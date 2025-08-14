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

describe('修改后的重连测试', () => {
  test('验证会话自动绑定是否已修复', () => {
    const server = new PokerServer(0);
    const socket = new FakeSocket('test_socket');
    
    console.log('=== 测试会话自动绑定修复 ===');
    
    // 1. 正常的玩家注册流程
    const result = server.playerRegistry.registerPlayer('test_socket', socket, 'TestPlayer', 1000);
    const playerId = result.playerId;
    
    console.log(`步骤1 - 玩家注册: ${playerId}`);
    console.log(`注册后宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    
    // 2. 检查是否已经自动创建了会话绑定
    const sessionSummary = server.session.getSessionSummary();
    console.log(`会话总数: ${sessionSummary.totalSessions}`);
    
    const playerSession = sessionSummary.activeSessions.find(s => s.playerId === playerId);
    if (playerSession) {
      console.log('✅ 找到玩家会话自动绑定');
      console.log(`  - sessionId: ${playerSession.sessionId}`);
      console.log(`  - isOnline: ${playerSession.isOnline}`);
    } else {
      console.log('❌ 未找到自动绑定的会话');
    }
    
    // 3. 测试断线后的宽限期
    server.handlePlayerDisconnect('test_socket');
    
    console.log(`\n步骤3 - 断线后状态:`);
    console.log(`宽限期状态: ${server.session.isWithinGrace(playerId)}`);
    console.log(`断线状态: ${server.playerRegistry.isPlayerDisconnected(playerId)}`);
    
    // 4. 如果宽限期现在是true，说明修复成功
    if (server.session.isWithinGrace(playerId)) {
      console.log('🎉 修复成功！会话自动绑定现在正常工作');
      
      // 测试重连
      const newSocket = new FakeSocket('reconnect_socket');
      const sessionToken = server.session.createSessionToken(playerSession.sessionId, playerId);
      
      server.handleHello(newSocket, { sessionToken });
      
      const reconnectMessage = newSocket.sent.find(msg => 
        msg.event === 'message' && 
        msg.data.type === 'session_accepted' && 
        msg.data.data?.reconnected === true
      );
      
      if (reconnectMessage) {
        console.log('✅ 重连测试通过：可以在宽限期内重连');
        assert.ok(true, '修复验证成功');
      } else {
        console.log('❌ 重连测试失败');
        assert.fail('重连功能仍有问题');
      }
      
    } else {
      console.log('❌ 修复未生效，宽限期仍然无效');
      assert.fail('会话绑定问题尚未修复');
    }
  });

  test('验证正常游戏流程中的会话管理', () => {
    const server = new PokerServer(0);
    
    // 创建两个玩家进行完整的游戏流程测试
    const socket1 = new FakeSocket('socket1');
    const socket2 = new FakeSocket('socket2');
    
    console.log('\n=== 完整游戏流程中的会话测试 ===');
    
    // 玩家加入
    const p1Result = server.playerRegistry.registerPlayer('socket1', socket1, 'Player1', 1000);
    const p2Result = server.playerRegistry.registerPlayer('socket2', socket2, 'Player2', 1000);
    
    const p1 = p1Result.playerId;
    const p2 = p2Result.playerId;
    
    console.log(`玩家1注册后宽限期: ${server.session.isWithinGrace(p1)}`);
    console.log(`玩家2注册后宽限期: ${server.session.isWithinGrace(p2)}`);
    
    // 加入游戏桌面
    server.lifecycle.handleJoinTable({ gameState: server.game.gameState, playerId: p1, nickname: 'Player1' });
    server.lifecycle.handleJoinTable({ gameState: server.game.gameState, playerId: p2, nickname: 'Player2' });
    server.lifecycle.handleTakeSeat({ gameState: server.game.gameState, tableRules: server.game.tableRules, playerId: p1, buyIn: 1000 });
    server.lifecycle.handleTakeSeat({ gameState: server.game.gameState, tableRules: server.game.tableRules, playerId: p2, buyIn: 1000 });
    
    console.log(`加入桌面后玩家1宽限期: ${server.session.isWithinGrace(p1)}`);
    console.log(`加入桌面后玩家2宽限期: ${server.session.isWithinGrace(p2)}`);
    
    // 测试断线和重连
    server.handlePlayerDisconnect('socket1');
    console.log(`玩家1断线后宽限期: ${server.session.isWithinGrace(p1)}`);
    
    if (server.session.isWithinGrace(p1)) {
      console.log('✅ 游戏流程中的会话管理正常');
      
      // 尝试重连
      const reconnectSocket = new FakeSocket('reconnect1');
      
      // 获取会话信息以创建令牌
      const sessionSummary = server.session.getSessionSummary();
      const playerSession = sessionSummary.activeSessions.find(s => s.playerId === p1);
      
      if (playerSession) {
        const token = server.session.createSessionToken(playerSession.sessionId, p1);
        server.handleHello(reconnectSocket, { sessionToken: token });
        
        const reconnectMsg = reconnectSocket.sent.find(msg => 
          msg.event === 'message' && 
          msg.data.type === 'session_accepted' && 
          msg.data.data?.reconnected === true
        );
        
        if (reconnectMsg) {
          console.log('🎉 完整流程重连成功！');
          assert.ok(true, '完整流程测试成功');
        } else {
          console.log('❌ 完整流程重连失败');
          assert.fail('完整流程重连问题');
        }
      } else {
        console.log('❌ 找不到玩家会话');
        assert.fail('会话查找问题');
      }
      
    } else {
      console.log('❌ 游戏流程中的会话管理仍有问题');
      assert.fail('游戏流程会话问题');
    }
  });
});