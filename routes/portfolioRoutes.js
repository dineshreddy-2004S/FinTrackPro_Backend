import express from 'express';
import { getPortfolio, addHolding, deleteHolding } from '../controllers/portfolioController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getPortfolio);

// Support both singular and plural endpoints for adding and deleting holdings
router.post('/holding', addHolding);
router.post('/holdings', addHolding);

router.delete('/holding/:id', deleteHolding);
router.delete('/holdings/:id', deleteHolding);

export default router;