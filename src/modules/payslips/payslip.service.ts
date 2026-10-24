import jwt from 'jsonwebtoken';
import { AppDataSource } from '../../config/data.source';
import { ApiError } from '../../common/middlewares/error.middleware';
import { PayslipSettings } from './payslip-settings.entity';
import { PfRecord } from './pfRecord.entity';
import { extractPdfText, parsePayslipText } from './payslip.parser';
import { decrypt, encrypt } from '../backup/secret.util';
import * as drive from '../backup/google-drive.client';

const PURPOSE = 'payslip-connect';
const settingsRepo = () => AppDataSource.getRepository(PayslipSettings);
const recordRepo = () => AppDataSource.getRepository(PfRecord);
let syncing = false;

async function getSettings(): Promise<PayslipSettings> {
    const existing = await settingsRepo().findOneBy({ id: 'default' });
    if (existing) return existing;
    return settingsRepo().save(
        settingsRepo().create({ id: 'default', refreshTokenEnc: null, accountEmail: null, folderId: null, lastSyncAt: null, lastStatus: null, lastMessage: null }),
    );
}

function requireConfigured() {
    if (!drive.isConfigured()) {
        throw new ApiError('Google sign-in is not set up on the server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / BACKEND_URL / BACKUP_SECRET)', 503);
    }
}

/** Accepts a Drive folder link or a bare folder id. */
export function parseFolderId(input: string): string | null {
    const text = input.trim();
    const fromPath = text.match(/\/folders\/([\w-]+)/);
    if (fromPath) return fromPath[1];
    const fromQuery = text.match(/[?&]id=([\w-]+)/);
    if (fromQuery) return fromQuery[1];
    return /^[\w-]{10,}$/.test(text) ? text : null;
}

export async function status() {
    const s = await getSettings();
    return {
        configured: drive.isConfigured(),
        connected: !!s.refreshTokenEnc,
        accountEmail: s.accountEmail,
        folderId: s.folderId,
        folderUrl: s.folderId ? `https://drive.google.com/drive/folders/${s.folderId}` : null,
        lastSyncAt: s.lastSyncAt,
        lastStatus: s.lastStatus,
        lastMessage: s.lastMessage,
    };
}

/** Google's consent screen, asking only for read-only Drive access. */
export function connectUrl(): string {
    requireConfigured();
    const state = jwt.sign({ purpose: PURPOSE }, process.env.JWT_SECRET!, { expiresIn: '10m' });
    return drive.buildAuthUrl(state, drive.READONLY_SCOPE);
}

/** Lets the shared Google callback tell a payslip sign-in from a backup one. */
export function isPayslipState(state: string): boolean {
    try {
        return (jwt.verify(state, process.env.JWT_SECRET!) as any)?.purpose === PURPOSE;
    } catch {
        return false;
    }
}

export async function completeConnection(code: string): Promise<void> {
    requireConfigured();
    const { refreshToken, accessToken } = await drive.exchangeCode(code);
    const s = await getSettings();
    const previous = s.refreshTokenEnc;
    s.refreshTokenEnc = encrypt(refreshToken);
    s.accountEmail = await drive.accountEmail(accessToken);
    s.lastStatus = null;
    s.lastMessage = null;
    await settingsRepo().save(s);
    if (previous) {
        try {
            const old = decrypt(previous);
            if (old !== refreshToken) await drive.revoke(old);
        } catch {
            /* an unreadable old key can't be revoked — the new connection is what matters */
        }
    }
}

export async function disconnect(): Promise<void> {
    const s = await getSettings();
    if (s.refreshTokenEnc) {
        try {
            await drive.revoke(decrypt(s.refreshTokenEnc));
        } catch {
            /* already unreadable — clearing it below is what matters */
        }
    }
    s.refreshTokenEnc = null;
    s.accountEmail = null;
    await settingsRepo().save(s);
    // Saved PF records and the folder are kept: disconnecting only removes the access.
}

export async function setFolder(input: string): Promise<void> {
    const folderId = parseFolderId(input);
    if (!folderId) throw new ApiError('That does not look like a Google Drive folder link', 400);
    await getSettings();
    await settingsRepo().update({ id: 'default' }, { folderId });
}

export interface SyncResult {
    found: number;
    added: number;
    updated: number;
    skipped: { fileName: string; reason: string }[];
}

