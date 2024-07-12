const express = require('express');
const mysql = require('mysql2');

const app = express();
const port = 3000; // 여기서 포트 번호를 설정합니다

// MySQL 연결 설정
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '381412',
  database: 'madcampweek3'
});

// 데이터베이스 연결
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database: ' + err.stack);
    return;
  }
  console.log('Connected to database.');
});

// JSON 파싱 미들웨어
app.use(express.json());

// 사용자 조회 라우트
app.get('/users', (req, res) => {
  connection.query('SELECT * FROM Users', (error, results) => {
    if (error) throw error;
    res.json(results);
  });
});

// 서버 시작
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
