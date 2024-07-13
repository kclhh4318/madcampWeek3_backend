const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

//MySQL 연결 설정
const pool = require('../config/database');

const router = express.Router();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Received registration request:', { username });
    
        // 사용자 이름 중복 체크
        const [users] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
        if (users.length > 0) {
            return res.status(400).json({ message: '이미 존재하는 사용자 이름입니다.' });
        }
    
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 10);
    
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
        console.log('Received login request:', { username });
    
        // 사용자 조회
        const [users] = await pool.query('SELECT * FROM Users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
        }
    
        const user = users[0];
    
        // 비밀번호 검증
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
        }
    
        // Access Token 생성
        const accessToken = jwt.sign({ userId: user.user_id }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
        
        // Refresh Token 생성
        const refreshToken = jwt.sign({ userId: user.user_id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

        // 데이터베이스에 Refresh Token 저장
        await pool.query('UPDATE Users SET refresh_token = ? WHERE user_id = ?', [refreshToken, user.user_id]);
    
        res.json({ message: user.user_id, accessToken, refreshToken }); //원래 여기서 
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
});

router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh Token이 제공되지 않았습니다.' });
        }

        // Refresh Token 검증
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        // 데이터베이스에서 사용자 확인
        const [users] = await pool.query('SELECT * FROM Users WHERE user_id = ? AND refresh_token = ?', [decoded.userId, refreshToken]);
        
        if (users.length === 0) {
            return res.status(401).json({ message: '유효하지 않은 Refresh Token입니다.' });
        }

        const user = users[0];

        // 새 Access Token 생성
        const newAccessToken = jwt.sign({ userId: user.user_id }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

        res.json({ accessToken: newAccessToken });
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Refresh Token이 만료되었습니다. 다시 로그인해주세요.' });
    }
});

// 예시: 보호된 라우트
router.get('/protected', authMiddleware, (req, res) => {
    res.json({ message: '보호된 리소스에 접근했습니다.', userId: req.userId });
});

module.exports = router;