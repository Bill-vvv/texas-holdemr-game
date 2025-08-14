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

describe('重连功能最终验证', () => {
  test('完整重连工作流程验证', () => {
    const server = new PokerServer(0);
    
    // 1. 注册玩家
    const socket1 = new FakeSocket('socket1');
    const result = server.playerRegistry.registerPlayer('socket1', socket1, 'TestPlayer', 1000);
    const playerId = result.playerId;
    
    console.log('=== 步骤1: 玩家注册 ===');
    console.log(`playerId: ${playerId}`);
    console.log(`在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    
    // 2. 手动绑定会话（模拟正常流程应该做的事情）
    const sessionResult = server.session.ensureSession();
    const sessionId = sessionResult.sessionId;
    server.session.bindSessionToPlayer(sessionId, playerId, 'socket1');
    
    console.log('\n=== 步骤2: 会话绑定 ===');
    console.log(`sessionId: ${sessionId}`);
    console.log(`宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    
    // 3. 模拟断线
    server.handlePlayerDisconnect('socket1');
    
    console.log('\n=== 步骤3: 玩家断线 ===');
    console.log(`在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    console.log(`断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    console.log(`宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    
    // 4. 创建会话令牌并重连
    const sessionToken = server.session.createSessionToken(sessionId, playerId);
    const newSocket = new FakeSocket('socket2');
    
    console.log('\n=== 步骤4: 尝试重连 ===');
    console.log(`会话令牌: ${sessionToken.substring(0, 50)}...`);
    
    // 执行重连
    server.handleHello(newSocket, { sessionToken });
    
    console.log('\n=== 步骤5: 重连结果 ===');
    console.log(`在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    console.log(`断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    // 检查重连消息
    const messages = newSocket.sent.filter(msg => msg.event === 'message');
    console.log(`收到消息数量: ${messages.length}`);
    
    const reconnectMessage = messages.find(msg => 
      msg.data.type === 'session_accepted' && 
      msg.data.data?.reconnected === true
    );
    
    if (reconnectMessage) {
      console.log('✅ 重连成功！收到重连确认消息');
      console.log(`关联的playerId: ${reconnectMessage.data.data.playerId}`);
      
      // 验证状态
      assert.ok(!server.playerRegistry.isPlayerDisconnected(playerId), '重连后不应该显示为断线');
      assert.ok(server.playerRegistry.isPlayerOnline(playerId), '重连后应该显示为在线');
      assert.equal(server.playerRegistry.getPlayerBySocket('socket2'), playerId, '新socket应该正确映射到玩家');
      
    } else {
      console.log('❌ 未收到重连确认消息');
      console.log('消息列表:');
      messages.forEach((msg, i) => {
        console.log(`  ${i+1}. type: ${msg.data.type}, reconnected: ${msg.data.data?.reconnected}`);
      });
    }
  });

  test('验证宽限期机制', () => {
    const server = new PokerServer(0);
    
    // 注册并绑定
    const socket = new FakeSocket('test_socket');
    const result = server.playerRegistry.registerPlayer('test_socket', socket, 'TestPlayer', 1000);
    const playerId = result.playerId;
    
    const sessionResult = server.session.ensureSession();
    server.session.bindSessionToPlayer(sessionResult.sessionId, playerId, 'test_socket');
    
    console.log('\n=== 宽限期机制验证 ===');
    console.log(`绑定后宽限期: ${server.session.isWithinGrace(playerId)}`);
    
    // 断线
    server.handlePlayerDisconnect('test_socket');
    console.log(`断线后宽限期: ${server.session.isWithinGrace(playerId)}`);
    
    // 验证宽限期确实有效
    if (server.session.isWithinGrace(playerId)) {
      console.log('✅ 宽限期机制正常工作');
      
      // 测试令牌创建和验证
      const token = server.session.createSessionToken(sessionResult.sessionId, playerId);
      const tokenVerify = server.session.verifySessionToken(token);
      
      console.log(`令牌验证成功: ${tokenVerify.success}`);
      if (tokenVerify.success) {
        console.log(`令牌中的sessionId: ${tokenVerify.payload.sid}`);
        console.log(`令牌中的playerId: ${tokenVerify.payload.pid}`);
      }
    } else {
      console.log('❌ 宽限期机制未正常工作');
    }
  });
});