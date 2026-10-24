import { PDFParse } from 'pdf-parse';

export interface ParsedPayslip {
    month: string | null; // 'YYYY-MM'
    employeePf: number | null;
    employerPf: number | null;
    gross: number | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT = '(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';

const toNumber = (s: string) => Number(s.replace(/,/g, ''));
const ym = (year: number, monthIndex: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

/** "March 2026", "Mar-2026", "03/2026", "2026-03" — first one found in the text. */
export function findMonth(text: string): string | null {
    const named = text.match(new RegExp(`(?<![a-z])(${MONTHS.join('|')})[a-z]*[\\s,.\\-/_']*(?:20)?(\\d{2})\\b`, 'i'));
    if (named) {
        const year = Number(named[2]);
        return ym(2000 + year, MONTHS.indexOf(named[1].toLowerCase()));
    }
    const numeric = text.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
    if (numeric) return ym(Number(numeric[2]), Number(numeric[1]) - 1);
    const iso = text.match(/\b(20\d{2})[\/\-](0[1-9]|1[0-2])\b/);
    if (iso) return ym(Number(iso[1]), Number(iso[2]) - 1);
    return null;
}

/** A file named just "March.pdf" inside a "2025" folder: the month from the name, the year from the folders. */
function findMonthFromPath(fileName: string, folderPath: string): string | null {
    const name = fileName.match(new RegExp(`(?<![a-z])(${MONTHS.join('|')})`, 'i'));
    const year = folderPath.match(/(?<!\d)(20\d{2})(?!\d)/);
    return name && year ? ym(Number(year[1]), MONTHS.indexOf(name[1].toLowerCase())) : null;
}

const PF_LABEL = /\bepf\b|\bpf\b|\bp\.\s?f\b\.?|provident\s*fund/gi; // PF, EPF, P.F., Provident Fund, Employees' Provident Fund
// Words between a PF label and the amount that mean it is not the PF amount itself: an account / UAN number, or
// something PF is worked out on or paid alongside.
const PF_IGNORE = /(?:\bno\b|number|a\/c|account|\buan\b|wages|ceiling|admin|edli|\beps\b|pension)/i;
const EMPLOYER = /(?:employer|company|\ber\b)/i; // "ER PF" is the employer's share
// Voluntary PF is the employee's own extra saving, not the statutory split — left out rather than guessed at.
const VOLUNTARY = /(?:voluntary|\bvpf\b)/i;
const MAX_GAP = 40; // an amount further away than this belongs to some other label

/**
 * Payslips put Earnings and Deductions side by side, so one text line often holds several cells
 * ("Basic Pay 8,546.77 Provident Fund 1,161.30"). Each PF label is therefore judged on its own: the first
 * amount after it, with only the words between them (and the ones just before it) deciding what it is.
 */
function findPf(lines: string[]): { employee: number | null; employer: number | null } {
    let employee: number | null = null;
    let employer: number | null = null;
    const amountG = new RegExp(AMOUNT, 'g');

    lines.forEach((line, i) => {
        for (const m of line.matchAll(PF_LABEL)) {
            const before = line.slice(0, m.index);
            const lastAmount = [...before.matchAll(amountG)].pop();
            const prefix = lastAmount ? before.slice(lastAmount.index! + lastAmount[0].length) : before; // this cell's words only
            const after = line.slice(m.index! + m[0].length);

            // The first amount that is not a rate ("12%").
            let amount: RegExpMatchArray | null = null;
            for (const a of after.matchAll(amountG)) {
                if (after.slice(a.index! + a[0].length).trimStart().startsWith('%')) continue;
                amount = a;
                break;
            }
            let gap = amount ? after.slice(0, amount.index) : after;
            if (!amount) {
                // Some PDFs put the number on the line below its label.
                const next = lines[i + 1]?.match(new RegExp(`^${AMOUNT}$`));
                if (!next) continue;
                amount = next;
                gap = '';
            }
            if (gap.length > MAX_GAP || PF_IGNORE.test(gap) || VOLUNTARY.test(gap) || VOLUNTARY.test(prefix)) continue;

            const value = toNumber(amount[1]);
            if (EMPLOYER.test(prefix) || EMPLOYER.test(gap)) employer ??= value;
            else employee ??= value;
        }
    });
    return { employee, employer };
}

/** Works on the plain text of a payslip. Label wording differs by employer, so this is deliberately forgiving. */
export function parsePayslipText(text: string, fileName = '', folderPath = ''): ParsedPayslip {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const found = findPf(lines);
    const employerPf = found.employer;
    let employeePf = found.employee;
    // Some payslips list the employer's share under Earnings and deduct the whole PF (both shares). Then the
    // deduction is exactly twice the employer's line, and the employee's own share is what is left after it.
    if (employeePf !== null && employerPf !== null && employerPf > 0 && Math.abs(employeePf - 2 * employerPf) <= 1) {
        employeePf = Math.round((employeePf - employerPf) * 100) / 100;
    }

    let gross: number | null = null;
    for (const line of lines) {
        const m = line.match(new RegExp(`gross\\s*(?:earnings?|salary|pay|total)?\\D{0,20}${AMOUNT}`, 'i'));
        if (m) {
            gross = toNumber(m[1]);
            break;
        }
    }

    const periodLine = lines.find((l) => /(pay\s*slip|salary\s*slip|pay\s*period|month|period|for the)/i.test(l) && findMonth(l));
    const month = (periodLine && findMonth(periodLine)) || findMonth(fileName) || findMonth(text) || findMonthFromPath(fileName, folderPath);

    return { month, employeePf, employerPf, gross };
}

export async function extractPdfText(data: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
        return (await parser.getText()).text;
    } finally {
        await parser.destroy().catch(() => undefined);
    }
}

const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/**
 * Catches a wrong reading before it is saved. Returns why the payslip should not be trusted, or null if it looks right.
 * Employer PF is deliberately not compared with the employee's: they differ whenever pay is capped or PF is voluntary.
 */
export function validatePayslip(p: ParsedPayslip, now = new Date()): string | null {
    if (p.employeePf !== null && p.employeePf <= 0) return 'PF amount is zero';
    if (p.gross !== null && p.employeePf !== null) {
        if (p.employeePf > p.gross) return `PF ${money(p.employeePf)} is more than the gross pay ${money(p.gross)}`;
        if (p.employeePf > p.gross * 0.5) return `PF ${money(p.employeePf)} is over half of the gross pay ${money(p.gross)}`;
    }
    if (p.gross !== null && p.employerPf !== null && p.employerPf > p.gross) return `Employer PF ${money(p.employerPf)} is more than the gross pay ${money(p.gross)}`;
    if (p.month) {
        const [y, m] = p.month.split('-').map(Number);
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        if (y < 1990 || new Date(y, m - 1, 1) > next) return `Pay month ${p.month} looks wrong`;
    }
    return null;
}

/** The lines that mention PF, to show why nothing was found — never the whole payslip. */
export function pfHint(text: string): string {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /provident|\bepf\b|\bpf\b/i.test(l)).slice(0, 2);
    return lines.length ? ` (PF lines seen: ${lines.map((l) => `"${l.slice(0, 60)}"`).join(', ')})` : ' (no line mentions PF — is this a payslip?)';
}
