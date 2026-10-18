import express from 'express';
import {
  getListedCompanies,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getStockTrend,
} from '../controllers/discoveryController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/companies', getListedCompanies);
router.get('/watchlist', getWatchlist);
router.post('/watchlist', addToWatchlist);
router.delete('/watchlist/:ticker', removeFromWatchlist);
router.get('/trend/:ticker', getStockTrend);

export default router;