import { Request, Response } from 'express';
import { FundService } from './fund.service';

const service = new FundService();

export class FundController {
    getAll = async (req: Request, res: Response) => {
        res.json(await service.getAll());
    };

    getById = async (req: Request, res: Response) => {
        res.json(await service.getById(req.params.id as string));
    };

    create = async (req: Request, res: Response) => {
        res.status(201).json(await service.create(req.body));
    };

    update = async (req: Request, res: Response) => {
        res.json(await service.update(req.params.id as string, req.body));
    };

    delete = async (req: Request, res: Response) => {
        await service.delete(req.params.id as string);
        res.json({ message: 'Deleted successfully' });
    };

    markPaid = async (req: Request, res: Response) => {
        const { date, amount } = req.body;
        res.json(await service.markPaid(req.params.fundId as string, date, amount));
    };

    removePaid = async (req: Request, res: Response) => {
        await service.removePaid(req.params.fundId as string, req.params.date as string);
        res.json({ message: 'Payment removed' });
    };
}