import { expressjwt as jwt } from 'express-jwt';
import db from '../_helpers/db';
export default function authorize(roles: any = []) {
    if (typeof roles === 'string') {
        roles = [roles];
    }
    return [
        (req: any, res: any, next: any) => {
            const secret = process.env.SECRET;
            if (!secret) {
                console.error("JWT Secret is missing!");
                return res.status(500).json({ message: "Internal server error" });
            }
            const middleware = jwt({ secret, algorithms: ['HS256'], requestProperty: 'user' });
            return middleware(req, res, next);
        },

        async (req: any, res: any, next: any) => {
            if (!db.Account) {
                return res.status(500).json({
                    message: 'Database is currently unavailable. Please try again later.',
                });
            }
            const account = await db.Account.findByPk(req.user.id);

            if (!account || (roles.length && !roles.includes(account.role))) {
            return res.status(401).json({ message: 'Unauthorized' });
            }
            req.user.role = account.role;
            const refreshTokens = await account.getRefreshTokens();
            req.user.ownsToken = (token: any) => !!refreshTokens.find((x: any) =>
            x.token === token);
            next();
        }
    ];
}