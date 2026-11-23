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

    // 3. Process Each Holding Safely (supports alternate column names)
    const enrichedHoldings = await Promise.all(
      rawRows.map(async (row) => {
        const ticker = (row.ticker || row.symbol || '').trim().toUpperCase();
        const shares = Number(row.shares ?? row.quantity) || 0;
        const costBasis = Number(row.cost_basis ?? row.buy_price ?? row.avg_price) || 0;
        const resolvedName = row.name || row.company_name || ticker;
        const resolvedAssetClass = row.asset_class || row.category || 'Stocks';

        let quote;
        try {
          quote = await getDetailedQuote(ticker);
        } catch (quoteErr) {
          console.warn(`[Quote Warning for ${ticker}]:`, quoteErr.message);
          quote = { price: costBasis || 100, name: resolvedName };
        }

        const currentPrice = Number(quote?.price) || costBasis || 0;

        const totalCost = Number((shares * costBasis).toFixed(2));
        const marketValue = Number((shares * currentPrice).toFixed(2));
        const gainLossRupees = Number((marketValue - totalCost).toFixed(2));
        const gainLossPercent =
          totalCost > 0 ? Number(((gainLossRupees / totalCost) * 100).toFixed(2)) : 0;
        const divYield = Number(quote?.estimatedDivYield || 1.2);

        totalMarketValue += marketValue;
        totalCostBasis += totalCost;
        totalProjectedAnnualDividends += (marketValue * divYield) / 100;

        return {
          id: row.id,
          ticker,
          name: resolvedName || quote?.name || ticker,
          assetClass: resolvedAssetClass,
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
    const totalReturnPercent =
      totalCostBasis > 0
        ? Number(((totalGainLossRupees / totalCostBasis) * 100).toFixed(2))
        : 0;

    let maxWeight = 0;
    const finalHoldings = enrichedHoldings.map((h) => {
      const weight =
        totalMarketValue > 0 ? Number(((h.marketValue / totalMarketValue) * 100).toFixed(2)) : 0;
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
        riskLevel:
          maxWeight > 40 ? 'High Concentration' : maxWeight > 25 ? 'Moderate' : 'Diversified',
        lastUpdated: new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
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
// 2. Add New Holding (Schema-Adaptive)
// ==========================================
export const addHolding = async (req, res) => {
  const userId = req.user?.id;
  const rawTicker = req.body.ticker || req.body.symbol;
  const rawShares = req.body.shares ?? req.body.quantity;
  const rawCost =
    req.body.costBasis ?? req.body.buyPrice ?? req.body.avgPrice ?? req.body.cost_basis;
  const { name, assetClass, purchaseDate } = req.body;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: Missing user token.' });
  }

  if (!rawTicker || rawShares === undefined || rawCost === undefined) {
    return res.status(400).json({ message: 'Ticker, shares quantity, and cost basis are required.' });
  }

  const numShares = Number(rawShares);
  const numCostBasis = Number(rawCost);

  if (Number.isNaN(numShares) || Number.isNaN(numCostBasis) || numShares <= 0 || numCostBasis <= 0) {
    return res.status(400).json({ message: 'Shares and buy price must be positive numbers.' });
  }

  try {
    // Ensure table exists if not created yet
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

    // Inspect actual TiDB Cloud columns to avoid ER_BAD_FIELD_ERROR
    const [columns] = await pool.query('SHOW COLUMNS FROM holdings');
    const colMap = new Map(columns.map((c) => [c.Field.toLowerCase(), c]));

    const id = uuidv4();
    const cleanTicker = rawTicker.trim().toUpperCase();
    const resolvedName = name?.trim() || cleanTicker;
    const resolvedAssetClass = assetClass || 'Stocks';
    const resolvedDate = purchaseDate || new Date().toISOString().split('T')[0];

    const insertCols = [];
    const insertVals = [];

    const idCol = colMap.get('id');
    if (idCol && !idCol.Extra.includes('auto_increment')) {
      insertCols.push('id');
      insertVals.push(id);
    }

    if (colMap.has('user_id')) {
      insertCols.push('user_id');
      insertVals.push(userId);
    }

    if (colMap.has('ticker')) {
      insertCols.push('ticker');
      insertVals.push(cleanTicker);
    } else if (colMap.has('symbol')) {
      insertCols.push('symbol');
      insertVals.push(cleanTicker);
    }

    if (colMap.has('name')) {
      insertCols.push('name');
      insertVals.push(resolvedName);
    } else if (colMap.has('company_name')) {
      insertCols.push('company_name');
      insertVals.push(resolvedName);
    }

    if (colMap.has('asset_class')) {
      insertCols.push('asset_class');
      insertVals.push(resolvedAssetClass);
    } else if (colMap.has('category')) {
      insertCols.push('category');
      insertVals.push(resolvedAssetClass);
    }

    if (colMap.has('shares')) {
      insertCols.push('shares');
      insertVals.push(numShares);
    } else if (colMap.has('quantity')) {
      insertCols.push('quantity');
      insertVals.push(numShares);
    }

    if (colMap.has('cost_basis')) {
      insertCols.push('cost_basis');
      insertVals.push(numCostBasis);
    } else if (colMap.has('buy_price')) {
      insertCols.push('buy_price');
      insertVals.push(numCostBasis);
    } else if (colMap.has('avg_price')) {
      insertCols.push('avg_price');
      insertVals.push(numCostBasis);
    }

    if (colMap.has('purchase_date')) {
      insertCols.push('purchase_date');
      insertVals.push(resolvedDate);
    }

    const placeholders = insertCols.map(() => '?').join(', ');
    const sql = `INSERT INTO holdings (${insertCols.join(', ')}) VALUES (${placeholders})`;

    await pool.query(sql, insertVals);

    return res.status(201).json({ message: 'Holding registered successfully', id });
  } catch (err) {
    console.error('🔥 [Portfolio Add Error]:', {
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
      sql: err.sql,
    });
    return res.status(500).json({
      message: 'Error adding holding',
      error: err.sqlMessage || err.message,
    });
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