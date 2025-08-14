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

describe('完整流程重连测试', () => {
  test('模拟真实的连接-加入-断线-重连流程', () => {
    const server = new PokerServer(0);
    
    console.log('=== 第1步：客户端连接并握手 ===');
    const socket1 = new FakeSocket('socket1');
    
    // 1. 客户端连接后发送hello
    server.handleHello(socket1, {});
    
    // 获取服务端分配的sessionToken
    const helloResponse = socket1.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'session_accepted'
    );
    
    console.log(`收到握手响应: ${helloResponse ? '是' : '否'}`);
    if (helloResponse) {
      console.log(`SessionToken: ${helloResponse.data.data.sessionToken.substring(0, 30)}...`);
    }
    
    console.log('\n=== 第2步：玩家加入游戏 ===');
    // 2. 玩家加入游戏
    server.handlePlayerJoin(socket1, {
      playerName: 'TestPlayer',
      buyIn: 1000
    });
    
    const playerId = server.playerRegistry.getPlayerBySocket('socket1');
    console.log(`玩家ID: ${playerId}`);
    console.log(`加入后宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    
    // 检查会话绑定
    const sessionSummary = server.session.getSessionSummary();
    console.log(`总会话数: ${sessionSummary.totalSessions}`);
    const playerSession = sessionSummary.activeSessions.find(s => s.playerId === playerId);
    if (playerSession) {
      console.log('✅ 找到玩家的绑定会话');
      console.log(`  SessionId: ${playerSession.sessionId}`);
    } else {
      console.log('❌ 未找到玩家的绑定会话');
    }
    
    console.log('\n=== 第3步：玩家断线 ===');
    // 3. 玩家断线
    server.handlePlayerDisconnect('socket1');
    console.log(`断线后宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    console.log(`断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    console.log('\n=== 第4步：玩家重连 ===');
    // 4. 玩家重连 - 使用原始的sessionToken
    const newSocket = new FakeSocket('socket2');
    const originalToken = helloResponse.data.data.sessionToken;
    
    server.handleHello(newSocket, { sessionToken: originalToken });
    
    const reconnectResponse = newSocket.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'session_accepted'
    );
    
    if (reconnectResponse && reconnectResponse.data.data.reconnected === true) {
      console.log('🎉 重连成功！');
      console.log(`重连的玩家ID: ${reconnectResponse.data.data.playerId}`);
      
      // 验证最终状态
      console.log(`重连后在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
      console.log(`重连后断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
      
      assert.equal(reconnectResponse.data.data.playerId, playerId, '重连应返回正确的playerId');
      assert.ok(!server.playerRegistry.isPlayerDisconnected(playerId), '重连后不应显示断线');
      assert.ok(server.playerRegistry.isPlayerOnline(playerId), '重连后应显示在线');
      
      console.log('✅ 完整流程测试成功！');
      
    } else {
      console.log('❌ 重连失败');
      if (reconnectResponse) {
        console.log(`响应: reconnected=${reconnectResponse.data.data.reconnected}, playerId=${reconnectResponse.data.data.playerId}`);
      } else {
        console.log('未收到重连响应');
      }
      
      // 检查是否是因为会话问题
      const tokenVerify = server.session.verifySessionToken(originalToken);
      console.log(`令牌验证: ${tokenVerify.success ? '成功' : '失败'}`);
      if (tokenVerify.success) {
        const withinGrace = server.session.isWithinGrace(tokenVerify.payload.pid);
        console.log(`宽限期检查: ${withinGrace}`);
      }
      
      assert.fail('重连流程失败');
    }
  });

  test('验证会话令牌绑定时机', () => {
    const server = new PokerServer(0);
    const socket = new FakeSocket('test_socket');
    
    console.log('\n=== 会话令牌绑定时机测试 ===');
    
    // 1. 首先握手创建会话
    server.handleHello(socket, {});
    
    const sessionId = server.socketToSession.get('test_socket');
    console.log(`握手后SessionId: ${sessionId}`);
    
    // 2. 加入游戏
    server.handlePlayerJoin(socket, { playerName: 'TestPlayer', buyIn: 1000 });
    
    const playerId = server.playerRegistry.getPlayerBySocket('test_socket');
    console.log(`加入后PlayerId: ${playerId}`);
    
    // 3. 检查会话是否正确绑定
    const withinGrace = server.session.isWithinGrace(playerId);
    console.log(`会话绑定后宽限期: ${withinGrace}`);
    
    if (withinGrace) {
      console.log('✅ 会话绑定成功');
      
      // 测试断线宽限期
      server.handlePlayerDisconnect('test_socket');
      const gracePeriodAfterDisconnect = server.session.isWithinGrace(playerId);
      console.log(`断线后宽限期: ${gracePeriodAfterDisconnect}`);
      
      assert.ok(gracePeriodAfterDisconnect, '断线后应该在宽限期内');
      console.log('✅ 宽限期机制正常');
    } else {
      console.log('❌ 会话绑定失败');
      
      // 调试信息
      const sessionSummary = server.session.getSessionSummary();
      console.log('调试 - 会话摘要:');
      console.log(`  总会话数: ${sessionSummary.totalSessions}`);
      sessionSummary.activeSessions.forEach((s, i) => {
        console.log(`  会话${i}: sessionId=${s.sessionId}, playerId=${s.playerId}, isOnline=${s.isOnline}`);
      });
      
      assert.fail('会话绑定机制仍有问题');
    }
  });
});