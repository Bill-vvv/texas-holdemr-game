import { test, describe } from 'node:test';
import assert from 'node:assert';
import PokerServer from '../../src/server/server.js';

class FakeSocket { constructor(id){ this.id=id; this.sent=[]; } emit(){/*noop*/} }

function createServerForTest() {
  const server = new PokerServer(0);
  server.TURN_TIMEOUT_MS = 50; // 加速测试
  return server;
}

function setupTwoPlayersAndStart(server) {
  const s1 = new FakeSocket('s1');
  const s2 = new FakeSocket('s2');
  const r = server.playerRegistry;
  const p1 = r.registerPlayer('s1', s1, 'A', 1000).playerId;
  const p2 = r.registerPlayer('s2', s2, 'B', 1000).playerId;
  // 将玩家加入桌面并入座
  server.lifecycle.handleJoinTable({ gameState: server.game.gameState, playerId: p1, nickname: 'A' });
  server.lifecycle.handleJoinTable({ gameState: server.game.gameState, playerId: p2, nickname: 'B' });
  server.lifecycle.handleTakeSeat({ gameState: server.game.gameState, tableRules: server.game.tableRules, playerId: p1, buyIn: 1000 });
  server.lifecycle.handleTakeSeat({ gameState: server.game.gameState, tableRules: server.game.tableRules, playerId: p2, buyIn: 1000 });
  assert.ok(server.startGame());
  return { p1, p2 };
}

describe('Turn timeout and grace logic', () => {
  test('should auto-check or fold after turn timeout', async () => {
    const server = createServerForTest();
    setupTwoPlayersAndStart(server);
    assert.equal(server.game.gameState.phase, 'PLAYING');
    const ct = server.game.gameState.currentTurn;
    assert.ok(ct);
    await new Promise(r => setTimeout(r, 120));
    assert.notEqual(server.game.gameState.currentTurn, ct);
  });

  test('should fold disconnected player on grace expiry during playing', async () => {
    const server = createServerForTest();
    const { p1 } = setupTwoPlayersAndStart(server);
    server.session.markDisconnected(p1);
    server.session.isWithinGrace = () => false; // 强制过期
    const beforeTurn = server.game.gameState.currentTurn;
    server.cleanupExpiredPlayer(p1);
    const player = server.game.gameState.getPlayer(p1);
    assert.ok(player);
    assert.equal(player.status, 'FOLDED');
    if (beforeTurn === p1) {
      assert.notEqual(server.game.gameState.currentTurn, p1);
    }
  });

  test('should remove disconnected player from table between hands', () => {
    const server = createServerForTest();
    const { p2 } = setupTwoPlayersAndStart(server);
    const settlement = server.game.endSession();
    assert.ok(settlement);
    assert.equal(server.game.gameState.phase, 'WAITING');
    server.session.markDisconnected(p2);
    const sockId = server.playerRegistry.playerSocketMap.get(p2);
    server.handlePlayerDisconnect(sockId);
    assert.equal(server.game.gameState.getPlayer(p2), null);
  });
});


