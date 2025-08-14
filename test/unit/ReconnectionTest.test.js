import { test, describe } from 'node:test';
import assert from 'node:assert';
import PokerServer from '../../src/server/server.js';

class FakeSocket { 
  constructor(id){ 
    this.id = id; 
    this.sent = []; 
  } 
  emit(event, data) { 
    this.sent.push({ event, data }); 
  } 
}

function createServerForTest() {
  const server = new PokerServer(0);
  server.TURN_TIMEOUT_MS = 50; // 加速测试
  return server;
}

function setupPlayerAndGame(server) {
  const socket1 = new FakeSocket('socket1');
  const socket2 = new FakeSocket('socket2');
  const r = server.playerRegistry;
  
  // 注册两个玩家
  const player1Result = r.registerPlayer('socket1', socket1, 'Player1', 1000);
  const player2Result = r.registerPlayer('socket2', socket2, 'Player2', 1000);
  
  assert.ok(player1Result.success);
  assert.ok(player2Result.success);
  
  const p1 = player1Result.playerId;
  const p2 = player2Result.playerId;
  
  // 加入桌面并入座
  server.lifecycle.handleJoinTable({ gameState: server.game.gameState, playerId: p1, nickname: 'Player1' });
  server.lifecycle.handleJoinTable({ gameState: server.game.gameState, playerId: p2, nickname: 'Player2' });
  server.lifecycle.handleTakeSeat({ gameState: server.game.gameState, tableRules: server.game.tableRules, playerId: p1, buyIn: 1000 });
  server.lifecycle.handleTakeSeat({ gameState: server.game.gameState, tableRules: server.game.tableRules, playerId: p2, buyIn: 1000 });
  
  // 开始游戏
  assert.ok(server.startGame());
  
  return { p1, p2, socket1, socket2 };
}

