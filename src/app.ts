import express from 'express';
import cors from 'cors';
import fundRoutes from './modules/funds/fund.routes';
import cardRoutes from './modules/creditCards/creditCard.routes';
import { errorHandler } from './common/middlewares/error.middleware';
import morgan from "morgan";
import jwt from 'jsonwebtoken'
import { protect } from './common/middlewares/protect.middleware';
import cookieParser from "cookie-parser";
import { isKeyValid } from './common/utils/keyValid';

const app = express();

const corsOptions = {
    origin: process.env.FRONTEND_URL,
    credentials: true,
};

app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));

app.use('/api/v1/funds', protect, fundRoutes);
app.use('/api/v1/credit-cards', protect, cardRoutes);


app.post("/api/v1/unlock", (req, res) => {
    const { key } = req.body;

    const isValid = isKeyValid(key)
    if (!isValid) {
        return res.status(401).json({ error: "Invalid access key" }); // Send JSON
    }

    const accessToken = jwt.sign(
        { access: true },
        process.env.JWT_SECRET!,
        { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
        { access: true },
        process.env.REFRESH_SECRET!,
        { expiresIn: "7d" }
    );

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
        accessToken,
        success: true
    });
});

app.post("/api/v1/refresh", (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) {
        return res.status(401).json({ error: "No refresh token" }); // Send JSON
    }

    try {
        jwt.verify(token, process.env.REFRESH_SECRET!);

        const newAccessToken = jwt.sign(
            { access: true },
            process.env.JWT_SECRET!,
            { expiresIn: "15m" }
        );

        res.json({ accessToken: newAccessToken });
    } catch {
        return res.status(401).json({ error: "Invalid refresh token" }); // Send JSON
    }
});

app.use(errorHandler);

export default app;