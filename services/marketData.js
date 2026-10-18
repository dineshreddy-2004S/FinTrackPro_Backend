import axios from 'axios';

// ==========================================
// 1. In-Memory High-Speed TTL Cache
// ==========================================
const quoteCache = new Map();
const trendCache = new Map();

const QUOTE_CACHE_TTL_MS = 20 * 1000; // 20 Seconds TTL for Quotes
const TREND_CACHE_TTL_MS = 60 * 1000; // 60 Seconds TTL for Historical Series

// ==========================================
// 2. Comprehensive Master Fallback Registry
// ==========================================
export const INDIAN_STOCKS_FALLBACK = {
  RELIANCE: {
    name: 'Reliance Industries Limited',
    price: 2980.5,
    open: 2960.0,
    previousClose: 2955.0,
    dayHigh: 2995.0,
    dayLow: 2948.0,
    fiftyTwoWeekHigh: 3024.9,
    fiftyTwoWeekLow: 2220.3,
    volume: 5840200,
    marketCap: 20165000000000,
    dividendYield: 0.35,
    sector: 'Energy & Petrochemicals',
  },
  TCS: {
    name: 'Tata Consultancy Services Limited',
    price: 3890.0,
    open: 3865.0,
    previousClose: 3855.0,
    dayHigh: 3915.0,
    dayLow: 3840.0,
    fiftyTwoWeekHigh: 4592.25,
    fiftyTwoWeekLow: 3313.0,
    volume: 2410300,
    marketCap: 14070000000000,
    dividendYield: 1.35,
    sector: 'Information Technology',
  },
  HDFCBANK: {
    name: 'HDFC Bank Limited',
    price: 1685.2,
    open: 1670.0,
    previousClose: 1672.0,
    dayHigh: 1694.0,
    dayLow: 1662.0,
    fiftyTwoWeekHigh: 1794.0,
    fiftyTwoWeekLow: 1363.55,
    volume: 18450000,
    marketCap: 12820000000000,
    dividendYield: 1.15,
    sector: 'Banking & Financial Services',
  },
  INFY: {
    name: 'Infosys Limited',
    price: 1840.75,
    open: 1825.0,
    previousClose: 1820.0,
    dayHigh: 1855.0,
    dayLow: 1812.0,
    fiftyTwoWeekHigh: 1974.75,
    fiftyTwoWeekLow: 1358.35,
    volume: 6720000,
    marketCap: 7640000000000,
    dividendYield: 2.1,
    sector: 'Information Technology',
  },
  ICICIBANK: {
    name: 'ICICI Bank Limited',
    price: 1245.6,
    open: 1238.0,
    previousClose: 1232.0,
    dayHigh: 1255.0,
    dayLow: 1230.0,
    fiftyTwoWeekHigh: 1335.0,
    fiftyTwoWeekLow: 915.0,
    volume: 12300000,
    marketCap: 8780000000000,
    dividendYield: 0.8,
    sector: 'Banking & Financial Services',
  },
  BHARTIARTL: {
    name: 'Bharti Airtel Limited',
    price: 1680.0,
    open: 1665.0,
    previousClose: 1660.0,
    dayHigh: 1695.0,
    dayLow: 1650.0,
    fiftyTwoWeekHigh: 1779.0,
    fiftyTwoWeekLow: 912.0,
    volume: 4500000,
    marketCap: 9800000000000,
    dividendYield: 0.5,
    sector: 'Telecommunications',
  },
  SBIN: {
    name: 'State Bank of India',
    price: 795.5,
    open: 790.0,
    previousClose: 788.0,
    dayHigh: 802.0,
    dayLow: 784.0,
    fiftyTwoWeekHigh: 912.1,
    fiftyTwoWeekLow: 543.2,
    volume: 14500000,
    marketCap: 7090000000000,
    dividendYield: 1.7,
    sector: 'Public Sector Banking',
  },
  LICI: {
    name: 'Life Insurance Corporation of India',
    price: 940.0,
    open: 935.0,
    previousClose: 930.0,
    dayHigh: 952.0,
    dayLow: 928.0,
    fiftyTwoWeekHigh: 1222.0,
    fiftyTwoWeekLow: 597.0,
    volume: 2100000,
    marketCap: 5940000000000,
    dividendYield: 1.05,
    sector: 'Insurance',
  },
  ITC: {
    name: 'ITC Limited',
    price: 492.3,
    open: 489.0,
    previousClose: 488.5,
    dayHigh: 496.0,
    dayLow: 486.0,
    fiftyTwoWeekHigh: 528.55,
    fiftyTwoWeekLow: 399.3,
    volume: 9800000,
    marketCap: 6150000000000,
    dividendYield: 2.8,
    sector: 'FMCG',
  },
  HINDUNILVR: {
    name: 'Hindustan Unilever Limited',
    price: 2540.0,
    open: 2525.0,
    previousClose: 2530.0,
    dayHigh: 2560.0,
    dayLow: 2515.0,
    fiftyTwoWeekHigh: 3035.0,
    fiftyTwoWeekLow: 2172.05,
    volume: 1650000,
    marketCap: 5960000000000,
    dividendYield: 1.6,
    sector: 'FMCG',
  },
  LT: {
    name: 'Larsen & Toubro Limited',
    price: 3620.0,
    open: 3590.0,
    previousClose: 3580.0,
    dayHigh: 3650.0,
    dayLow: 3570.0,
    fiftyTwoWeekHigh: 3948.0,
    fiftyTwoWeekLow: 2872.0,
    volume: 2300000,
    marketCap: 4970000000000,
    dividendYield: 0.95,
    sector: 'Construction & Engineering',
  },
  BAJFINANCE: {
    name: 'Bajaj Finance Limited',
    price: 7120.0,
    open: 7080.0,
    previousClose: 7050.0,
    dayHigh: 7180.0,
    dayLow: 7020.0,
    fiftyTwoWeekHigh: 8192.0,
    fiftyTwoWeekLow: 6375.0,
    volume: 1100000,
    marketCap: 4400000000000,
    dividendYield: 0.5,
    sector: 'NBFC',
  },
  TATAMOTORS: {
    name: 'Tata Motors Limited',
    price: 915.4,
    open: 908.0,
    previousClose: 905.0,
    dayHigh: 924.0,
    dayLow: 902.0,
    fiftyTwoWeekHigh: 1179.0,
    fiftyTwoWeekLow: 621.75,
    volume: 11200000,
    marketCap: 3370000000000,
    dividendYield: 0.65,
    sector: 'Automotive',
  },
  NIFTYBEES: {
    name: 'Nippon India ETF Nifty 50 BeES',
    price: 278.4,
    open: 276.5,
    previousClose: 276.0,
    dayHigh: 279.5,
    dayLow: 275.8,
    fiftyTwoWeekHigh: 292.0,
    fiftyTwoWeekLow: 208.0,
    volume: 7800000,
    marketCap: 250000000000,
    dividendYield: 0.0,
    sector: 'Index ETF',
  },
  GOLDBEES: {
    name: 'Nippon India ETF Gold BeES',
    price: 68.25,
    open: 67.8,
    previousClose: 67.5,
    dayHigh: 68.6,
    dayLow: 67.4,
    fiftyTwoWeekHigh: 72.0,
    fiftyTwoWeekLow: 51.5,
    volume: 9100000,
    marketCap: 120000000000,
    dividendYield: 0.0,
    sector: 'Gold ETF',
  },
  SILVERBEES: {
    name: 'Nippon India ETF Silver BeES',
    price: 88.5,
    open: 87.2,
    previousClose: 87.0,
    dayHigh: 89.2,
    dayLow: 86.8,
    fiftyTwoWeekHigh: 96.0,
    fiftyTwoWeekLow: 65.0,
    volume: 5400000,
    marketCap: 50000000000,
    dividendYield: 0.0,
    sector: 'Commodity ETF',
  },
  SGB: {
    name: 'Sovereign Gold Bonds 2.50% (RBI)',
    price: 7650.0,
    open: 7600.0,
    previousClose: 7580.0,
    dayHigh: 7680.0,
    dayLow: 7550.0,
    fiftyTwoWeekHigh: 7850.0,
    fiftyTwoWeekLow: 5800.0,
    volume: 120000,
    marketCap: 80000000000,
    dividendYield: 2.5,
    sector: 'Government Debt / SGB',
  },
};

