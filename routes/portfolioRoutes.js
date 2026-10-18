import express from 'express';
import { getPortfolio, addHolding, deleteHolding } from '../controllers/portfolioController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getPortfolio);
router.post('/holding', addHolding);
router.delete('/holding/:id', deleteHolding);

export default router;