import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db.js';
import { getDetailedQuote, getHistoricalTrends } from '../services/marketData.js';

// 1. Get ALL Listed Indian Companies with Database Pagination & Search
export const getListedCompanies = async (req, res) => {
  const { search = '', sector = 'All', group = 'All', page = 1, limit = 20 } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * pageSize;

  try {
    let whereClauses = ['1=1'];
    let queryParams = [];

    if (search.trim()) {
      whereClauses.push('(ticker LIKE ? OR name LIKE ?)');
      queryParams.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (sector !== 'All') {
      whereClauses.push('sector = ?');
      queryParams.push(sector);
    }

    if (group !== 'All') {
      whereClauses.push('market_cap_group = ?');
      queryParams.push(group);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM listed_companies WHERE ${whereSql}`,
      queryParams
    );
    const totalRecords = countResult[0]?.total || 0;

    const [rows] = await pool.query(
      `SELECT ticker, name, sector, industry, market_cap_group AS \`group\`
       FROM listed_companies 
       WHERE ${whereSql}
       ORDER BY ticker ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    );

    const [sectorRows] = await pool.query('SELECT DISTINCT sector FROM listed_companies ORDER BY sector ASC');
    const [groupRows] = await pool.query('SELECT DISTINCT market_cap_group AS \`group\` FROM listed_companies ORDER BY market_cap_group ASC');

    const enriched = await Promise.all(
      rows.map(async (item) => {
        const q = await getDetailedQuote(item.ticker);
        return {
          ...item,
          price: q.price,
          changePercent: q.changePercent,
          marketCap: q.marketCap,
          volume: q.volume,
        };
      })
    );

    res.json({
      total: totalRecords,
      page: pageNum,
      pageSize,
      totalPages: Math.ceil(totalRecords / pageSize),
      companies: enriched,
      sectors: ['All', ...sectorRows.map((r) => r.sector)],
      groups: ['All', ...groupRows.map((r) => r.group)],
    });
  } catch (err) {
    console.error('[Listed Companies Error]:', err);
    res.status(500).json({ message: 'Error retrieving listed companies', error: err.message });
  }
};

// 2. Fetch User Watchlist
export const getWatchlist = async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        ticker VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        sector VARCHAR(50) DEFAULT 'General',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY user_ticker_idx (user_id, ticker),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    const [rows] = await pool.query(
      'SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const enriched = await Promise.all(
      rows.map(async (item) => {
        const q = await getDetailedQuote(item.ticker);
        return {
          id: item.id,
          ticker: item.ticker,
          name: item.name,
          sector: item.sector,
          price: q.price,
          change: q.change,
          changePercent: q.changePercent,
          dayHigh: q.dayHigh,
          dayLow: q.dayLow,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          volume: q.volume,
          marketCap: q.marketCap,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error('[Watchlist Controller Error]:', err.message);
    res.status(200).json([]);
  }
};

// 3. Add to Watchlist
export const addToWatchlist = async (req, res) => {
  const userId = req.user.id;
  const { ticker, name, sector } = req.body;

  try {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO watchlist (id, user_id, ticker, name, sector) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [id, userId, ticker.toUpperCase(), name, sector || 'General']
    );
    res.status(201).json({ message: 'Added to watchlist', id });
  } catch (err) {
    console.error('[Add Watchlist Error]:', err.message);
    res.status(500).json({ message: 'Error adding to watchlist', error: err.message });
  }
};

// 4. Remove from Watchlist
export const removeFromWatchlist = async (req, res) => {
  const userId = req.user.id;
  const { ticker } = req.params;

  try {
    await pool.query('DELETE FROM watchlist WHERE user_id = ? AND ticker = ?', [userId, ticker.toUpperCase()]);
    res.json({ message: 'Removed from watchlist' });
  } catch (err) {
    console.error('[Remove Watchlist Error]:', err.message);
    res.status(500).json({ message: 'Error removing from watchlist', error: err.message });
  }
};

// 5. Stock Trend Historical Performance (Dynamic Range Filtering)
export const getStockTrend = async (req, res) => {
  const { ticker } = req.params;
  const { period = '1M', startDate, endDate } = req.query;

  try {
    const quote = await getDetailedQuote(ticker);
    const history = await getHistoricalTrends(ticker, period, startDate, endDate);

    if (!history || history.length === 0) {
      return res.json({
        ticker: ticker.toUpperCase(),
        name: quote.name,
        currentPrice: quote.price,
        open: quote.open,
        previousClose: quote.previousClose,
        marketCap: quote.marketCap,
        volume: quote.volume,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        periodChange: 0,
        periodChangePercent: 0,
        history: [],
      });
    }

    const periodStartCandle = history[0];
    const periodEndCandle = history[history.length - 1];

    const periodOpen = periodStartCandle.open || periodStartCandle.close;
    const periodClose = periodEndCandle.close;

    const periodHigh = Math.max(...history.map((c) => Number(c.high || c.close)));
    const periodLow = Math.min(...history.map((c) => Number(c.low || c.close)));
    const periodVolume = history.reduce((sum, c) => sum + (Number(c.volume) || 0), 0);

    const periodChange = Number((periodClose - periodOpen).toFixed(2));
    const periodChangePercent = periodOpen > 0 
      ? Number(((periodChange / periodOpen) * 100).toFixed(2)) 
      : 0;

    res.json({
      ticker: ticker.toUpperCase(),
      name: quote.name,
      currentPrice: periodClose,
      open: periodOpen,
      dayHigh: periodHigh,
      dayLow: periodLow,
      volume: periodVolume,
      marketCap: quote.marketCap,
      periodChange,
      periodChangePercent,
      history,
    });
  } catch (err) {
    console.error('[Stock Trend Error]:', err.message);
    res.status(500).json({ message: 'Error generating stock trend', error: err.message });
  }
};