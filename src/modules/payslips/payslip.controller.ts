import { Request, Response } from 'express';
import * as service from './payslip.service';

export class PayslipController {
    status = async (_req: Request, res: Response) => res.json(await service.status());

    // The browser is sent to this address to approve read-only access on Google's own page.
    connect = async (_req: Request, res: Response) => res.json({ url: service.connectUrl() });

    disconnect = async (_req: Request, res: Response) => {
        await service.disconnect();
        res.json(await service.status());
    };

    setFolder = async (req: Request, res: Response) => {
        await service.setFolder(req.body.folder);
        res.json(await service.status());
    };

    sync = async (req: Request, res: Response) => res.json(await service.sync(req.query.full === 'true'));

    summary = async (_req: Request, res: Response) => res.json(await service.summary());

    list = async (_req: Request, res: Response) => res.json({ records: await service.listRecords() });

    create = async (req: Request, res: Response) => res.status(201).json(await service.saveRecord(null, req.body));

    update = async (req: Request, res: Response) => res.json(await service.saveRecord(String(req.params.id), req.body));

    remove = async (req: Request, res: Response) => {
        await service.deleteRecord(String(req.params.id));
        res.status(204).end();
    };
}
