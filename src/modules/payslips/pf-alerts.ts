import { PfRecord } from './pfRecord.entity';

export type PfAlert =
    | { type: 'missing'; company: string; from: string; to: string; count: number; trailing: boolean }
    | { type: 'change'; company: string; month: string; previousMonth: string; previous: number; current: number; pct: number };

const CHANGE_THRESHOLD = 0.25; // your PF moving by a quarter or more from the previous month
const RETURNED = 0.05; // ...unless the next month is back within 5% of where it was: then the odd month was the one before
const GRACE_DAY = 10; // the previous month's payslip is only expected once this day of the month is reached
const MAX_TRAILING_MONTHS = 6; // a longer silence means the job ended, not that payslips are missing

const idx = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return y * 12 + (m - 1);
};
const ymOf = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const pct = (from: number, to: number) => Math.round(((to - from) / from) * 100);

/** Gaps in a company's months, and months whose PF jumped or dropped. Pure: records in, alerts out. */
export function computeAlerts(records: PfRecord[], now = new Date()): PfAlert[] {
    const byCompany = new Map<string, PfRecord[]>();
    for (const r of records) {
        const list = byCompany.get(r.company) ?? [];
        list.push(r);
        byCompany.set(r.company, list);
    }

    const alerts: PfAlert[] = [];
    let latestCompany: string | null = null;
    let latestIdx = -1;

    for (const [company, list] of byCompany) {
        const rs = [...list].sort((a, b) => a.month.localeCompare(b.month));
        const last = idx(rs[rs.length - 1].month);
        if (last > latestIdx) {
            latestIdx = last;
            latestCompany = company;
        }

        for (let i = 1; i < rs.length; i++) {
            const a = idx(rs[i - 1].month);
            const b = idx(rs[i].month);
            if (b - a > 1) alerts.push({ type: 'missing', company, from: ymOf(a + 1), to: ymOf(b - 1), count: b - a - 1, trailing: false });
        }

        for (let i = 1; i < rs.length; i++) {
            const previous = Number(rs[i - 1].employeePf);
            const current = Number(rs[i].employeePf);
            if (rs[i].reviewed || previous <= 0) continue;
            if (Math.abs(current - previous) / previous < CHANGE_THRESHOLD) continue;
            if (i >= 2) {
                const before = Number(rs[i - 2].employeePf);
                if (before > 0 && Math.abs(current - before) / before < RETURNED) continue;
            }
            alerts.push({ type: 'change', company, month: rs[i].month, previousMonth: rs[i - 1].month, previous, current, pct: pct(previous, current) });
        }
    }

    // Is the newest payslip older than expected? Only the employer with the latest record can be "still paying".
    if (latestCompany !== null) {
        const thisMonth = now.getFullYear() * 12 + now.getMonth();
        const expected = thisMonth - (now.getDate() >= GRACE_DAY ? 1 : 2);
        const behind = expected - latestIdx;
        if (behind > 0 && behind <= MAX_TRAILING_MONTHS) {
            alerts.push({ type: 'missing', company: latestCompany, from: ymOf(latestIdx + 1), to: ymOf(expected), count: behind, trailing: true });
        }
    }

    const when = (a: PfAlert) => (a.type === 'missing' ? a.to : a.month);
    return alerts.sort((a, b) => when(b).localeCompare(when(a)));
}
