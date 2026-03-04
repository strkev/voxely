import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    sendRequest,
    getRequests,
    acceptRequest,
    declineRequest,
    getFriends,
    removeFriend,
} from '../controllers/friends';

const router = Router();

// All friends routes require authentication
router.use(authenticate);

// Friend requests
router.post('/request', sendRequest);
router.get('/requests', getRequests);
router.post('/requests/:id/accept', acceptRequest);
router.delete('/requests/:id', declineRequest);

// Friends list
router.get('/', getFriends);
router.delete('/:friendId', removeFriend);

export default router;
