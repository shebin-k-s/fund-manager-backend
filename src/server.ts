import app from './app';
import dotenv from 'dotenv';
import { AppDataSource } from './config/data.source';

dotenv.config();

const PORT = process.env.PORT || 5000;

AppDataSource.initialize()
    .then(() => {
        console.log('Database connected');
        app.listen(PORT, () =>
            console.log(`Server running on port ${PORT}`)
        );
    })
    .catch((err) => {
        console.error('DB Error:', err);
    });