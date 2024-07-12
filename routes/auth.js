const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Received registration request:', { username, password });
    
        // 사용자 이름 중복 체크
        const [users] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
        console.log('User search result:', users);
        if (users.length > 0) {
          return res.status(400).json({ message: '이미 존재하는 사용자 이름입니다.' });
        }
    
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Hashed password:', hashedPassword);
    
        // 새 사용자 등록
        await pool.query('INSERT INTO Users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        console.log('User registered successfully:', { username });
    
        res.status(201).json({ message: '회원가입이 완료되었습니다.' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
      }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Received login request:', { username, password });
    
        // 사용자 조회
        const [users] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
        console.log('User search result:', users);
        if (users.length === 0) {
          return res.status(401).json({ message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
        }
    
        const user = users[0];
    
        // 비밀번호 검증
        const isValidPassword = await bcrypt.compare(password, user.password);
        console.log('Password validation result:', isValidPassword);
        if (!isValidPassword) {
          return res.status(401).json({ message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
        }
    
        // JWT 토큰 생성
        const token = jwt.sign({ userId: user.user_id }, 'your_jwt_secret', { expiresIn: '1h' });
        console.log('Generated JWT token:', token);
    
        res.json({ message: '로그인 성공', token });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
      }
});

module.exports = router;