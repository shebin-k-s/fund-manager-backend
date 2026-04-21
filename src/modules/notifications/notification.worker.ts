import cron from 'node-cron';
import webpush from '../lib/webpush';
import { AppDataSource } from '../../config/data.source';
import { NotificationSubscription } from './notificationSubscription.entity';
import { CreditCard } from '../creditCards/creditCard.entity';
import { Fund } from '../funds/fund.entity';

export const initNotificationWorker = () => {
    console.log('Initializing Notification Worker...');

    // Runs every day at 12:00 AM
    cron.schedule('0 12 * * *', async () => {
        console.log('Running daily dues reminder check...');
        await checkAndNotifyAllUsers();
    });
};

async function checkAndNotifyAllUsers() {
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

        // TODO: Add your real pending-dues logic here using cards and funds

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
                        title: 'Daily Dues Reminder',
                        body: 'You have unpaid bills. Open the app to view details.',
                        url: '/',
                    })
                );
                console.log('Push sent to subscription:', subscription.id);
            } catch (error: any) {
                console.error('Error sending push to subscription:', subscription.id, error);
                // 410 = subscription expired/invalid, remove it
                if (error?.statusCode === 410) {
                    console.log('Removing expired subscription:', subscription.id);
                    await subscriptionRepo.delete(subscription.id);
                }
            }
        }
    } catch (error) {
        console.error('Error in notification worker:', error);
    }
}