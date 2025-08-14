import assert from 'assert';
import PokerServer from '../../src/server/server.js';

// 简化的端到端流程测试（不真正通过Socket.IO）
describe('Integration: turn timeout flow', () => {
  it('should auto-progress on timeout and remove disconnected between hands', async () => {
    const server = new PokerServer(0);
    server.TURN_TIMEOUT_MS = 50;

    // 注册两人并开始
    const reg = server.playerRegistry;
    const s1 = { emit(){} };
    const s2 = { emit(){} };
    const p1 = reg.registerPlayer('s1', s1, 'A', 1000).playerId;
    const p2 = reg.registerPlayer('s2', s2, 'B', 1000).playerId;
    assert.ok(server.startGame());

    const ct = server.game.gameState.currentTurn;
    assert.ok(ct);

    // 等待超时推进
    await new Promise(r => setTimeout(r, 120));
    assert.notEqual(server.game.gameState.currentTurn, ct);

    // 结束整局以进入局间
    server.game.endSession();
    assert.equal(server.game.gameState.phase, 'WAITING');

    // 标记p2断线，局间应立即移除
    server.session.markDisconnected(p2);
    server.handlePlayerDisconnect(reg.playerSocketMap.get(p2));
    assert.strictEqual(server.game.gameState.getPlayer(p2), null);
  });
});


