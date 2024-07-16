const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

const authMiddleware = async (req, res, next) => {
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
      const refreshToken = req.header('x-refresh-token');
      if (!refreshToken) {
        return res.status(401).json({ message: '리프레시 토큰이 필요합니다.' });
      }

      try {
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
        const [users] = await pool.query('SELECT * FROM Users WHERE user_id = ? AND refresh_token = ?', [decoded.userId, refreshToken]);
        
        if (users.length === 0) {
          return res.status(401).json({ message: '유효하지 않은 리프레시 토큰입니다.' });
        }

        const user = users[0];
        const newAccessToken = jwt.sign({ userId: user.user_id }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

        res.setHeader('Authorization', `Bearer ${newAccessToken}`);
        req.userId = user.user_id;
        next();
      } catch (error) {
        console.error(error);
        return res.status(401).json({ message: '리프레시 토큰이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.' });
      }
    } else {
      res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
  }
};

module.exports = authMiddleware;
