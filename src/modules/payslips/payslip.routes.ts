import { Router } from 'express';
import Joi from 'joi';
import { PayslipController } from './payslip.controller';
import { validate } from '../../common/middlewares/validate.middleware';

const router = Router();
const controller = new PayslipController();

const record = Joi.object({
    company: Joi.string().trim().max(100).allow('').default(''),
    month: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).required(),
    employeePf: Joi.number().min(0).required(),
    employerPf: Joi.number().min(0).allow(null),
    gross: Joi.number().min(0).allow(null),
});

router.get('/status', controller.status);
router.post('/connect', controller.connect);
router.post('/disconnect', controller.disconnect);
router.put('/folder', validate(Joi.object({ folder: Joi.string().trim().required() })), controller.setFolder);
router.post('/sync', controller.sync);

router.get('/summary', controller.summary);
router.get('/records', controller.list);
router.post('/records', validate(record), controller.create);
router.put('/records/:id', validate(record), controller.update);
router.post('/records/:id/review', controller.review);
router.delete('/records/:id', controller.remove);

export default router;
