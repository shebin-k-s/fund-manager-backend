import Joi from 'joi';

export const createFundSchema = Joi.object({
    name: Joi.string()
        .required()
        .messages({
            'string.base': 'Fund name must be a string',
            'string.empty': 'Fund name cannot be empty',
            'any.required': 'Fund name is required',
        }),

    amount: Joi.number()
        .positive()
        .required()
        .messages({
            'number.base': 'Amount must be a number',
            'number.positive': 'Amount must be greater than 0',
            'any.required': 'Amount is required',
        }),

    recurrence: Joi.string()
        .valid('weekly', 'monthly')
        .required()
        .messages({
            'any.only': 'Recurrence must be either "weekly" or "monthly"',
            'any.required': 'Recurrence is required',
            'string.empty': 'Recurrence cannot be empty',
        }),

    dayOfWeek: Joi.number()
        .min(0)
        .max(6)
        .when('recurrence', { is: 'weekly', then: Joi.required(), otherwise: Joi.optional() })
        .messages({
            'number.base': 'Day of week must be a number',
            'number.min': 'Day of week cannot be less than 0 (Sunday)',
            'number.max': 'Day of week cannot be greater than 6 (Saturday)',
            'any.required': 'Day of week is required when recurrence is weekly',
        }),

    dayOfMonth: Joi.number()
        .min(1)
        .max(31)
        .when('recurrence', { is: 'monthly', then: Joi.required(), otherwise: Joi.optional() })
        .messages({
            'number.base': 'Day of month must be a number',
            'number.min': 'Day of month cannot be less than 1',
            'number.max': 'Day of month cannot be greater than 31',
            'any.required': 'Day of month is required when recurrence is monthly',
        }),

    startDate: Joi.date()
        .required()
        .messages({
            'date.base': 'Start date must be a valid date',
            'any.required': 'Start date is required',
        }),

    endDate: Joi.date()
        .greater(Joi.ref('startDate'))
        .optional()
        .messages({
            'date.base': 'End date must be a valid date',
            'date.greater': 'End date must be after start date',
        }),
});

export const fundPaymentSchema = Joi.object({
    date: Joi.date()
        .required()
        .messages({
            'date.base': 'Payment date must be a valid date',
            'any.required': 'Payment date is required',
        }),

    amount: Joi.number()
        .positive()
        .required()
        .messages({
            'number.base': 'Payment amount must be a number',
            'number.positive': 'Payment amount must be greater than 0',
            'any.required': 'Payment amount is required',
        }),
});