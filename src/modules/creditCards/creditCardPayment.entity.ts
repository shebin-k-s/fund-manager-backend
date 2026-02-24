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