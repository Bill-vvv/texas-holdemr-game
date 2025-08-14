import { describe, it } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import PositionHelper from '../../src/game/PositionHelper.js';

describe('PositionHelper', () => {
  function makeState() {
    const gs = new GameState();
    gs.addPlayer({ id: 'p1', name: 'P1', chips: 1000 });
    gs.addPlayer({ id: 'p2', name: 'P2', chips: 1000 });
    gs.addPlayer({ id: 'p3', name: 'P3', chips: 1000 });
    return gs;
  }

  // 补齐 getNextActivePlayer 的跳过逻辑、按钮回绕、双人/多人盲注定位
  it('getNextActivePlayer 跳过坐出与弃牌玩家', () => {
    const gs = makeState();
    gs.players[1].status = 'SITTING_OUT';
    const next = PositionHelper.getNextActivePlayer(gs, 'p1');
    assert.strictEqual(next, 'p3'); // 应该跳过p2
  });

  it('按钮回绕处理', () => {
    const gs = makeState();
    gs.buttonIndex = 10; // 超出范围
    PositionHelper.setButtonPosition(gs);
    assert.strictEqual(gs.buttonIndex, 0); // 应该回绕到0
    assert.strictEqual(gs.players[0].isDealer, true);
  });

  it('双人局盲注定位：按钮即小盲', () => {
    const gs = new GameState();
    gs.addPlayer({ id: 'p1', name: 'P1', chips: 1000 });
    gs.addPlayer({ id: 'p2', name: 'P2', chips: 1000 });
    gs.players[0].isDealer = true;
    PositionHelper.setHeadsUpBlinds(gs);
    assert.strictEqual(gs.players[0].isSmallBlind, true);
    assert.strictEqual(gs.players[1].isBigBlind, true);
  });

  it('多人局盲注定位：按钮左侧为小盲，再左侧为大盲', () => {
    const gs = makeState();
    gs.players[0].isDealer = true; // p1 按钮
    PositionHelper.setMultiPlayerBlinds(gs);
    assert.strictEqual(gs.getPlayer('p2').isSmallBlind, true);
    assert.strictEqual(gs.getPlayer('p3').isBigBlind, true);
  });

  it('getNextActivePlayer 全部跳过后回绕到起始玩家', () => {
    const gs = makeState();
    gs.addPlayer({ id: 'p4', name: 'P4', chips: 1000 });
    gs.players[1].status = 'FOLDED'; // p2
    gs.players[2].status = 'ALL_IN'; // p3
    gs.players[3].status = 'SITTING_OUT'; // p4
    const next = PositionHelper.getNextActivePlayer(gs, 'p1');
    assert.strictEqual(next, 'p1'); // 所有人都跳过，回到自己
  });

  it('处理不存在的起始玩家', () => {
    const gs = makeState();
    const next = PositionHelper.getNextActivePlayer(gs, 'nonexistent');
    assert.strictEqual(next, 'p1'); // 不存在时返回第一个活跃玩家
  });
});