/** Reads every payslip PDF in the folder and saves its PF figures. Safe to run repeatedly. */
export async function sync(): Promise<SyncResult> {
    requireConfigured();
    const s = await getSettings();
    if (!s.refreshTokenEnc) throw new ApiError('Connect Google Drive first', 400);
    if (!s.folderId) throw new ApiError('Add your payslip folder link first', 400);
    if (syncing) throw new ApiError('A sync is already running', 409);
    syncing = true;
    const result: SyncResult = { found: 0, added: 0, updated: 0, skipped: [] };
    try {
        const accessToken = await drive.accessTokenFor(decrypt(s.refreshTokenEnc));
        const files = await drive.listPdfsInFolder(accessToken, s.folderId);
        result.found = files.length;

        for (const file of files) {
            const shown = file.folderPath ? `${file.folderPath}/${file.name}` : file.name;
            const known = await recordRepo().findOneBy({ driveFileId: file.id });
            if (known) continue; // already read; use a manual edit to correct it
            try {
                const parsed = parsePayslipText(await extractPdfText(await drive.downloadFile(accessToken, file.id)), file.name, file.folderPath);
                if (!parsed.month) {
                    result.skipped.push({ fileName: shown, reason: 'Could not find the pay month' });
                    continue;
                }
                if (parsed.employeePf === null) {
                    result.skipped.push({ fileName: shown, reason: 'Could not find a PF amount' });
                    continue;
                }
                const fields = {
                    employeePf: parsed.employeePf.toFixed(2),
                    employerPf: parsed.employerPf === null ? null : parsed.employerPf.toFixed(2),
                    gross: parsed.gross === null ? null : parsed.gross.toFixed(2),
                    driveFileId: file.id,
                    fileName: file.name,
                };
                const sameMonth = await recordRepo().findOneBy({ company: file.company, month: parsed.month });
                if (sameMonth?.edited) {
                    result.skipped.push({ fileName: shown, reason: `${parsed.month} was edited by hand — left as is` });
                } else if (sameMonth) {
                    await recordRepo().update({ id: sameMonth.id }, fields);
                    result.updated++;
                } else {
                    await recordRepo().save(recordRepo().create({ company: file.company, month: parsed.month, ...fields, edited: false }));
                    result.added++;
                }
            } catch (err) {
                result.skipped.push({ fileName: shown, reason: err instanceof Error ? err.message.slice(0, 120) : 'Could not read this file' });
            }
        }

        await settingsRepo().update({ id: 'default' }, { lastSyncAt: new Date(), lastStatus: 'ok', lastMessage: `${result.added} added, ${result.updated} updated, ${result.skipped.length} skipped` });
        return result;
    } catch (err) {
        await settingsRepo()
            .update({ id: 'default' }, { lastSyncAt: new Date(), lastStatus: 'error', lastMessage: err instanceof Error ? err.message.slice(0, 300) : 'Sync failed' })
            .catch(() => undefined);
        throw err;
    } finally {
        syncing = false;
    }
}

export function listRecords(): Promise<PfRecord[]> {
    return recordRepo().find({ order: { month: 'DESC', company: 'ASC' } });
}

export async function summary() {
    const records = await listRecords();
    const sum = (pick: (r: PfRecord) => string | null) => records.reduce((t, r) => t + Number(pick(r) ?? 0), 0);
    const employee = sum((r) => r.employeePf);
    const employer = sum((r) => r.employerPf);
    const financialYear = (month: string) => {
        const [y, m] = month.split('-').map(Number);
        return m >= 4 ? y : y - 1; // April–March
    };
    const byYear = new Map<number, { employee: number; employer: number; months: number }>();
    for (const r of records) {
        const fy = financialYear(r.month);
        const row = byYear.get(fy) ?? { employee: 0, employer: 0, months: 0 };
        row.employee += Number(r.employeePf);
        row.employer += Number(r.employerPf ?? 0);
        row.months++;
        byYear.set(fy, row);
    }
    const byCompany = new Map<string, { employee: number; employer: number; months: number; from: string; to: string }>();
    for (const r of records) {
        const row = byCompany.get(r.company) ?? { employee: 0, employer: 0, months: 0, from: r.month, to: r.month };
        row.employee += Number(r.employeePf);
        row.employer += Number(r.employerPf ?? 0);
        row.months++;
        if (r.month < row.from) row.from = r.month;
        if (r.month > row.to) row.to = r.month;
        byCompany.set(r.company, row);
    }
    return {
        months: records.length,
        employeeTotal: employee,
        employerTotal: employer,
        total: employee + employer,
        latestMonth: records[0]?.month ?? null,
        byCompany: [...byCompany.entries()]
            .map(([company, v]) => ({ company, ...v, total: v.employee + v.employer }))
            .sort((a, b) => b.to.localeCompare(a.to) || b.total - a.total), // current employer first
        byFinancialYear: [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([fy, v]) => ({ label: `${fy}-${String(fy + 1).slice(2)}`, ...v })),
    };
}

export interface RecordInput {
    company?: string;
    month: string;
    employeePf: number;
    employerPf?: number | null;
    gross?: number | null;
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toFixed(2));

export async function saveRecord(id: string | null, input: RecordInput): Promise<PfRecord> {
    const company = (input.company ?? '').trim();
    const clash = await recordRepo().findOneBy({ company, month: input.month });
    if (clash && clash.id !== id) throw new ApiError(`${company || 'This company'} already has a record for ${input.month}`, 409);
    const fields = { company, month: input.month, employeePf: input.employeePf.toFixed(2), employerPf: money(input.employerPf), gross: money(input.gross), edited: true };
    if (!id) return recordRepo().save(recordRepo().create(fields));
    const existing = await recordRepo().findOneBy({ id });
    if (!existing) throw new ApiError('Record not found', 404);
    return recordRepo().save({ ...existing, ...fields });
}

export async function deleteRecord(id: string): Promise<void> {
    const res = await recordRepo().delete({ id });
    if (!res.affected) throw new ApiError('Record not found', 404);
}
