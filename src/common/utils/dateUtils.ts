import { addDays, addMonths, format, isBefore, startOfDay, getDay, getDaysInMonth, isAfter } from 'date-fns';
import { CreditCard } from '../../modules/creditCards/creditCard.entity';
import { Fund } from '../../modules/funds/fund.entity';

export interface BillingCycle {
  cycle: string;
  billDate: Date;
  dueDate: Date;
  isPaid: boolean;
  paidAmount?: number;
}

export function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function getFundPaymentDates(fund: Fund, rangeEnd?: Date): Date[] {
  const dates: Date[] = [];
  const start = startOfDay(new Date(fund.startDate));
  const end = fund.endDate
    ? startOfDay(new Date(fund.endDate))
    : rangeEnd || addMonths(new Date(), 3);

  if (fund.recurrence === 'weekly' && fund.dayOfWeek !== undefined) {
    let cur = new Date(start);
    while (getDay(cur) !== fund.dayOfWeek) cur = addDays(cur, 1);
    while (!isBefore(end, cur)) {
      dates.push(new Date(cur));
      cur = addDays(cur, 7);
    }
  } else if (fund.recurrence === 'monthly' && fund.dayOfMonth !== undefined) {
    let y = start.getFullYear(), m = start.getMonth();
    const dayInMonth = (yr: number, mo: number) => {
      const max = getDaysInMonth(new Date(yr, mo));
      return new Date(yr, mo, Math.min(fund.dayOfMonth!, max));
    };
    let first = dayInMonth(y, m);
    if (isBefore(first, start)) { m++; if (m > 11) { m = 0; y++; } }
    let cur = dayInMonth(y, m);
    while (!isBefore(end, cur)) {
      dates.push(cur);
      m++;
      if (m > 11) { m = 0; y++; }
      cur = dayInMonth(y, m);
    }
  }
  return dates;
}

export function isDatePaid(fund: Fund, date: Date): boolean {
  if (!fund.payments) return false;
  return fund.payments.some(p => p.date === dateKey(date));
}

export function getBillingCycles(card: CreditCard): BillingCycle[] {
  if (!card.payments) card.payments = [];
  const startFrom = card.billingStartDate ? new Date(card.billingStartDate) : new Date(card.createdAt);
  const now = new Date();
  const cycles: BillingCycle[] = [];
  let y = startFrom.getFullYear(), m = startFrom.getMonth();
  const endDate = addMonths(now, 1);

  while (new Date(y, m, 1) <= endDate) {
    const billDay = Math.min(card.billDate, getDaysInMonth(new Date(y, m)));
    const billDate = new Date(y, m, billDay);
    let dueY = y, dueM = m;
    if (card.dueDate <= card.billDate) {
      dueM++;
      if (dueM > 11) { dueM = 0; dueY++; }
    }
    const dueDay = Math.min(card.dueDate, getDaysInMonth(new Date(dueY, dueM)));
    const dueDate = new Date(dueY, dueM, dueDay);
    const cycleKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const payment = card.payments.find(p => p.cycle === cycleKey);

    cycles.push({
      cycle: cycleKey,
      billDate,
      dueDate,
      isPaid: !!payment,
      paidAmount: payment?.amount,
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return cycles;
}
