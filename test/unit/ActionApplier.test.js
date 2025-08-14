import { describe, it } from 'node:test';
import assert from 'node:assert';
import ActionApplier from '../../src/game/actions/ActionApplier.js';
import GameState from '../../src/game/GameState.js';
import TableRules from '../../src/game/rules/TableRules.js';

describe('ActionApplier', () => {
  let gameState;
  let rules;

  function setupBasicGame() {
    gameState = new GameState();
    rules = TableRules.createCashGame(20); // 10/20 blinds
    
    // 添加三个玩家
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 1500 });
    
    // 设置游戏状态
    gameState.phase = 'PLAYING';
    gameState.currentTurn = 'player1';
    gameState.amountToCall = 0;
    gameState.isActionReopened = true;
    gameState.activePlayersCount = 3;
  }

  describe('动作历史记录', () => {
    it('应该记录动作到历史中', () => {
      setupBasicGame();
      
      const action = { type: 'bet', playerId: 'player1', amount: 50 };
      ActionApplier.apply(action, gameState, rules);
      
      assert(gameState.actionHistory);
      assert.strictEqual(gameState.actionHistory.length, 1);
      assert.strictEqual(gameState.actionHistory[0].type, 'bet');
      assert.strictEqual(gameState.actionHistory[0].playerId, 'player1');
      assert.strictEqual(gameState.actionHistory[0].amount, 50);
      assert(gameState.actionHistory[0].timestamp);
    });
  });

  describe('check动作应用', () => {
    it('check不应该改变游戏状态', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      const originalChips = player.chips;
      const originalBet = player.currentBet;
      
      const action = { type: 'check', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, originalChips);
      assert.strictEqual(player.currentBet, originalBet);
      assert.strictEqual(gameState.amountToCall, 0);
    });
  });

  describe('bet动作应用', () => {
    it('应该正确应用bet动作', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'bet', playerId: 'player1', amount: 50 };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, 950); // 1000 - 50
      assert.strictEqual(player.currentBet, 50);
      assert.strictEqual(player.totalBet, 50);
      assert.strictEqual(gameState.amountToCall, 50);
      assert.strictEqual(gameState.lastAggressorId, 'player1');
      assert.strictEqual(gameState.isActionReopened, true);
    });

    it('应该更新最小加注额', () => {
      setupBasicGame();
      const originalMinRaise = rules.minRaise;
      
      const action = { type: 'bet', playerId: 'player1', amount: 100 };
      ActionApplier.apply(action, gameState, rules);
      
      assert(rules.minRaise >= Math.max(originalMinRaise, 100));
    });
  });

  describe('call动作应用', () => {
    it('应该正确应用完整call', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'call', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, 950); // 1000 - 50
      assert.strictEqual(player.currentBet, 50);
      assert.strictEqual(player.totalBet, 50);
      assert.strictEqual(player.status, 'ACTIVE');
    });

    it('应该处理筹码不足的call（自动all-in）', () => {
      setupBasicGame();
      gameState.amountToCall = 2000; // 超过player1的1000筹码
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'call', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, 0); // 全部筹码用完
      assert.strictEqual(player.currentBet, 1000); // 所有筹码
      assert.strictEqual(player.totalBet, 1000);
      assert.strictEqual(player.status, 'ALL_IN');
    });

    it('部分跟注时应该关闭行动重开', () => {
      setupBasicGame();
      gameState.amountToCall = 1500; // 大于player1筹码，形成非完整跟注
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'call', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.status, 'ALL_IN');
      assert.strictEqual(gameState.isActionReopened, false);
    });
  });

  describe('raise动作应用', () => {
    it('应该正确应用raise动作', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      const player = gameState.getPlayer('player1');
      player.currentBet = 0; // 尚未下注
      
      const action = { type: 'raise', playerId: 'player1', amount: 100 };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, 900); // 1000 - 100
      assert.strictEqual(player.currentBet, 100);
      assert.strictEqual(player.totalBet, 100);
      assert.strictEqual(gameState.amountToCall, 100);
      assert.strictEqual(gameState.lastAggressorId, 'player1');
      assert.strictEqual(gameState.isActionReopened, true);
    });

    it('应该计算正确的加注金额', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      const player = gameState.getPlayer('player1');
      player.currentBet = 20; // 已有部分下注
      
      const action = { type: 'raise', playerId: 'player1', amount: 100 };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, 920); // 1000 - 80 (100 - 20)
      assert.strictEqual(player.currentBet, 100);
      assert.strictEqual(player.totalBet, 80); // 只加了80
    });
  });

  describe('fold动作应用', () => {
    it('应该正确应用fold动作', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      player.holeCards = ['AH', 'KD'];
      
      const action = { type: 'fold', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.status, 'FOLDED');
      assert.strictEqual(player.holeCards.length, 0); // 清除手牌
      assert.strictEqual(gameState.activePlayersCount, 2); // 减少活跃玩家
    });

    it('fold不应该改变筹码', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      const originalChips = player.chips;
      const originalBet = player.currentBet;
      
      const action = { type: 'fold', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, originalChips);
      assert.strictEqual(player.currentBet, originalBet);
    });
  });

  describe('all-in动作应用', () => {
    it('应该正确应用all-in动作', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'all-in', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.chips, 0);
      assert.strictEqual(player.currentBet, 1000);
      assert.strictEqual(player.totalBet, 1000);
      assert.strictEqual(player.status, 'ALL_IN');
      assert.strictEqual(gameState.activePlayersCount, 2);
    });

    it('all-in加注应该更新amountToCall', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'all-in', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(gameState.amountToCall, 1000);
      assert.strictEqual(gameState.lastAggressorId, 'player1');
    });

    it('完整all-in加注应该重开行动', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      rules.minRaise = 20;
      
      const action = { type: 'all-in', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      const actualRaise = 1000 - 50; // 950
      assert(actualRaise >= rules.minRaise);
      assert.strictEqual(gameState.isActionReopened, true);
    });

    it('非完整all-in加注应该关闭行动', () => {
      setupBasicGame();
      // 设置一个小筹码玩家进行微小加注
      const smallPlayer = gameState.getPlayer('player1');
      smallPlayer.chips = 65; // 少量筹码，但大于跟注额
      gameState.amountToCall = 50;
      rules.minRaise = 50; // 设置最小加注额为50
      
      const action = { type: 'all-in', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      // 玩家all-in 65，需要跟注50，所以新注额是65
      // 实际加注是 65 - 50 = 15，小于最小加注50
      const actualRaise = 65 - 50; // 15
      assert(actualRaise < 50); // 确实小于最小加注
      assert.strictEqual(gameState.isActionReopened, false);
    });
  });

  describe('辅助方法测试', () => {
    it('_calculateAmountToCall应该正确计算', () => {
      setupBasicGame();
      gameState.amountToCall = 100;
      const player = gameState.getPlayer('player1');
      player.currentBet = 30;
      
      const result = ActionApplier._calculateAmountToCall(gameState, player);
      assert.strictEqual(result, 70);
    });

    it('_updateActivePlayersCount应该正确更新', () => {
      setupBasicGame();
      const player1 = gameState.getPlayer('player1');
      const player2 = gameState.getPlayer('player2');
      
      player1.status = 'FOLDED';
      player2.status = 'ALL_IN';
      
      ActionApplier._updateActivePlayersCount(gameState);
      assert.strictEqual(gameState.activePlayersCount, 1); // 只有player3是ACTIVE
    });
  });

  describe('街道状态重置', () => {
    it('resetStreetState应该重置所有相关状态', () => {
      setupBasicGame();
      
      // 设置一些状态
      gameState.amountToCall = 100;
      gameState.lastAggressorId = 'player1';
      gameState.isActionReopened = false;
      gameState.actionHistory = [
        { type: 'bet', playerId: 'player1', street: 'PRE_FLOP' },
        { type: 'call', playerId: 'player2', street: 'PRE_FLOP' }
      ];
      
      const player1 = gameState.getPlayer('player1');
      const player2 = gameState.getPlayer('player2');
      player1.currentBet = 50;
      player2.currentBet = 50;
      
      ActionApplier.resetStreetState(gameState);
      
      // 验证重置结果
      assert.strictEqual(gameState.amountToCall, 0);
      assert.strictEqual(gameState.lastAggressorId, null);
      assert.strictEqual(gameState.isActionReopened, true);
      assert.strictEqual(player1.currentBet, 0);
      assert.strictEqual(player2.currentBet, 0);
    });

    it('resetStreetState应该保留当前街道的动作历史', () => {
      setupBasicGame();
      gameState.street = 'FLOP';
      gameState.actionHistory = [
        { type: 'bet', playerId: 'player1', street: 'PRE_FLOP' },
        { type: 'call', playerId: 'player2', street: 'FLOP' }
      ];
      
      ActionApplier.resetStreetState(gameState);
      
      // 应该只保留当前街道(FLOP)的历史
      assert.strictEqual(gameState.actionHistory.length, 1);
      assert.strictEqual(gameState.actionHistory[0].street, 'FLOP');
    });
  });

  describe('边界情况处理', () => {
    it('应该处理玩家筹码为0的情况', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      player.chips = 0;
      
      const action = { type: 'call', playerId: 'player1' };
      ActionApplier.apply(action, gameState, rules);
      
      // 不应该出错，筹码仍为0
      assert.strictEqual(player.chips, 0);
      assert.strictEqual(player.currentBet, 0);
    });

    it('应该处理amountToCall为0的raise', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      const player = gameState.getPlayer('player1');
      
      const action = { type: 'raise', playerId: 'player1', amount: 50 };
      ActionApplier.apply(action, gameState, rules);
      
      assert.strictEqual(player.currentBet, 50);
      assert.strictEqual(gameState.amountToCall, 50);
    });
  });
});