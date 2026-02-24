import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

dotenv.config();

const isDatabaseUrlAvailable = !!process.env.DB_URL;


export const AppDataSource = new DataSource({
    type: 'postgres',
    ...(isDatabaseUrlAvailable
        ? {
            url: process.env.DB_URL,
        }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT) || 5432,
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        }),
    synchronize: true,
    logging: false,

    entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
    migrations: [],
    subscribers: [],
});