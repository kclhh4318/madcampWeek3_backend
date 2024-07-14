const express = require('express');
const cors = require('cors'); // CORS 모듈 불러오기
require('dotenv').config();
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const rankingRoutes = require('./routes/ranking');
const profileRoutes = require('./routes/profile');

const app = express();
const port = 3000;

app.use(cors()); // CORS 미들웨어 추가
app.use(express.json()); // JSON 파싱 미들웨어 추가

// 로그인/회원가입 라우트
app.use('/api/auth', authRoutes);

// 게임 기능 라우트
app.use('/api/game', gameRoutes);

//랭킹 라우트
app.use('/api/ranking', rankingRoutes);

//프로필 라우트
app.use('/api/profile', profileRoutes);

// 서버 시작
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
