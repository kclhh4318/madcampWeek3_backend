const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const rankingRoutes = require('./routes/ranking');
const profileRoutes = require('./routes/profile');

const app = express();
const port = 80; // HTTP 기본 포트인 80으로 변경

app.use(cors({
  origin: ['http://localhost:3001', 'https://kcloudvpn.kaist.ac.kr'],
  credentials: true
}));
app.use(express.json());

app.options('*', cors());

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/profile', profileRoutes);

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// HTTP 서버 시작
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});