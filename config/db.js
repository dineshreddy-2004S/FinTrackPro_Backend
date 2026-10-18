import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,        // Keeps connection alive
  keepAliveInitialDelay: 10000, // Sends ping every 10s
});

pool.getConnection()
  .then((conn) => {
    console.log('Connected securely to TiDB Cloud Database');
    conn.release();
  })
  .catch((err) => console.error('TiDB Connection Error:', err));