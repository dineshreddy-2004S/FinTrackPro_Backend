import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db.js';
import { getDetailedQuote } from '../services/marketData.js';

// ==========================================
// 1. Get Portfolio Summary & Holdings
// ==========================================
export const getPortfolio = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: Missing user token' });
  }

  try {
    // 1. Ensure Table Exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holdings (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        ticker VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        asset_class VARCHAR(50) DEFAULT 'Stocks',
        shares DECIMAL(15, 4) NOT NULL DEFAULT 0,
        cost_basis DECIMAL(15, 2) NOT NULL DEFAULT 0,
        purchase_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX user_idx (user_id)
      )
    `);

    // 2. Query Holdings safely using SELECT *
    const [rawRows] = await pool.query(
      'SELECT * FROM holdings WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    let totalMarketValue = 0;
    let totalCostBasis = 0;
    let totalProjectedAnnualDividends = 0;

    // 3. Process Each Holding Safely
    const enrichedHoldings = await Promise.all(
      rawRows.map(async (row) => {
        const ticker = (row.ticker || '').trim().toUpperCase();
        let quote;

        try {
          quote = await getDetailedQuote(ticker);
        } catch (quoteErr) {
          console.warn(`[Quote Warning for ${ticker}]:`, quoteErr.message);
          quote = { price: Number(row.cost_basis) || 100, name: row.name || ticker };
        }

        const shares = Number(row.shares) || 0;
        const costBasis = Number(row.cost_basis) || 0;
        const currentPrice = Number(quote?.price) || costBasis || 0;

        const totalCost = Number((shares * costBasis).toFixed(2));
        const marketValue = Number((shares * currentPrice).toFixed(2));
        const gainLossRupees = Number((marketValue - totalCost).toFixed(2));
        const gainLossPercent = totalCost > 0 ? Number(((gainLossRupees / totalCost) * 100).toFixed(2)) : 0;
        const divYield = Number(quote?.estimatedDivYield || 1.2);

        totalMarketValue += marketValue;
        totalCostBasis += totalCost;
        totalProjectedAnnualDividends += (marketValue * divYield) / 100;

        return {
          id: row.id,
          ticker,
          name: row.name || quote?.name || ticker,
          assetClass: row.asset_class || 'Stocks',
          shares,
          costBasis,
          currentPrice,
          marketValue,
          totalCost,
          gainLossRupees,
          gainLossPercent,
          estimatedDivYield: divYield,
        };
      })
    );

    // 4. Portfolio Return Aggregations
    const totalGainLossRupees = Number((totalMarketValue - totalCostBasis).toFixed(2));
    const totalReturnPercent = totalCostBasis > 0 
      ? Number(((totalGainLossRupees / totalCostBasis) * 100).toFixed(2)) 
      : 0;

    let maxWeight = 0;
    const finalHoldings = enrichedHoldings.map((h) => {
      const weight = totalMarketValue > 0 ? Number(((h.marketValue / totalMarketValue) * 100).toFixed(2)) : 0;
      if (weight > maxWeight) maxWeight = weight;
      return { ...h, weight };
    });

    // 5. Allocation Breakdown
    const allocationMap = {};
    finalHoldings.forEach((h) => {
      allocationMap[h.assetClass] = (allocationMap[h.assetClass] || 0) + h.marketValue;
    });

    const assetAllocation = Object.entries(allocationMap).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
      percentage: totalMarketValue > 0 ? Number(((value / totalMarketValue) * 100).toFixed(2)) : 0,
    }));

    // 6. Top 5 Holdings
    const topHoldings = [...finalHoldings]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5)
      .map((h, idx) => ({
        rank: idx + 1,
        ticker: h.ticker,
        marketValue: h.marketValue,
        weight: h.weight,
      }));

    // 7. Capital Gains Liability (LTCG @ 12.5% over ₹1.25L exemption)
    const taxableGains = Math.max(0, totalGainLossRupees - 125000);
    const projectedTaxLiability = Number((taxableGains * 0.125).toFixed(2));

    return res.status(200).json({
      summary: {
        totalMarketValue: Number(totalMarketValue.toFixed(2)),
        totalCostBasis: Number(totalCostBasis.toFixed(2)),
        totalGainLossRupees,
        totalReturnPercent,
        projectedTaxLiability,
        totalProjectedAnnualDividends: Number(totalProjectedAnnualDividends.toFixed(2)),
        maxSingleHoldingWeight: maxWeight,
        riskLevel: maxWeight > 40 ? 'High Concentration' : maxWeight > 25 ? 'Moderate' : 'Diversified',
        lastUpdated: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      },
      holdings: finalHoldings,
      assetAllocation,
      topHoldings,
    });
  } catch (err) {
    console.error('====================================');
    console.error('🔥 [CRITICAL GET PORTFOLIO ERROR]:', err);
    console.error('====================================');
    return res.status(500).json({
      message: 'Failed to retrieve portfolio data',
      error: err.message,
    });
  }
};

// ==========================================
// 2. Add New Holding
// ==========================================
export const addHolding = async (req, res) => {
  const userId = req.user?.id;
  const { ticker, name, assetClass, shares, costBasis, purchaseDate } = req.body;

  if (!ticker || shares === undefined || costBasis === undefined) {
    return res.status(400).json({ message: 'Ticker, shares quantity, and cost basis are required.' });
  }

  const numShares = Number(shares);
  const numCostBasis = Number(costBasis);

  if (numShares <= 0 || numCostBasis <= 0) {
    return res.status(400).json({ message: 'Shares and buy price must be positive numbers.' });
  }

  try {
    const id = uuidv4();
    const cleanTicker = ticker.trim().toUpperCase();
    const resolvedName = name?.trim() || cleanTicker;
    const resolvedAssetClass = assetClass || 'Stocks';
    const resolvedDate = purchaseDate || new Date().toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO holdings (id, user_id, ticker, name, asset_class, shares, cost_basis, purchase_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, cleanTicker, resolvedName, resolvedAssetClass, numShares, numCostBasis, resolvedDate]
    );

    return res.status(201).json({ message: 'Holding registered successfully', id });
  } catch (err) {
    console.error('[Portfolio Add Error]:', err);
    return res.status(500).json({ message: 'Error adding holding', error: err.message });
  }
};

// ==========================================
// 3. Delete Holding
// ==========================================
export const deleteHolding = async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Holding ID is required.' });
  }

  try {
    const [result] = await pool.query(
      'DELETE FROM holdings WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Holding not found or unauthorized.' });
    }

    return res.json({ message: 'Holding deleted successfully' });
  } catch (err) {
    console.error('[Portfolio Delete Error]:', err);
    return res.status(500).json({ message: 'Error deleting holding', error: err.message });
  }
};

export default {
  getPortfolio,
  addHolding,
  deleteHolding,
};