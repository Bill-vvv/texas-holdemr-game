import { describe, it } from 'node:test';
import assert from 'node:assert';
import ActionValidator from '../../src/game/actions/ActionValidator.js';
import GameState from '../../src/game/GameState.js';
import TableRules from '../../src/game/rules/TableRules.js';

describe('ActionValidator', () => {
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
  }

  describe('基本参数验证', () => {
    it('应该拒绝无效的动作格式', () => {
      setupBasicGame();
      
      // 缺少必要字段
      let result = ActionValidator.validate({}, gameState, rules);
      assert.strictEqual(result.error, 'INVALID_ACTION_FORMAT');
      
      result = ActionValidator.validate({ type: 'bet' }, gameState, rules);
      assert.strictEqual(result.error, 'INVALID_ACTION_FORMAT');
      
      result = ActionValidator.validate({ playerId: 'player1' }, gameState, rules);
      assert.strictEqual(result.error, 'INVALID_ACTION_FORMAT');
    });

    it('应该拒绝不存在的玩家', () => {
      setupBasicGame();
      
      const result = ActionValidator.validate({
        type: 'check',
        playerId: 'nonexistent'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'PLAYER_NOT_FOUND');
    });

    it('应该拒绝非当前轮玩家的动作', () => {
      setupBasicGame();
      gameState.currentTurn = 'player1';
      
      const result = ActionValidator.validate({
        type: 'check',
        playerId: 'player2'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'NOT_YOUR_TURN');
    });

    it('应该拒绝非ACTIVE状态玩家的动作', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      player.status = 'FOLDED';
      
      const result = ActionValidator.validate({
        type: 'check',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'INVALID_PLAYER_STATUS');
    });
  });

  describe('check动作验证', () => {
    it('无人下注时应该允许check', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      const result = ActionValidator.validate({
        type: 'check',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });

    it('有人下注时不应该允许check', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      
      const result = ActionValidator.validate({
        type: 'check',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'CANNOT_CHECK');
      assert(result.message.includes('需要跟注'));
    });

    it('玩家已跟到最高注时应该允许check', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      const player = gameState.getPlayer('player1');
      player.currentBet = 50; // 已经跟到最高注
      
      const result = ActionValidator.validate({
        type: 'check',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });
  });

  describe('bet动作验证', () => {
    it('无人下注时应该允许合法bet', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      const result = ActionValidator.validate({
        type: 'bet',
        playerId: 'player1',
        amount: 50
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });

    it('有人已下注时不应该允许bet', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      
      const result = ActionValidator.validate({
        type: 'bet',
        playerId: 'player1',
        amount: 100
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'CANNOT_BET');
    });

    it('应该拒绝无效的下注金额', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      // 金额为0
      let result = ActionValidator.validate({
        type: 'bet',
        playerId: 'player1',
        amount: 0
      }, gameState, rules);
      assert.strictEqual(result.error, 'INVALID_BET_AMOUNT');
      
      // 负金额
      result = ActionValidator.validate({
        type: 'bet',
        playerId: 'player1',
        amount: -50
      }, gameState, rules);
      assert.strictEqual(result.error, 'INVALID_BET_AMOUNT');
    });

    it('应该拒绝超出筹码的下注', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      const result = ActionValidator.validate({
        type: 'bet',
        playerId: 'player1',
        amount: 2000 // 超过1000筹码
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'INSUFFICIENT_CHIPS');
    });

    it('应该拒绝小于最小下注额的bet', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      const result = ActionValidator.validate({
        type: 'bet',
        playerId: 'player1',
        amount: 10 // 小于20(大盲)
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'BET_TOO_SMALL');
    });
  });

  describe('call动作验证', () => {
    it('有人下注时应该允许call', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      
      const result = ActionValidator.validate({
        type: 'call',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });

    it('无人下注时不应该允许call', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      const result = ActionValidator.validate({
        type: 'call',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'CANNOT_CALL');
    });

    it('即使筹码不足也应该允许call（自动all-in）', () => {
      setupBasicGame();
      gameState.amountToCall = 2000; // 超过玩家筹码
      
      const result = ActionValidator.validate({
        type: 'call',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });
  });

  describe('raise动作验证', () => {
    it('有人下注时应该允许合法raise', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      gameState.isActionReopened = true;
      
      const result = ActionValidator.validate({
        type: 'raise',
        playerId: 'player1',
        amount: 100
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });

    it('无人下注时不应该允许raise', () => {
      setupBasicGame();
      gameState.amountToCall = 0;
      
      const result = ActionValidator.validate({
        type: 'raise',
        playerId: 'player1',
        amount: 50
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'CANNOT_RAISE');
    });

    it('非完整加注后不应该允许raise', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      gameState.isActionReopened = false; // 被非完整加注关闭
      
      const result = ActionValidator.validate({
        type: 'raise',
        playerId: 'player1',
        amount: 100
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'ACTION_NOT_REOPENED');
    });

    it('应该拒绝小于跟注金额的raise', () => {
      setupBasicGame();
      gameState.amountToCall = 100;
      
      const result = ActionValidator.validate({
        type: 'raise',
        playerId: 'player1',
        amount: 80 // 小于需要跟注的100
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'RAISE_TOO_SMALL');
    });

    it('应该拒绝超出筹码的raise', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      
      const result = ActionValidator.validate({
        type: 'raise',
        playerId: 'player1',
        amount: 2000 // 超过1000筹码
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'INSUFFICIENT_CHIPS');
    });

    it('应该拒绝小于最小加注额的raise', () => {
      setupBasicGame();
      gameState.amountToCall = 50;
      const player = gameState.getPlayer('player1');
      player.currentBet = 0;
      
      const result = ActionValidator.validate({
        type: 'raise',
        playerId: 'player1',
        amount: 60 // 只加10，小于最小加注20
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'RAISE_TOO_SMALL');
    });
  });

  describe('fold动作验证', () => {
    it('应该始终允许fold', () => {
      setupBasicGame();
      
      const result = ActionValidator.validate({
        type: 'fold',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });

    it('即使在特殊状态下也应该允许fold', () => {
      setupBasicGame();
      gameState.amountToCall = 1000;
      gameState.isActionReopened = false;
      
      const result = ActionValidator.validate({
        type: 'fold',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });
  });

  describe('all-in动作验证', () => {
    it('有筹码时应该允许all-in', () => {
      setupBasicGame();
      
      const result = ActionValidator.validate({
        type: 'all-in',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result, null);
    });

    it('没有筹码时不应该允许all-in', () => {
      setupBasicGame();
      const player = gameState.getPlayer('player1');
      player.chips = 0;
      
      const result = ActionValidator.validate({
        type: 'all-in',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'NO_CHIPS_TO_ALLIN');
    });
  });

  describe('辅助方法测试', () => {
    it('_calculateAmountToCall应该正确计算需跟注金额', () => {
      setupBasicGame();
      gameState.amountToCall = 100;
      const player = gameState.getPlayer('player1');
      player.currentBet = 30;
      
      const amountToCall = ActionValidator._calculateAmountToCall(gameState, player);
      assert.strictEqual(amountToCall, 70); // 100 - 30
    });

    it('玩家已跟到最高注时应该返回0', () => {
      setupBasicGame();
      gameState.amountToCall = 100;
      const player = gameState.getPlayer('player1');
      player.currentBet = 100;
      
      const amountToCall = ActionValidator._calculateAmountToCall(gameState, player);
      assert.strictEqual(amountToCall, 0);
    });

    it('玩家下注超过最高注时应该返回0', () => {
      setupBasicGame();
      gameState.amountToCall = 100;
      const player = gameState.getPlayer('player1');
      player.currentBet = 150;
      
      const amountToCall = ActionValidator._calculateAmountToCall(gameState, player);
      assert.strictEqual(amountToCall, 0);
    });
  });

  describe('无效动作类型', () => {
    it('应该拒绝未知的动作类型', () => {
      setupBasicGame();
      
      const result = ActionValidator.validate({
        type: 'invalid-action',
        playerId: 'player1'
      }, gameState, rules);
      
      assert.strictEqual(result.error, 'INVALID_ACTION_TYPE');
    });
  });
});