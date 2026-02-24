import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    CreateDateColumn,
} from 'typeorm';
import { CreditCardPayment } from './creditCardPayment.entity';

@Entity('credit_cards')
export class CreditCard {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ length: 4 })
    lastFour: string;

    @Column()
    billDate: number; // 1-31

    @Column()
    dueDate: number; // 1-31

    @Column({ type: 'date' })
    billingStartDate: string;

    @OneToMany(() => CreditCardPayment, (payment) => payment.card)
    payments: CreditCardPayment[];

    @CreateDateColumn()
    createdAt: Date;
}