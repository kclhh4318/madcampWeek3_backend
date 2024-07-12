const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: '인증 토큰이 없습니다.' });

  try {
    const decoded = jwt.verify(token, 'your_jwt_secret');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(400).json({ message: '유효하지 않은 토큰입니다.' });
  }
};

module.exports = authMiddleware;