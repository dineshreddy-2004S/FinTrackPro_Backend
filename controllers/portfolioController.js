import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db.js';
import { getLivePrice } from '../services/marketData.js';

export const getPortfolio = async (req, res) => {
  const userId = req.user.id;

  try {
    const [holdings] = await pool.query(
      'SELECT * FROM holdings WHERE user_id = ? ORDER BY asset_class ASC, ticker ASC',
      [userId]
    );

    let totalMarketValue = 0;
    let totalCostBasis = 0;
    let totalProjectedAnnualDividends = 0;

    const enrichedHoldings = await Promise.all(
      holdings.map(async (item) => {
        const isLiquid = item.asset_class === 'Liquid';
        let currentPrice = 0;
        let marketValue = 0;
        let totalCost = 0;

        if (isLiquid) {
          marketValue = Number(item.manual_market_value || 0);
          totalCost = marketValue;
          currentPrice = 1.0;
        } else {
          currentPrice = await getLivePrice(item.ticker);
          const shares = Number(item.shares || 0);
          const costBasis = Number(item.cost_basis || 0);
          marketValue = shares * currentPrice;
          totalCost = shares * costBasis;
        }

        const gainLossRupees = marketValue - totalCost;
        const gainLossPercent = totalCost > 0 ? (gainLossRupees / totalCost) * 100 : 0;

        // Estimated dividend yield heuristics for Indian instruments
        let estimatedDivYield = 0;
        if (item.asset_class === 'Stocks') {
          estimatedDivYield = item.ticker === 'TCS' ? 2.1 : item.ticker === 'RELIANCE' ? 0.35 : 1.2;
        } else if (item.asset_class === 'ETFs') {
          estimatedDivYield = 1.1;
        } else if (item.asset_class === 'Liquid') {
          estimatedDivYield = 6.5; // FD / Savings interest yield
        }
        const annualDividend = (marketValue * estimatedDivYield) / 100;

        totalMarketValue += marketValue;
        totalCostBasis += totalCost;
        totalProjectedAnnualDividends += annualDividend;

        return {
          id: item.id,
          ticker: item.ticker,
          name: item.name,
          assetClass: item.asset_class,
          shares: isLiquid ? null : Number(item.shares),
          costBasis: isLiquid ? null : Number(item.cost_basis),
          currentPrice: isLiquid ? null : currentPrice,
          marketValue,
          totalCost,
          gainLossRupees,
          gainLossPercent,
          estimatedDivYield,
          annualDividend,
        };
      })
    );

    // Grouping asset classes
    const assetClassMap = { Stocks: 0, ETFs: 0, Alternatives: 0, Liquid: 0 };

    const itemsWithWeights = enrichedHoldings.map((h) => {
      const weight = totalMarketValue > 0 ? (h.marketValue / totalMarketValue) * 100 : 0;
      if (assetClassMap[h.assetClass] !== undefined) {
        assetClassMap[h.assetClass] += h.marketValue;
      }
      return { ...h, weight };
    });

    const totalGainLossRupees = totalMarketValue - totalCostBasis;
    const totalReturnPercent = totalCostBasis > 0 ? (totalGainLossRupees / totalCostBasis) * 100 : 0;

    // Top 5 Holdings
    const topHoldings = [...itemsWithWeights]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5)
      .map((item, index) => ({
        rank: index + 1,
        ticker: item.ticker,
        marketValue: item.marketValue,
      }));

    // Asset allocation percentages
    const assetAllocation = Object.keys(assetClassMap).map((key) => ({
      name: key,
      value: assetClassMap[key],
      percentage: totalMarketValue > 0 ? (assetClassMap[key] / totalMarketValue) * 100 : 0,
    }));

    // Indian Capital Gains Tax Projections
    // Assuming 65% LTCG & 35% STCG distribution across active equity gains
    const equityGains = totalGainLossRupees > 0 ? totalGainLossRupees : 0;
    const estimatedLtcgGains = equityGains * 0.65;
    const estimatedStcgGains = equityGains * 0.35;
    const taxableLtcg = Math.max(0, estimatedLtcgGains - 125000); // 1.25L exemption
    const projectedTaxLiability = (taxableLtcg * 0.125) + (estimatedStcgGains * 0.20);

    // Portfolio Risk Score (Concentration Index)
    const maxWeight = Math.max(...itemsWithWeights.map((w) => w.weight), 0);
    const riskLevel = maxWeight > 35 ? 'High (Over-concentrated)' : maxWeight > 20 ? 'Moderate' : 'Balanced & Well Diversified';

    res.json({
      summary: {
        totalMarketValue,
        totalCostBasis,
        totalGainLossRupees,
        totalReturnPercent,
        totalProjectedAnnualDividends,
        projectedTaxLiability,
        riskLevel,
        maxSingleHoldingWeight: maxWeight,
        holdingsCount: enrichedHoldings.length,
        lastUpdated: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      },
      holdings: itemsWithWeights,
      assetAllocation,
      topHoldings,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving portfolio', error: error.message });
  }
};

export const addHolding = async (req, res) => {
  const userId = req.user.id;
  const { ticker, name, assetClass, shares, costBasis, manualMarketValue } = req.body;

  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO holdings (id, user_id, ticker, name, asset_class, shares, cost_basis, manual_market_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, ticker.toUpperCase(), name, assetClass, shares || 0, costBasis || 0, manualMarketValue || null]
    );

    res.status(201).json({ message: 'Investment added successfully.', id });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add investment.', error: error.message });
  }
};

export const deleteHolding = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM holdings WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ message: 'Holding deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete holding.', error: error.message });
  }
};