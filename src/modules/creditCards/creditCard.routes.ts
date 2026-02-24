import { Router } from 'express';
import { CreditCardController } from './creditCard.controller';
import { validate } from '../../common/middlewares/validate.middleware';
import {
    createCardSchema,
    updateCardSchema,
    cardPaymentSchema,
} from './creditCard.validation';

const router = Router();
const controller = new CreditCardController();

/**
 * GET /api/credit-cards
 * Get all credit cards
 */
router.get('/', controller.getAll);

/**
 * GET /api/credit-cards/:id
 * Get single credit card by ID
 */
router.get('/:id', controller.getById);

/**
 * POST /api/credit-cards
 * Create new credit card
 */
router.post(
    '/',
    validate(createCardSchema),
    controller.create
);

/**
 * PUT /api/credit-cards/:id
 * Update credit card
 */
router.put(
    '/:id',
    validate(updateCardSchema),
    controller.update
);

/**
 * DELETE /api/credit-cards/:id
 * Delete credit card
 */
router.delete('/:id', controller.delete);

/**
 * POST /api/credit-cards/:cardId/payments
 * Mark billing cycle as paid
 */
router.post(
    '/:cardId/payments',
    validate(cardPaymentSchema),
    controller.markPaid
);

/**
 * DELETE /api/credit-cards/:cardId/payments/:cycle
 * Remove payment for billing cycle
 */
router.delete(
    '/:cardId/payments/:cycle',
    controller.removePaid
);

export default router;