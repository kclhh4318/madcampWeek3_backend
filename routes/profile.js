// routes/profile.js

const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

// MySQL 연결 설정
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '381412',
  database: 'madcamp3',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 사용자 프로필 및 게임 히스토리 조회 API
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 사용자 정보 조회
    const [userInfo] = await pool.query(`
      SELECT username, best_profit_rate, total_games
      FROM Users
      WHERE user_id = ?
    `, [userId]);

    if (userInfo.length === 0) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // 게임 히스토리 조회
    const [gameHistory] = await pool.query(`
      SELECT 
        session_id,
        start_balance,
        end_balance,
        (end_balance - start_balance) / start_balance * 100 AS profit_rate,
        created_at,
        completed_at
      FROM GameSessions
      WHERE user_id = ? AND is_active = false
      ORDER BY completed_at DESC
      LIMIT 10
    `, [userId]);

    // 최고 금액 조회
    const [maxMoney] = await pool.query(`
      SELECT MAX(end_balance) AS max_money
      FROM GameSessions
      WHERE user_id = ? AND is_active = false
    `, [userId]);

    res.json({
      userInfo: userInfo[0],
      gameHistory,
      maxMoney: maxMoney[0].max_money
    });

  } catch (error) {
    console.error('프로필 조회 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;