/**
 * FileStorage基础功能验证测试
 * 
 * 这是一个临时测试文件，用于验证FileStorage的基本功能。
 * 在正式的测试框架集成前，先通过这个简单测试确保功能正常。
 */

import fs from 'fs/promises';
import path from 'path';
import FileStorage from './FileStorage.js';

async function runBasicTests() {
  console.log('🧪 开始FileStorage基础功能测试...');
  
  const testDataDir = './test-data-temp';
  const storage = new FileStorage(testDataDir);
  const testSessionId = 'test-session-' + Date.now();
  
  try {
    // 测试1: 快照保存和读取
    console.log('\\n1️⃣  测试快照保存和读取...');
    const testSnapshot = {
      meta: { version: 1, savedAt: Date.now() },
      session: { id: testSessionId, startedAt: Date.now(), handsPlayed: 0 },
      gameState: { phase: 'WAITING', players: [], street: 'PRE_FLOP' }
    };
    
    await storage.saveSnapshot(testSessionId, testSnapshot);
    const loadedSnapshot = await storage.readSnapshot(testSessionId);
    
    console.assert(loadedSnapshot.session.id === testSessionId, '快照ID匹配失败');
    console.assert(loadedSnapshot.gameState.phase === 'WAITING', '快照数据匹配失败');
    console.log('✅ 快照保存和读取测试通过');
    
    // 测试2: 公共事件追加
    console.log('\\n2️⃣  测试公共事件追加...');
    const testEvents = [
      { seq: 1, t: Date.now(), sessionId: testSessionId, type: 'HAND_STARTED', payload: {} },
      { seq: 2, t: Date.now(), sessionId: testSessionId, type: 'PLAYER_ACTION', payload: { playerId: 'p1', action: 'bet' } },
      { seq: 3, t: Date.now(), sessionId: testSessionId, type: 'HAND_FINISHED', payload: {} }
    ];
    
    for (const event of testEvents) {
      await storage.appendPublicEvent(testSessionId, event);
    }
    console.log('✅ 事件追加测试通过');
    
    // 测试3: 流式事件读取
    console.log('\\n3️⃣  测试流式事件读取...');
    const readEvents = [];
    for await (const event of storage.streamPublicEvents(testSessionId)) {
      readEvents.push(event);
    }
    
    console.assert(readEvents.length === testEvents.length, `事件数量不匹配: 期望${testEvents.length}, 实际${readEvents.length}`);
    console.assert(readEvents[0].type === 'HAND_STARTED', '事件顺序不正确');
    console.assert(readEvents[1].type === 'PLAYER_ACTION', '事件内容不正确');
    console.log('✅ 流式事件读取测试通过');
    
    // 测试4: 会话管理
    console.log('\\n4️⃣  测试会话管理...');
    const exists = await storage.sessionExists(testSessionId);
    console.assert(exists, '会话存在性检查失败');
    
    const sessions = await storage.listSessions();
    console.assert(sessions.some(s => s.sessionId === testSessionId), '会话列表中未找到测试会话');
    console.log('✅ 会话管理测试通过');
    
    // 测试5: 私有事件（可选功能）
    console.log('\\n5️⃣  测试私有事件追加和读取...');
    const privateEvent = { seq: 1, t: Date.now(), type: 'DECK_SHUFFLED', payload: { orderedDeck: ['AS', 'KH'] } };
    await storage.appendPrivateEvent(testSessionId, privateEvent);
    
    const privateEvents = [];
    for await (const event of storage.streamPrivateEvents(testSessionId)) {
      privateEvents.push(event);
    }
    
    console.assert(privateEvents.length === 1, '私有事件数量不正确');
    console.assert(privateEvents[0].type === 'DECK_SHUFFLED', '私有事件类型不正确');
    console.log('✅ 私有事件测试通过');
    
    console.log('\\n🎉 所有测试通过！FileStorage功能正常。');
    
  } catch (error) {
    console.error('\\n❌ 测试失败:', error);
    throw error;
  } finally {
    // 清理测试数据
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
      console.log('🧹 测试数据已清理');
    } catch (cleanupError) {
      console.warn('清理测试数据失败:', cleanupError.message);
    }
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('开始运行测试...');
  runBasicTests().catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
}

export default runBasicTests;