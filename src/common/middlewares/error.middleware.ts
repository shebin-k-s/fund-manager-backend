import { Request, Response, NextFunction } from "express";


export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {

    const statusCode = err.statusCode || 500

    const message = err.message || "Internal Server Error"


    res.status(statusCode).json({
        success: false,
        message

    })
}





export class ApiError extends Error {

    constructor(public message: string, public statusCode: number = 500) {
        super(message)
    }
}