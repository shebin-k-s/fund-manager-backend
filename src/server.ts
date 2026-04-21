import app from './app';
import dotenv from 'dotenv';
import { AppDataSource } from './config/data.source';
import { initNotificationWorker } from './modules/notifications/notification.worker';

dotenv.config();

const PORT = process.env.PORT || 5000;

AppDataSource.initialize()
    .then(() => {
        console.log('Database connected');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            initNotificationWorker();
        });
    })
    .catch((err) => {
        console.error('DB Error:', err);
    });