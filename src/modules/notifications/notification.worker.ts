import webpush from '../lib/webpush';
import { AppDataSource } from '../../config/data.source';
import { NotificationSubscription } from './notificationSubscription.entity';
import { CreditCard } from '../creditCards/creditCard.entity';
import { Fund } from '../funds/fund.entity';

import { getBillingCycles, getFundPaymentDates, isDatePaid } from '../../common/utils/dateUtils';
import { differenceInDays, startOfDay, isAfter, addDays, format } from 'date-fns';

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
            return;
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
            return;
        }

        // Build formatted notification content
        const total = allMessages.length;
        const overdueCount = allMessages.filter(m => m.startsWith('OVERDUE')).length;

        const formatLine = (msg: string, type: 'card' | 'fund') => {
            const [status, name, detail, sub] = msg.split('|');
            const icon = type === 'card' ? '💳' : '💰';
            const urgency = status === 'OVERDUE' ? '🔴' : status === 'TODAY' ? '🟡' : '🔵';
            return `${urgency} ${icon} ${name} · ${detail} (${sub})`;
        };

        const lines: string[] = [];

        if (cardMessages.length > 0) {
            lines.push('💳 Credit Cards');
            cardMessages.forEach(m => lines.push(formatLine(m, 'card')));
        }
        if (fundMessages.length > 0) {
            if (cardMessages.length > 0) lines.push('');
            lines.push('💰 Funds');
            fundMessages.forEach(m => lines.push(formatLine(m, 'fund')));
        }

        const notificationBody = lines.join('\n');
        const notificationTitle = overdueCount > 0
            ? `🔴 ${overdueCount} overdue · ${total} due soon`
            : `📋 ${total} item${total !== 1 ? 's' : ''} due soon`;


        console.log('Notification body:\n', notificationBody);

        // Send to all subscriptions
        for (const subscription of subscriptions) {
            const keys = subscription.keys as { p256dh: string; auth: string };

            if (!keys?.p256dh || !keys?.auth) {
                console.error('Invalid keys for subscription:', subscription.id);
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
                        title: notificationTitle,
                        body: notificationBody,
                        url: '/',
                    })
                );
                console.log('Push sent to subscription:', subscription.id);
            } catch (error: any) {
                console.error('Error sending push to subscription:', subscription.id, error);


                if (error?.statusCode === 410 || error?.statusCode === 403) {
                    console.log('Removing invalid subscription:', subscription.id);
                    await subscriptionRepo.delete(subscription.id);
                }
            }
        }
    } catch (error) {
        console.error('Error in notification worker:', error);
    }
}