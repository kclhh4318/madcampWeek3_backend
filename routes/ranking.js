// routes/ranking.js

const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

// MySQL 연결 설정 (실제 환경에서는 별도의 설정 파일로 분리하는 것이 좋습니다)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '381412',
  database: 'madcamp3',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 랭킹 조회 API
router.get('/top', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.username, 
        gs.end_balance AS final_balance,
        gs.completed_at
      FROM 
        GameSessions gs
      JOIN 
        Users u ON gs.user_id = u.user_id
      WHERE 
        gs.is_active = false  -- 완료된 게임만 선택
      ORDER BY 
        gs.end_balance DESC
      LIMIT 100  -- 상위 100개 결과만 반환
    `);

    res.json(rows);
  } catch (error) {
    console.error('랭킹 조회 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;