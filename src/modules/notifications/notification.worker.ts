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

        const cardMessages: string[] = [];
        const fundMessages: string[] = [];
        const today = startOfDay(new Date());

        // Check Cards
        for (const card of cards) {
            const cycles = getBillingCycles(card);
            const activeUnpaid = cycles.filter(c => !c.isPaid && !isAfter(c.billDate, today));

            for (const c of activeUnpaid) {
                const diff = differenceInDays(c.dueDate, today);
                const formatD = format(c.dueDate, 'MMM d');

                if (diff < 0) {
                    cardMessages.push(`OVERDUE|${card.name}|${Math.abs(diff)} days overdue|for ${formatD}`);
                } else if (diff === 0) {
                    cardMessages.push(`TODAY|${card.name}|Due today|for ${formatD}`);
                } else if (diff <= 7) {
                    cardMessages.push(`SOON|${card.name}|Due in ${diff} days|for ${formatD}`);
                } else {
                    cardMessages.push(`PENDING|${card.name}|Due in ${diff} days|for ${formatD}`);
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
                const formatD = format(d, 'MMM d');

                if (diff < 0) {
                    fundMessages.push(`OVERDUE|${fund.name}|${Math.abs(diff)} days overdue|for ${formatD}`);
                } else if (diff === 0) {
                    fundMessages.push(`TODAY|${fund.name}|Due today|for ${formatD}`);
                } else if (diff <= 7) {
                    fundMessages.push(`SOON|${fund.name}|Due in ${diff} days|for ${formatD}`);
                }
            }
        }

        const allMessages = [...cardMessages, ...fundMessages];

        if (allMessages.length === 0) {
            console.log('No pending dues to notify about.');
            return { subscriptions: subscriptions.length, dueItems: 0, sent: 0, failed: 0, reason: 'no_due_items' };
        }

        // Sending multiple separate push messages per run was unreliable
        // (OS-level notification-flooding protection silently drops one of
        // them even with a delay in between), so always send exactly one
        // notification per subscription, truncated with a "+N more" line.
        const total = allMessages.length;
        const overdueCount = allMessages.filter(m => m.startsWith('OVERDUE')).length;

        const formatLine = (msg: string, type: 'card' | 'fund') => {
            const [status, name, detail, sub] = msg.split('|');
            const icon = type === 'card' ? '💳' : '💰';
            const urgency = status === 'OVERDUE' ? '🔴' : status === 'TODAY' ? '🟡' : '🔵';
            return `${urgency} ${icon} ${name} · ${detail} (${sub})`;
        };

        const itemLines = [
            ...cardMessages.map(message => formatLine(message, 'card')),
            ...fundMessages.map(message => formatLine(message, 'fund')),
        ];
        const notificationTitle = overdueCount > 0
            ? `🔴 ${overdueCount} overdue · ${total} due soon`
            : `📋 ${total} item${total !== 1 ? 's' : ''} due soon`;

        const notificationDate = format(today, 'yyyy-MM-dd');
        const visibleLines = itemLines.slice(0, MAX_ITEMS_PER_NOTIFICATION);
        const remaining = total - visibleLines.length;
        const body = remaining > 0
            ? `${visibleLines.join('\n')}\n+${remaining} more`
            : visibleLines.join('\n');

        const notification = {
            title: notificationTitle,
            body,
            tag: `due-items-${notificationDate}`,
        };

        console.log(`Sending 1 notification for ${total} due item(s).`, notification.body);

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
                await webpush.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: keys.p256dh,
                            auth: keys.auth,
                        },
                    },
                    JSON.stringify({
                        ...notification,
                        url: '/',
                    })
                );
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
