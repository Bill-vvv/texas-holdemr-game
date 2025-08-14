import { describe, it } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import TurnOrderCalculator from '../../src/game/TurnOrderCalculator.js';

describe('TurnOrderCalculator', () => {
  function makeState(n = 3) {
    const gs = new GameState();
    for (let i = 1; i <= n; i++) {
      gs.addPlayer({ id: `p${i}`, name: `P${i}`, chips: 1000 });
    }
    return gs;
  }

  // 补齐行动顺序在缺失按钮/大盲、当前玩家不存在、跳过不可行动玩家等
  it('缺失按钮时回退处理', () => {
    const gs = makeState(3);
    // 没有设置按钮
    gs.players.forEach(p => (p.isDealer = false));
    const first = TurnOrderCalculator.getFirstPlayerAfterButton(gs);
    assert.strictEqual(first, 'p1'); // 期望回退到第一个可行动玩家
  });

  it('当前玩家不存在时的处理', () => {
    const gs = makeState(4);
    // 模拟 p2 不存在的情况
    const next = TurnOrderCalculator.getNextActorAfter(gs, 'nonexistent');
    assert.strictEqual(next, 'p1'); // 期望返回第一个可行动玩家
  });

  it('跳过不可行动玩家', () => {
    const gs = makeState(4);
    gs.players[1].status = 'FOLDED'; // p2
    gs.players[2].status = 'ALL_IN'; // p3
    const next = TurnOrderCalculator.getNextActorAfter(gs, 'p1');
    assert.strictEqual(next, 'p4'); // 应该跳过p2和p3
  });

  it('大盲缺失时UTG的确定', () => {
    const gs = makeState(3);
    gs.players[0].isDealer = true; // p1为按钮
    // 未设置大盲
    const utg = TurnOrderCalculator.getUTGPlayer(gs);
    const expected = TurnOrderCalculator.getFirstPlayerAfterButton(gs);
    assert.strictEqual(utg, expected); // 应该回退到按钮后首个玩家
  });

  it('所有玩家都不可行动时的处理', () => {
    const gs = makeState(3);
    gs.players.forEach(p => (p.status = 'FOLDED'));
    const actionable = TurnOrderCalculator.getActionablePlayers(gs);
    assert.deepStrictEqual(actionable, []); // 应该返回空数组
  });

  it('单人游戏的边界情况', () => {
    const gs = makeState(1);
    const next = TurnOrderCalculator.getNextActorAfter(gs, 'p1');
    assert.strictEqual(next, null); // 单人时没有下一个玩家
  });

  it('按钮位回绕处理', () => {
    const gs = makeState(3);
    gs.players[2].status = 'FOLDED'; // p3弃牌
    gs.players[0].isDealer = true; // p1为按钮
    const next = TurnOrderCalculator.getNextActorAfter(gs, 'p2');
    assert.strictEqual(next, 'p1'); // 应该回绕到按钮位
  });
});