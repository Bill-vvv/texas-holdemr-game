import { describe, it } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import TableRules from '../../src/game/rules/TableRules.js';
import BlindsCollector from '../../src/game/BlindsCollector.js';

describe('BlindsCollector', () => {
  function setupThree() {
    const gs = new GameState();
    gs.addPlayer({ id: 'p1', name: 'P1', chips: 1000 });
    gs.addPlayer({ id: 'p2', name: 'P2', chips: 1000 });
    gs.addPlayer({ id: 'p3', name: 'P3', chips: 1000 });
    gs.players[1].isSmallBlind = true; // p2
    gs.players[2].isBigBlind = true;   // p3
    const rules = new TableRules({ smallBlind: 10, bigBlind: 20 });
    return { gs, rules };
  }

  // 独立验证盲注扣款、筹码不足 all-in、getBlindsInfo
  it('独立验证盲注扣款', () => {
    const { gs, rules } = setupThree();
    BlindsCollector.collectBlinds(gs, rules);
    const sb = gs.getPlayer('p2');
    const bb = gs.getPlayer('p3');
    assert.strictEqual(sb.currentBet, 10);
    assert.strictEqual(bb.currentBet, 20);
    assert.strictEqual(gs.amountToCall, 20);
  });

  it('筹码不足 all-in 处理', () => {
    const { gs, rules } = setupThree();
    const sb = gs.getPlayer('p2');
    const bb = gs.getPlayer('p3');
    sb.chips = 5; // 小盲不足
    bb.chips = 15; // 大盲不足
    BlindsCollector.collectBlinds(gs, rules);
    assert.strictEqual(sb.currentBet, 5);
    assert.strictEqual(sb.status, 'ALL_IN');
    assert.strictEqual(bb.currentBet, 15);
    assert.strictEqual(bb.status, 'ALL_IN');
  });

  it('getBlindsInfo 验证', () => {
    const { gs, rules } = setupThree();
    BlindsCollector.collectBlinds(gs, rules);
    const info = BlindsCollector.getBlindsInfo(gs, rules);
    assert.strictEqual(info.smallBlind.playerId, 'p2');
    assert.strictEqual(info.bigBlind.playerId, 'p3');
    assert.strictEqual(info.isHeadsUp, false);
  });

  it('双人局盲注处理', () => {
    const gs = new GameState();
    gs.addPlayer({ id: 'p1', name: 'P1', chips: 500 });
    gs.addPlayer({ id: 'p2', name: 'P2', chips: 500 });
    gs.players[0].isSmallBlind = true;
    gs.players[1].isBigBlind = true;
    
    const rules = new TableRules({ smallBlind: 5, bigBlind: 10 });
    BlindsCollector.collectBlinds(gs, rules);
    
    assert.strictEqual(gs.getPlayer('p1').currentBet, 5);
    assert.strictEqual(gs.getPlayer('p2').currentBet, 10);
    
    const info = BlindsCollector.getBlindsInfo(gs, rules);
    assert.strictEqual(info.isHeadsUp, true);
  });
});