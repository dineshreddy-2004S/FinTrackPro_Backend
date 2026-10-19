import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db.js';

// Unified secret retrieval matching authMiddleware.js
const getJwtSecret = () => {
  return process.env.JWT_SECRET || 'fallback_default_fintrackpro_jwt_secret_key_2026';
};

// ==========================================
// 1. User Registration
// ==========================================
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields (name, email, password) are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Ensure users table exists with consistent schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if email already exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userId = uuidv4();

    // Insert user
    await pool.query(
      'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
      [userId, name.trim(), normalizedEmail, hashedPassword]
    );

    // Create session token (Valid for 7 days)
    const token = jwt.sign(
      { id: userId, email: normalizedEmail },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
    };

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: userPayload,
    });
  } catch (err) {
    console.error('[Register Error]:', err);
    return res.status(500).json({
      message: 'Server error during registration',
      error: err.message,
    });
  }
};

// ==========================================
// 2. User Login
// ==========================================
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Query user record
    const [rows] = await pool.query(
      'SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials. User not found.' });
    }

    const user = rows[0];

    // Verify password hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials. Incorrect password.' });
    }

    // Generate JWT signed with unified secret
    const token = jwt.sign(
      { id: user.id, email: user.email },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: userPayload,
    });
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({
      message: 'Server error during login',
      error: err.message,
    });
  }
};

// ==========================================
// 3. Get Current User Profile (Token Verification)
// ==========================================
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized session' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User profile not found' });
    }

    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('[GetMe Error]:', err);
    return res.status(500).json({
      message: 'Error retrieving user details',
      error: err.message,
    });
  }
};