import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_subscriptions')
export class NotificationSubscription {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    endpoint: string;

    @Column({ nullable: true })
    expirationTime: string;

    @Column('jsonb')
    keys: {
        p256dh: string;
        auth: string;
    };

    // Set when a push is sent to this subscription. Compared against
    // lastConfirmedAt to detect a subscription that's accepted by the push
    // service but never actually delivered to the device.
    @Column({ type: 'timestamp', nullable: true })
    lastTriggeredAt: Date | null;

    // Set when the service worker reports it actually received and showed a
    // push — real delivery confirmation, not just "the push service accepted
    // the request."
    @Column({ type: 'timestamp', nullable: true })
    lastConfirmedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
