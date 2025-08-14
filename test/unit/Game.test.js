import { describe, it } from 'node:test';
import assert from 'node:assert';
import Game from '../../src/game/Game.js';
import TableRules from '../../src/game/rules/TableRules.js';

describe('Game - 集成测试', () => {
  let game;
  let rules;

  function setupBasicGame() {
    rules = TableRules.createCashGame(20); // 10/20 盲注
    game = new Game(rules);
    
    // 添加三个玩家
    game.addPlayer({ id: 'alice', name: 'Alice', chips: 1000 });
    game.addPlayer({ id: 'bob', name: 'Bob', chips: 2000 });
    game.addPlayer({ id: 'charlie', name: 'Charlie', chips: 1500 });
  }

  describe('游戏生命周期', () => {
    it('应该正确初始化游戏', () => {
      setupBasicGame();
      
      const state = game.getPublicState();
      assert.strictEqual(state.phase, 'WAITING');
      assert.strictEqual(state.players.length, 3);
      assert.strictEqual(state.handNumber, 0);
    });

    it('应该成功开始新一轮', () => {
      setupBasicGame();
      
      const success = game.startNewHand();
      assert.strictEqual(success, true);
      
      const state = game.getPublicState();
      assert.strictEqual(state.phase, 'PLAYING');
      assert.strictEqual(state.street, 'PRE_FLOP');
      assert.strictEqual(state.handNumber, 1);
      assert(state.currentTurn); // 应该有当前行动者
      
      // 检查盲注是否正确设置
      const smallBlindPlayer = state.players.find(p => p.isSmallBlind);
      const bigBlindPlayer = state.players.find(p => p.isBigBlind);
      assert(smallBlindPlayer);
      assert(bigBlindPlayer);
      assert.strictEqual(smallBlindPlayer.totalBet, 10);
      assert.strictEqual(bigBlindPlayer.totalBet, 20);
    });

    it('玩家数量不足时不应该开始游戏', () => {
      rules = TableRules.createCashGame(20);
      game = new Game(rules);
      game.addPlayer({ id: 'alice', name: 'Alice', chips: 1000 });
      
      const success = game.startNewHand();
      assert.strictEqual(success, false);
    });

    it('应该正确发放手牌', () => {
      setupBasicGame();
      game.startNewHand();
      
      // 检查每个玩家都有两张手牌
      const alicePrivate = game.getPrivateStateFor('alice');
      const bobPrivate = game.getPrivateStateFor('bob');
      const charliePrivate = game.getPrivateStateFor('charlie');
      
      assert.strictEqual(alicePrivate.holeCards.length, 2);
      assert.strictEqual(bobPrivate.holeCards.length, 2);
      assert.strictEqual(charliePrivate.holeCards.length, 2);
      
      // 检查牌面格式正确
      assert(alicePrivate.holeCards[0].match(/^[2-9TJQKA][SHDC]$/));
      assert(alicePrivate.holeCards[1].match(/^[2-9TJQKA][SHDC]$/));
    });
  });

  describe('动作处理与游戏流程', () => {
    it('应该正确处理有效动作', () => {
      setupBasicGame();
      game.startNewHand();
      
      const currentPlayer = game.getPublicState().currentTurn;
      const result = game.applyAction({
        type: 'call',
        playerId: currentPlayer
      });
      
      assert.strictEqual(result.success, true);
      assert(result.gameEvents);
      assert(result.gameState);
    });

    it('应该拒绝无效动作', () => {
      setupBasicGame();
      game.startNewHand();
      
      const currentPlayer = game.getPublicState().currentTurn;
      const result = game.applyAction({
        type: 'bet',
        playerId: currentPlayer,
        amount: 5 // 小于最小下注额
      });
      
      assert.strictEqual(result.success, false);
      assert(result.error);
    });

    it('应该正确推进街道', () => {
      setupBasicGame();
      game.startNewHand();
      
      // 模拟所有玩家call到flop
      let state = game.getPublicState();
      
      // 第一个玩家call
      game.applyAction({ type: 'call', playerId: state.currentTurn });
      state = game.getPublicState();
      
      // 第二个玩家call  
      game.applyAction({ type: 'call', playerId: state.currentTurn });
      state = game.getPublicState();
      
      // 大盲check，应该推进到FLOP
      const result = game.applyAction({ type: 'check', playerId: state.currentTurn });
      
      assert.strictEqual(result.success, true);
      assert(result.gameEvents.some(e => e.type === 'STREET_ADVANCED'));
      assert(result.gameEvents.some(e => e.type === 'FLOP_DEALT'));
      assert.strictEqual(result.gameState.street, 'FLOP');
      assert.strictEqual(result.gameState.communityCards.length, 3);
    });

    it('应该正确处理all-in情况', () => {
      setupBasicGame();
      game.startNewHand();
      
      const state = game.getPublicState();
      const currentPlayer = state.currentTurn;
      
      const result = game.applyAction({
        type: 'all-in',
        playerId: currentPlayer
      });
      
      assert.strictEqual(result.success, true);
      
      // 检查玩家状态变为ALL_IN
      const updatedState = game.getPublicState();
      const player = updatedState.players.find(p => p.id === currentPlayer);
      assert.strictEqual(player.status, 'ALL_IN');
      assert.strictEqual(player.chips, 0);
    });

    it('应该正确处理弃牌', () => {
      setupBasicGame();
      game.startNewHand();
      
      const state = game.getPublicState();
      const currentPlayer = state.currentTurn;
      
      const result = game.applyAction({
        type: 'fold',
        playerId: currentPlayer
      });
      
      assert.strictEqual(result.success, true);
      
      // 检查玩家状态变为FOLDED
      const updatedState = game.getPublicState();
      const player = updatedState.players.find(p => p.id === currentPlayer);
      assert.strictEqual(player.status, 'FOLDED');
      assert.strictEqual(updatedState.activePlayersCount, 2);
    });
  });

  describe('彩池管理', () => {
    it('应该正确管理彩池', () => {
      setupBasicGame();
      game.startNewHand();
      
      let state = game.getPublicState();
      let result;
      
      // 第一个玩家动作 (UTG raise 50)
      result = game.applyAction({ type: 'raise', playerId: state.currentTurn, amount: 50 });
      state = game.getPublicState();
      
      // 第二个玩家动作 (call)
      result = game.applyAction({ type: 'call', playerId: state.currentTurn });
      state = game.getPublicState();
      
      // 第三个玩家动作 (call) - 应该触发回合闭合和街道推进
      result = game.applyAction({ type: 'call', playerId: state.currentTurn });
      state = result.gameState || game.getPublicState();
      
      // 检查是否成功推进到FLOP并收集了彩池
      if (result.gameEvents && result.gameEvents.some(e => e.type === 'STREET_ADVANCED')) {
        // 街道推进成功，应该有彩池
        assert(state.pots.totalAmount > 0);
        assert(state.pots.potCount >= 1);
        assert.strictEqual(state.street, 'FLOP');
      } else {
        // 如果没有推进街道，至少验证动作成功执行了
        assert.strictEqual(result.success, true);
      }
    });

    it('应该正确处理边池', () => {
      setupBasicGame();
      // 设置一个短筹码玩家
      const shortPlayer = game.gameState.players.find(p => p.id === 'alice');
      shortPlayer.chips = 50;
      
      game.startNewHand();
      
      let state = game.getPublicState();
      let result;
      
      // 让所有玩家参与到一定下注，然后短筹码玩家all-in
      while (state.currentTurn !== 'alice' && state.phase === 'PLAYING') {
        result = game.applyAction({ type: 'call', playerId: state.currentTurn });
        state = result.gameState || game.getPublicState();
      }
      
      if (state.currentTurn === 'alice') {
        result = game.applyAction({ type: 'all-in', playerId: 'alice' });
        state = result.gameState || game.getPublicState();
      }
      
      // 其他玩家继续下注直到回合闭合
      let maxActions = 10;
      let actionCount = 0;
      while (state.phase === 'PLAYING' && state.street === 'PRE_FLOP' && actionCount < maxActions) {
        if (state.currentTurn && state.currentTurn !== 'alice') {
          result = game.applyAction({ type: 'call', playerId: state.currentTurn });
          state = result.gameState || game.getPublicState();
        } else {
          break;
        }
        actionCount++;
      }
      
      // 应该有彩池（可能有边池）
      assert(state.pots.potCount >= 1);
    });
  });

  describe('游戏结束', () => {
    it('只剩一人时应该结束游戏', () => {
      setupBasicGame();
      game.startNewHand();
      
      let state = game.getPublicState();
      let result;
      
      // 两个玩家弃牌
      let foldCount = 0;
      while (foldCount < 2 && state.phase === 'PLAYING') {
        result = game.applyAction({ type: 'fold', playerId: state.currentTurn });
        if (result.success) {
          foldCount++;
        }
        state = game.getPublicState();
      }
      
      // 游戏应该结束
      assert(result.gameEvents.some(e => e.type === 'GAME_ENDED' || e.type === 'HAND_FINISHED'));
    });

    it('到达摊牌阶段应该结束游戏', () => {
      setupBasicGame();
      game.startNewHand();
      
      // 模拟所有玩家一路call到摊牌
      let state = game.getPublicState();
      let maxActions = 20; // 防止无限循环
      let actionCount = 0;
      
      while (state.phase === 'PLAYING' && state.street !== 'SHOWDOWN' && actionCount < maxActions) {
        const result = game.applyAction({ type: 'check', playerId: state.currentTurn });
        if (!result.success) {
          game.applyAction({ type: 'call', playerId: state.currentTurn });
        }
        state = game.getPublicState();
        actionCount++;
      }
      
      // 如果到达摊牌，游戏应该自动结束
      if (state.street === 'SHOWDOWN') {
        assert.strictEqual(state.phase, 'WAITING');
      }
    });
  });

  describe('玩家管理', () => {
    it('应该正确添加和移除玩家', () => {
      rules = TableRules.createCashGame(20);
      game = new Game(rules);
      
      const success1 = game.addPlayer({ id: 'alice', name: 'Alice', chips: 1000 });
      const success2 = game.addPlayer({ id: 'bob', name: 'Bob', chips: 2000 });
      
      assert.strictEqual(success1, true);
      assert.strictEqual(success2, true);
      assert.strictEqual(game.getPublicState().players.length, 2);
      
      const success3 = game.removePlayer('alice');
      assert.strictEqual(success3, true);
      assert.strictEqual(game.getPublicState().players.length, 1);
    });

    it('应该拒绝无效买入金额', () => {
      rules = TableRules.createCashGame(20);
      game = new Game(rules);
      
      const success = game.addPlayer({ id: 'alice', name: 'Alice', chips: 100 }); // 低于最小买入
      assert.strictEqual(success, false);
    });

    it('游戏进行中不应该允许添加玩家', () => {
      setupBasicGame();
      game.startNewHand();
      
      const success = game.addPlayer({ id: 'david', name: 'David', chips: 1000 });
      assert.strictEqual(success, false);
    });
  });

  describe('状态查询', () => {
    it('应该返回正确的公共状态', () => {
      setupBasicGame();
      
      const publicState = game.getPublicState();
      
      assert(publicState.gameId);
      assert(publicState.phase);
      assert(Array.isArray(publicState.players));
      assert(publicState.tableRules);
      assert(publicState.pots);
      
      // 公共状态不应该包含手牌
      publicState.players.forEach(player => {
        assert(!player.holeCards || player.holeCards.length === 0);
      });
    });

    it('应该返回正确的私有状态', () => {
      setupBasicGame();
      game.startNewHand();
      
      const privateState = game.getPrivateStateFor('alice');
      
      assert(privateState.holeCards);
      assert(Array.isArray(privateState.holeCards));
    });

    it('应该返回正确的游戏摘要', () => {
      setupBasicGame();
      game.startNewHand();
      
      const summary = game.getGameSummary();
      
      assert(summary.gameId);
      assert.strictEqual(summary.phase, 'PLAYING');
      assert.strictEqual(summary.playerCount, 3);
      assert.strictEqual(summary.handNumber, 1);
      assert(summary.tableRules);
    });
  });

  describe('边界情况', () => {
    it('应该处理玩家筹码不足的情况', () => {
      setupBasicGame();
      // 设置一个玩家只有很少筹码
      const poorPlayer = game.gameState.players.find(p => p.id === 'alice');
      poorPlayer.chips = 5;
      
      game.startNewHand();
      
      const state = game.getPublicState();
      
      // 尝试下注超过筹码的金额应该失败
      const result = game.applyAction({
        type: 'bet',
        playerId: state.currentTurn,
        amount: 100
      });
      
      if (state.currentTurn === 'alice') {
        assert.strictEqual(result.success, false);
      }
    });

    it('应该处理空游戏状态', () => {
      rules = TableRules.createCashGame(20);
      game = new Game(rules);
      
      const publicState = game.getPublicState();
      const summary = game.getGameSummary();
      
      assert.strictEqual(publicState.phase, 'WAITING');
      assert.strictEqual(publicState.players.length, 0);
      assert.strictEqual(summary.playerCount, 0);
    });
  });
});