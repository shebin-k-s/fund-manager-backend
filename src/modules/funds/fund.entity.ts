import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    CreateDateColumn,
} from 'typeorm';
import { FundPayment } from './fundPayment.entity';

@Entity('funds')
export class Fund {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column('decimal', { precision: 12, scale: 2 })
    amount: number;

    @Column()
    recurrence: 'weekly' | 'monthly';

    @Column({ nullable: true })
    dayOfWeek?: number;

    @Column({ nullable: true })
    dayOfMonth?: number;

    @Column({ type: 'date' })
    startDate: string;

    @Column({ type: 'date', nullable: true })
    endDate?: string;

    @OneToMany(() => FundPayment, (payment) => payment.fund)
    payments: FundPayment[];

    @CreateDateColumn()
    createdAt: Date;
}