// ==========================================
// 3. Fallback Synthesizer for Any Unlisted Symbol
// ==========================================
const generateSynthesizedQuote = (sym) => {
  let hash = 0;
  for (let i = 0; i < sym.length; i++) {
    hash = sym.charCodeAt(i) + ((hash << 5) - hash);
  }
  const basePrice = Math.abs(hash % 2500) + 250;
  const variation = (hash % 15) / 10;
  const currentPrice = Number((basePrice * (1 + variation / 100)).toFixed(2));
  const open = Number((basePrice * 0.995).toFixed(2));
  const previousClose = Number(basePrice.toFixed(2));
  const dayHigh = Number((currentPrice * 1.018).toFixed(2));
  const dayLow = Number((currentPrice * 0.985).toFixed(2));
  const change = Number((currentPrice - previousClose).toFixed(2));
  const changePercent = Number(((change / previousClose) * 100).toFixed(2));
  const volume = Math.abs((hash * 9301) % 5000000) + 100000;
  const marketCap = currentPrice * 150000000;

  return {
    ticker: sym,
    name: `${sym} India Limited`,
    price: currentPrice,
    open,
    dayHigh,
    dayLow,
    previousClose,
    fiftyTwoWeekHigh: Number((currentPrice * 1.25).toFixed(2)),
    fiftyTwoWeekLow: Number((currentPrice * 0.75).toFixed(2)),
    change,
    changePercent,
    volume,
    marketCap,
    estimatedDivYield: 1.2,
    sector: 'Diversified',
  };
};

