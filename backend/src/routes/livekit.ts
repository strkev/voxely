import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { generateToken } from '../controllers/livekit';

const router = Router();

// Requires valid JWT – prevents unauthenticated token generation
router.post('/token', authenticate, generateToken);

export default router;
