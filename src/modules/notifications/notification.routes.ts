import { Router } from 'express';
import webpush from '../lib/webpush';
import { AppDataSource } from '../../config/data.source';
import { NotificationSubscription } from './notificationSubscription.entity';
import { checkAndNotifyAllUsers } from './notification.worker';

const router = Router();
const subscriptionRepository = AppDataSource.getRepository(NotificationSubscription);

router.post('/subscribe', async (req, res) => {
    try {
        const subscription = req.body;

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return res.status(400).json({ error: 'Invalid subscription object. Missing endpoint or keys.' });
        }

        console.log('Received subscription request for endpoint:', subscription.endpoint);

        // Atomic upsert (INSERT ... ON CONFLICT (endpoint) DO UPDATE) — a
        // find-then-create here would race when two components (Header and
        // DashboardPage) both auto-subscribe on the same app mount, creating
        // duplicate rows for the same endpoint.
        await subscriptionRepository.upsert(
            {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                },
                expirationTime: subscription.expirationTime ?? null,
            },
            ['endpoint']
        );

        return res.status(201).json({ success: true });
    } catch (error) {
        console.error('Error saving subscription:', error);
        return res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// Called by the service worker's 'push' handler after it actually shows a
// notification — real delivery confirmation, as opposed to /trigger's
// "sent" count which only means the push service accepted the request.
router.post('/confirm-delivery', async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Missing endpoint' });
        }

        const result = await subscriptionRepository.update(
            { endpoint },
            { lastConfirmedAt: new Date() }
        );

        return res.json({ success: true, updated: result.affected ?? 0 });
    } catch (error) {
        console.error('Error confirming delivery:', error);
        return res.status(500).json({ error: 'Failed to confirm delivery' });
    }
});

router.post('/test', async (req, res) => {
    console.log('Triggering test notification...');

    const subscriptions = await subscriptionRepository.find();
    console.log(`Found ${subscriptions.length} active subscriptions.`);

    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            const keys = sub.keys as { p256dh: string; auth: string };

            if (!keys?.p256dh || !keys?.auth) {
                throw new Error(`Invalid keys for subscription ${sub.id}`);
            }

            console.log('Sending push to:', sub.endpoint);
            return webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: keys.p256dh,
                        auth: keys.auth,
                    },
                },
                JSON.stringify({
                    title: 'Test Notification',
                    body: 'It works! This is a test push notification.',
                    url: '/',
                })
            );
        })
    );

    // Clean up expired subscriptions (status 410)
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected' && (result.reason as any)?.statusCode === 410) {
            console.log('Removing expired subscription:', subscriptions[i].id);
            await subscriptionRepository.delete(subscriptions[i].id);
        }
    }

    console.log('Test notification results:', results);
    return res.json({ success: true, count: subscriptions.length, results });
});

router.post('/trigger', async (req, res) => {
    try {
        console.log('Manually triggering daily push notifications...');
        const result = await checkAndNotifyAllUsers();
        return res.json({ success: true, message: 'Push notifications triggered successfully', ...result });
    } catch (error) {
        console.error('Error in manual trigger:', error);
        return res.status(500).json({ error: 'Failed to trigger notifications' });
    }
});

export default router;