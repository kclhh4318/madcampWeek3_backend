const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET; // 실제 프로덕션에서는 환경 변수로 관리해야 합니다.

const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return res.status(401).json({ message: '인증 토큰이 없습니다.' });

  const token = authHeader.split(' ')[1]; // "Bearer <token>" 형식에서 토큰 추출
  if (!token) return res.status(401).json({ message: '유효한 토큰 형식이 아닙니다.' });

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '토큰이 만료되었습니다.' });
    }
    res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
};

module.exports = authMiddleware;