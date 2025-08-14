/**
 * TableRules.test.js - TableRules模块单元测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import TableRules from '../../src/game/rules/TableRules.js';

describe('TableRules', () => {
  test('应该创建默认规则配置', () => {
    const rules = new TableRules();
    
    assert.strictEqual(rules.minPlayers, 2);
    assert.strictEqual(rules.maxPlayers, 3);
    assert.strictEqual(rules.smallBlind, 10);
    assert.strictEqual(rules.bigBlind, 20);
    assert.strictEqual(rules.minRaise, 20);
    assert.strictEqual(rules.noLimit, true);
    assert.strictEqual(rules.minBuyIn, 800); // 40 * 20
    assert.strictEqual(rules.maxBuyIn, 2000); // 100 * 20
    assert.strictEqual(rules.rebuyAllowed, true);
    assert.strictEqual(rules.rebuyOnlyBetweenHands, true);
  });

  test('应该接受自定义规则配置', () => {
    const customOptions = {
      minPlayers: 3,
      maxPlayers: 6,
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 1000,
      maxBuyIn: 5000,
      rebuyAllowed: false
    };
    
    const rules = new TableRules(customOptions);
    
    assert.strictEqual(rules.minPlayers, 3);
    assert.strictEqual(rules.maxPlayers, 6);
    assert.strictEqual(rules.smallBlind, 25);
    assert.strictEqual(rules.bigBlind, 50);
    assert.strictEqual(rules.minBuyIn, 1000);
    assert.strictEqual(rules.maxBuyIn, 5000);
    assert.strictEqual(rules.rebuyAllowed, false);
  });

  test('应该验证配置合理性', () => {
    // 最小玩家数不能小于2
    assert.throws(() => {
      new TableRules({ minPlayers: 1 });
    }, Error, '最小玩家数必须至少为2');

    // 最大玩家数不能小于最小玩家数
    assert.throws(() => {
      new TableRules({ minPlayers: 5, maxPlayers: 3 });
    }, Error, '最大玩家数不能小于最小玩家数');

    // 最大玩家数不能超过9
    assert.throws(() => {
      new TableRules({ maxPlayers: 10 });
    }, Error, '最大玩家数不能超过9');

    // 小盲必须小于大盲
    assert.throws(() => {
      new TableRules({ smallBlind: 50, bigBlind: 50 });
    }, Error, '小盲必须小于大盲');

    // 盲注必须为正数
    assert.throws(() => {
      new TableRules({ smallBlind: -10, bigBlind: 20 });
    }, Error, '盲注必须为正数');

    // 买入金额必须为正数
    assert.throws(() => {
      new TableRules({ minBuyIn: -100, maxBuyIn: 1000 });
    }, Error, '买入金额必须为正数');

    // 最小买入不能大于等于最大买入
    assert.throws(() => {
      new TableRules({ minBuyIn: 1000, maxBuyIn: 500 });
    }, Error, '最小买入必须小于最大买入');
  });

  test('应该正确检查买入金额有效性', () => {
    const rules = new TableRules({
      minBuyIn: 1000,
      maxBuyIn: 5000
    });

    assert.strictEqual(rules.isValidBuyIn(1500), true);
    assert.strictEqual(rules.isValidBuyIn(1000), true); // 边界值
    assert.strictEqual(rules.isValidBuyIn(5000), true); // 边界值
    
    assert.strictEqual(rules.isValidBuyIn(500), false);  // 太少
    assert.strictEqual(rules.isValidBuyIn(6000), false); // 太多
    assert.strictEqual(rules.isValidBuyIn('1000'), false); // 非数字
    assert.strictEqual(rules.isValidBuyIn(null), false);
  });

  test('应该正确检查增购是否被允许', () => {
    // 允许增购，但只在局间
    const rules1 = new TableRules({
      rebuyAllowed: true,
      rebuyOnlyBetweenHands: true
    });

    assert.strictEqual(rules1.isRebuyAllowed('WAITING'), true);
    assert.strictEqual(rules1.isRebuyAllowed('FINISHED'), true);
    assert.strictEqual(rules1.isRebuyAllowed('PLAYING'), false);

    // 完全不允许增购
    const rules2 = new TableRules({
      rebuyAllowed: false
    });

    assert.strictEqual(rules2.isRebuyAllowed('WAITING'), false);
    assert.strictEqual(rules2.isRebuyAllowed('PLAYING'), false);

    // 允许增购，任何时候
    const rules3 = new TableRules({
      rebuyAllowed: true,
      rebuyOnlyBetweenHands: false
    });

    assert.strictEqual(rules3.isRebuyAllowed('WAITING'), true);
    assert.strictEqual(rules3.isRebuyAllowed('PLAYING'), true);
  });

  test('应该正确验证增购金额', () => {
    const rules = new TableRules({
      rebuyAllowed: true,
      rebuyMaxAmount: 2000
    });

    // 有效增购
    assert.strictEqual(rules.isValidRebuy(500, 1000), true); // 总计1500，在限制内
    assert.strictEqual(rules.isValidRebuy(1000, 1000), true); // 总计2000，刚好等于上限

    // 无效增购
    assert.strictEqual(rules.isValidRebuy(1500, 1000), false); // 总计2500，超过上限
    assert.strictEqual(rules.isValidRebuy(-100, 1000), false); // 负数
    assert.strictEqual(rules.isValidRebuy('500', 1000), false); // 非数字

    // 不允许增购的规则
    const noRebuyRules = new TableRules({ rebuyAllowed: false });
    assert.strictEqual(noRebuyRules.isValidRebuy(500, 1000), false);
  });

  test('应该正确计算最小加注金额', () => {
    const rules = new TableRules({
      bigBlind: 20,
      minRaise: 20
    });

    // 默认情况
    assert.strictEqual(rules.getMinRaiseAmount(), 20);

    // 上次加注增量更大
    assert.strictEqual(rules.getMinRaiseAmount(100, 50), 50);

    // 上次加注增量更小
    assert.strictEqual(rules.getMinRaiseAmount(100, 10), 20);
  });

  test('应该正确验证玩家数量', () => {
    const rules = new TableRules({
      minPlayers: 2,
      maxPlayers: 6
    });

    assert.strictEqual(rules.isValidPlayerCount(3), true);
    assert.strictEqual(rules.isValidPlayerCount(2), true); // 边界值
    assert.strictEqual(rules.isValidPlayerCount(6), true); // 边界值

    assert.strictEqual(rules.isValidPlayerCount(1), false); // 太少
    assert.strictEqual(rules.isValidPlayerCount(7), false); // 太多
    assert.strictEqual(rules.isValidPlayerCount('3'), false); // 非数字
  });

  test('应该返回建议的买入金额', () => {
    const rules = new TableRules({
      minBuyIn: 1000,
      maxBuyIn: 3000
    });

    const recommended = rules.getRecommendedBuyIn();
    assert.strictEqual(recommended, 2000); // (1000 + 3000) / 2
  });

  test('应该创建现金局默认规则', () => {
    const rules = TableRules.createCashGame(50);

    assert.strictEqual(rules.smallBlind, 25);
    assert.strictEqual(rules.bigBlind, 50);
    assert.strictEqual(rules.minBuyIn, 2000); // 40 * 50
    assert.strictEqual(rules.maxBuyIn, 5000); // 100 * 50
    assert.strictEqual(rules.rebuyAllowed, true);
    assert.strictEqual(rules.rebuyOnlyBetweenHands, true);
    assert.strictEqual(rules.noLimit, true);
  });

  test('创建锦标赛规则应该抛出错误（MVP阶段未实现）', () => {
    assert.throws(() => {
      TableRules.createTournament();
    }, Error, 'Tournament mode not implemented in MVP phase');
  });

  test('应该正确序列化和反序列化', () => {
    const originalRules = new TableRules({
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 1000,
      maxBuyIn: 3000,
      rebuyAllowed: false
    });

    const serialized = originalRules.serialize();
    const deserializedRules = TableRules.deserialize(serialized);

    assert.strictEqual(deserializedRules.smallBlind, 25);
    assert.strictEqual(deserializedRules.bigBlind, 50);
    assert.strictEqual(deserializedRules.minBuyIn, 1000);
    assert.strictEqual(deserializedRules.maxBuyIn, 3000);
    assert.strictEqual(deserializedRules.rebuyAllowed, false);
  });

  test('应该生成正确的规则摘要', () => {
    const rules = new TableRules({
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 800,
      maxBuyIn: 2000,
      rebuyAllowed: true,
      noLimit: true
    });

    const summary = rules.getSummary();
    const expected = 'No-Limit Hold\'em 10/20, 买入: 800-2000, 允许增购';
    assert.strictEqual(summary, expected);

    // 测试不允许增购的情况
    const noRebuyRules = new TableRules({
      smallBlind: 5,
      bigBlind: 10,
      rebuyAllowed: false
    });

    const noRebuySummary = noRebuyRules.getSummary();
    assert.ok(noRebuySummary.includes('不允许增购'));
  });
});