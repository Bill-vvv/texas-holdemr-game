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

describe('修复验证测试', () => {
  test('验证修复后的重连功能', () => {
    const server = new PokerServer(0);
    
    console.log('=== 修复验证：完整重连流程 ===');
    
    // 1. 模拟客户端连接和握手
    const socket1 = new FakeSocket('socket1');
    server.handleHello(socket1, {});
    
    // 2. 玩家加入游戏（这时会话会被正确绑定）
    server.handlePlayerJoin(socket1, {
      playerName: 'TestPlayer',
      buyIn: 1000
    });
    
    const playerId = server.playerRegistry.getPlayerBySocket('socket1');
    console.log(`玩家加入成功: ${playerId}`);
    console.log(`加入后宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    
    // 验证会话绑定
    const sessionSummary = server.session.getSessionSummary();
    const playerSession = sessionSummary.activeSessions.find(s => s.playerId === playerId);
    assert.ok(playerSession, '应该找到玩家会话');
    
    console.log('✅ 会话绑定成功');
    
    // 3. 玩家断线
    server.handlePlayerDisconnect('socket1');
    console.log(`断线后宽限期: ${server.session.isWithinGrace(playerId)}`);
    console.log(`断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    assert.ok(server.session.isWithinGrace(playerId), '断线后应该在宽限期内');
    assert.ok(server.playerRegistry.isPlayerDisconnected(playerId), '应该标记为断线');
    
    // 4. 创建重连用的sessionToken（基于绑定后的会话）
    const reconnectToken = server.session.createSessionToken(playerSession.sessionId, playerId);
    console.log(`创建重连令牌: ${reconnectToken.substring(0, 30)}...`);
    
    // 5. 模拟重连
    const newSocket = new FakeSocket('socket2');
    server.handleHello(newSocket, { sessionToken: reconnectToken });
    
    // 6. 检查重连结果
    const reconnectResponse = newSocket.sent.find(msg => 
      msg.event === 'message' && 
      msg.data.type === 'session_accepted'
    );
    
    console.log(`重连响应: reconnected=${reconnectResponse?.data?.data?.reconnected}, playerId=${reconnectResponse?.data?.data?.playerId}`);
    
    if (reconnectResponse && reconnectResponse.data.data.reconnected === true) {
      console.log('🎉 重连成功！');
      
      // 验证最终状态
      assert.equal(reconnectResponse.data.data.playerId, playerId, '应该返回正确的playerId');
      assert.ok(!server.playerRegistry.isPlayerDisconnected(playerId), '重连后不应显示断线');
      assert.ok(server.playerRegistry.isPlayerOnline(playerId), '重连后应显示在线');
      
      console.log('✅ 修复验证成功：重连功能完全正常！');
      
    } else {
      console.log('❌ 重连仍有问题');
      
      // 调试信息
      const tokenVerify = server.session.verifySessionToken(reconnectToken);
      console.log(`令牌验证: ${tokenVerify.success}`);
      if (tokenVerify.success) {
        console.log(`令牌中的playerId: ${tokenVerify.payload.pid}`);
        console.log(`宽限期检查: ${server.session.isWithinGrace(tokenVerify.payload.pid)}`);
      }
      
      assert.fail('重连功能仍有问题');
    }
  });

  test('验证Bug修复状态', () => {
    const server = new PokerServer(0);
    const socket = new FakeSocket('test');
    
    console.log('\n=== Bug修复状态验证 ===');
    
    // 完整流程测试
    server.handleHello(socket, {});
    server.handlePlayerJoin(socket, { playerName: 'TestPlayer', buyIn: 1000 });
    
    const playerId = server.playerRegistry.getPlayerBySocket('test');
    
    console.log('Bug1 - PlayerRegistry状态一致性:');
    console.log(`  注册后在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    
    server.handlePlayerDisconnect('test');
    console.log(`  断线后在线状态: ${server.playerRegistry.isPlayerOnline(playerId)}`);
    console.log(`  断线后断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    if (!server.playerRegistry.isPlayerOnline(playerId) && server.playerRegistry.isPlayerDisconnected(playerId)) {
      console.log('  ✅ Bug1已修复：状态一致性正常');
    } else {
      console.log('  ❌ Bug1未修复：状态不一致');
    }
    
    console.log('\nBug2 - 会话绑定时机:');
    console.log(`  宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    
    if (server.session.isWithinGrace(playerId)) {
      console.log('  ✅ Bug2已修复：会话绑定正常');
    } else {
      console.log('  ❌ Bug2未修复：会话绑定失败');
    }
    
    // 整体评估
    const bug1Fixed = !server.playerRegistry.isPlayerOnline(playerId) && server.playerRegistry.isPlayerDisconnected(playerId);
    const bug2Fixed = server.session.isWithinGrace(playerId);
    
    if (bug1Fixed && bug2Fixed) {
      console.log('\n🎉 所有Bug均已修复！重连功能完全正常！');
      assert.ok(true, '所有bug已修复');
    } else {
      console.log(`\n⚠️  Bug修复状态: Bug1=${bug1Fixed ? '已修复' : '未修复'}, Bug2=${bug2Fixed ? '已修复' : '未修复'}`);
      if (!bug1Fixed) assert.fail('Bug1未修复');
      if (!bug2Fixed) assert.fail('Bug2未修复');
    }
  });
});