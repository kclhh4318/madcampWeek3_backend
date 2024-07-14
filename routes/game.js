const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// 게임 시작 라우트
router.post('/start-game', async (req, res) => {
  try {
    const { userId } = req.body;

    // 1. 새 게임 세션 생성
    const [result] = await pool.query(
      'INSERT INTO GameSessions (user_id, current_balance, current_year) VALUES (?, 1000000, 2014)',
      [userId]
    );
    const sessionId = result.insertId;

    // 2. 랜덤으로 12개 회사 선택
    const [companies] = await pool.query(
      'SELECT company_id, name FROM Companies ORDER BY RAND() LIMIT 12'
    );

    // 3. 선택된 회사들을 SessionCompanies 테이블에 추가
    await Promise.all(companies.map(company =>
      pool.query('INSERT INTO SessionCompanies (session_id, company_id) VALUES (?, ?)', [sessionId, company.company_id])
    ));

    // 4. 초기 주식 가격 조회 (2014년)
    const [stockPrices] = await pool.query(
      'SELECT company_id, price FROM StockPrices WHERE year = 2014 AND company_id IN (?)',
      [companies.map(c => c.company_id)]
    );

    res.json({
      message: '게임이 시작되었습니다.',
      sessionId,
      companies: companies.map(c => ({
        id: c.company_id,
        name: c.name,
        price: stockPrices.find(sp => sp.company_id === c.company_id).price
      }))
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 게임 상태 조회 라우트
router.get('/game-state/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 현재 게임 세션 정보 조회
    const [session] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);

    // 현재 세션의 회사들과 주가 정보 조회
    const [companies] = await pool.query(`
      SELECT c.company_id, c.name, sp.price
      FROM SessionCompanies sc
      JOIN Companies c ON sc.company_id = c.company_id
      JOIN StockPrices sp ON c.company_id = sp.company_id
      WHERE sc.session_id = ? AND sp.year = ?
    `, [sessionId, session[0].current_year]);

    // 현재 보유 주식 정보 조회
    const [investments] = await pool.query(`
      SELECT c.company_id, c.name, i.amount, i.price_per_stock
      FROM Investments i
      JOIN Companies c ON i.company_id = c.company_id
      WHERE i.session_id = ?
    `, [sessionId]);

    res.json({
      session: session[0],
      companies,
      investments
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 주식 거래 라우트
router.post('/trade', async (req, res) => {
  try {
    const { sessionId, companyId, amount, action } = req.body; // action: 'buy' or 'sell'

    // 현재 세션 정보 조회
    const [session] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);

    // 주가 정보 조회
    const [stockPrice] = await pool.query('SELECT price FROM StockPrices WHERE company_id = ? AND year = ?', [companyId, session[0].current_year]);

    const totalPrice = amount * stockPrice[0].price;

    if (action === 'buy') {
      if (session[0].current_balance < totalPrice) {
        return res.status(400).json({ message: '잔액이 부족합니다.' });
      }

      // 주식 구매 및 잔액 갱신
      await pool.query('INSERT INTO Investments (session_id, company_id, year, amount, price_per_stock) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)', [sessionId, companyId, session[0].current_year, amount, stockPrice[0].price]);
      await pool.query('UPDATE GameSessions SET current_balance = current_balance - ? WHERE session_id = ?', [totalPrice, sessionId]);
    } else if (action === 'sell') {
      // 보유 주식 확인
      const [investment] = await pool.query('SELECT amount FROM Investments WHERE session_id = ? AND company_id = ?', [sessionId, companyId]);

      if (!investment[0] || investment[0].amount < amount) {
        return res.status(400).json({ message: '보유한 주식이 부족합니다.' });
      }

      // 주식 판매 및 잔액 갱신
      await pool.query('UPDATE Investments SET amount = amount - ? WHERE session_id = ? AND company_id = ?', [amount, sessionId, companyId]);
      await pool.query('UPDATE GameSessions SET current_balance = current_balance + ? WHERE session_id = ?', [totalPrice, sessionId]);
    }

    res.json({ message: '거래가 완료되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 뉴스 조회 라우트
router.get('/news/:sessionId/:companyId/:type', async (req, res) => {
  try {
    const { sessionId, companyId, type } = req.params;

    // 세션 정보 및 사용자 포인트 조회
    const [[session], [user]] = await Promise.all([
      pool.query('SELECT current_year FROM GameSessions WHERE session_id = ?', [sessionId]),
      pool.query('SELECT points FROM Users WHERE user_id = (SELECT user_id FROM GameSessions WHERE session_id = ?)', [sessionId])
    ]);

    const pointCost = type === 'general' ? 100 : 1000;

    if (user[0].points < pointCost) {
      return res.status(400).json({ message: '포인트가 부족합니다.' });
    }

    // 뉴스 조회 및 포인트 차감
    const [news] = await pool.query('SELECT * FROM News WHERE company_id = ? AND year = ? AND type = ?', [companyId, session[0].current_year, type]);
    await pool.query('UPDATE Users SET points = points - ? WHERE user_id = (SELECT user_id FROM GameSessions WHERE session_id = ?)', [pointCost, sessionId]);

    res.json({ news: news[0], remainingPoints: user[0].points - pointCost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 턴 종료 라우트
router.post('/end-turn/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 현재 세션 정보 조회
    const [session] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);
    const nextYear = session[0].current_year + 1;

    if (nextYear > 2024) {
      return res.status(400).json({ message: '게임이 종료되었습니다.' });
    }

    // 투자 내역 조회
    const [investments] = await pool.query('SELECT * FROM Investments WHERE session_id = ?', [sessionId]);

    // 새로운 주가 정보 조회
    const [newPrices] = await pool.query('SELECT company_id, price FROM StockPrices WHERE year = ? AND company_id IN (SELECT company_id FROM SessionCompanies WHERE session_id = ?)', [nextYear, sessionId]);

    // 수익 계산
    let totalValue = session[0].current_balance;
    for (const inv of investments) {
      const newPrice = newPrices.find(p => p.company_id === inv.company_id).price;
      totalValue += inv.amount * newPrice;
    }

    // 세션 업데이트
    await pool.query('UPDATE GameSessions SET current_year = ?, current_balance = ? WHERE session_id = ?', [nextYear, totalValue, sessionId]);

    // 투자 내역 초기화
    await pool.query('DELETE FROM Investments WHERE session_id = ?', [sessionId]);

    res.json({
      message: '턴이 종료되었습니다.',
      nextYear,
      newBalance: totalValue
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 주가 변동 조회 라우트
router.get('/stock-changes/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 현재 세션 정보 조회
    const [session] = await pool.query('SELECT current_year FROM GameSessions WHERE session_id = ?', [sessionId]);
    const currentYear = session[0].current_year;
    const previousYear = currentYear - 1;

    // 현재 년도와 이전 년도의 주가 정보 조회
    const [stockChanges] = await pool.query(`
      SELECT 
        c.company_id,
        c.name AS company_name,
        prev.price AS previous_price,
        curr.price AS current_price,
        ((curr.price - prev.price) / prev.price * 100) AS change_percentage
      FROM 
        SessionCompanies sc
        JOIN Companies c ON sc.company_id = c.company_id
        JOIN StockPrices prev ON c.company_id = prev.company_id AND prev.year = ?
        JOIN StockPrices curr ON c.company_id = curr.company_id AND curr.year = ?
      WHERE 
        sc.session_id = ?
    `, [previousYear, currentYear, sessionId]);

    res.json(stockChanges);
  } catch (error) {
    console.error('주가 변화 조회 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
