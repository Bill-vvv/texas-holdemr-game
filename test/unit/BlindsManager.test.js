/**
 * BlindsManager.test.js - BlindsManager模块单元测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import TableRules from '../../src/game/rules/TableRules.js';
import BlindsManager from '../../src/game/BlindsManager.js';

describe('BlindsManager', () => {
  let gameState;
  let rules;

  function beforeEach() {
    gameState = new GameState();
    rules = new TableRules({
      smallBlind: 10,
      bigBlind: 20
    });
  }

  function setupThreePlayers() {
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 1500 });
    gameState.buttonIndex = 0; // Alice是按钮位
  }

  function setupTwoPlayers() {
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    gameState.buttonIndex = 0; // Alice是按钮位
  }

  test('应该拒绝少于2个玩家的盲注设置', () => {
    beforeEach();
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    
    assert.throws(() => {
      BlindsManager.setupBlindsAndButton(gameState, rules);
    }, Error, '至少需要2个玩家');
  });

  test('应该正确设置三人局的按钮位和盲注', () => {
    beforeEach();
    setupThreePlayers();
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 验证按钮位
    assert.strictEqual(gameState.players[0].isDealer, true);
    assert.strictEqual(gameState.players[1].isDealer, false);
    assert.strictEqual(gameState.players[2].isDealer, false);
    
    // 验证小盲（按钮左侧第一位）
    assert.strictEqual(gameState.players[1].isSmallBlind, true);
    assert.strictEqual(gameState.players[0].isSmallBlind, false);
    assert.strictEqual(gameState.players[2].isSmallBlind, false);
    
    // 验证大盲（小盲左侧第一位）
    assert.strictEqual(gameState.players[2].isBigBlind, true);
    assert.strictEqual(gameState.players[0].isBigBlind, false);
    assert.strictEqual(gameState.players[1].isBigBlind, false);
  });

  test('应该正确设置双人局的按钮位和盲注', () => {
    beforeEach();
    setupTwoPlayers();
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 验证按钮位（同时是小盲）
    assert.strictEqual(gameState.players[0].isDealer, true);
    assert.strictEqual(gameState.players[0].isSmallBlind, true);
    
    // 验证大盲
    assert.strictEqual(gameState.players[1].isBigBlind, true);
    assert.strictEqual(gameState.players[1].isSmallBlind, false);
    assert.strictEqual(gameState.players[1].isDealer, false);
  });

  test('应该正确收取盲注并扣除筹码', () => {
    beforeEach();
    setupThreePlayers();
    
    const initialChips = gameState.players.map(p => p.chips);
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 验证小盲筹码扣除
    const smallBlindPlayer = gameState.players.find(p => p.isSmallBlind);
    assert.strictEqual(smallBlindPlayer.currentBet, 10);
    assert.strictEqual(smallBlindPlayer.chips, initialChips[1] - 10); // player2是小盲
    
    // 验证大盲筹码扣除
    const bigBlindPlayer = gameState.players.find(p => p.isBigBlind);
    assert.strictEqual(bigBlindPlayer.currentBet, 20);
    assert.strictEqual(bigBlindPlayer.chips, initialChips[2] - 20); // player3是大盲
    
    // 验证amountToCall设置
    assert.strictEqual(gameState.amountToCall, 20);
  });

  test('应该正确处理筹码不足的盲注情况', () => {
    beforeEach();
    // 设置小盲玩家筹码不足
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 5 }); // 小盲不足
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 15 }); // 大盲不足
    gameState.buttonIndex = 0;
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 小盲玩家应该all-in
    const smallBlindPlayer = gameState.players.find(p => p.isSmallBlind);
    assert.strictEqual(smallBlindPlayer.currentBet, 5); // 只能下注5
    assert.strictEqual(smallBlindPlayer.chips, 0);
    assert.strictEqual(smallBlindPlayer.status, 'ALL_IN');
    
    // 大盲玩家应该all-in
    const bigBlindPlayer = gameState.players.find(p => p.isBigBlind);
    assert.strictEqual(bigBlindPlayer.currentBet, 15); // 只能下注15
    assert.strictEqual(bigBlindPlayer.chips, 0);
    assert.strictEqual(bigBlindPlayer.status, 'ALL_IN');
  });

  test('应该正确移动按钮位', () => {
    beforeEach();
    setupThreePlayers();
    
    assert.strictEqual(gameState.buttonIndex, 0);
    
    BlindsManager.moveButton(gameState);
    assert.strictEqual(gameState.buttonIndex, 1);
    
    BlindsManager.moveButton(gameState);
    assert.strictEqual(gameState.buttonIndex, 2);
    
    // 循环回到开始
    BlindsManager.moveButton(gameState);
    assert.strictEqual(gameState.buttonIndex, 0);
  });

  test('移动按钮时应该跳过坐出的玩家', () => {
    beforeEach();
    setupThreePlayers();
    
    // 设置player2坐出
    gameState.players[1].status = 'SITTING_OUT';
    gameState.buttonIndex = 0;
    
    BlindsManager.moveButton(gameState);
    
    // 应该跳过player2，直接到player3
    assert.strictEqual(gameState.buttonIndex, 2);
  });

  test('应该正确获取Preflop第一个行动者 - 三人局', () => {
    beforeEach();
    setupThreePlayers();
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    const firstActor = BlindsManager.getPreflopFirstActor(gameState);
    
    // 三人局应该是大盲左侧第一位（UTG），即按钮位
    assert.strictEqual(firstActor, 'player1');
  });

  test('应该正确获取Preflop第一个行动者 - 双人局', () => {
    beforeEach();
    setupTwoPlayers();
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    const firstActor = BlindsManager.getPreflopFirstActor(gameState);
    
    // 双人局应该是按钮位（小盲）先行动
    assert.strictEqual(firstActor, 'player1');
  });

  test('应该正确获取Postflop第一个行动者', () => {
    beforeEach();
    setupThreePlayers();
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    const firstActor = BlindsManager.getPostflopFirstActor(gameState);
    
    // 翻牌后应该是按钮左侧第一位，即小盲
    assert.strictEqual(firstActor, 'player2');
  });

  test('应该正确检查盲注是否已设置 - 三人局', () => {
    beforeEach();
    setupThreePlayers();
    
    // 未设置盲注前
    assert.strictEqual(BlindsManager.areBlindsSet(gameState), false);
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 设置盲注后
    assert.strictEqual(BlindsManager.areBlindsSet(gameState), true);
  });

  test('应该正确检查盲注是否已设置 - 双人局', () => {
    beforeEach();
    setupTwoPlayers();
    
    // 未设置盲注前
    assert.strictEqual(BlindsManager.areBlindsSet(gameState), false);
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 设置盲注后
    assert.strictEqual(BlindsManager.areBlindsSet(gameState), true);
  });

  test('应该返回正确的盲注信息摘要', () => {
    beforeEach();
    setupThreePlayers();
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    const blindsInfo = BlindsManager.getBlindsInfo(gameState, rules);
    
    assert.strictEqual(blindsInfo.smallBlind.playerId, 'player2');
    assert.strictEqual(blindsInfo.smallBlind.amount, 10);
    assert.strictEqual(blindsInfo.smallBlind.actualAmount, 10);
    
    assert.strictEqual(blindsInfo.bigBlind.playerId, 'player3');
    assert.strictEqual(blindsInfo.bigBlind.amount, 20);
    assert.strictEqual(blindsInfo.bigBlind.actualAmount, 20);
    
    assert.strictEqual(blindsInfo.isHeadsUp, false);
  });

  test('应该正确识别双人局', () => {
    beforeEach();
    setupTwoPlayers();
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    const blindsInfo = BlindsManager.getBlindsInfo(gameState, rules);
    
    assert.strictEqual(blindsInfo.isHeadsUp, true);
  });

  test('处理筹码不足时应该在盲注信息中显示实际金额', () => {
    beforeEach();
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 5 }); // 小盲不足
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 15 }); // 大盲不足
    gameState.buttonIndex = 0;
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    const blindsInfo = BlindsManager.getBlindsInfo(gameState, rules);
    
    assert.strictEqual(blindsInfo.smallBlind.amount, 10);
    assert.strictEqual(blindsInfo.smallBlind.actualAmount, 5); // 实际只下注了5
    
    assert.strictEqual(blindsInfo.bigBlind.amount, 20);
    assert.strictEqual(blindsInfo.bigBlind.actualAmount, 15); // 实际只下注了15
  });

  test('没有足够玩家时移动按钮应该不报错', () => {
    beforeEach();
    // 只有一个玩家
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    
    // 应该不抛出错误
    assert.doesNotThrow(() => {
      BlindsManager.moveButton(gameState);
    });
  });

  test('应该正确清除之前的位置标记', () => {
    beforeEach();
    setupThreePlayers();
    
    // 手动设置一些错误的标记
    gameState.players[0].isSmallBlind = true;
    gameState.players[2].isDealer = true;
    
    BlindsManager.setupBlindsAndButton(gameState, rules);
    
    // 验证只有正确的位置被标记
    const dealerCount = gameState.players.filter(p => p.isDealer).length;
    const smallBlindCount = gameState.players.filter(p => p.isSmallBlind).length;
    const bigBlindCount = gameState.players.filter(p => p.isBigBlind).length;
    
    assert.strictEqual(dealerCount, 1);
    assert.strictEqual(smallBlindCount, 1);
    assert.strictEqual(bigBlindCount, 1);
  });
});