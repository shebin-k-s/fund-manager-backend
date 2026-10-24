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
    const named = text.match(new RegExp(`(?<![a-z])(${MONTHS.join('|')})[a-z]*[\\s,.\\-/']*(?:20)?(\\d{2})\\b`, 'i'));
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

const PF_LABEL = /(?:\bepf\b|\bpf\b|provident\s*fund)/i;
// Lines that mention PF but are not an amount to track (account / UAN numbers, wages the PF is worked out on).
const PF_IGNORE = /(?:\bno\b|number|a\/c|account|uan|wages|ceiling|basic|admin|edli|eps|pension)/i;
const EMPLOYER = /(?:employer|company)/i;

function firstAmountAfterLabel(line: string): number | null {
    const label = line.match(PF_LABEL);
    if (!label || label.index === undefined) return null;
    const m = line.slice(label.index + label[0].length).match(new RegExp(AMOUNT));
    return m ? toNumber(m[1]) : null;
}

/** Works on the plain text of a payslip. Label wording differs by employer, so this is deliberately forgiving. */
export function parsePayslipText(text: string, fileName = '', folderPath = ''): ParsedPayslip {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    let employeePf: number | null = null;
    let employerPf: number | null = null;
    for (const line of lines) {
        if (!PF_LABEL.test(line) || PF_IGNORE.test(line.replace(PF_LABEL, ''))) continue;
        const amount = firstAmountAfterLabel(line);
        if (amount === null) continue;
        if (EMPLOYER.test(line)) employerPf ??= amount;
        else employeePf ??= amount;
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
