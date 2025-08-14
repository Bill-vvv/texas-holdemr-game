/**
 * Deck.test.js - Deck模块单元测试
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import Deck from '../../src/game/core/Deck.js';

describe('Deck', () => {
  test('应该创建标准52张牌', () => {
    const deck = new Deck();
    assert.strictEqual(deck.getRemainingCount(), 52);
  });

  test('应该包含所有花色和点数', () => {
    const deck = new Deck();
    const cards = deck.dealMany(52);
    
    // 检查是否有4种花色
    const suits = new Set();
    const ranks = new Set();
    
    for (const card of cards) {
      suits.add(card.slice(-1)); // 最后一个字符是花色
      ranks.add(card.slice(0, -1)); // 除最后一个字符外是点数
    }
    
    assert.strictEqual(suits.size, 4, '应该有4种花色');
    assert.strictEqual(ranks.size, 13, '应该有13种点数');
    assert.strictEqual(cards.length, 52, '应该正好52张牌');
  });

  test('洗牌后顺序应该改变', () => {
    const deck1 = new Deck();
    const deck2 = new Deck();
    
    const original = deck1.dealMany(52);
    deck2.shuffle();
    const shuffled = deck2.dealMany(52);
    
    // 洗牌后不太可能完全相同（概率极低）
    let different = false;
    for (let i = 0; i < 52; i++) {
      if (original[i] !== shuffled[i]) {
        different = true;
        break;
      }
    }
    
    assert.ok(different, '洗牌后顺序应该改变');
  });

  test('dealOne应该每次发一张牌', () => {
    const deck = new Deck();
    const initialCount = deck.getRemainingCount();
    
    const card = deck.dealOne();
    
    assert.ok(card, '应该发出一张牌');
    assert.strictEqual(deck.getRemainingCount(), initialCount - 1, '剩余牌数应该减1');
  });

  test('dealMany应该发指定数量的牌', () => {
    const deck = new Deck();
    const cards = deck.dealMany(5);
    
    assert.strictEqual(cards.length, 5, '应该发5张牌');
    assert.strictEqual(deck.getRemainingCount(), 47, '剩余47张牌');
  });

  test('牌发完后应该返回null', () => {
    const deck = new Deck();
    deck.dealMany(52); // 发完所有牌
    
    const card = deck.dealOne();
    assert.strictEqual(card, null, '牌发完后应该返回null');
  });

  test('dealMany超过剩余牌数时应该返回所有剩余牌', () => {
    const deck = new Deck();
    deck.dealMany(50); // 剩余2张
    
    const cards = deck.dealMany(5); // 要求5张，但只剩2张
    
    assert.strictEqual(cards.length, 2, '应该返回剩余的2张牌');
    assert.strictEqual(deck.getRemainingCount(), 0, '牌堆应该空了');
  });

  test('hasEnough应该正确判断是否有足够的牌', () => {
    const deck = new Deck();
    
    assert.ok(deck.hasEnough(10), '新牌堆应该有足够的牌');
    assert.ok(!deck.hasEnough(60), '不应该有超过52张的牌');
    
    deck.dealMany(50);
    assert.ok(!deck.hasEnough(5), '剩余2张时不够发5张');
  });

  test('reset应该重新创建完整牌堆', () => {
    const deck = new Deck();
    deck.dealMany(30);
    assert.strictEqual(deck.getRemainingCount(), 22);
    
    deck.reset();
    assert.strictEqual(deck.getRemainingCount(), 52, 'reset后应该恢复52张牌');
  });
});