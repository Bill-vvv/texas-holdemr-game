/**
 * HandEvaluator.test.js - HandEvaluator模块单元测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import HandEvaluator from '../../src/game/core/HandEvaluator.js';

describe('HandEvaluator', () => {
  const evaluator = new HandEvaluator();

  test('应该正确评估皇家同花顺', () => {
    const holeCards = ['AH', 'KH'];
    const board = ['QH', 'JH', 'TH'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 9, '皇家同花顺应该是rank 9');
    assert.ok(result.name.includes('Straight Flush'), '应该识别为同花顺');
  });

  test('应该正确评估四条', () => {
    const holeCards = ['AH', 'AS'];
    const board = ['AD', 'AC', 'KH'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 8, '四条应该是rank 8');
    assert.ok(result.name.includes('Four of a Kind'), '应该识别为四条');
  });

  test('应该正确评估葫芦', () => {
    const holeCards = ['AH', 'AS'];
    const board = ['AD', 'KC', 'KH'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 7, '葫芦应该是rank 7');
    assert.ok(result.name.includes('Full House'), '应该识别为葫芦');
  });

  test('应该正确评估同花', () => {
    const holeCards = ['AH', '9H'];
    const board = ['KH', 'JH', '7H'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 6, '同花应该是rank 6');
    assert.ok(result.name.includes('Flush'), '应该识别为同花');
  });

  test('应该正确评估顺子', () => {
    const holeCards = ['AH', '2S'];
    const board = ['3D', '4C', '5H'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 5, '顺子应该是rank 5');
    assert.ok(result.name.includes('Straight'), '应该识别为顺子');
  });

  test('应该正确评估三条', () => {
    const holeCards = ['AH', 'AS'];
    const board = ['AD', 'KC', '7H'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 4, '三条应该是rank 4');
    assert.ok(result.name.includes('Three of a Kind'), '应该识别为三条');
  });

  test('应该正确评估两对', () => {
    const holeCards = ['AH', 'AS'];
    const board = ['KC', 'KH', '7D'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 3, '两对应该是rank 3');
    assert.ok(result.name.includes('Two Pair'), '应该识别为两对');
  });

  test('应该正确评估一对', () => {
    const holeCards = ['AH', 'AS'];
    const board = ['KC', '7H', '3D'];
    
    const result = evaluator.evaluate(holeCards, board);
    
    assert.strictEqual(result.rank, 2, '一对应该是rank 2');
    assert.ok(result.name.includes('Pair'), '应该识别为一对');
  });

  test('应该正确比较不同牌型大小', () => {
    const evaluator = new HandEvaluator();
    
    // 三条 vs 一对
    const trip = evaluator.evaluate(['AH', 'AS'], ['AD', 'KC', '7H']);
    const pair = evaluator.evaluate(['KH', 'KS'], ['AD', 'QC', '7H']);
    
    const result = evaluator.compare(trip, pair);
    assert.strictEqual(result, 1, '三条应该大于一对');
  });

  test('应该正确处理findWinners', () => {
    const players = [
      { id: 'player1', holeCards: ['AH', 'AS'] }, // A对
      { id: 'player2', holeCards: ['KH', 'KS'] }, // K对  
      { id: 'player3', holeCards: ['QH', 'QS'] }  // Q对
    ];
    const board = ['7C', '8D', '9H'];
    
    const winners = evaluator.findWinners(players, board);
    
    assert.deepStrictEqual(winners, ['player1'], 'A对应该获胜');
  });

  test('应该正确处理平局', () => {
    const players = [
      { id: 'player1', holeCards: ['AH', 'KS'] }, // A高
      { id: 'player2', holeCards: ['AD', 'KC'] }  // A高(同样的)
    ];
    const board = ['QC', 'JD', '9H', '7S', '3C'];
    
    const winners = evaluator.findWinners(players, board);
    
    assert.strictEqual(winners.length, 2, '应该是平局');
    assert.ok(winners.includes('player1'), 'player1应该在获胜者中');
    assert.ok(winners.includes('player2'), 'player2应该在获胜者中');
  });

  test('输入验证 - holeCards必须是2张牌', () => {
    assert.throws(() => {
      evaluator.evaluate(['AH'], ['KC', '7H', '3D', '2S', '9C']);
    }, Error, '应该抛出错误：holeCards必须是2张牌');

    assert.throws(() => {
      evaluator.evaluate(['AH', 'AS', 'KC'], ['7H', '3D']);
    }, Error, '应该抛出错误：holeCards不能超过2张牌');
  });

  test('输入验证 - 至少需要5张牌', () => {
    assert.throws(() => {
      evaluator.evaluate(['AH', 'AS'], ['KC', '7H']);
    }, Error, '应该抛出错误：至少需要5张牌');
  });

  test('getRankName应该返回正确的中文牌型名', () => {
    assert.strictEqual(evaluator.getRankName(9), '同花顺');
    assert.strictEqual(evaluator.getRankName(8), '四条');
    assert.strictEqual(evaluator.getRankName(4), '三条');
    assert.strictEqual(evaluator.getRankName(1), '高牌');
  });

  test('_convertCardFormat应该正确转换牌面格式', () => {
    assert.strictEqual(evaluator._convertCardFormat('AH'), 'Ah');
    assert.strictEqual(evaluator._convertCardFormat('KS'), 'Ks');
    assert.strictEqual(evaluator._convertCardFormat('TD'), 'Td');
    assert.strictEqual(evaluator._convertCardFormat('2C'), '2c');
  });
});