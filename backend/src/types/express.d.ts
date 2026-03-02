// Extend Express Request type to include the authenticated user
// Set by src/middleware/authenticate.ts
declare namespace Express {
    interface Request {
        user?: {
            userId: string;
            email: string;
        };
    }
}
