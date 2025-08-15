/**
 * EventLogger 功能测试
 * 
 * 测试EventLogger的核心功能：
 * - 事件追加和序号管理
 * - 批量操作和错误处理
 * - 配置开关和索引支持
 * - 流式读取和事件计数
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import EventLogger from '../../src/server/persistence/EventLogger.js';
import FileStorage from '../../src/server/persistence/storage/FileStorage.js';
import fs from 'fs/promises';
import path from 'path';

describe('EventLogger功能测试', () => {
  let storage;
  let eventLogger;
  let testDataDir;
  const testSessionId = 'test-session-123';

  beforeEach(async () => {
    // 创建临时测试目录
    testDataDir = path.join(process.cwd(), 'test-data', `eventlogger-${Date.now()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    
    // 初始化存储和日志器
    storage = new FileStorage(testDataDir);
    
    // 临时设置环境变量启用持久化
    process.env.PERSIST_ENABLED = 'true';
    eventLogger = new EventLogger(storage);
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
    delete process.env.EVENT_INDEX_ENABLED;
  });

  describe('基础事件记录', () => {
    test('应能追加单个公共事件', async () => {
      const eventData = {
        type: 'PLAYER_ACTION',
        payload: { playerId: 'player1', action: 'bet', amount: 100 }
      };

      const seq = await eventLogger.appendPublicEvent(testSessionId, eventData, 1);
      
      assert.strictEqual(seq, 1);
      
      // 验证事件被正确记录
      const events = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].seq, 1);
      assert.strictEqual(events[0].sessionId, testSessionId);
      assert.strictEqual(events[0].handNumber, 1);
      assert.strictEqual(events[0].type, 'PLAYER_ACTION');
      assert.deepStrictEqual(events[0].payload, eventData.payload);
      assert(events[0].t > 0);
    });

    test('应能追加多个事件并正确管理序号', async () => {
      const events = [
        { type: 'HAND_STARTED', payload: {} },
        { type: 'PLAYER_ACTION', payload: { playerId: 'p1', action: 'call' } },
        { type: 'FLOP_DEALT', payload: { cards: ['AH', 'KD', '7S'] } }
      ];

      const sequences = [];
      for (const eventData of events) {
        const seq = await eventLogger.appendPublicEvent(testSessionId, eventData, 1);
        sequences.push(seq);
      }
      
      assert.deepStrictEqual(sequences, [1, 2, 3]);
      
      // 验证事件总数
      const count = await eventLogger.getEventCount(testSessionId);
      assert.strictEqual(count, 3);
    });

    test('应能处理空payload', async () => {
      const eventData = { type: 'ROUND_CLOSED' }; // 无payload

      const seq = await eventLogger.appendPublicEvent(testSessionId, eventData, 1);
      
      assert.strictEqual(seq, 1);
      
      const events = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.deepStrictEqual(events[0].payload, {});
    });
  });

  describe('批量操作', () => {
    test('应能批量追加事件', async () => {
      const events = [
        { type: 'HAND_STARTED', payload: {} },
        { type: 'PLAYER_ACTION', payload: { playerId: 'p1', action: 'bet', amount: 50 } },
        { type: 'PLAYER_ACTION', payload: { playerId: 'p2', action: 'call' } }
      ];

      const sequences = await eventLogger.appendBatch(testSessionId, events, 2);
      
      assert.deepStrictEqual(sequences, [1, 2, 3]);
      
      // 验证所有事件都被记录
      const recordedEvents = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        recordedEvents.push(event);
      }
      
      assert.strictEqual(recordedEvents.length, 3);
      assert.strictEqual(recordedEvents[0].handNumber, 2);
      assert.strictEqual(recordedEvents[1].type, 'PLAYER_ACTION');
      assert.strictEqual(recordedEvents[2].payload.playerId, 'p2');
    });

    test('应能处理空批量', async () => {
      const sequences = await eventLogger.appendBatch(testSessionId, [], 1);
      
      assert.deepStrictEqual(sequences, []);
      
      const count = await eventLogger.getEventCount(testSessionId);
      assert.strictEqual(count, 0);
    });
  });

  describe('配置开关', () => {
    test('持久化禁用时应返回假序号', async () => {
      process.env.PERSIST_ENABLED = 'false';
      const disabledLogger = new EventLogger(storage);
      
      const seq = await disabledLogger.appendPublicEvent(testSessionId, { type: 'TEST' }, 1);
      
      assert.strictEqual(seq, -1);
      
      const count = await disabledLogger.getEventCount(testSessionId);
      assert.strictEqual(count, 0);
    });
  });

  describe('流式读取', () => {
    test('应能从头开始流式读取', async () => {
      // 先添加一些测试事件
      await eventLogger.appendPublicEvent(testSessionId, { type: 'HAND_STARTED' }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'PLAYER_ACTION', payload: { playerId: 'p1' } }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'FLOP_DEALT' }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'HAND_FINISHED' }, 1);

      const events = [];
      for await (const event of eventLogger.streamEvents(testSessionId)) {
        events.push(event);
      }
      
      assert.strictEqual(events.length, 4);
      assert.strictEqual(events[0].type, 'HAND_STARTED');
      assert.strictEqual(events[3].type, 'HAND_FINISHED');
    });

    test('应能从指定序号开始读取', async () => {
      // 先添加一些测试事件
      await eventLogger.appendPublicEvent(testSessionId, { type: 'HAND_STARTED' }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'PLAYER_ACTION', payload: { playerId: 'p1' } }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'FLOP_DEALT' }, 1);
      await eventLogger.appendPublicEvent(testSessionId, { type: 'HAND_FINISHED' }, 1);

      const events = [];
      for await (const event of eventLogger.streamEvents(testSessionId, 3)) {
        events.push(event);
      }
      
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].seq, 3);
      assert.strictEqual(events[1].seq, 4);
    });

    test('应能处理不存在的会话', async () => {
      const events = [];
      for await (const event of eventLogger.streamEvents('nonexistent-session')) {
        events.push(event);
      }
      
      assert.strictEqual(events.length, 0);
    });
  });

  describe('事件计数', () => {
    test('应能正确统计事件数量', async () => {
      assert.strictEqual(await eventLogger.getEventCount(testSessionId), 0);
      
      await eventLogger.appendPublicEvent(testSessionId, { type: 'EVENT1' }, 1);
      assert.strictEqual(await eventLogger.getEventCount(testSessionId), 1);
      
      await eventLogger.appendBatch(testSessionId, [{ type: 'EVENT2' }, { type: 'EVENT3' }], 1);
      assert.strictEqual(await eventLogger.getEventCount(testSessionId), 3);
    });

    test('不存在的会话应返回0', async () => {
      const count = await eventLogger.getEventCount('nonexistent-session');
      assert.strictEqual(count, 0);
    });
  });
});