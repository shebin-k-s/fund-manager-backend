import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from 'joi';

export const validate =
    (schema: ObjectSchema, property: 'body' | 'params' = 'body') =>
        (req: Request, res: Response, next: NextFunction) => {
            const { error, value } = schema.validate(req[property], {
                abortEarly: false,
                stripUnknown: true,
            });

            if (error) {
                return res.status(400).json({
                    message: 'Validation error',
                    errors: error.details.map((d) => d.message),
                });
            }

            req[property] = value;
            next();
        };