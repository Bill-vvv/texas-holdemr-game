/**
 * PrivateEventLogger 功能测试
 * 
 * 测试PrivateEventLogger的核心功能：
 * - 私有事件记录和访问控制
 * - 发牌剧本的专门方法
 * - 配置开关控制
 * - 批量操作和流式读取
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import PrivateEventLogger from '../../src/server/persistence/PrivateEventLogger.js';
import FileStorage from '../../src/server/persistence/storage/FileStorage.js';
import fs from 'fs/promises';
import path from 'path';

describe('PrivateEventLogger功能测试', () => {
  let storage;
  let privateLogger;
  let testDataDir;
  const testSessionId = 'test-session-456';

  beforeEach(async () => {
    // 创建临时测试目录
    testDataDir = path.join(process.cwd(), 'test-data', `private-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    
    // 初始化存储和日志器
    storage = new FileStorage(testDataDir);
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
  });

  describe('配置开关控制', () => {
    test('私有日志默认应禁用', () => {
      privateLogger = new PrivateEventLogger(storage);
      assert.strictEqual(privateLogger.isEnabled(), false);
    });

    test('持久化禁用时私有日志应禁用', () => {
      process.env.PERSIST_ENABLED = 'false';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
      
      assert.strictEqual(privateLogger.isEnabled(), false);
    });

    test('完全启用时私有日志应可用', () => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
      
      assert.strictEqual(privateLogger.isEnabled(), true);
    });

    test('私有日志禁用时操作应返回假序号', async () => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'false';
      privateLogger = new PrivateEventLogger(storage);
      
      const seq = await privateLogger.appendPrivateEvent(testSessionId, { type: 'TEST' });
      assert.strictEqual(seq, -1);
      
      const count = await privateLogger.getPrivateEventCount(testSessionId);
      assert.strictEqual(count, 0);
    });
  });

  describe('私有事件记录（启用状态）', () => {
    beforeEach(() => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
    });

    test('应能记录基本私有事件', async () => {
      const eventData = {
        type: 'CUSTOM_PRIVATE',
        payload: { secret: 'test-data' }
      };

      const seq = await privateLogger.appendPrivateEvent(testSessionId, eventData);
      
      assert.strictEqual(seq, 1);
      
      // 验证事件被记录
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].seq, 1);
      assert.strictEqual(events[0].type, 'CUSTOM_PRIVATE');
      assert.deepStrictEqual(events[0].payload, { secret: 'test-data' });
      assert(events[0].t > 0);
      // 验证不包含sessionId和handNumber
      assert.strictEqual(events[0].sessionId, undefined);
      assert.strictEqual(events[0].handNumber, undefined);
    });

    test('应能记录牌堆洗牌事件', async () => {
      const orderedDeck = ['AS', 'KH', 'QD', 'JC', '10S'];
      
      const seq = await privateLogger.logDeckShuffled(testSessionId, orderedDeck);
      
      assert.strictEqual(seq, 1);
      
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events[0].type, 'DECK_SHUFFLED');
      assert.deepStrictEqual(events[0].payload.orderedDeck, ['AS', 'KH', 'QD', 'JC', '10S']);
    });

    test('应能记录底牌发放事件', async () => {
      const playerId = 'player1';
      const cards = ['AH', 'KD'];
      
      const seq = await privateLogger.logHoleCardsDealt(testSessionId, playerId, cards);
      
      assert.strictEqual(seq, 1);
      
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events[0].type, 'HOLE_CARDS_DEALT');
      assert.strictEqual(events[0].payload.playerId, 'player1');
      assert.deepStrictEqual(events[0].payload.cards, ['AH', 'KD']);
    });

    test('应能记录公共牌发放事件', async () => {
      const street = 'FLOP';
      const cards = ['AS', '7H', '2C'];
      
      const seq = await privateLogger.logCommunityCardsDealt(testSessionId, street, cards);
      
      assert.strictEqual(seq, 1);
      
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events[0].type, 'COMMUNITY_CARDS_DEALT');
      assert.strictEqual(events[0].payload.street, 'FLOP');
      assert.deepStrictEqual(events[0].payload.cards, ['AS', '7H', '2C']);
    });

    test('应能记录随机种子事件', async () => {
      const seed = 12345;
      const source = 'test';
      
      const seq = await privateLogger.logRandomSeed(testSessionId, seed, source);
      
      assert.strictEqual(seq, 1);
      
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events[0].type, 'RANDOM_SEED');
      assert.strictEqual(events[0].payload.seed, 12345);
      assert.strictEqual(events[0].payload.source, 'test');
    });
  });

  describe('批量操作（启用状态）', () => {
    beforeEach(() => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
    });

    test('应能批量记录私有事件', async () => {
      const events = [
        { type: 'DECK_SHUFFLED', payload: { orderedDeck: ['AS', 'KH'] } },
        { type: 'HOLE_CARDS_DEALT', payload: { playerId: 'p1', cards: ['AS', 'KH'] } },
        { type: 'HOLE_CARDS_DEALT', payload: { playerId: 'p2', cards: ['QD', 'JC'] } }
      ];

      const sequences = await privateLogger.appendBatch(testSessionId, events);
      
      assert.deepStrictEqual(sequences, [1, 2, 3]);
      
      // 验证所有事件都被记录
      const recordedEvents = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        recordedEvents.push(event);
      }
      
      assert.strictEqual(recordedEvents.length, 3);
      assert.strictEqual(recordedEvents[0].type, 'DECK_SHUFFLED');
      assert.strictEqual(recordedEvents[1].payload.playerId, 'p1');
      assert.strictEqual(recordedEvents[2].payload.playerId, 'p2');
    });

    test('应能处理空批量', async () => {
      const sequences = await privateLogger.appendBatch(testSessionId, []);
      
      assert.deepStrictEqual(sequences, []);
      
      const count = await privateLogger.getPrivateEventCount(testSessionId);
      assert.strictEqual(count, 0);
    });
  });

  describe('数据安全性', () => {
    beforeEach(() => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
    });

    test('应确保输入数据不被外部修改', async () => {
      const originalDeck = ['AS', 'KH', 'QD'];
      const deckCopy = [...originalDeck];
      
      await privateLogger.logDeckShuffled(testSessionId, originalDeck);
      
      // 修改原始数组
      originalDeck.push('JC');
      
      // 验证记录的数据没有被影响
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.deepStrictEqual(events[0].payload.orderedDeck, deckCopy);
      assert.notDeepStrictEqual(events[0].payload.orderedDeck, originalDeck);
    });

    test('底牌数据应被深拷贝保护', async () => {
      const originalCards = ['AH', 'KD'];
      const cardsCopy = [...originalCards];
      
      await privateLogger.logHoleCardsDealt(testSessionId, 'player1', originalCards);
      
      // 修改原始数组
      originalCards[0] = 'AS';
      
      // 验证记录的数据没有被影响
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.deepStrictEqual(events[0].payload.cards, cardsCopy);
      assert.notDeepStrictEqual(events[0].payload.cards, originalCards);
    });
  });

  describe('序号管理', () => {
    beforeEach(() => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
    });

    test('私有事件应有独立的序号序列', async () => {
      await privateLogger.logDeckShuffled(testSessionId, ['AS']);
      await privateLogger.logHoleCardsDealt(testSessionId, 'p1', ['AH', 'KD']);
      await privateLogger.logCommunityCardsDealt(testSessionId, 'FLOP', ['QS', 'JS', '10H']);
      
      const events = [];
      for await (const event of privateLogger.streamPrivateEvents(testSessionId)) {
        events.push(event);
      }
      
      const sequences = events.map(e => e.seq);
      assert.deepStrictEqual(sequences, [1, 2, 3]);
    });

    test('多会话应有独立的序号空间', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      await privateLogger.logDeckShuffled(session1, ['AS']);
      await privateLogger.logDeckShuffled(session2, ['KH']);
      await privateLogger.logDeckShuffled(session1, ['QD']);
      
      // 验证session1的序号
      const events1 = [];
      for await (const event of privateLogger.streamPrivateEvents(session1)) {
        events1.push(event);
      }
      const sequences1 = events1.map(e => e.seq);
      assert.deepStrictEqual(sequences1, [1, 2]);
      
      // 验证session2的序号
      const events2 = [];
      for await (const event of privateLogger.streamPrivateEvents(session2)) {
        events2.push(event);
      }
      const sequences2 = events2.map(e => e.seq);
      assert.deepStrictEqual(sequences2, [1]);
    });
  });

  describe('事件计数', () => {
    beforeEach(() => {
      process.env.PERSIST_ENABLED = 'true';
      process.env.PERSIST_PRIVATE = 'true';
      privateLogger = new PrivateEventLogger(storage);
    });

    test('应能正确统计私有事件数量', async () => {
      assert.strictEqual(await privateLogger.getPrivateEventCount(testSessionId), 0);
      
      await privateLogger.logDeckShuffled(testSessionId, ['AS']);
      assert.strictEqual(await privateLogger.getPrivateEventCount(testSessionId), 1);
      
      await privateLogger.appendBatch(testSessionId, [
        { type: 'HOLE_CARDS_DEALT', payload: { playerId: 'p1', cards: ['AH', 'KD'] } },
        { type: 'HOLE_CARDS_DEALT', payload: { playerId: 'p2', cards: ['QS', 'JS'] } }
      ]);
      assert.strictEqual(await privateLogger.getPrivateEventCount(testSessionId), 3);
    });
  });
});