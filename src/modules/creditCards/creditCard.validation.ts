import Joi from 'joi';

export const createCardSchema = Joi.object({
    name: Joi.string()
        .required()
        .messages({
            'string.base': 'Name must be a string',
            'any.required': 'Name is required',
            'string.empty': 'Name cannot be empty',
        }),

    lastFour: Joi.string()
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.base': 'Last four digits must be a string of numbers',
            'string.pattern.base': 'Last four digits must be exactly 4 digits',
            'any.required': 'Last four digits are required',
            'string.empty': 'Last four digits cannot be empty',
        }),

    billDate: Joi.number()
        .min(1)
        .max(31)
        .required()
        .messages({
            'number.base': 'Bill date must be a number',
            'number.min': 'Bill date cannot be less than 1',
            'number.max': 'Bill date cannot be greater than 31',
            'any.required': 'Bill date is required',
        }),

    dueDate: Joi.number()
        .min(1)
        .max(31)
        .required()
        .messages({
            'number.base': 'Due date must be a number',
            'number.min': 'Due date cannot be less than 1',
            'number.max': 'Due date cannot be greater than 31',
            'any.required': 'Due date is required',
        }),

    billingStartDate: Joi.date()
        .required()
        .messages({
            'date.base': 'Billing start date must be a valid date',
            'any.required': 'Billing start date is required',
        }),
});

export const updateCardSchema = createCardSchema.fork(
    ['name', 'lastFour', 'billDate', 'dueDate', 'billingStartDate'],
    (schema) => schema.optional()
);

export const cardPaymentSchema = Joi.object({
    cycle: Joi.string()
        .pattern(/^\d{4}-\d{2}$/)
        .required()
        .messages({
            'string.base': 'Cycle must be a string',
            'string.pattern.base': 'Cycle must be in YYYY-MM format',
            'any.required': 'Cycle is required',
            'string.empty': 'Cycle cannot be empty',
        }),

    amount: Joi.number()
        .min(0)
        .required()
        .messages({
            'number.base': 'Amount must be a number',
            'number.min': 'Amount cannot be negative',
            'any.required': 'Amount is required',
        }),
});