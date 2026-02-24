import { AppDataSource } from '../../config/data.source';
import { Fund } from './fund.entity';
import { FundPayment } from './fundPayment.entity';

export class FundService {
    private fundRepo = AppDataSource.getRepository(Fund);
    private paymentRepo = AppDataSource.getRepository(FundPayment);

    getAll() {
        return this.fundRepo.find({
            relations: ['payments'],
            order: { createdAt: 'DESC' }
        });
    }

    async getById(id: string) {
        const fund = await this.fundRepo.findOne({
            where: { id },
            relations: ['payments'],
        });

        if (!fund) {
            throw { status: 404, message: 'Fund not found' };
        }

        return fund;
    }

    async create(data: Partial<Fund>) {
        const fund = this.fundRepo.create(data);
        return this.fundRepo.save(fund);
    }

    async update(id: string, data: Partial<Fund>) {
        const fund = await this.getById(id);
        Object.assign(fund, data);
        return this.fundRepo.save(fund);
    }

    async delete(id: string) {
        const fund = await this.getById(id);
        await this.fundRepo.remove(fund);
        return { message: 'Deleted successfully' };
    }

    async markPaid(fundId: string, date: string, amount: number) {
        const fund = await this.getById(fundId);

        // Check if payment already exists for this date
        const existingPayment = await this.paymentRepo.findOne({
            where: {
                fund: { id: fundId },
                date
            }
        });

        if (existingPayment) {
            throw { status: 400, message: 'Payment already exists for this date' };
        }

        // Create new payment
        const payment = this.paymentRepo.create({
            fund,
            date,
            amount,
        });

        await this.paymentRepo.save(payment);

        // Return the updated fund with all payments
        return this.getById(fundId);
    }

    async removePaid(fundId: string, date: string) {
        const fund = await this.getById(fundId);

        const payment = await this.paymentRepo.findOne({
            where: {
                fund: { id: fundId },
                date
            }
        });

        if (!payment) {
            throw { status: 404, message: 'Payment not found' };
        }

        await this.paymentRepo.remove(payment);

        // Return the updated fund with all payments
        return this.getById(fundId);
    }
}