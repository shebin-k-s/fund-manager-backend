import webpush from '../lib/webpush';
import { AppDataSource } from '../../config/data.source';
import { NotificationSubscription } from './notificationSubscription.entity';
import { CreditCard } from '../creditCards/creditCard.entity';
import { Fund } from '../funds/fund.entity';

import { getBillingCycles, getFundPaymentDates, isDatePaid } from '../../common/utils/dateUtils';
import { differenceInDays, startOfDay, isAfter, addDays, format } from 'date-fns';

const MAX_ITEMS_PER_NOTIFICATION = 4;

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

        type DueItem = { type: 'card' | 'fund'; name: string; dueDate: Date; diff: number; status: string };
        const dueItems: DueItem[] = [];
        const today = startOfDay(new Date());

        // Check Cards
        for (const card of cards) {
            const cycles = getBillingCycles(card);
            const activeUnpaid = cycles.filter(c => !c.isPaid && !isAfter(c.billDate, today));

            for (const c of activeUnpaid) {
                const diff = differenceInDays(c.dueDate, today);
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
                const diff = differenceInDays(d, today);
                const status = diff < 0 ? 'OVERDUE' : diff === 0 ? 'TODAY' : 'SOON';
                dueItems.push({ type: 'fund', name: fund.name, dueDate: d, diff, status });
            }
        }

        // Most overdue / soonest due first
        dueItems.sort((a, b) => a.diff - b.diff);

        const allMessages = dueItems.map(item => {
            const formatD = format(item.dueDate, 'MMM d');
            const detail = item.status === 'OVERDUE'
                ? `${Math.abs(item.diff)} days overdue`
                : item.status === 'TODAY'
                    ? 'Due today'
                    : `Due in ${item.diff} days`;
            return `${item.status}|${item.name}|${detail}|for ${formatD}|${item.type}`;
        });

        if (allMessages.length === 0) {
            console.log('No pending dues to notify about.');
            return { subscriptions: subscriptions.length, dueItems: 0, sent: 0, failed: 0, reason: 'no_due_items' };
        }

        // Keep each push short enough for browser/OS notification trays. Long
        // multiline bodies are commonly clipped after roughly four visible lines.
        const total = allMessages.length;
        const overdueCount = allMessages.filter(m => m.startsWith('OVERDUE')).length;

        const formatLine = (msg: string) => {
            const [status, name, detail, sub, type] = msg.split('|');
            const icon = type === 'card' ? '💳' : '💰';
            const urgency = status === 'OVERDUE' ? '🔴' : status === 'TODAY' ? '🟡' : '🔵';
            return `${urgency} ${icon} ${name} · ${detail} (${sub})`;
        };

        const itemLines = allMessages.map(formatLine);
        const notificationTitle = overdueCount > 0
            ? `🔴 ${overdueCount} overdue · ${total} due soon`
            : `📋 ${total} item${total !== 1 ? 's' : ''} due soon`;

        const notifications = [];
        const notificationDate = format(today, 'yyyy-MM-dd');
        for (let start = 0; start < itemLines.length; start += MAX_ITEMS_PER_NOTIFICATION) {
            const end = Math.min(start + MAX_ITEMS_PER_NOTIFICATION, total);
            notifications.push({
                title: total > MAX_ITEMS_PER_NOTIFICATION
                    ? `${notificationTitle} · ${start + 1}-${end} of ${total}`
                    : notificationTitle,
                body: itemLines.slice(start, end).join('\n'),
                // A fresh tag each day prevents a scheduled notification from
                // silently replacing the same chunk left by yesterday's run.
                tag: `due-items-${notificationDate}-${start + 1}-${end}`,
            });
        }

        console.log(
            `Sending ${notifications.length} notification(s) for ${total} due item(s).`,
            notifications.map(notification => notification.body)
        );

        // Send to all subscriptions
        let sent = 0;
        let failed = 0;
        for (const subscription of subscriptions) {
            const keys = subscription.keys as { p256dh: string; auth: string };

            if (!keys?.p256dh || !keys?.auth) {
                console.error('Invalid keys for subscription:', subscription.id);
                failed++;
                continue;
            }

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

        return { subscriptions: subscriptions.length, dueItems: total, sent, failed, reason: 'sent' };
    } catch (error) {
        console.error('Error in notification worker:', error);
        return { subscriptions: 0, dueItems: 0, sent: 0, failed: 0, reason: 'error' };
    }
}
