import { describe, it } from 'node:test';
import assert from 'node:assert';
import PotManager from '../../src/game/pot/PotManager.js';
import HandEvaluator from '../../src/game/core/HandEvaluator.js';

describe('PotManager', () => {
  let handEvaluator;

  function createPlayer(id, chips, totalBet, currentBet = 0, status = 'ACTIVE', holeCards = ['AH', 'KS']) {
    return {
      id,
      chips,
      totalBet,
      currentBet,
      status,
      holeCards
    };
  }

  function createMockHandEvaluator() {
    return {
      evaluate: (holeCards, board) => {
        // 简单模拟：基于第一张牌的点数返回牌力
        const cardValue = holeCards[0].charAt(0);
        const rank = cardValue === 'A' ? 9 : cardValue === 'K' ? 8 : cardValue === 'Q' ? 7 : 2;
        return {
          rank,
          score: rank * 100,
          cards: holeCards.concat(board.slice(0, 3))
        };
      },
      getRankName: (rank) => {
        const names = ['', '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
        return names[rank] || '未知';
      }
    };
  }

  function setupHandEvaluator() {
    handEvaluator = createMockHandEvaluator();
  }

  describe('基本彩池收集', () => {
    it('应该正确收集无边池的简单情况', () => {
      const players = [
        createPlayer('player1', 950, 50, 50),
        createPlayer('player2', 950, 50, 50),
        createPlayer('player3', 950, 50, 50)
      ];
      
      const pots = PotManager.collectBetsFromStreet(players);
      
      assert.strictEqual(pots.length, 1);
      assert.strictEqual(pots[0].amount, 150); // 3 * 50
      assert.strictEqual(pots[0].eligiblePlayers.length, 3);
      assert.strictEqual(pots[0].type, 'main');
      
      // 验证currentBet被清零
      players.forEach(player => {
        assert.strictEqual(player.currentBet, 0);
      });
    });

    it('无下注时应该返回空彩池', () => {
      const players = [
        createPlayer('player1', 1000, 0, 0),
        createPlayer('player2', 1000, 0, 0)
      ];
      
      const pots = PotManager.collectBetsFromStreet(players);
      
      assert.strictEqual(pots.length, 0);
    });

    it('应该保留现有彩池', () => {
      const players = [
        createPlayer('player1', 950, 50, 50),
        createPlayer('player2', 950, 50, 50)
      ];
      
      const existingPots = [
        { id: 'pot_0', amount: 100, eligiblePlayers: ['player1', 'player2'], type: 'main' }
      ];
      
      const pots = PotManager.collectBetsFromStreet(players, existingPots);
      
      // 相同参与者的彩池会被合并，所以应该只有1个彩池，金额为200
      assert.strictEqual(pots.length, 1);
      assert.strictEqual(pots[0].amount, 200); // 原有100 + 新收集100
    });
  });

  describe('多层边池构建', () => {
    it('应该正确构建两层边池', () => {
      const players = [
        createPlayer('player1', 0, 100, 100, 'ALL_IN'), // all-in 100
        createPlayer('player2', 850, 150, 150),          // 下注 150
        createPlayer('player3', 850, 150, 150)           // 下注 150
      ];
      
      const pots = PotManager.collectBetsFromStreet(players);
      
      assert.strictEqual(pots.length, 2);
      
      // 主池：所有人都参与，每人贡献100
      const mainPot = pots.find(p => p.eligiblePlayers.length === 3);
      assert(mainPot);
      assert.strictEqual(mainPot.amount, 300); // 3 * 100
      assert.strictEqual(mainPot.type, 'main');
      
      // 边池：只有player2和player3参与，每人额外贡献50
      const sidePot = pots.find(p => p.eligiblePlayers.length === 2);
      assert(sidePot);
      assert.strictEqual(sidePot.amount, 100); // 2 * 50
      assert.strictEqual(sidePot.type, 'side');
      assert(sidePot.eligiblePlayers.includes('player2'));
      assert(sidePot.eligiblePlayers.includes('player3'));
    });

    it('应该正确构建三层边池', () => {
      const players = [
        createPlayer('player1', 0, 50, 50, 'ALL_IN'),    // all-in 50
        createPlayer('player2', 0, 100, 100, 'ALL_IN'),  // all-in 100
        createPlayer('player3', 750, 200, 200)           // 下注 200
      ];
      
      const pots = PotManager.collectBetsFromStreet(players);
      
      assert.strictEqual(pots.length, 3);
      
      // 第一层：所有人参与50
      const firstLayer = pots.find(p => p.threshold === 50);
      assert(firstLayer);
      assert.strictEqual(firstLayer.amount, 150); // 3 * 50
      assert.strictEqual(firstLayer.eligiblePlayers.length, 3);
      
      // 第二层：player2和player3参与额外50
      const secondLayer = pots.find(p => p.threshold === 100);
      assert(secondLayer);
      assert.strictEqual(secondLayer.amount, 100); // 2 * 50
      assert.strictEqual(secondLayer.eligiblePlayers.length, 2);
      
      // 第三层：只有player3参与额外100
      const thirdLayer = pots.find(p => p.threshold === 200);
      assert(thirdLayer);
      assert.strictEqual(thirdLayer.amount, 100); // 1 * 100
      assert.strictEqual(thirdLayer.eligiblePlayers.length, 1);
    });
  });

  describe('彩池分配', () => {
    it('应该正确分配单个彩池给唯一获胜者', () => {
      handEvaluator = createMockHandEvaluator();
      const players = [
        createPlayer('player1', 950, 50, 0, 'ACTIVE', ['AH', 'KS']), // 最强牌
        createPlayer('player2', 950, 50, 0, 'ACTIVE', ['QH', 'JS']),
        createPlayer('player3', 950, 50, 0, 'FOLDED', ['TC', '9D'])  // 弃牌
      ];
      
      const pots = [
        { id: 'pot_1', amount: 150, eligiblePlayers: ['player1', 'player2', 'player3'], type: 'main' }
      ];
      
      const board = ['7H', '8C', '9S'];
      const results = PotManager.distributePots(pots, players, board, handEvaluator);
      
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].winners.length, 1);
      assert.strictEqual(results[0].winners[0], 'player1');
      assert.strictEqual(results[0].amount, 150);
      assert.strictEqual(players[0].chips, 1100); // 950 + 150
    });

    it('应该正确处理平局分配', () => {
      handEvaluator = createMockHandEvaluator();
      const players = [
        createPlayer('player1', 950, 50, 0, 'ACTIVE', ['AH', 'KS']),
        createPlayer('player2', 950, 50, 0, 'ACTIVE', ['AC', 'KD']), // 相同牌力
        createPlayer('player3', 950, 50, 0, 'ACTIVE', ['QH', 'JS'])
      ];
      
      const pots = [
        { id: 'pot_1', amount: 150, eligiblePlayers: ['player1', 'player2', 'player3'], type: 'main' }
      ];
      
      const board = ['7H', '8C', '9S'];
      const results = PotManager.distributePots(pots, players, board, handEvaluator, 0);
      
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].winners.length, 2);
      assert(results[0].winners.includes('player1'));
      assert(results[0].winners.includes('player2'));
      
      // 每人应该得到75筹码（150 / 2）
      assert.strictEqual(players[0].chips, 1025); // 950 + 75
      assert.strictEqual(players[1].chips, 1025); // 950 + 75
      assert.strictEqual(players[2].chips, 950);  // 未获胜
    });

    it('应该正确处理余数分配', () => {
      handEvaluator = createMockHandEvaluator();
      const players = [
        createPlayer('player1', 950, 0, 0, 'ACTIVE', ['AH', 'KS']),
        createPlayer('player2', 950, 0, 0, 'ACTIVE', ['AC', 'KD']),
        createPlayer('player3', 950, 0, 0, 'ACTIVE', ['AS', 'KH'])
      ];
      
      const pots = [
        { id: 'pot_1', amount: 100, eligiblePlayers: ['player1', 'player2', 'player3'], type: 'main' }
      ];
      
      const board = ['7H', '8C', '9S'];
      const buttonIndex = 0; // player1是按钮
      const results = PotManager.distributePots(pots, players, board, handEvaluator, buttonIndex);
      
      // 100筹码三人平分：每人33，余数1给按钮后第一个获胜者
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].winners.length, 3);
      assert.strictEqual(results[0].distribution.sharePerWinner, 33);
      assert.strictEqual(results[0].distribution.remainder, 1);
      
      // 检查余数分配（按钮位后顺时针）
      const remainderRecipient = results[0].distribution.remainderRecipients[0];
      assert(results[0].distribution.remainderRecipients.includes('player2')); // 按钮后第一位
    });

    it('应该正确分配多个边池', () => {
      handEvaluator = createMockHandEvaluator();
      
      const players = [
        createPlayer('player1', 0, 50, 0, 'ALL_IN', ['AH', 'KS']),   // 最强牌，参与主池
        createPlayer('player2', 850, 150, 0, 'ACTIVE', ['QH', 'JS']), // 参与主池+边池
        createPlayer('player3', 850, 150, 0, 'ACTIVE', ['TC', '9D'])  // 参与主池+边池
      ];
      
      const pots = [
        { id: 'pot_1', amount: 150, eligiblePlayers: ['player1', 'player2', 'player3'], type: 'main' },
        { id: 'pot_2', amount: 200, eligiblePlayers: ['player2', 'player3'], type: 'side' }
      ];
      
      const board = ['7H', '8C', '9S'];
      const results = PotManager.distributePots(pots, players, board, handEvaluator);
      
      assert.strictEqual(results.length, 2);
      
      // 主池由player1获得（最强牌）
      const mainPotResult = results.find(r => r.potId === 'pot_1');
      assert(mainPotResult);
      assert.strictEqual(mainPotResult.winners[0], 'player1');
      
      // 边池由player2获得（在边池参与者中最强）
      const sidePotResult = results.find(r => r.potId === 'pot_2');
      assert(sidePotResult);
      assert.strictEqual(sidePotResult.winners[0], 'player2');
    });

    it('只有一人有资格时应该直接获得彩池', () => {
      handEvaluator = createMockHandEvaluator();
      const players = [
        createPlayer('player1', 950, 50, 0, 'ACTIVE', ['AH', 'KS']),
        createPlayer('player2', 950, 50, 0, 'FOLDED', ['QH', 'JS']),
        createPlayer('player3', 950, 50, 0, 'FOLDED', ['TC', '9D'])
      ];
      
      const pots = [
        { id: 'pot_1', amount: 150, eligiblePlayers: ['player1', 'player2', 'player3'], type: 'main' }
      ];
      
      const board = ['7H', '8C', '9S'];
      const results = PotManager.distributePots(pots, players, board, handEvaluator);
      
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].winners.length, 1);
      assert.strictEqual(results[0].winners[0], 'player1');
      assert.strictEqual(results[0].reason, 'only_eligible');
      assert.strictEqual(players[0].chips, 1100); // 950 + 150
    });
  });

  describe('彩池摘要', () => {
    it('应该返回正确的彩池摘要', () => {
      const pots = [
        { id: 'pot_1', amount: 300, eligiblePlayers: ['p1', 'p2', 'p3'], type: 'main' },
        { id: 'pot_2', amount: 100, eligiblePlayers: ['p2', 'p3'], type: 'side' },
        { id: 'pot_3', amount: 50, eligiblePlayers: ['p3'], type: 'side' }
      ];
      
      const summary = PotManager.getPotsSummary(pots);
      
      assert.strictEqual(summary.totalAmount, 450);
      assert.strictEqual(summary.potCount, 3);
      assert.strictEqual(summary.mainPotAmount, 300);
      assert.strictEqual(summary.sidePotAmount, 150);
      assert.strictEqual(summary.pots.length, 3);
      assert.strictEqual(summary.pots[0].eligiblePlayerCount, 3);
    });

    it('空彩池应该返回零值摘要', () => {
      const summary = PotManager.getPotsSummary([]);
      
      assert.strictEqual(summary.totalAmount, 0);
      assert.strictEqual(summary.potCount, 0);
      assert.strictEqual(summary.mainPotAmount, 0);
      assert.strictEqual(summary.sidePotAmount, 0);
      assert.strictEqual(summary.pots.length, 0);
    });
  });

  describe('辅助方法测试', () => {
    it('clearPots应该返回空数组', () => {
      const pots = PotManager.clearPots();
      assert(Array.isArray(pots));
      assert.strictEqual(pots.length, 0);
    });

    it('_arraysEqual应该正确比较数组', () => {
      assert.strictEqual(PotManager._arraysEqual([1, 2, 3], [1, 2, 3]), true);
      assert.strictEqual(PotManager._arraysEqual([1, 2, 3], [1, 2, 4]), false);
      assert.strictEqual(PotManager._arraysEqual([1, 2], [1, 2, 3]), false);
      assert.strictEqual(PotManager._arraysEqual([], []), true);
    });

    it('_sortWinnersByPosition应该按位置正确排序', () => {
      const allPlayers = [
        { id: 'player1' }, // 位置0 - 按钮
        { id: 'player2' }, // 位置1
        { id: 'player3' }, // 位置2
        { id: 'player4' }  // 位置3
      ];
      
      const winners = [
        { playerId: 'player3' },
        { playerId: 'player1' },
        { playerId: 'player4' }
      ];
      
      const sorted = PotManager._sortWinnersByPosition(winners, 0, allPlayers);
      
      // 按钮(player1)后顺时针顺序：player2, player3, player4, player1
      // 按钮位最后分配余数，在获胜者中的顺序应该是：player3(2), player4(3), player1(最后)
      assert.strictEqual(sorted[0].playerId, 'player3'); // 距离2
      assert.strictEqual(sorted[1].playerId, 'player4'); // 距离3  
      assert.strictEqual(sorted[2].playerId, 'player1'); // 按钮位最后
    });
  });

  describe('边界情况处理', () => {
    it('应该处理所有玩家都all-in的情况', () => {
      const players = [
        createPlayer('player1', 0, 100, 100, 'ALL_IN'),
        createPlayer('player2', 0, 200, 200, 'ALL_IN'),
        createPlayer('player3', 0, 150, 150, 'ALL_IN')
      ];
      
      const pots = PotManager.collectBetsFromStreet(players);
      
      // 应该产生3层边池
      assert.strictEqual(pots.length, 3);
      
      // 验证总金额正确
      const totalAmount = pots.reduce((sum, pot) => sum + pot.amount, 0);
      assert.strictEqual(totalAmount, 450); // 100 + 200 + 150
    });

    it('应该处理金额为0的彩池', () => {
      handEvaluator = createMockHandEvaluator();
      
      const players = [
        createPlayer('player1', 950, 50, 0, 'ACTIVE', ['AH', 'KS'])
      ];
      
      const pots = [
        { id: 'pot_1', amount: 0, eligiblePlayers: ['player1'], type: 'main' },
        { id: 'pot_2', amount: 100, eligiblePlayers: ['player1'], type: 'main' }
      ];
      
      const board = ['7H', '8C', '9S'];
      const results = PotManager.distributePots(pots, players, board, handEvaluator);
      
      // 只应该处理非零彩池
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].potId, 'pot_2');
    });

    it('应该处理相同投入金额的多个玩家', () => {
      const players = [
        createPlayer('player1', 900, 100, 100),
        createPlayer('player2', 900, 100, 100),
        createPlayer('player3', 900, 100, 100),
        createPlayer('player4', 900, 100, 100)
      ];
      
      const pots = PotManager.collectBetsFromStreet(players);
      
      // 所有人投入相同，应该只有一个主池
      assert.strictEqual(pots.length, 1);
      assert.strictEqual(pots[0].amount, 400);
      assert.strictEqual(pots[0].eligiblePlayers.length, 4);
      assert.strictEqual(pots[0].type, 'main');
    });
  });
});