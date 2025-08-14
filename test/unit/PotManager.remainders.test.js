import { describe, it } from 'node:test';
import assert from 'node:assert';
import PotManager from '../../src/game/pot/PotManager.js';

describe('PotManager 多边池 + 平局余数分配', () => {
  function P(id, chips, totalBet, status = 'ACTIVE', holeCards = ['AH', 'KS']) {
    return { id, chips, totalBet, currentBet: 0, status, holeCards };
  }

  function mockEvaluator(rank = 6) {
    return {
      evaluate: () => ({ rank, score: rank * 100, cards: [] }),
      getRankName: () => '同花'
    };
  }

  it('两个边池，均出现多人并列且产生余数时应按按钮位后顺时针分配', () => {
    const players = [
      P('p1', 1000, 50),   // 只参与主池
      P('p2', 1000, 150),  // 参与主池+边池1
      P('p3', 1000, 150),  // 参与主池+边池1
      P('p4', 1000, 175)   // 参与主池+边池1+边池2（额外25）
    ];

    const pots = [
      { id: 'pot_1', amount: 350, eligiblePlayers: ['p1', 'p2', 'p3', 'p4'], type: 'main' }, // 4人主池
      { id: 'pot_2', amount: 200, eligiblePlayers: ['p2', 'p3', 'p4'], type: 'side' },       // 3人边池1
      { id: 'pot_3', amount: 25,  eligiblePlayers: ['p4'], type: 'side' }                     // 1人边池2
    ];

    // 人为制造：主池三人并列（p2,p3,p4），余数 350 % 3 = 2
    // 边池1 两人并列（p2,p3），余数 200 % 2 = 0
    // 边池2 单人获胜 p4
    const evaluator = {
      evaluate: (holeCards, board) => {
        // 简单根据玩家ID制造相同rank并列
        const id = players.find(p => p.holeCards === holeCards)?.id;
        if (id === 'p1') return { rank: 5, score: 500, cards: [] }; // 最弱
        if (id === 'p4') return { rank: 7, score: 700, cards: [] }; // 边池最强
        return { rank: 7, score: 700, cards: [] }; // p2,p3 与 p4 在主池并列最强
      },
      getRankName: () => '葫芦'
    };

    const buttonIndex = 1; // 假设按钮在 p2 的座位
    const results = PotManager.distributePots(pots, players, ['7H','8C','9S','TD','JD'], evaluator, buttonIndex);

    // 主池：p2,p3,p4 三人平分 350 -> 每人 116，余数 2 给按钮后顺时针的获胜者
    const main = results.find(r => r.potId === 'pot_1');
    assert.strictEqual(main.winners.length, 3);
    assert.strictEqual(main.distribution.sharePerWinner, 116);
    assert.strictEqual(main.distribution.remainder, 2);
    // 按钮在 p2，顺时针顺序（p3 -> p4 -> p1 -> p2），获胜者中是 p2,p3,p4 → 余数应给 p3, p4
    assert.deepStrictEqual(main.distribution.remainderRecipients.sort(), ['p3','p4'].sort());

    // 边池1：p2,p3,p4 参与，但我们设定 p2,p3 与 p4 同rank，同样三人并列 -> 每人 66，余数 2
    const side1 = results.find(r => r.potId === 'pot_2');
    assert.strictEqual(side1.winners.length, 3);
    assert.strictEqual(side1.distribution.sharePerWinner, 66);
    assert.strictEqual(side1.distribution.remainder, 2);
    assert.deepStrictEqual(side1.distribution.remainderRecipients.sort(), ['p3','p4'].sort());

    // 边池2：只有 p4
    const side2 = results.find(r => r.potId === 'pot_3');
    assert.strictEqual(side2.winners.length, 1);
    assert.strictEqual(side2.winners[0], 'p4');
  });

  it('单边池大余数分配：按钮位后严格顺时针', () => {
    const players = [
      P('p1', 1000, 100), // 座位0
      P('p2', 1000, 100), // 座位1  
      P('p3', 1000, 100), // 座位2
      P('p4', 1000, 100), // 座位3
      P('p5', 1000, 100)  // 座位4
    ];

    const pots = [
      { id: 'main_pot', amount: 503, eligiblePlayers: ['p1', 'p2', 'p3', 'p4', 'p5'], type: 'main' }
    ];

    // 设置所有人相同rank，产生5人平分，余数 503 % 5 = 3
    const evaluator = {
      evaluate: () => ({ rank: 6, score: 600, cards: [] }),
      getRankName: () => '顺子'
    };

    const buttonIndex = 2; // 按钮在p3(座位2)
    const results = PotManager.distributePots(pots, players, ['7H','8C','9S','TD','JD'], evaluator, buttonIndex);

    const main = results.find(r => r.potId === 'main_pot');
    assert.strictEqual(main.winners.length, 5);
    assert.strictEqual(main.distribution.sharePerWinner, 100); // 503 / 5 = 100
    assert.strictEqual(main.distribution.remainder, 3);
    
    // 按钮在p3，顺时针顺序是 p4->p5->p1->p2->p3，余数3应给 p4,p5,p1
    const expectedRecipients = ['p4', 'p5', 'p1'];
    assert.deepStrictEqual(main.distribution.remainderRecipients.sort(), expectedRecipients.sort());
  });

  it('余数为0时不应有余数接收者', () => {
    const players = [
      P('p1', 1000, 100),
      P('p2', 1000, 100),
      P('p3', 1000, 100),
      P('p4', 1000, 100)
    ];

    const pots = [
      { id: 'even_pot', amount: 400, eligiblePlayers: ['p1', 'p2', 'p3', 'p4'], type: 'main' }
    ];

    const evaluator = {
      evaluate: () => ({ rank: 5, score: 500, cards: [] }),
      getRankName: () => '同花'
    };

    const results = PotManager.distributePots(pots, players, ['7H','8H','9H','TH','JH'], evaluator, 0);
    
    const pot = results[0];
    assert.strictEqual(pot.distribution.sharePerWinner, 100); // 400 / 4 = 100
    assert.strictEqual(pot.distribution.remainder, 0);
    assert.deepStrictEqual(pot.distribution.remainderRecipients, []);
  });

  it('单人获胜无余数问题', () => {
    const players = [
      P('p1', 1000, 50),
      P('p2', 1000, 50),
      P('p3', 1000, 50)
    ];

    const pots = [
      { id: 'winner_takes_all', amount: 149, eligiblePlayers: ['p1', 'p2', 'p3'], type: 'main' }
    ];

    // p1 获胜，其他人败
    const evaluator = {
      evaluate: (holeCards) => {
        const id = players.find(p => p.holeCards === holeCards)?.id;
        return id === 'p1' ? { rank: 8, score: 800, cards: [] } : { rank: 5, score: 500, cards: [] };
      },
      getRankName: () => '顺子'
    };

    const results = PotManager.distributePots(pots, players, ['7H','8C','9S','TD','JD'], evaluator, 0);
    
    const pot = results[0];
    assert.strictEqual(pot.winners.length, 1);
    assert.strictEqual(pot.winners[0], 'p1');
    assert.strictEqual(pot.distribution.sharePerWinner, 149); // 全部给获胜者
    assert.strictEqual(pot.distribution.remainder, 0);
  });

  it('复杂多边池场景：不同边池不同获胜者组合', () => {
    const players = [
      P('p1', 1000, 300), // 参与所有池
      P('p2', 1000, 200), // 参与主池+边池1
      P('p3', 1000, 100), // 只参与主池
      P('p4', 1000, 250)  // 参与主池+边池1，部分边池2
    ];

    const pots = [
      { id: 'main', amount: 401, eligiblePlayers: ['p1', 'p2', 'p3', 'p4'], type: 'main' },     // 4人池
      { id: 'side1', amount: 302, eligiblePlayers: ['p1', 'p2', 'p4'], type: 'side' },           // 3人池  
      { id: 'side2', amount: 103, eligiblePlayers: ['p1'], type: 'side' }                        // 1人池
    ];

    const evaluator = {
      evaluate: (holeCards) => {
        const id = players.find(p => p.holeCards === holeCards)?.id;
        if (id === 'p1' || id === 'p2') return { rank: 7, score: 700, cards: [] }; // 主池平分
        if (id === 'p3') return { rank: 6, score: 600, cards: [] };
        if (id === 'p4') return { rank: 8, score: 800, cards: [] }; // 边池1最强
        return { rank: 5, score: 500, cards: [] };
      },
      getRankName: () => '同花'
    };

    const buttonIndex = 1; // 按钮在p2
    const results = PotManager.distributePots(pots, players, ['AH','KC','QS','JD','TH'], evaluator, buttonIndex);

    // 主池：p4 单独获胜
    const mainResult = results.find(r => r.potId === 'main');
    assert.strictEqual(mainResult.winners.length, 1);
    assert.strictEqual(mainResult.winners[0], 'p4');

    // 边池1：p4 单独获胜
    const side1Result = results.find(r => r.potId === 'side1');
    assert.strictEqual(side1Result.winners.length, 1);
    assert.strictEqual(side1Result.winners[0], 'p4');

    // 边池2：p1 单独获胜
    const side2Result = results.find(r => r.potId === 'side2');
    assert.strictEqual(side2Result.winners.length, 1);
    assert.strictEqual(side2Result.winners[0], 'p1');
  });

  it('边界情况：按钮在最后位置的余数分配', () => {
    const players = [
      P('p1', 1000, 100),
      P('p2', 1000, 100),
      P('p3', 1000, 100)
    ];

    const pots = [
      { id: 'test_pot', amount: 304, eligiblePlayers: ['p1', 'p2', 'p3'], type: 'main' }
    ];

    const evaluator = {
      evaluate: () => ({ rank: 6, score: 600, cards: [] }),
      getRankName: () => '对子'
    };

    const buttonIndex = 2; // 按钮在最后位置p3
    const results = PotManager.distributePots(pots, players, ['AH','AC','KS','QD','JH'], evaluator, buttonIndex);

    const pot = results[0];
    assert.strictEqual(pot.distribution.sharePerWinner, 101); // 304 / 3 = 101
    assert.strictEqual(pot.distribution.remainder, 1); // 304 % 3 = 1
    // 按钮p3后顺时针是p1，所以余数给p1
    assert.deepStrictEqual(pot.distribution.remainderRecipients, ['p1']);
  });

  it('极端情况：余数等于获胜者数量', () => {
    const players = [
      P('p1', 1000, 50),
      P('p2', 1000, 50),
      P('p3', 1000, 50)
    ];

    const pots = [
      { id: 'special_pot', amount: 305, eligiblePlayers: ['p1', 'p2', 'p3'], type: 'main' }
    ];

    const evaluator = {
      evaluate: () => ({ rank: 7, score: 700, cards: [] }),
      getRankName: () => '三条'
    };

    const buttonIndex = 0; // 按钮在p1
    const results = PotManager.distributePots(pots, players, ['7H','7C','7S','KD','QH'], evaluator, buttonIndex);

    const pot = results[0];
    assert.strictEqual(pot.distribution.sharePerWinner, 101); // 305 / 3 = 101
    assert.strictEqual(pot.distribution.remainder, 2); // 305 % 3 = 2
    // 按钮p1后顺时针是p2,p3，余数2给p2,p3
    assert.deepStrictEqual(pot.distribution.remainderRecipients.sort(), ['p2', 'p3'].sort());
  });
});