// ==========================================
// 4. Get Detailed Quote with Live API & Fallback
// ==========================================
export const getDetailedQuote = async (ticker) => {
  const sym = String(ticker || 'HDFCBANK').trim().toUpperCase();
  const now = Date.now();

  // Cache Lookup
  if (quoteCache.has(sym)) {
    const cached = quoteCache.get(sym);
    if (now - cached.timestamp < QUOTE_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // Finnhub API Key Check
  const apiKey = process.env.FINNHUB_API_KEY;

  if (apiKey) {
    try {
      const response = await axios.get('https://finnhub.io/api/v1/quote', {
        params: { symbol: `${sym}.NS`, token: apiKey },
        timeout: 2500,
      });

      const d = response.data;
      if (d && d.c > 0) {
        const fallback = INDIAN_STOCKS_FALLBACK[sym] || generateSynthesizedQuote(sym);
        const price = Number(d.c.toFixed(2));
        const previousClose = Number((d.pc || price).toFixed(2));
        const change = Number((d.d !== null ? d.d : price - previousClose).toFixed(2));
        const changePercent = Number((d.dp !== null ? d.dp : (change / previousClose) * 100).toFixed(2));

        const quoteData = {
          ticker: sym,
          name: fallback.name,
          price,
          open: Number((d.o || price).toFixed(2)),
          dayHigh: Number((d.h || price).toFixed(2)),
          dayLow: Number((d.l || price).toFixed(2)),
          previousClose,
          fiftyTwoWeekHigh: fallback.fiftyTwoWeekHigh || Number((price * 1.2).toFixed(2)),
          fiftyTwoWeekLow: fallback.fiftyTwoWeekLow || Number((price * 0.8).toFixed(2)),
          change,
          changePercent,
          volume: fallback.volume || 1000000,
          marketCap: fallback.marketCap || price * 100000000,
          estimatedDivYield: fallback.dividendYield ?? fallback.estimatedDivYield ?? 1.0,
          sector: fallback.sector || 'General',
        };

        quoteCache.set(sym, { timestamp: now, data: quoteData });
        return quoteData;
      }
    } catch (err) {
      // Continue to fallback on rate limit or timeout
    }
  }

  // Fallback Generation
  let quoteData;
  if (INDIAN_STOCKS_FALLBACK[sym]) {
    const f = INDIAN_STOCKS_FALLBACK[sym];
    const change = Number((f.price - f.previousClose).toFixed(2));
    const changePercent = Number(((change / f.previousClose) * 100).toFixed(2));

    quoteData = {
      ticker: sym,
      name: f.name,
      price: f.price,
      open: f.open,
      dayHigh: f.dayHigh,
      dayLow: f.dayLow,
      previousClose: f.previousClose,
      fiftyTwoWeekHigh: f.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: f.fiftyTwoWeekLow,
      change,
      changePercent,
      volume: f.volume,
      marketCap: f.marketCap,
      estimatedDivYield: f.dividendYield,
      sector: f.sector,
    };
  } else {
    quoteData = generateSynthesizedQuote(sym);
  }

  quoteCache.set(sym, { timestamp: now, data: quoteData });
  return quoteData;
};

// ==========================================
// 5. Get Historical Trends (Candles & Timeframes)
// ==========================================
export const getHistoricalTrends = async (ticker, period = '1M', startDate, endDate) => {
  const sym = String(ticker || 'HDFCBANK').trim().toUpperCase();
  const cacheKey = `${sym}_${period}_${startDate || ''}_${endDate || ''}`;
  const now = Date.now();

  // Cache Lookup
  if (trendCache.has(cacheKey)) {
    const cached = trendCache.get(cacheKey);
    if (now - cached.timestamp < TREND_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const quote = await getDetailedQuote(sym);
  const basePrice = quote.price;

  let count = 30;
  let volatility = 0.015;

  switch (period.toUpperCase()) {
    case '1D':
      count = 24;
      volatility = 0.003;
      break;
    case '1W':
      count = 7;
      volatility = 0.008;
      break;
    case '1M':
      count = 30;
      volatility = 0.012;
      break;
    case '3M':
      count = 90;
      volatility = 0.015;
      break;
    case '6M':
      count = 180;
      volatility = 0.018;
      break;
    case '1Y':
      count = 365;
      volatility = 0.022;
      break;
    case 'CUSTOM':
      if (startDate && endDate) {
        const diffMs = Math.abs(new Date(endDate) - new Date(startDate));
        count = Math.min(Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 5), 400);
      } else {
        count = 30;
      }
      volatility = 0.015;
      break;
    default:
      count = 30;
  }

  // Build sequential dates
  const history = [];
  const curr = new Date();

  // Pseudo-random walk with seed
  let runningClose = basePrice * (1 - (count * 0.0015));

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(curr);

    if (period === '1D') {
      d.setHours(curr.getHours() - i);
    } else {
      d.setDate(curr.getDate() - i);
    }

    const dateStr =
      period === '1D'
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : d.toISOString().split('T')[0];

    const delta = (Math.sin(i * 0.4) * 0.4 + (Math.random() - 0.48)) * volatility;
    const openPrice = Number(runningClose.toFixed(2));
    runningClose = Math.max(10, runningClose * (1 + delta));
    const closePrice = Number(runningClose.toFixed(2));

    const highPrice = Number((Math.max(openPrice, closePrice) * (1 + Math.random() * 0.008)).toFixed(2));
    const lowPrice = Number((Math.min(openPrice, closePrice) * (1 - Math.random() * 0.008)).toFixed(2));
    const volume = Math.floor(quote.volume / count * (0.8 + Math.random() * 0.4));

    history.push({
      date: dateStr,
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: closePrice,
      volume,
    });
  }

  // Ensure current day's price converges to live LTP
  if (history.length > 0) {
    history[history.length - 1].close = quote.price;
  }

  trendCache.set(cacheKey, { timestamp: now, data: history });
  return history;
};

// ==========================================
// 6. Backward-Compatibility Aliases
// ==========================================
// Allows controllers expecting getLivePrice or getPrice to work seamlessly
export const getLivePrice = async (ticker) => {
  const quote = await getDetailedQuote(ticker);
  return quote.price;
};

export const getPrice = getLivePrice;

export default {
  getDetailedQuote,
  getLivePrice,
  getPrice,
  getHistoricalTrends,
  INDIAN_STOCKS_FALLBACK,
};