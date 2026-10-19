import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : authHeader;

  if (!token) {
    return res.status(401).json({ message: 'Access denied: No authentication token provided' });
  }

  const secret = process.env.JWT_SECRET || 'fallback_default_fintrackpro_jwt_secret_key_2026';

  jwt.verify(token, secret, (err, decodedUser) => {
    if (err) {
      console.error('[JWT Verification Failure]:', err.message);
      return res.status(403).json({
        message: 'Forbidden: Invalid or expired authentication token',
        error: err.message,
      });
    }

    req.user = decodedUser;
    next();
  });
};

// Aliases so routes importing { protect } or { authenticateToken } both work
export const protect = authenticateToken;
export const verifyToken = authenticateToken;

export default authenticateToken;