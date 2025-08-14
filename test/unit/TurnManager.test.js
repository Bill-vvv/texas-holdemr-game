/**
 * TurnManager.test.js - TurnManager模块单元测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import TurnManager from '../../src/game/TurnManager.js';

describe('TurnManager', () => {
  let gameState;

  function beforeEach() {
    gameState = new GameState();
    // 添加测试玩家
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 1500 });
    
    // 设置基本盲注信息
    gameState.players[0].isDealer = true;
    gameState.players[1].isSmallBlind = true;
    gameState.players[2].isBigBlind = true;
  }

  test('应该正确获取当前行动玩家', () => {
    beforeEach();
    
    // 设置当前轮转玩家
    gameState.currentTurn = 'player1';
    
    const currentActor = TurnManager.getCurrentActor(gameState);
    assert.strictEqual(currentActor, 'player1');
  });

  test('当前玩家不可行动时应该找到下一个可行动玩家', () => {
    beforeEach();
    
    // 设置player2为弃牌状态
    gameState.players[1].status = 'FOLDED';
    gameState.currentTurn = 'player2';
    gameState.updateActivePlayers();
    
    const currentActor = TurnManager.getCurrentActor(gameState);
    // 应该跳过已弃牌的player2，找到player3
    assert.strictEqual(currentActor, 'player3');
  });

  test('没有可行动玩家时应该返回null', () => {
    beforeEach();
    
    // 所有玩家都弃牌
    gameState.players.forEach(p => p.status = 'FOLDED');
    gameState.updateActivePlayers();
    
    const currentActor = TurnManager.getCurrentActor(gameState);
    assert.strictEqual(currentActor, null);
  });

  test('应该正确推进到下一个行动者', () => {
    beforeEach();
    
    gameState.currentTurn = 'player1';
    TurnManager.advanceToNextActor(gameState);
    
    assert.strictEqual(gameState.currentTurn, 'player2');
    
    TurnManager.advanceToNextActor(gameState);
    assert.strictEqual(gameState.currentTurn, 'player3');
    
    // 循环到第一个玩家
    TurnManager.advanceToNextActor(gameState);
    assert.strictEqual(gameState.currentTurn, 'player1');
  });

  test('应该跳过不可行动的玩家', () => {
    beforeEach();
    
    // 设置player2为all-in状态
    gameState.players[1].status = 'ALL_IN';
    gameState.updateActivePlayers();
    gameState.currentTurn = 'player1';
    
    TurnManager.advanceToNextActor(gameState);
    
    // 应该跳过player2，直接到player3
    assert.strictEqual(gameState.currentTurn, 'player3');
  });

  test('只有一个可行动玩家时回合应该闭合', () => {
    beforeEach();
    
    // 设置两个玩家弃牌
    gameState.players[1].status = 'FOLDED';
    gameState.players[2].status = 'FOLDED';
    gameState.updateActivePlayers();
    
    const isClosed = TurnManager.isRoundClosed(gameState);
    assert.strictEqual(isClosed, true);
  });

  test('所有玩家匹配注额时回合应该闭合', () => {
    beforeEach();
    
    // 设置所有玩家都跟注到100
    gameState.amountToCall = 100;
    gameState.players.forEach(p => p.currentBet = 100);
    gameState.lastAggressorId = 'player1';
    gameState.currentTurn = 'player1';
    
    // 模拟所有人都行动过
    gameState.actionHistory = ['action1', 'action2', 'action3'];
    
    const isClosed = TurnManager.isRoundClosed(gameState);
    assert.strictEqual(isClosed, true);
  });

  test('玩家注额不匹配时回合不应该闭合', () => {
    beforeEach();
    
    gameState.amountToCall = 100;
    gameState.players[0].currentBet = 100;
    gameState.players[1].currentBet = 50;  // 未匹配
    gameState.players[2].currentBet = 100;
    
    const isClosed = TurnManager.isRoundClosed(gameState);
    assert.strictEqual(isClosed, false);
  });

  test('应该正确推进街道', () => {
    beforeEach();
    
    assert.strictEqual(gameState.street, 'PRE_FLOP');
    
    TurnManager.advanceStreet(gameState);
    assert.strictEqual(gameState.street, 'FLOP');
    
    TurnManager.advanceStreet(gameState);
    assert.strictEqual(gameState.street, 'TURN');
    
    TurnManager.advanceStreet(gameState);
    assert.strictEqual(gameState.street, 'RIVER');
    
    TurnManager.advanceStreet(gameState);
    assert.strictEqual(gameState.street, 'SHOWDOWN');
  });

  test('推进街道时应该重置回合状态', () => {
    beforeEach();
    
    // 设置一些回合状态
    gameState.amountToCall = 100;
    gameState.lastAggressorId = 'player1';
    gameState.isActionReopened = false;
    gameState.actionHistory = ['action1'];
    gameState.players.forEach(p => p.currentBet = 50);
    
    TurnManager.advanceStreet(gameState);
    
    // 验证状态已重置
    assert.strictEqual(gameState.amountToCall, 0);
    assert.strictEqual(gameState.lastAggressorId, null);
    assert.strictEqual(gameState.isActionReopened, true);
    assert.strictEqual(gameState.actionHistory.length, 0);
    assert.strictEqual(gameState.players[0].currentBet, 0);
  });

  test('只剩一人时游戏应该结束', () => {
    beforeEach();
    
    gameState.players[1].status = 'FOLDED';
    gameState.players[2].status = 'FOLDED';
    
    const shouldEnd = TurnManager.shouldEndGame(gameState);
    assert.strictEqual(shouldEnd, true);
  });

  test('到达摊牌阶段时游戏应该结束', () => {
    beforeEach();
    
    gameState.street = 'SHOWDOWN';
    
    const shouldEnd = TurnManager.shouldEndGame(gameState);
    assert.strictEqual(shouldEnd, true);
  });

  test('正常游戏进行时不应该结束', () => {
    beforeEach();
    
    gameState.street = 'FLOP';
    
    const shouldEnd = TurnManager.shouldEndGame(gameState);
    assert.strictEqual(shouldEnd, false);
  });

  test('应该正确处理双人局的行动顺序', () => {
    // 创建双人局
    gameState = new GameState();
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    
    gameState.players[0].isDealer = true;
    gameState.players[0].isSmallBlind = true;
    gameState.players[1].isBigBlind = true;
    
    gameState.currentTurn = 'player1';
    
    TurnManager.advanceToNextActor(gameState);
    assert.strictEqual(gameState.currentTurn, 'player2');
    
    TurnManager.advanceToNextActor(gameState);
    assert.strictEqual(gameState.currentTurn, 'player1');
  });

  test('推进街道时应该正确设置新的行动者', () => {
    beforeEach();
    
    gameState.street = 'PRE_FLOP';
    gameState.currentTurn = 'player3'; // 当前在大盲位
    
    TurnManager.advanceStreet(gameState);
    
    // 翻牌后应该从按钮位之后的第一个玩家开始
    // 按钮是player1，所以应该从player2开始
    assert.strictEqual(gameState.currentTurn, 'player2');
  });

  test('处理all-in玩家时应该正确计算可行动玩家', () => {
    beforeEach();
    
    // 设置一个玩家all-in
    gameState.players[1].status = 'ALL_IN';
    gameState.updateActivePlayers();
    
    // 只有2个玩家可以行动
    assert.strictEqual(gameState.activePlayersCount, 2);
    assert.deepStrictEqual(gameState.activePlayers, ['player1', 'player3']);
    
    const currentActor = TurnManager.getCurrentActor(gameState);
    // 应该能正确获取可行动的玩家
    assert.ok(['player1', 'player3'].includes(currentActor));
  });
});