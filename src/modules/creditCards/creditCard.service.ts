import { AppDataSource } from '../../config/data.source';
import { CreditCard } from './creditCard.entity';
import { CreditCardPayment } from './creditCardPayment.entity';

export class CreditCardService {
    private cardRepo = AppDataSource.getRepository(CreditCard);
    private paymentRepo = AppDataSource.getRepository(CreditCardPayment);

    async getAll() {
        return this.cardRepo.find({
            relations: ['payments'],
            order: { createdAt: 'DESC' },
        });
    }

    async getById(id: string) {
        const card = await this.cardRepo.findOne({
            where: { id },
            relations: ['payments'],
        });

        if (!card) {
            throw { status: 404, message: 'Credit card not found' };
        }

        return card;
    }

    async create(data: Partial<CreditCard>) {
        const card = this.cardRepo.create(data);
        return this.cardRepo.save(card);
    }

    async update(id: string, data: Partial<CreditCard>) {
        const card = await this.getById(id);

        Object.assign(card, data);
        return this.cardRepo.save(card);
    }

    async delete(id: string) {
        const card = await this.getById(id);
        await this.cardRepo.remove(card);

        return { message: 'Deleted successfully' };
    }

    async markPaid(cardId: string, cycle: string, amount: number) {
        const card = await this.getById(cardId);

        // Check if payment already exists for this cycle
        const existingPayment = await this.paymentRepo.findOne({
            where: {
                card: { id: cardId },
                cycle
            }
        });

        if (existingPayment) {
            throw { status: 400, message: 'Payment already exists for this cycle' };
        }

        // Create new payment
        const payment = this.paymentRepo.create({
            card,
            cycle,
            amount,
        });

        await this.paymentRepo.save(payment);

        // Return the updated card with all payments
        return this.getById(cardId);
    }

    async removePaid(cardId: string, cycle: string) {
        const card = await this.getById(cardId);

        const payment = await this.paymentRepo.findOne({
            where: {
                card: { id: cardId },
                cycle
            }
        });

        if (!payment) {
            throw { status: 404, message: 'Payment not found' };
        }

        await this.paymentRepo.remove(payment);

        // Return the updated card with all payments
        return this.getById(cardId);
    }
}