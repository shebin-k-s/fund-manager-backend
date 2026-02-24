import Joi from 'joi';

export const createFundSchema = Joi.object({
    name: Joi.string().required(),
    amount: Joi.number().positive().required(),
    recurrence: Joi.string().valid('weekly', 'monthly').required(),
    dayOfWeek: Joi.number().min(0).max(6).optional(),
    dayOfMonth: Joi.number().min(1).max(31).optional(),
    startDate: Joi.date().required(),
    endDate: Joi.date().optional(),
});

export const fundPaymentSchema = Joi.object({
    date: Joi.date().required(),
    amount: Joi.number().positive().required(),
});