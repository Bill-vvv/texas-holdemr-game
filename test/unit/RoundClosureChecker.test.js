import { describe, it } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import RoundClosureChecker from '../../src/game/RoundClosureChecker.js';

describe('RoundClosureChecker', () => {
  function makeState() {
    const gs = new GameState();
    gs.phase = 'PLAYING';
    gs.addPlayer({ id: 'p1', name: 'P1', chips: 1000 });
    gs.addPlayer({ id: 'p2', name: 'P2', chips: 1000 });
    gs.addPlayer({ id: 'p3', name: 'P3', chips: 1000 });
    gs.players.forEach(p => {
      p.currentBet = 0;
      p.totalBet = 0;
      p.status = 'ACTIVE';
    });
    return gs;
  }

  // 补齐回合闭合的细粒度判定
  it('amountToCall=0 未全员行动 → 不闭合', () => {
    const gs = makeState();
    gs.amountToCall = 0;
    gs.actionHistory = [{}, {}]; // 可行动3人，但只行动了2次
    assert.strictEqual(RoundClosureChecker.isRoundClosed(gs), false);
  });

  it('不止一人可行动且未全部匹配注额 → 不闭合', () => {
    const gs = makeState();
    gs.amountToCall = 100;
    gs.players[0].currentBet = 50; // p1 未跟注
    gs.players[1].currentBet = 100; // p2 已跟注
    gs.players[2].currentBet = 100; // p3 已跟注
    assert.strictEqual(RoundClosureChecker.isRoundClosed(gs), false);
  });

  it('最后进攻者 all-in 但其他人未匹配注额 → 不闭合', () => {
    const gs = makeState();
    gs.amountToCall = 100;
    gs.lastAggressorId = 'p1';
    gs.players[0].currentBet = 80;
    gs.players[0].status = 'ALL_IN'; // p1 all-in但未达到需跟注金额
    gs.players[1].currentBet = 50; // p2 未跟注完
    gs.players[2].currentBet = 100; // p3 已跟注
    assert.strictEqual(RoundClosureChecker.isRoundClosed(gs), false);
  });

  it('所有可行动玩家都 ALL_IN → 闭合', () => {
    const gs = makeState();
    gs.amountToCall = 200;
    gs.players.forEach(p => {
      p.currentBet = p.chips; // 全部 ALL_IN
      p.status = 'ALL_IN';
    });
    gs.updateActivePlayers();
    assert.strictEqual(RoundClosureChecker.isRoundClosed(gs), true);
  });

  it('边界条件：amountToCall > 0 但所有人筹码不足只能 ALL_IN → 闭合', () => {
    const gs = makeState();
    gs.amountToCall = 500;
    gs.players.forEach(p => {
      p.chips = 200; // 筹码不足
      p.currentBet = 200; // 全部 ALL_IN
      p.status = 'ALL_IN';
    });
    gs.updateActivePlayers();
    assert.strictEqual(RoundClosureChecker.isRoundClosed(gs), true);
  });
});