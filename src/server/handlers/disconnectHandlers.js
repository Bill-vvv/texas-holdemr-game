import TurnManager from '../../game/TurnManager.js';

export function handlePlayerDisconnect(server, socketId) {
  const playerId = server.playerRegistry.getPlayerBySocket(socketId);
  if (playerId) {
    server.session.markDisconnected(playerId);
    server.playerRegistry.markPlayerDisconnected(playerId);

    console.log(`玩家 ${playerId} 断线，开始宽限期`);

    setTimeout(() => {
      cleanupExpiredPlayer(server, playerId);
    }, 5 * 60 * 1000);

    const gameState = server.game.gameState;
    if (gameState && gameState.phase !== 'PLAYING') {
      server.game.removePlayer(playerId);
      server.broadcastGameState();
    }
  }
}

export function cleanupExpiredPlayer(server, playerId) {
  if (!server.session.isWithinGrace(playerId)) {
    console.log(`玩家 ${playerId} 宽限期到期，执行清理`);

    const gameState = server.game.gameState;
    const isPlaying = gameState && gameState.phase === 'PLAYING';
    const wasCurrentTurn = isPlaying && gameState.currentTurn === playerId;

    if (isPlaying) {
      try {
        if (wasCurrentTurn) {
          const result = server.game.applyAction({ type: 'fold', playerId });
          if (result && result.success && result.gameEvents && result.gameEvents.length > 0) {
            server.handleGameEvents(result.gameEvents);
          } else {
            const player = gameState.getPlayer(playerId);
            if (player) {
              player.status = 'FOLDED';
              gameState.updateActivePlayers();
              TurnManager.advanceToNextActor(gameState);
              server.handleGameEvents([{ type: 'TURN_CHANGED', playerId: gameState.currentTurn }]);
            }
          }
        } else {
          const player = gameState.getPlayer(playerId);
          if (player) {
            player.status = 'FOLDED';
            gameState.updateActivePlayers();
          }
        }
      } catch (e) {
        console.warn(`清理玩家 ${playerId} 时自动弃牌失败:`, e && e.message ? e.message : e);
      }

      server.broadcastGameState();
    } else {
      server.game.removePlayer(playerId);
      server.broadcastGameState();
    }

    server.session.unbindPlayer(playerId);
    server.playerRegistry.unregisterPlayerById(playerId);
  }
}


