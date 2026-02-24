import { Request, Response, NextFunction } from "express";
import { ObjectSchema } from "joi";
import { ApiError } from "./error.middleware";

export const validate =
    (schema: ObjectSchema) =>
        (req: Request, res: Response, next: NextFunction) => {
            if (!req.body) {
                throw new ApiError("Request body is missing", 400);
            }

            const { error, value } = schema.validate(
                req.body,
                {
                    abortEarly: false,
                    errors: {
                        wrap: {
                            label: false
                        }
                    }
                });

            if (error) {
                const messages = error.details.map((d) => d.message).join(", ");

                throw new ApiError(messages, 400);
            }
            req.body = value;
            next();
        };
