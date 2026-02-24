import { Router } from 'express';
import { FundController } from './fund.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import { createFundSchema, fundPaymentSchema } from './fund.validations';


const router = Router();
const controller = new FundController();

/**
 * GET /api/funds
 * Get all funds
 */
router.get('/', controller.getAll);

/**
 * GET /api/funds/:id
 * Get single fund
 */
router.get('/:id', controller.getById);

/**
 * POST /api/funds
 * Create new fund
 */
router.post(
    '/',
    validate(createFundSchema),
    controller.create
);

/**
 * PUT /api/funds/:id
 * Update fund
 */
router.put(
    '/:id',
    validate(createFundSchema),
    controller.update
);

/**
 * DELETE /api/funds/:id
 * Delete fund
 */
router.delete('/:id', controller.delete);

/**
 * POST /api/funds/:fundId/payments
 * Mark fund payment
 */
router.post(
    '/:fundId/payments',
    validate(fundPaymentSchema),
    controller.markPaid
);

/**
 * DELETE /api/funds/:fundId/payments/:date
 * Remove payment for specific date
 */
router.delete(
    '/:fundId/payments/:date',
    controller.removePaid
);

export default router;