const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

//MySQL 연걸 설정
const pool = require('../config/database');

// 단일 게임 최고 수익률 랭킹 라우트
router.get('/top-profit-rate', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.username, 
        u.best_profit_rate,
        gs.completed_at
      FROM 
        Users u
      JOIN 
        GameSessions gs ON u.user_id = gs.user_id
      WHERE 
        gs.completed_at IS NOT NULL
      ORDER BY 
        u.best_profit_rate DESC
      LIMIT 100
    `);

    res.json(rows);
  } catch (error) {
    console.error('랭킹 조회 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 누적 수익률 랭킹 라우트
router.get('/top-cumulative-profit', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.username, 
        u.cumulative_profit_rate,
        u.total_games
      FROM 
        Users u
      WHERE 
        u.total_games > 0
      ORDER BY 
        u.cumulative_profit_rate DESC
      LIMIT 100
    `);

    // 수익률을 백분율로 표시하고 예외 처리
    const formattedRows = rows.map(row => {
      let formattedRate = '0.00%';
      try {
        const rate = parseFloat(row.cumulative_profit_rate);
        if (!isNaN(rate)) {
          formattedRate = rate.toFixed(2) + '%';
        }
      } catch (error) {
        console.error('Error formatting cumulative_profit_rate:', error);
      }
      return {
        ...row,
        cumulative_profit_rate: formattedRate
      };
    });

    res.json(formattedRows);
  } catch (error) {
    console.error('랭킹 조회 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
