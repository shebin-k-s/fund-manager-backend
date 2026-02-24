import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from 'express';


export const protect = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(" ")[1];

  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    next();
  } catch {
    return res.sendStatus(401);
  }
};