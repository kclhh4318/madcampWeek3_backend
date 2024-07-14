const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

// MySQL 연결 설정
const pool = require('../config/database');

// 사용자 프로필 및 게임 히스토리 조회 라우트
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 사용자 정보 조회
    const [userInfo] = await pool.query(`
      SELECT username, best_profit_rate, total_games, cumulative_profit_rate
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
        current_balance AS end_balance,
        (current_balance - start_balance) / start_balance * 100 AS profit_rate,
        created_at,
        completed_at
      FROM GameSessions
      WHERE user_id = ? AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 10
    `, [userId]);

    // 최고 금액 조회
    const [maxMoney] = await pool.query(`
      SELECT MAX(current_balance) AS max_money
      FROM GameSessions
      WHERE user_id = ? AND completed_at IS NOT NULL
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
