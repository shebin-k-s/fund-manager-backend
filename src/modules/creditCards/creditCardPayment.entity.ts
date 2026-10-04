import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
} from 'typeorm';
import { CreditCard } from './creditCard.entity';

@Entity('credit_card_payments')
@Unique(['card', 'cycle'])
export class CreditCardPayment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // When the bill was actually paid (defaults to when it was recorded)
    @Column({ type: 'timestamp', default: () => 'now()' })
    date: Date;

    @Column()
    cycle: string; // YYYY-MM


    @Column('decimal', {
        precision: 12,
        scale: 2,
        transformer: {
            to: (value: number) => value, 
            from: (value: string) => parseFloat(value) 
        }
    })
    amount: number;

    @ManyToOne(() => CreditCard, (card) => card.payments, {
        onDelete: 'CASCADE',
    })
    card: CreditCard;
}