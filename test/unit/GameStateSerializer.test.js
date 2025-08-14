import { describe, it } from 'node:test';
import assert from 'node:assert';
import GameState from '../../src/game/GameState.js';
import GameStateSerializer from '../../src/game/GameStateSerializer.js';

describe('GameStateSerializer', () => {
  // 快照/恢复在复杂状态下的数据完整性
  it('复杂状态序列化完整性', () => {
    const gs = new GameState();
    gs.gameId = 'complex_g1';
    gs.phase = 'PLAYING';
    gs.street = 'TURN';
    
    // 添加多个玩家，不同状态
    gs.addPlayer({ id: 'p1', name: 'Alice', chips: 500 });
    gs.addPlayer({ id: 'p2', name: 'Bob', chips: 0 });
    gs.addPlayer({ id: 'p3', name: 'Charlie', chips: 1200 });
    
    // 设置复杂的玩家状态
    gs.players[0].status = 'ACTIVE';
    gs.players[0].currentBet = 100;
    gs.players[0].totalBet = 250;
    gs.players[0].holeCards = ['AS', 'KH'];
    gs.players[0].isDealer = true;
    
    gs.players[1].status = 'ALL_IN';
    gs.players[1].currentBet = 150;
    gs.players[1].totalBet = 1000;
    gs.players[1].holeCards = ['QD', 'JC'];
    
    gs.players[2].status = 'FOLDED';
    gs.players[2].currentBet = 0;
    gs.players[2].totalBet = 50;
    gs.players[2].holeCards = null;
    
    // 复杂的游戏状态
    gs.buttonIndex = 0;
    gs.communityCards = ['AH', 'KS', 'QD', 'JC'];
    gs.pots = [{ id: 'pot_1', amount: 1200, eligiblePlayers: ['p1', 'p2', 'p3'], type: 'main' }];
    gs.totalPot = 1200;
    gs.currentTurn = 'p1';
    gs.amountToCall = 100;
    gs.lastAggressorId = 'p2';
    gs.activePlayersCount = 1;
    gs.handNumber = 15;
    
    const snap = GameStateSerializer.createSnapshot(gs);
    const gs2 = new GameState();
    GameStateSerializer.restoreFromSnapshot(gs2, snap);
    
    // 验证所有关键字段
    assert.strictEqual(gs2.gameId, 'complex_g1');
    assert.strictEqual(gs2.phase, 'PLAYING');
    assert.strictEqual(gs2.street, 'TURN');
    assert.strictEqual(gs2.players.length, 3);
    assert.strictEqual(gs2.totalPot, 1200);
    assert.strictEqual(gs2.handNumber, 15);
    
    // 验证玩家状态
    assert.strictEqual(gs2.getPlayer('p1').status, 'ACTIVE');
    assert.strictEqual(gs2.getPlayer('p2').status, 'ALL_IN');
    assert.strictEqual(gs2.getPlayer('p3').status, 'FOLDED');
    assert.deepStrictEqual(gs2.getPlayer('p1').holeCards, ['AS', 'KH']);
  });

  it('边界情况：空状态序列化', () => {
    const gs = new GameState();
    gs.gameId = 'minimal';
    gs.phase = 'WAITING';
    
    const snap = GameStateSerializer.createSnapshot(gs);
    const gs2 = new GameState();
    GameStateSerializer.restoreFromSnapshot(gs2, snap);
    
    assert.strictEqual(gs2.gameId, 'minimal');
    assert.strictEqual(gs2.phase, 'WAITING');
    assert.strictEqual(gs2.players.length, 0);
  });

  it('大量数据序列化性能', () => {
    const gs = new GameState();
    gs.gameId = 'big_game';
    
    // 添加多个玩家
    for (let i = 1; i <= 9; i++) {
      gs.addPlayer({ id: `p${i}`, name: `Player${i}`, chips: 1000 });
    }
    
    // 添加大量行动历史
    for (let i = 0; i < 50; i++) {
      gs.actionHistory.push({
        type: 'bet',
        playerId: `p${(i % 9) + 1}`,
        amount: 100
      });
    }
    
    const start = Date.now();
    const snap = GameStateSerializer.createSnapshot(gs);
    const gs2 = new GameState();
    GameStateSerializer.restoreFromSnapshot(gs2, snap);
    const end = Date.now();
    
    // 验证性能和完整性
    assert.ok(end - start < 100, '大量数据序列化应在100ms内完成');
    assert.strictEqual(gs2.players.length, 9);
    assert.strictEqual(gs2.actionHistory.length, 50);
  });
});