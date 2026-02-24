import Joi from 'joi';

export const createCardSchema = Joi.object({
    name: Joi.string().required(),

    lastFour: Joi.string()
        .pattern(/^\d{4}$/)
        .required(),

    billDate: Joi.number().min(1).max(31).required(),

    dueDate: Joi.number().min(1).max(31).required(),

    billingStartDate: Joi.date().required(),
});

export const updateCardSchema = createCardSchema.fork(
    ['name', 'lastFour', 'billDate', 'dueDate', 'billingStartDate'],
    (schema) => schema.optional()
);

export const cardPaymentSchema = Joi.object({
    cycle: Joi.string()
        .pattern(/^\d{4}-\d{2}$/)
        .required(),

    amount: Joi.number().positive().required(),
});