import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { register, login, logout, getMe, deleteAccount, updateProfile } from '../controllers/auth';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Strict rate limit for auth endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    skipSuccessfulRequests: true,  // Only count failed attempts against the limit
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfile);
router.delete('/me', authenticate, deleteAccount);

export default router;
