import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import portfolioRoutes from './routes/portfolioRoutes.js';
import discoveryRoutes from './routes/discoveryRoutes.js';

// Database Pool Verification
import { pool } from './config/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 1. CORS & Middleware Configuration
// ==========================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some((o) => origin.startsWith(o))) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 2. Health Check & Root Ping Endpoints
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'FinTrack Pro Backend API Engine',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const [dbResult] = await pool.query('SELECT 1 + 1 AS health');
    res.status(200).json({
      status: 'healthy',
      database: dbResult[0]?.health === 2 ? 'connected' : 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'degraded',
      database: 'disconnected',
      error: error.message,
    });
  }
});

// ==========================================
// 3. API Routes Mounting (All prefixed with /api)
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/discovery', discoveryRoutes);

// ==========================================
// 4. Static Serving & SPA Fallback (Express 5 Safe)
// ==========================================
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

// Express 5 compatible catch-all (uses middleware instead of app.get('*'))
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: `API route ${req.originalUrl} not found` });
  }

  const indexPath = path.join(frontendDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ message: 'Resource not found' });
    }
  });
});

// ==========================================
// 5. Global Error Handling Middleware
// ==========================================
app.use((err, req, res, next) => {
  console.error('[FinTrack Pro Error Handler]:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// ==========================================
// 6. Server Initialization
// ==========================================
app.listen(PORT, async () => {
  console.log(`=========================================`);
  console.log(`🚀 FinTrack Pro Server running on port ${PORT}`);
  console.log(`📡 Base API URL: http://localhost:${PORT}/api`);
  console.log(`=========================================`);

  try {
    const [res] = await pool.query('SELECT 1');
    if (res) {
      console.log('✅ TiDB Cloud Database Connected Successfully');
    }
  } catch (err) {
    console.error('❌ Database connection warning:', err.message);
  }
});

export default app;