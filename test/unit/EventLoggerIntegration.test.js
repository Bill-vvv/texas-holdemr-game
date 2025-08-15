/**
 * EventLogger 集成验证测试
 * 
 * 验证EventLogger和PrivateEventLogger与存储系统的完整集成：
 * - 真实文件系统存储验证
 * - 公共和私有事件的混合记录
 * - 事件流读取和数据一致性
 * - 配置开关的端到端验证
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import EventLogger from '../../src/server/persistence/EventLogger.js';
import PrivateEventLogger from '../../src/server/persistence/PrivateEventLogger.js';
import FileStorage from '../../src/server/persistence/storage/FileStorage.js';
import fs from 'fs/promises';
import path from 'path';

describe('EventLogger集成验证', () => {
  let storage;
  let eventLogger;
  let privateLogger;
  let testDataDir;
  const testSessionId = 'integration-test-session';

  beforeEach(async () => {
    // 创建临时测试目录
    testDataDir = path.join(process.cwd(), 'test-data', `integration-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    
    // 初始化存储和日志器
    storage = new FileStorage(testDataDir);
    
    // 启用持久化功能
    process.env.PERSIST_ENABLED = 'true';
    process.env.PERSIST_PRIVATE = 'true';
    
    eventLogger = new EventLogger(storage);
    privateLogger = new PrivateEventLogger(storage);
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('清理测试数据失败:', error.message);
    }
    
    // 重置环境变量
    delete process.env.PERSIST_ENABLED;
    delete process.env.PERSIST_PRIVATE;
    delete process.env.EVENT_INDEX_ENABLED;
  });

  describe('完整的游戏场景模拟', () => {
    test('应能模拟完整的德州扑克手牌流程', async () => {
      const handNumber = 1;
      
      // 1. 记录洗牌（私有）
      await privateLogger.logDeckShuffled(testSessionId, [
        'AS', 'KH', 'QD', 'JC', 'TS', '9H', '8D', '7C', '6S', '5H',
        '4D', '3C', '2S', 'AH', 'KD', 'QC', 'JS', 'TH', '9D', '8C'
      ]);
      
      // 2. 手牌开始（公共）
      await eventLogger.appendPublicEvent(testSessionId, {
        type: 'HAND_STARTED',
        payload: { players: ['player1', 'player2', 'player3'] }
      }, handNumber);
      
      // 3. 发放底牌（私有）
      await privateLogger.logHoleCardsDealt(testSessionId, 'player1', ['AS', 'KH']);
      await privateLogger.logHoleCardsDealt(testSessionId, 'player2', ['QD', 'JC']);
      await privateLogger.logHoleCardsDealt(testSessionId, 'player3', ['TS', '9H']);
      
      // 4. 玩家动作序列（公共）
      const actions = [
        { type: 'PLAYER_ACTION', payload: { playerId: 'player1', action: 'call', amount: 20 } },
        { type: 'PLAYER_ACTION', payload: { playerId: 'player2', action: 'raise', amount: 60 } },
        { type: 'PLAYER_ACTION', payload: { playerId: 'player3', action: 'fold' } },
        { type: 'PLAYER_ACTION', payload: { playerId: 'player1', action: 'call', amount: 40 } }
      ];
      
      for (const action of actions) {
        await eventLogger.appendPublicEvent(testSessionId, action, handNumber);
      }
      
      // 5. 翻牌（公共和私有都记录）
      const flopCards = ['8D', '7C', '6S'];
      await eventLogger.appendPublicEvent(testSessionId, {
        type: 'FLOP_DEALT',
        payload: { cards: flopCards }
      }, handNumber);
      await privateLogger.logCommunityCardsDealt(testSessionId, 'FLOP', flopCards);
      
      // 6. 更多动作
      await eventLogger.appendPublicEvent(testSessionId, {
        type: 'PLAYER_ACTION',
        payload: { playerId: 'player1', action: 'check' }
      }, handNumber);
      await eventLogger.appendPublicEvent(testSessionId, {
        type: 'PLAYER_ACTION',
        payload: { playerId: 'player2', action: 'bet', amount: 100 }
      }, handNumber);
      
      // 7. 手牌结束
      await eventLogger.appendPublicEvent(testSessionId, {
        type: 'HAND_FINISHED',
        payload: { 
          winner: 'player2',
          pots: [{ amount: 220, winners: ['player2'] }]
        }
      }, handNumber);
      
      // 验证公共事件
      const publicEvents = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        publicEvents.push(event);
      }
      
      assert.strictEqual(publicEvents.length, 9); // 1开始 + 4动作 + 1翻牌 + 2动作 + 1结束
      assert.strictEqual(publicEvents[0].type, 'HAND_STARTED');
      assert.strictEqual(publicEvents[5].type, 'FLOP_DEALT');
      assert.strictEqual(publicEvents[8].type, 'HAND_FINISHED');
      
      // 验证私有事件
      const privateEvents = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        privateEvents.push(event);
      }
      
      assert.strictEqual(privateEvents.length, 5); // 1洗牌 + 3底牌 + 1公共牌
      assert.strictEqual(privateEvents[0].type, 'DECK_SHUFFLED');
      assert.strictEqual(privateEvents[1].type, 'HOLE_CARDS_DEALT');
      assert.strictEqual(privateEvents[4].type, 'COMMUNITY_CARDS_DEALT');
      
      // 验证事件计数
      assert.strictEqual(await eventLogger.getEventCount(testSessionId), 9);
      assert.strictEqual(await privateLogger.getPrivateEventCount(testSessionId), 5);
    });

    test('应能处理多手牌的事件记录', async () => {
      // 模拟3手牌的游戏
      for (let handNum = 1; handNum <= 3; handNum++) {
        // 每手的基本流程
        await eventLogger.appendPublicEvent(testSessionId, {
          type: 'HAND_STARTED',
          payload: { handNumber: handNum }
        }, handNum);
        
        await privateLogger.logDeckShuffled(testSessionId, ['AS', 'KH', 'QD']);
        
        await eventLogger.appendPublicEvent(testSessionId, {
          type: 'HAND_FINISHED',
          payload: { handNumber: handNum }
        }, handNum);
      }
      
      // 验证总计数
      assert.strictEqual(await eventLogger.getEventCount(testSessionId), 6); // 3开始 + 3结束
      assert.strictEqual(await privateLogger.getPrivateEventCount(testSessionId), 3); // 3洗牌
      
      // 验证事件的handNumber字段
      const publicEvents = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        publicEvents.push(event);
      }
      
      const handNumbers = publicEvents.map(e => e.handNumber);
      assert.deepStrictEqual(handNumbers, [1, 1, 2, 2, 3, 3]);
    });
  });

  describe('文件系统验证', () => {
    test('应在文件系统中创建正确的目录结构和文件', async () => {
      // 记录一些事件
      await eventLogger.appendPublicEvent(testSessionId, { type: 'TEST_PUBLIC' }, 1);
      await privateLogger.appendPrivateEvent(testSessionId, { type: 'TEST_PRIVATE' });
      
      // 验证目录结构
      const sessionDir = path.join(testDataDir, testSessionId);
      const sessionDirStats = await fs.stat(sessionDir);
      assert(sessionDirStats.isDirectory());
      
      // 验证公共事件文件
      const eventsFile = path.join(sessionDir, 'events.ndjson');
      const eventsStats = await fs.stat(eventsFile);
      assert(eventsStats.isFile());
      
      const eventsContent = await fs.readFile(eventsFile, 'utf8');
      assert(eventsContent.includes('TEST_PUBLIC'));
      assert(eventsContent.includes(testSessionId)); // 公共事件包含sessionId
      
      // 验证私有事件文件
      const privateFile = path.join(sessionDir, 'private.ndjson');
      const privateStats = await fs.stat(privateFile);
      assert(privateStats.isFile());
      
      const privateContent = await fs.readFile(privateFile, 'utf8');
      assert(privateContent.includes('TEST_PRIVATE'));
      assert(!privateContent.includes(testSessionId)); // 私有事件不包含sessionId
    });

    test('应能正确处理NDJSON格式', async () => {
      // 添加多个事件
      await eventLogger.appendPublicEvent(testSessionId, { type: 'EVENT_1' }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'EVENT_2' }, 1);
      await privateLogger.appendPrivateEvent(testSessionId, { type: 'PRIVATE_1' });
      
      // 读取文件内容
      const sessionDir = path.join(testDataDir, testSessionId);
      const eventsContent = await fs.readFile(path.join(sessionDir, 'events.ndjson'), 'utf8');
      const privateContent = await fs.readFile(path.join(sessionDir, 'private.ndjson'), 'utf8');
      
      // 验证NDJSON格式（每行一个JSON对象）
      const eventLines = eventsContent.trim().split('\n');
      assert.strictEqual(eventLines.length, 2);
      
      const event1 = JSON.parse(eventLines[0]);
      const event2 = JSON.parse(eventLines[1]);
      assert.strictEqual(event1.type, 'EVENT_1');
      assert.strictEqual(event2.type, 'EVENT_2');
      assert.strictEqual(event1.seq, 1);
      assert.strictEqual(event2.seq, 2);
      
      const privateLines = privateContent.trim().split('\n');
      assert.strictEqual(privateLines.length, 1);
      
      const privateEvent = JSON.parse(privateLines[0]);
      assert.strictEqual(privateEvent.type, 'PRIVATE_1');
      assert.strictEqual(privateEvent.seq, 1);
    });
  });

  describe('配置开关验证', () => {
    test('私有日志禁用时不应创建private.ndjson文件', async () => {
      // 重新初始化，禁用私有日志
      process.env.PERSIST_PRIVATE = 'false';
      const disabledPrivateLogger = new PrivateEventLogger(storage);
      
      // 尝试记录私有事件
      const seq = await disabledPrivateLogger.appendPrivateEvent(testSessionId, { type: 'SHOULD_NOT_EXIST' });
      assert.strictEqual(seq, -1);
      
      // 记录公共事件以确保会话目录被创建
      await eventLogger.appendPublicEvent(testSessionId, { type: 'PUBLIC_EVENT' }, 1);
      
      // 验证只有公共事件文件存在
      const sessionDir = path.join(testDataDir, testSessionId);
      const sessionDirStats = await fs.stat(sessionDir);
      assert(sessionDirStats.isDirectory());
      
      const eventsFile = path.join(sessionDir, 'events.ndjson');
      const eventsStats = await fs.stat(eventsFile);
      assert(eventsStats.isFile());
      
      // 私有事件文件不应存在
      const privateFile = path.join(sessionDir, 'private.ndjson');
      try {
        await fs.stat(privateFile);
        assert.fail('私有事件文件不应存在');
      } catch (error) {
        assert.strictEqual(error.code, 'ENOENT');
      }
    });

    test('持久化完全禁用时不应创建任何文件', async () => {
      // 重新初始化，完全禁用持久化
      process.env.PERSIST_ENABLED = 'false';
      const disabledEventLogger = new EventLogger(storage);
      const disabledPrivateLogger = new PrivateEventLogger(storage);
      
      // 尝试记录事件
      const pubSeq = await disabledEventLogger.appendPublicEvent(testSessionId, { type: 'DISABLED' }, 1);
      const privSeq = await disabledPrivateLogger.appendPrivateEvent(testSessionId, { type: 'DISABLED' });
      
      assert.strictEqual(pubSeq, -1);
      assert.strictEqual(privSeq, -1);
      
      // 验证会话目录不存在
      const sessionDir = path.join(testDataDir, testSessionId);
      try {
        await fs.stat(sessionDir);
        assert.fail('会话目录不应存在');
      } catch (error) {
        assert.strictEqual(error.code, 'ENOENT');
      }
    });
  });

  describe('序号一致性验证', () => {
    test('公共和私有事件应有独立的序号空间', async () => {
      // 交替记录公共和私有事件
      const pubSeq1 = await eventLogger.appendPublicEvent(testSessionId, { type: 'PUB_1' }, 1);
      const privSeq1 = await privateLogger.appendPrivateEvent(testSessionId, { type: 'PRIV_1' });
      const pubSeq2 = await eventLogger.appendPublicEvent(testSessionId, { type: 'PUB_2' }, 1);
      const privSeq2 = await privateLogger.appendPrivateEvent(testSessionId, { type: 'PRIV_2' });
      
      // 验证序号独立性
      assert.strictEqual(pubSeq1, 1);
      assert.strictEqual(privSeq1, 1);
      assert.strictEqual(pubSeq2, 2);
      assert.strictEqual(privSeq2, 2);
      
      // 验证文件中的序号
      const publicEvents = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        publicEvents.push(event);
      }
      
      const privateEvents = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        privateEvents.push(event);
      }
      
      assert.deepStrictEqual(publicEvents.map(e => e.seq), [1, 2]);
      assert.deepStrictEqual(privateEvents.map(e => e.seq), [1, 2]);
    });
  });

  describe('错误恢复验证', () => {
    test('应能优雅处理损坏的事件行', async () => {
      // 先记录正常事件
      await eventLogger.appendPublicEvent(testSessionId, { type: 'BEFORE_CORRUPTION' }, 1);
      
      // 手动写入损坏的JSON行
      const sessionDir = path.join(testDataDir, testSessionId);
      const eventsFile = path.join(sessionDir, 'events.ndjson');
      await fs.appendFile(eventsFile, 'this is not valid json\n');
      
      // 继续记录正常事件
      await eventLogger.appendPublicEvent(testSessionId, { type: 'AFTER_CORRUPTION' }, 1);
      
      // 验证能够跳过损坏行并读取正常事件
      const events = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].type, 'BEFORE_CORRUPTION');
      assert.strictEqual(events[1].type, 'AFTER_CORRUPTION');
      
      // 验证事件计数正确（跳过损坏行）
      const count = await eventLogger.getEventCount(testSessionId);
      assert.strictEqual(count, 2);
    });
  });
});