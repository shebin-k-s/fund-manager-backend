import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_subscriptions')
export class NotificationSubscription {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    endpoint: string;

    @Column({ nullable: true })
    expirationTime: string;

    @Column('jsonb')
    keys: {
        p256dh: string;
        auth: string;
    };

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
