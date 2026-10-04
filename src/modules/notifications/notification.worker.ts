import webpush from '../lib/webpush';
import { AppDataSource } from '../../config/data.source';
import { NotificationSubscription } from './notificationSubscription.entity';
import { CreditCard } from '../creditCards/creditCard.entity';
import { Fund } from '../funds/fund.entity';

import { getBillingCycles, getFundPaymentDates, isDatePaid } from '../../common/utils/dateUtils';
import { differenceInCalendarDays, startOfDay, isAfter, addDays, addMinutes, format } from 'date-fns';

const MAX_ITEMS_PER_NOTIFICATION = 4;
const IST_OFFSET_MINUTES = 330;

export async function checkAndNotifyAllUsers() {
    try {
        const subscriptionRepo = AppDataSource.getRepository(NotificationSubscription);
        const cardRepo = AppDataSource.getRepository(CreditCard);
        const fundRepo = AppDataSource.getRepository(Fund);

        const subscriptions = await subscriptionRepo.find();
        const cards = await cardRepo.find({ relations: ['payments'] });
        const funds = await fundRepo.find({ relations: ['payments'] });

        if (subscriptions.length === 0) {
            console.log('No subscriptions found, skipping notification.');
            return { subscriptions: 0, dueItems: 0, sent: 0, failed: 0, reason: 'no_subscriptions' };
        }

        type DueItem = { type: 'card' | 'fund'; name: string; dueDate: Date; diff: number; status: string; amount?: number };
        const dueItems: DueItem[] = [];
        // Due dates are built as midnight on the server clock (UTC on Render).
        // Use the user's calendar date (IST, +5:30) for "today" so a trigger
        // between 00:00 and 05:30 IST doesn't count from yesterday.
        const today = startOfDay(addMinutes(new Date(), IST_OFFSET_MINUTES));

        // Check Cards
        for (const card of cards) {
            const cycles = getBillingCycles(card);
            const activeUnpaid = cycles.filter(c => !c.isPaid && !isAfter(c.billDate, today));

            for (const c of activeUnpaid) {
                const diff = differenceInCalendarDays(c.dueDate, today);
                if (diff <= 7) {
                    const status = diff < 0 ? 'OVERDUE' : diff === 0 ? 'TODAY' : 'SOON';
                    dueItems.push({ type: 'card', name: card.name, dueDate: c.dueDate, diff, status });
                } else {
                    dueItems.push({ type: 'card', name: card.name, dueDate: c.dueDate, diff, status: 'PENDING' });
                }
            }
        }

        // Check Funds
        for (const fund of funds) {
            const checkLimit = addDays(today, 8);
            const requiredDates = getFundPaymentDates(fund, checkLimit);
            const unpaidDates = requiredDates.filter(d => !isDatePaid(fund, d));

            for (const d of unpaidDates) {
                const diff = differenceInCalendarDays(d, today);
                if (diff > 7) continue;
                const status = diff < 0 ? 'OVERDUE' : diff === 0 ? 'TODAY' : 'SOON';
                const amount = parseFloat(String(fund.amount)) || undefined;
                dueItems.push({ type: 'fund', name: fund.name, dueDate: d, diff, status, amount });
            }
        }

        // Most overdue / soonest due first
        dueItems.sort((a, b) => a.diff - b.diff);

        if (dueItems.length === 0) {
            console.log('No pending dues to notify about.');
            return { subscriptions: subscriptions.length, dueItems: 0, sent: 0, failed: 0, reason: 'no_due_items' };
        }

        const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

        // One notification per urgency group so it reads at a glance: the
        // title says what kind of due it is, the body is just what to pay.
        //   🔴 Overdue · 2        SLICE CC · 26 days late
        //   🟡 Due today · 1      Monthly Chit · ₹2,000
        //   🔵 Coming up · 2      Roar bank · in 5 days (Oct 9)
        const amountOf = (item: DueItem) => item.amount ? ` · ₹${item.amount.toLocaleString('en-IN')}` : '';
        // Overdue: one line per fund/card, so a fund missed for weeks is a
        // single line ("vtm · 27 missed · ₹54,000 · oldest 185 days late")
        // instead of flooding the tray with near-identical lines.
        const overdueLines: string[] = [];
        const overdueByName = new Map<string, DueItem[]>();
        for (const i of dueItems.filter(i => i.diff < 0)) {
            const key = `${i.type}:${i.name}`;
            if (!overdueByName.has(key)) overdueByName.set(key, []);
            overdueByName.get(key)!.push(i);
        }
        for (const items of overdueByName.values()) {
            const first = items[0]; // dueItems is sorted, so this is the oldest
            if (items.length === 1) {
                overdueLines.push(`${first.name}${amountOf(first)} · ${plural(-first.diff, 'day')} late`);
            } else {
                const total = items.reduce((sum, i) => sum + (i.amount || 0), 0);
                const totalText = total ? ` · ₹${total.toLocaleString('en-IN')}` : '';
                const what = first.type === 'card' ? 'bills' : 'missed';
                overdueLines.push(`${first.name} · ${items.length} ${what}${totalText} · oldest ${plural(-first.diff, 'day')} late`);
            }
        }

        const groups: Array<{ key: string; title: string; lines: string[] }> = [
            {
                key: 'overdue',
                title: '🔴 Overdue',
                lines: overdueLines,
            },
            {
                key: 'today',
                title: '🟡 Due today',
                lines: dueItems.filter(i => i.diff === 0).map(i => `${i.name}${amountOf(i)}`),
            },
            {
                key: 'upcoming',
                title: '🔵 Coming up',
                lines: dueItems.filter(i => i.diff > 0).map(i => i.diff === 1
                    ? `${i.name}${amountOf(i)} · tomorrow (${format(i.dueDate, 'MMM d')})`
                    : `${i.name}${amountOf(i)} · in ${plural(i.diff, 'day')} (${format(i.dueDate, 'MMM d')})`),
            },
        ];

        // Keep each push short enough for browser/OS notification trays. Long
        // multiline bodies are commonly clipped after roughly four visible lines.
        const notifications = [];
        const notificationDate = format(today, 'yyyy-MM-dd');
        for (const group of groups) {
            const count = group.lines.length;
            if (count === 0) continue;
            const parts = Math.ceil(count / MAX_ITEMS_PER_NOTIFICATION);
            for (let start = 0; start < count; start += MAX_ITEMS_PER_NOTIFICATION) {
                const part = start / MAX_ITEMS_PER_NOTIFICATION + 1;
                notifications.push({
                    title: `${group.title} · ${count}${parts > 1 ? ` (${part}/${parts})` : ''}`,
                    body: group.lines.slice(start, start + MAX_ITEMS_PER_NOTIFICATION).join('\n'),
                    // A fresh tag each day prevents a scheduled notification from
                    // silently replacing the same group left by yesterday's run.
                    tag: `due-${group.key}-${notificationDate}-${part}`,
                });
            }
        }

        console.log(
            `Sending ${notifications.length} notification(s) for ${dueItems.length} due item(s).`,
            notifications.map(notification => notification.body)
        );

        // Send to all subscriptions
        let sent = 0;
        let failed = 0;
        const currentTags = notifications.map(n => n.tag);
        const partialDeliveries: Array<{ id: string; missed: number; of: number }> = [];
        for (const subscription of subscriptions) {
            const keys = subscription.keys as { p256dh: string; auth: string };

            if (!keys?.p256dh || !keys?.auth) {
                console.error('Invalid keys for subscription:', subscription.id);
                failed++;
                continue;
            }

            // Compare the PREVIOUS cycle's sent tags against what actually got
            // confirmed since then — an exact chunk count, not just "was
            // anything confirmed at some point" (which can't distinguish 1-of-2
            // chunks confirmed from 2-of-2).
            const prevSentTags = subscription.lastSentTags || [];
            const prevConfirmedTags = subscription.confirmedTags || [];
            const missedTags = prevSentTags.filter(t => !prevConfirmedTags.includes(t));
            if (prevSentTags.length > 0 && missedTags.length > 0) {
                partialDeliveries.push({ id: subscription.id, missed: missedTags.length, of: prevSentTags.length });
            }

            // Reset tracking for THIS cycle before sending, so confirms that
            // arrive during/after sending attach to fresh data, not leftovers.
            subscription.lastSentTags = currentTags;
            subscription.confirmedTags = [];
            await subscriptionRepo.save(subscription);

            try {
                for (let i = 0; i < notifications.length; i++) {
                    // Sending multiple pushes to the same endpoint back-to-back
                    // can get the later ones silently dropped by OS-level
                    // notification-flooding protection, even with distinct tags.
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                    await webpush.sendNotification(
                        {
                            endpoint: subscription.endpoint,
                            keys: {
                                p256dh: keys.p256dh,
                                auth: keys.auth,
                            },
                        },
                        JSON.stringify({
                            ...notifications[i],
                            url: '/',
                        })
                    );
                }
                console.log('Push sent to subscription:', subscription.id);
                subscription.lastTriggeredAt = new Date();
                await subscriptionRepo.save(subscription);
                sent++;
            } catch (error: any) {
                console.error('Error sending push to subscription:', subscription.id, error);
                failed++;

                if (error?.statusCode === 410 || error?.statusCode === 403) {
                    console.log('Removing invalid subscription:', subscription.id);
                    await subscriptionRepo.delete(subscription.id);
                }
            }
        }

        return {
            subscriptions: subscriptions.length,
            dueItems: dueItems.length,
            sent,
            failed,
            reason: 'sent',
            unconfirmedFromLastRun: partialDeliveries.reduce((sum, p) => sum + p.missed, 0),
            partialDeliveries,
        };
    } catch (error) {
        console.error('Error in notification worker:', error);
        return { subscriptions: 0, dueItems: 0, sent: 0, failed: 0, reason: 'error' };
    }
}
