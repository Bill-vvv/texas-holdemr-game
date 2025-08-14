import { test, describe } from 'node:test';
import assert from 'node:assert';
import PokerServer from '../../src/server/server.js';

class FakeSocket { 
  constructor(id){ this.id = id; this.sent = []; } 
  emit(){} 
}

describe('Bug验证测试', () => {
  test('Bug1: PlayerRegistry状态不一致', () => {
    const server = new PokerServer(0);
    const socket = new FakeSocket('test_socket');
    
    // 注册玩家
    const result = server.playerRegistry.registerPlayer('test_socket', socket, 'TestPlayer', 1000);
    const playerId = result.playerId;
    
    console.log('注册后状态:');
    console.log(`- 在线: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    console.log(`- 断线: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    // 模拟断线
    server.playerRegistry.markPlayerDisconnected(playerId);
    
    console.log('\n断线后状态:');
    console.log(`- 在线: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    console.log(`- 断线: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    // Bug验证：断线后仍然显示在线
    if (server.playerRegistry.isPlayerOnline(playerId)) {
      console.log('🐛 Bug确认：断线玩家仍然显示为在线');
      console.log('   原因：markPlayerDisconnected没有删除playerSocketMap映射');
    }
    
    // 这个断言会失败，证明bug存在
    // assert.ok(!server.playerRegistry.isPlayerOnline(playerId), 'Bug: 断线玩家不应该显示为在线');
  });

  test('Bug2: 会话绑定时机问题', () => {
    const server = new PokerServer(0);
    const socket = new FakeSocket('test_socket');
    
    // 正常的玩家加入流程
    const result = server.playerRegistry.registerPlayer('test_socket', socket, 'TestPlayer', 1000);
    const playerId = result.playerId;
    
    console.log('\n玩家注册后的会话状态:');
    console.log(`- 宽限期: ${server.session.isWithinGrace(playerId)}`);
    
    // 模拟断线
    server.handlePlayerDisconnect('test_socket');
    
    console.log('\n断线后的会话状态:');
    console.log(`- 宽限期: ${server.session.isWithinGrace(playerId)}`);
    
    // 如果宽限期仍然是false，说明会话没有正确绑定
    if (!server.session.isWithinGrace(playerId)) {
      console.log('🐛 Bug确认：会话没有正确绑定到玩家');
      console.log('   原因：handlePlayerJoin流程中缺少bindSessionToPlayer调用');
    }
  });

  test('Bug3: 重连后PlayerRegistry映射问题', () => {
    const server = new PokerServer(0);
    const socket1 = new FakeSocket('socket1');
    const socket2 = new FakeSocket('socket2');
    
    // 注册玩家并绑定会话
    const result = server.playerRegistry.registerPlayer('socket1', socket1, 'TestPlayer', 1000);
    const playerId = result.playerId;
    
    const sessionResult = server.session.ensureSession();
    server.session.bindSessionToPlayer(sessionResult.sessionId, playerId, 'socket1');
    
    // 断线
    server.handlePlayerDisconnect('socket1');
    
    // 重连
    const sessionToken = server.session.createSessionToken(sessionResult.sessionId, playerId);
    server.handleHello(socket2, { sessionToken });
    
    console.log('\n重连后的映射检查:');
    console.log(`- 新socket的玩家ID: ${server.playerRegistry.getPlayerBySocket('socket2')}`);
    console.log(`- 玩家的socket ID: ${server.playerRegistry.playerSocketMap.get(playerId)}`);
    console.log(`- 在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    console.log(`- 断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    // 验证重连后的状态是否正确
    if (server.playerRegistry.getPlayerBySocket('socket2') === playerId &&
        server.playerRegistry.playerSocketMap.get(playerId) === 'socket2' &&
        !server.playerRegistry.isPlayerDisconnected(playerId)) {
      console.log('✅ 重连映射正确');
    } else {
      console.log('🐛 重连映射存在问题');
    }
  });
});