const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  const JWT_SECRET =
    process.env.JWT_SECRET ||
    '8ae74b4cf76c2e91531a6a5e7ed2ef3a62c4dcaee24d7b176fdfd0ba6c1e9abf';

  if (!token) {
    console.log('Auth failed: No token provided');
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    console.log('Verifying token:', token.substring(0, 20) + '...');
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.userId) {
      console.log('Auth failed: No userId in token payload:', decoded);
      return res.status(400).json({ message: 'Invalid token payload: id not found' });
    }

    console.log('Auth successful for user:', decoded.userId);
    req.user = decoded; // Store the full decoded payload (e.g., { id, email, role, etc. })

    next();
  } catch (err) {
    console.log('Auth failed: Token verification error:', err.message);
    return res.status(403).json({ message: 'Invalid token' });
  }
};

module.exports = authenticateToken;

