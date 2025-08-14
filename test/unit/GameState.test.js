/**
 * GameState.test.js - GameState模块单元测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';

describe('GameState', () => {
  let gameState;

  // 每个测试前重置状态
  function beforeEach() {
    gameState = new GameState();
  }

  test('应该创建默认的初始状态', () => {
    beforeEach();
    
    assert.strictEqual(gameState.street, 'PRE_FLOP');
    assert.strictEqual(gameState.phase, 'WAITING');
    assert.strictEqual(gameState.players.length, 0);
    assert.strictEqual(gameState.buttonIndex, 0);
    assert.strictEqual(gameState.currentTurn, null);
    assert.strictEqual(gameState.amountToCall, 0);
    assert.strictEqual(gameState.isActionReopened, true);
  });

  test('应该正确添加玩家', () => {
    beforeEach();
    
    const player = { id: 'player1', name: 'Alice', chips: 1000 };
    gameState.addPlayer(player);
    
    assert.strictEqual(gameState.players.length, 1);
    assert.strictEqual(gameState.players[0].id, 'player1');
    assert.strictEqual(gameState.players[0].name, 'Alice');
    assert.strictEqual(gameState.players[0].chips, 1000);
    assert.strictEqual(gameState.players[0].position, 0);
    assert.strictEqual(gameState.players[0].status, 'ACTIVE');
    assert.strictEqual(gameState.activePlayers.length, 1);
  });

  test('应该拒绝无效的玩家数据', () => {
    beforeEach();
    
    assert.throws(() => {
      gameState.addPlayer(null);
    }, Error, '应该抛出错误：无效玩家数据');

    assert.throws(() => {
      gameState.addPlayer({ name: 'Alice' }); // 缺少id
    }, Error, '应该抛出错误：缺少玩家ID');

    assert.throws(() => {
      gameState.addPlayer({ id: 'player1' }); // 缺少chips
    }, Error, '应该抛出错误：缺少筹码数量');
  });

  test('应该拒绝重复添加相同玩家', () => {
    beforeEach();
    
    const player = { id: 'player1', name: 'Alice', chips: 1000 };
    gameState.addPlayer(player);
    
    assert.throws(() => {
      gameState.addPlayer(player);
    }, Error, '应该抛出错误：玩家已存在');
  });

  test('应该正确移除玩家', () => {
    beforeEach();
    
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    
    assert.strictEqual(gameState.players.length, 2);
    
    gameState.removePlayer('player1');
    
    assert.strictEqual(gameState.players.length, 1);
    assert.strictEqual(gameState.players[0].id, 'player2');
    assert.strictEqual(gameState.players[0].position, 0); // 位置重新计算
    assert.strictEqual(gameState.activePlayers.length, 1);
  });

  test('移除不存在的玩家应该抛出错误', () => {
    beforeEach();
    
    assert.throws(() => {
      gameState.removePlayer('nonexistent');
    }, Error, '应该抛出错误：玩家不存在');
  });

  test('应该正确获取玩家', () => {
    beforeEach();
    
    const player = { id: 'player1', name: 'Alice', chips: 1000 };
    gameState.addPlayer(player);
    
    const found = gameState.getPlayer('player1');
    assert.strictEqual(found.id, 'player1');
    assert.strictEqual(found.name, 'Alice');
    
    const notFound = gameState.getPlayer('nonexistent');
    assert.strictEqual(notFound, null);
  });

  test('应该正确更新活跃玩家', () => {
    beforeEach();
    
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 1500 });
    
    assert.strictEqual(gameState.activePlayersCount, 3);
    assert.deepStrictEqual(gameState.activePlayers, ['player1', 'player2', 'player3']);
    
    // 设置一个玩家为弃牌状态
    gameState.players[1].status = 'FOLDED';
    gameState.updateActivePlayers();
    
    assert.strictEqual(gameState.activePlayersCount, 2);
    assert.deepStrictEqual(gameState.activePlayers, ['player1', 'player3']);
  });

  test('应该正确检查游戏是否可以开始', () => {
    beforeEach();
    
    // 没有玩家不能开始
    assert.strictEqual(gameState.canStart(), false);
    
    // 只有1个玩家不能开始
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    assert.strictEqual(gameState.canStart(), false);
    
    // 2个玩家可以开始
    gameState.addPlayer({ id: 'player2', name: 'Bob', chips: 2000 });
    assert.strictEqual(gameState.canStart(), true);
    
    // 3个玩家也可以开始
    gameState.addPlayer({ id: 'player3', name: 'Charlie', chips: 1500 });
    assert.strictEqual(gameState.canStart(), true);
    
    // 游戏进行中不能重新开始
    gameState.phase = 'PLAYING';
    assert.strictEqual(gameState.canStart(), false);
  });

  test('应该正确生成公共状态', () => {
    beforeEach();
    
    gameState.gameId = 'test-game';
    gameState.street = 'FLOP';
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    
    // 给玩家发牌（但公共状态不应暴露具体牌面）
    gameState.players[0].holeCards = ['AH', 'KS'];
    
    const publicState = gameState.getPublicState();
    
    assert.strictEqual(publicState.gameId, 'test-game');
    assert.strictEqual(publicState.street, 'FLOP');
    assert.strictEqual(publicState.players.length, 1);
    assert.strictEqual(publicState.players[0].id, 'player1');
    assert.strictEqual(publicState.players[0].hasCards, true);
    
    // 确保手牌没有暴露
    assert.strictEqual(publicState.players[0].holeCards, undefined);
  });

  test('应该正确生成玩家私有状态', () => {
    beforeEach();
    
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.players[0].holeCards = ['AH', 'KS'];
    
    const privateState = gameState.getPrivateStateFor('player1');
    
    assert.deepStrictEqual(privateState.holeCards, ['AH', 'KS']);
    assert.strictEqual(privateState.playerId, 'player1');
    
    // 不存在的玩家应该返回空手牌
    const emptyState = gameState.getPrivateStateFor('nonexistent');
    assert.deepStrictEqual(emptyState.holeCards, []);
  });

  test('应该正确序列化和反序列化状态', () => {
    beforeEach();
    
    // 设置一些状态
    gameState.gameId = 'test-game';
    gameState.street = 'TURN';
    gameState.phase = 'PLAYING';
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.communityCards = ['AH', 'KS', 'QD'];
    gameState.currentTurn = 'player1';
    gameState.amountToCall = 100;
    
    // 序列化
    const serialized = gameState.serialize();
    
    // 创建新的实例并反序列化
    const newGameState = new GameState();
    newGameState.deserialize(serialized);
    
    // 验证状态正确恢复
    assert.strictEqual(newGameState.gameId, 'test-game');
    assert.strictEqual(newGameState.street, 'TURN');
    assert.strictEqual(newGameState.phase, 'PLAYING');
    assert.strictEqual(newGameState.players.length, 1);
    assert.strictEqual(newGameState.players[0].id, 'player1');
    assert.deepStrictEqual(newGameState.communityCards, ['AH', 'KS', 'QD']);
    assert.strictEqual(newGameState.currentTurn, 'player1');
    assert.strictEqual(newGameState.amountToCall, 100);
  });

  test('应该正确重置状态', () => {
    beforeEach();
    
    // 设置一些状态
    gameState.gameId = 'test-game';
    gameState.street = 'RIVER';
    gameState.addPlayer({ id: 'player1', name: 'Alice', chips: 1000 });
    gameState.communityCards = ['AH', 'KS', 'QD', 'JC', 'TD'];
    
    // 重置
    gameState.reset();
    
    // 验证所有状态都重置了
    assert.strictEqual(gameState.gameId, null);
    assert.strictEqual(gameState.street, 'PRE_FLOP');
    assert.strictEqual(gameState.phase, 'WAITING');
    assert.strictEqual(gameState.players.length, 0);
    assert.strictEqual(gameState.communityCards.length, 0);
    assert.strictEqual(gameState.currentTurn, null);
    assert.strictEqual(gameState.amountToCall, 0);
  });
});