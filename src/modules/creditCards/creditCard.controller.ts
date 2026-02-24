import { Request, Response } from 'express';
import { CreditCardService } from './creditCard.service';

const service = new CreditCardService();

export class CreditCardController {
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
        res.json(await service.delete(req.params.id as string));
    };

    markPaid = async (req: Request, res: Response) => {
        const { cycle, amount } = req.body;

        res.json(
            await service.markPaid(req.params.cardId as string, cycle, amount)
        );
    };

    removePaid = async (req: Request, res: Response) => {
        res.json(
            await service.removePaid(req.params.cardId as string, req.params.cycle as string)
        );
    };
}