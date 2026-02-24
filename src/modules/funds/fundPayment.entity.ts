import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
} from 'typeorm';
import { Fund } from './fund.entity';

@Entity('fund_payments')
@Unique(['fund', 'date'])
export class FundPayment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'date' })
    date: string;


    @Column('decimal', {
        precision: 12,
        scale: 2,
        transformer: {
            to: (value: number) => value,
            from: (value: string) => parseFloat(value)
        }
    })
    amount: number;

    @ManyToOne(() => Fund, (fund) => fund.payments, {
        onDelete: 'CASCADE',
    })
    fund: Fund;
}