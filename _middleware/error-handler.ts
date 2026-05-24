import { Request, Response, NextFunction } from 'express';
export default function errorHandler(err: any, req: Request, res: Response, next:
NextFunction) {
    switch (true) {
        case typeof err === 'string':
            const is404 = err.toLowerCase().endsWith('not found');
            const statusCode = is404 ? 404 : 400;
            return res.status(statusCode).json({ message: err });
        case err.name === 'UnauthorizedError':
            return res.status(401).json({ message: 'Unauthorized' });
        case err instanceof TypeError:
            return res.status(500).json({
                message: 'Database is currently unavailable. Please try again later.',
            });
        default:
            return res.status(500).json({ message: err.message });
    }
}