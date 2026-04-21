import { Router } from 'express';
import { AppDataSource } from '../../config/data.source';
import { NotificationSubscription } from './notificationSubscription.entity';

const router = Router();
const subscriptionRepository = AppDataSource.getRepository(NotificationSubscription);

router.post('/subscribe', async (req, res) => {
    try {
        const subscription = req.body;
        console.log('Received subscription request for endpoint:', subscription.endpoint);

        // Check if subscription already exists
        let existing = await subscriptionRepository.findOne({
            where: { endpoint: subscription.endpoint }
        });

        if (existing) {
            console.log('Updating existing subscription...');
            existing.keys = subscription.keys;
            await subscriptionRepository.save(existing);
        } else {
            console.log('Creating new subscription...');
            const newSub = subscriptionRepository.create({
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                expirationTime: subscription.expirationTime
            });
            await subscriptionRepository.save(newSub);
        }

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

router.post('/test', async (req, res) => {
    console.log('Triggering test notification...');
    const webpush = require('web-push');
    const subscriptions = await subscriptionRepository.find();
    console.log(`Found ${subscriptions.length} active subscriptions.`);

    const results = await Promise.allSettled(subscriptions.map(sub => {
        console.log('Sending push to:', sub.endpoint);
        return webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({
                title: 'Test Notification',
                body: 'It works! This is a test push notification. 🎉',
                url: '/'
            })
        );
    }));

    console.log('Test notification results:', results);
    res.json({ success: true, count: subscriptions.length, results });
});

export default router;