describe('Disconnection and Reconnection Tests', () => {
  test('should allow reconnection within grace period', () => {
    const server = createServerForTest();
    const { p1, p2, socket1, socket2 } = setupPlayerAndGame(server);
    
    // 验证玩家已在线
    assert.ok(server.playerRegistry.isPlayerOnline(p1));
    assert.ok(server.playerRegistry.isPlayerOnline(p2));
    assert.ok(!server.playerRegistry.isPlayerDisconnected(p1));
    
    // 模拟玩家1断线
    server.handlePlayerDisconnect('socket1');
    
    // 验证断线状态
    assert.ok(server.playerRegistry.isPlayerDisconnected(p1));
    assert.ok(!server.playerRegistry.isPlayerOnline(p1));
    
    // 验证仍在宽限期内
    assert.ok(server.session.isWithinGrace(p1));
    
    // 验证游戏中的玩家仍然存在（未被移除）
    const player = server.game.gameState.getPlayer(p1);
    assert.ok(player);
    assert.notEqual(player.status, 'SITTING_OUT'); // 游戏中不应该被标记为坐出
    
    console.log(`玩家 ${p1} 断线后状态: ${player.status}`);
    
    // 创建新的socket模拟重连
    const newSocket = new FakeSocket('socket1_new');
    
    // 获取会话令牌（正常情况下客户端会保存这个令牌）
    const sessionToken = server.session.createSessionToken(server.session.sessionId, p1);
    
    // 模拟重连握手
    server.handleHello(newSocket, { sessionToken });
    
    // 验证重连成功
    assert.ok(!server.playerRegistry.isPlayerDisconnected(p1));
    assert.ok(server.playerRegistry.isPlayerOnline(p1));
    
    // 验证新的socket映射
    assert.equal(server.playerRegistry.getPlayerBySocket('socket1_new'), p1);
    
    // 检查是否发送了重连成功的消息
    const reconnectMessage = newSocket.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'session_accepted' && 
      msg.data.data.reconnected === true
    );
    assert.ok(reconnectMessage, '应该发送重连成功消息');
    assert.equal(reconnectMessage.data.data.playerId, p1);
    
    console.log('✓ 重连测试通过：玩家在宽限期内成功重连');
  });

  test('should reject reconnection after grace period expires', async () => {
    const server = createServerForTest();
    const { p1, p2, socket1 } = setupPlayerAndGame(server);
    
    // 模拟玩家1断线
    server.handlePlayerDisconnect('socket1');
    
    // 验证断线状态
    assert.ok(server.playerRegistry.isPlayerDisconnected(p1));
    assert.ok(server.session.isWithinGrace(p1));
    
    // 强制设置宽限期过期
    server.session.isWithinGrace = () => false;
    
    // 创建新的socket模拟重连尝试
    const newSocket = new FakeSocket('socket1_reconnect');
    
    // 获取会话令牌
    const sessionToken = server.session.createSessionToken(server.session.sessionId, p1);
    
    // 尝试重连（应该失败）
    server.handleHello(newSocket, { sessionToken });
    
    // 验证重连失败 - 应该创建新会话而不是恢复旧会话
    const sessionMessage = newSocket.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'session_accepted'
    );
    assert.ok(sessionMessage);
    assert.equal(sessionMessage.data.data.reconnected, false, '宽限期过期后应该创建新会话');
    assert.equal(sessionMessage.data.data.playerId, null, '应该没有关联的playerId');
    
    console.log('✓ 宽限期过期测试通过：超时后不允许重连');
  });

  test('should handle reconnection with invalid session token', () => {
    const server = createServerForTest();
    const { p1, p2 } = setupPlayerAndGame(server);
    
    // 创建新socket
    const newSocket = new FakeSocket('socket_invalid');
    
    // 使用无效的会话令牌尝试重连
    const invalidToken = 'invalid_token_12345';
    server.handleHello(newSocket, { sessionToken: invalidToken });
    
    // 验证创建了新会话（而不是重连）
    const sessionMessage = newSocket.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'session_accepted'
    );
    assert.ok(sessionMessage);
    assert.equal(sessionMessage.data.data.reconnected, false, '无效令牌应该创建新会话');
    assert.equal(sessionMessage.data.data.playerId, null, '应该没有关联的playerId');
    
    console.log('✓ 无效令牌测试通过：无效令牌时创建新会话');
  });

  test('should maintain game state during reconnection', () => {
    const server = createServerForTest();
    const { p1, p2, socket1 } = setupPlayerAndGame(server);
    
    // 记录断线前的游戏状态
    const beforeDisconnect = {
      phase: server.game.gameState.phase,
      currentTurn: server.game.gameState.currentTurn,
      player1Chips: server.game.gameState.getPlayer(p1).chips,
      player2Chips: server.game.gameState.getPlayer(p2).chips
    };
    
    // 模拟玩家1断线
    server.handlePlayerDisconnect('socket1');
    
    // 验证游戏状态保持不变
    assert.equal(server.game.gameState.phase, beforeDisconnect.phase);
    assert.equal(server.game.gameState.currentTurn, beforeDisconnect.currentTurn);
    
    // 重连
    const newSocket = new FakeSocket('socket1_reconnect');
    const sessionToken = server.session.createSessionToken(server.session.sessionId, p1);
    server.handleHello(newSocket, { sessionToken });
    
    // 验证重连后游戏状态保持一致
    assert.equal(server.game.gameState.phase, beforeDisconnect.phase);
    assert.equal(server.game.gameState.currentTurn, beforeDisconnect.currentTurn);
    assert.equal(server.game.gameState.getPlayer(p1).chips, beforeDisconnect.player1Chips);
    assert.equal(server.game.gameState.getPlayer(p2).chips, beforeDisconnect.player2Chips);
    
    // 验证重连后收到了游戏状态
    const gameStateMessage = newSocket.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'game_state'
    );
    assert.ok(gameStateMessage, '重连后应该收到游戏状态');
    
    console.log('✓ 游戏状态保持测试通过：重连后游戏状态保持一致');
  });
});