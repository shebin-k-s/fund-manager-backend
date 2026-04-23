import { AppDataSource } from '../config/data.source';
import { checkAndNotifyAllUsers } from '../modules/notifications/notification.worker';

async function run() {
    try {
        await AppDataSource.initialize();
        console.log("DB connected");

        await checkAndNotifyAllUsers();

        console.log("Job completed");
        process.exit(0);
    } catch (err) {
        console.error("Job failed", err);
        process.exit(1);
    }
}

run();