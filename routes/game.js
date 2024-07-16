//routes/game.js
const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// 게임 시작 라우트
router.post('/start-game', async (req, res) => {
  try {
    const { userId } = req.body;
    console.log('Received start-game request:', { userId });

    if (!userId) {
      console.log('Invalid userId:', userId);
      return res.status(400).json({ message: '유효한 사용자 ID가 제공되지 않았습니다.' });
    }

    // 1. 새 게임 세션 생성
    const [result] = await pool.query(
      'INSERT INTO GameSessions (user_id, current_balance, current_year) VALUES (?, 1000, 2014)',
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
    console.error('Error in start-game:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 게임 상태 조회 라우트
router.get('/game-state/:sessionId', async (req, res) => {
  console.log('Received request for game state');
  try {
    const { sessionId } = req.params;
    console.log('Received request for game state with sessionId:', sessionId);

    // 현재 게임 세션 정보 조회
    const [session] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);
    console.log('Retrieved session:', session);

    if (session.length === 0) {
      console.log('No session found for sessionId:', sessionId);
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }

    // 현재 세션의 회사들과 주가 정보 조회
    const [companies] = await pool.query(`
      SELECT c.company_id, c.name, sp.price
      FROM SessionCompanies sc
      JOIN Companies c ON sc.company_id = c.company_id
      JOIN StockPrices sp ON c.company_id = sp.company_id
      WHERE sc.session_id = ? AND sp.year = ?
    `, [sessionId, session[0].current_year]);
    console.log('Retrieved companies:', companies);

    // 현재 보유 주식 정보 조회
    const [investments] = await pool.query(`
      SELECT c.company_id, c.name, i.amount, i.price_per_stock
      FROM Investments i
      JOIN Companies c ON i.company_id = c.company_id
      WHERE i.session_id = ?
    `, [sessionId]);
    console.log('Retrieved investments:', investments);

    const responseData = {
      session: session[0],
      companies,
      investments
    };
    console.log('Sending response:', responseData);

    res.json(responseData);
  } catch (error) {
    console.error('Error in game-state route:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 주식 거래 라우트
router.post('/trade', async (req, res) => {
  try {
    const { sessionId, companyId, amount, action } = req.body;
    
    console.log(`Processing trade: sessionId=${sessionId}, companyId=${companyId}, amount=${amount}, action=${action}`);

    if (!sessionId || !companyId || !amount || !action) {
      return res.status(400).json({ message: '모든 필수 필드를 입력해주세요.' });
    }

    // 현재 세션 정보 조회
    const [sessions] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);
    if (sessions.length === 0) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    const session = sessions[0];
    console.log('Session found:', session);

    let companyIdNumber;
    if (isNaN(companyId)) {
      const [companies] = await pool.query('SELECT company_id FROM Companies WHERE name = ?', [companyId]);
      if (companies.length === 0) {
        return res.status(400).json({ message: '해당 회사를 찾을 수 없습니다.' });
      }
      companyIdNumber = companies[0].company_id;
    } else {
      companyIdNumber = parseInt(companyId, 10);
      if (isNaN(companyIdNumber)) {
        return res.status(400).json({ message: '유효하지 않은 회사 ID입니다.' });
      }
    }

    // 주가 정보 조회
    const [stockPrices] = await pool.query('SELECT price FROM StockPrices WHERE company_id = ? AND year = ?', [companyIdNumber, session.current_year]);
    if (stockPrices.length === 0) {
      console.log('Stock price not found for year:', session.current_year);
      return res.status(400).json({ message: '해당 연도의 주가 정보를 찾을 수 없습니다.' });
    }
    const stockPrice = stockPrices[0];
    console.log('Stock price found:', stockPrice);

    const totalPrice = amount * stockPrice.price;

    if (action === 'buy') {
      if (session.current_balance < totalPrice) {
        return res.status(400).json({ message: '잔액이 부족합니다.' });
      }

      // 주식 구매 및 잔액 갱신
      await pool.query('INSERT INTO Investments (session_id, company_id, year, amount, price_per_stock) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)', [sessionId, companyIdNumber, session.current_year, amount, stockPrice.price]);
      await pool.query('UPDATE GameSessions SET current_balance = current_balance - ? WHERE session_id = ?', [totalPrice, sessionId]);
    } else if (action === 'sell') {
      // 보유 주식 확인
      const [investments] = await pool.query('SELECT amount FROM Investments WHERE session_id = ? AND company_id = ?', [sessionId, companyIdNumber]);

      if (investments.length === 0 || investments[0].amount < amount) {
        return res.status(400).json({ message: '보유한 주식이 부족합니다.' });
      }

      // 주식 판매 및 잔액 갱신
      await pool.query('UPDATE Investments SET amount = amount - ? WHERE session_id = ? AND company_id = ?', [amount, sessionId, companyIdNumber]);
      await pool.query('UPDATE GameSessions SET current_balance = current_balance + ? WHERE session_id = ?', [totalPrice, sessionId]);
    } else {
      return res.status(400).json({ message: '유효하지 않은 거래 유형입니다.' });
    }

    // 최신 세션 정보 및 투자 내역 반환
    const [updatedSessions] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);
    const [updatedInvestments] = await pool.query('SELECT * FROM Investments WHERE session_id = ?', [sessionId]);

    res.json({
      message: '거래가 완료되었습니다.',
      session: updatedSessions[0],
      investments: updatedInvestments
    });
  } catch (error) {
    console.error('Trade error:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
});

//포트폴리오 가져오는 라우트
router.get('/portfolio/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [portfolio] = await pool.query(`
      SELECT i.*, c.name as company_name
      FROM Investments i
      JOIN Companies c ON i.company_id = c.company_id
      WHERE i.session_id = ?
    `, [sessionId]);

    res.json(portfolio);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 뉴스 열람 라우트
router.get('/news/:sessionId/:companyId/:isPremium', async (req, res) => {
  console.log('Received request for news:', req.params);
  try {
    const { sessionId, companyId, isPremium } = req.params;
    const isPremiumBool = isPremium === '1';
    console.log('Parsed request parameters:', { sessionId, companyId, isPremium: isPremiumBool });

    // 세션 정보 조회
    const [session] = await pool.query('SELECT current_balance, current_year FROM GameSessions WHERE session_id = ?', [sessionId]);
    console.log('Session query result:', session);

    if (session.length === 0) {
      console.log('No session found for sessionId:', sessionId);
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }

    const newsCost = isPremiumBool ? 100 : 50;
    console.log('News cost:', newsCost);

    if (session[0].current_balance < newsCost) {
      console.log('Insufficient balance. Current balance:', session[0].current_balance);
      return res.status(400).json({ message: '잔액이 부족합니다.' });
    }

    // 뉴스 조회
    let newsQuery = 'SELECT company_id, year, headline, content, isPremium FROM News WHERE company_id = ? AND year = ?';
    console.log('Executing news query with params:', [companyId, session[0].current_year]);
    const [news] = await pool.query(newsQuery, [companyId, session[0].current_year]);
    console.log('News query result:', news);

    if (news.length === 0) {
      console.log('No news found for company:', companyId, 'and year:', session[0].current_year);
      return res.status(404).json({ message: '해당 뉴스를 찾을 수 없습니다.' });
    }

    // 잔액 차감
    console.log('Updating balance. Old balance:', session[0].current_balance);
    await pool.query('UPDATE GameSessions SET current_balance = current_balance - ? WHERE session_id = ?', [newsCost, sessionId]);
    console.log('Balance updated. New balance:', session[0].current_balance - newsCost);

    // isPremium에 따라 반환할 데이터 결정
    let responseNews = {
      company_id: news[0].company_id,
      year: news[0].year,
      headline: news[0].headline
    };

    if (isPremiumBool) {
      responseNews.content = news[0].content;
    }

    console.log('Sending response:', { news: responseNews, remainingBalance: session[0].current_balance - newsCost });

    res.json({ 
      news: responseNews, 
      remainingBalance: session[0].current_balance - newsCost 
    });
  } catch (error) {
    console.error('News route error:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 턴 종료 라우트
router.post('/end-turn/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 현재 세션 정보 조회
    const [session] = await pool.query('SELECT * FROM GameSessions WHERE session_id = ?', [sessionId]);
    const currentYear = session[0].current_year;
    const nextYear = currentYear + 1;

    // 투자 내역 조회
    const [investments] = await pool.query('SELECT * FROM Investments WHERE session_id = ?', [sessionId]);

    // 현재 연도의 주가 정보 조회
    const [currentPrices] = await pool.query('SELECT company_id, price FROM StockPrices WHERE year = ? AND company_id IN (SELECT company_id FROM SessionCompanies WHERE session_id = ?)', [currentYear, sessionId]);

    // 다음 연도의 주가 정보 조회 (2023년까지)
    const [newPrices] = await pool.query('SELECT company_id, price FROM StockPrices WHERE year = ? AND company_id IN (SELECT company_id FROM SessionCompanies WHERE session_id = ?)', [Math.min(nextYear, 2023), sessionId]);

    // 수익 계산
    let totalValue = parseFloat(session[0].current_balance);
    for (const inv of investments) {
      const newPrice = newPrices.find(p => p.company_id === inv.company_id);
      if (newPrice) {
        totalValue += inv.amount * newPrice.price;
      } else {
        console.warn(`Price not found for company ${inv.company_id} in year ${Math.min(nextYear, 2023)}`);
      }
    }

    if (nextYear > 2023) {
      // 게임 종료 로직
      await pool.query('UPDATE GameSessions SET current_year = ?, current_balance = ?, completed_at = NOW() WHERE session_id = ?', [nextYear, totalValue, sessionId]);
      
      // 사용자 정보 업데이트
      const profit_rate = (totalValue - parseFloat(session[0].start_balance)) / parseFloat(session[0].start_balance) * 100;
      await pool.query(`
        UPDATE Users 
        SET 
          total_games = total_games + 1,
          best_profit_rate = GREATEST(IFNULL(best_profit_rate, 0), ?),
          cumulative_profit_rate = (IFNULL(cumulative_profit_rate, 0) * total_games + ?) / (total_games + 1)
        WHERE user_id = ?
      `, [profit_rate, profit_rate, session[0].user_id]);

      res.json({ message: '게임이 종료되었습니다.', finalBalance: totalValue.toFixed(2) });
    } else {
      // 일반적인 턴 종료 로직
      await pool.query('UPDATE GameSessions SET current_year = ?, current_balance = ? WHERE session_id = ?', [nextYear, totalValue, sessionId]);

      // 투자 내역 초기화
      await pool.query('DELETE FROM Investments WHERE session_id = ?', [sessionId]);

      res.json({
        message: '턴이 종료되었습니다.',
        nextYear,
        newBalance: totalValue.toFixed(2)
      });
    }
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

    if (session.length === 0) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }

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
