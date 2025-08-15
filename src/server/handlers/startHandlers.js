import { createErrorMessage, createGameEventMessage, ERROR_TYPES, GAME_EVENTS } from '../protocol.js';

export function handleStartGame(server, socket) {
  const playerId = server.playerRegistry.getPlayerBySocket(socket.id);
  if (!playerId) {
    socket.emit('message', createErrorMessage(
      ERROR_TYPES.PLAYER_NOT_FOUND,
      '玩家未找到'
    ));
    return;
  }

  if (!server.playerRegistry.isRoomHost(playerId)) {
    socket.emit('message', createErrorMessage(
      ERROR_TYPES.NOT_ROOM_HOST,
      '只有房主可以开始游戏'
    ));
    return;
  }

  const gameState = server.game.getPublicState();
  if (gameState.phase !== 'WAITING') {
    socket.emit('message', createErrorMessage(
      ERROR_TYPES.GAME_IN_PROGRESS,
      '游戏已在进行中'
    ));
    return;
  }

  if (gameState.players.length < 2) {
    socket.emit('message', createErrorMessage(
      ERROR_TYPES.ACTION_NOT_ALLOWED,
      '至少需要2个玩家才能开始游戏'
    ));
    return;
  }

  const success = startGame(server);
  if (success) {
    console.log(`房主 ${playerId} 开始了游戏`);
  } else {
    socket.emit('message', createErrorMessage(
      ERROR_TYPES.GAME_ERROR,
      '开始游戏失败，请稍后重试'
    ));
  }
}

export function startGame(server) {
  const gameState = server.game.getPublicState();
  console.log('startGame调试信息:');
  console.log('- phase:', gameState.phase);
  console.log('- players.length:', gameState.players.length);
  console.log('- 条件检查: phase === WAITING:', gameState.phase === 'WAITING');
  console.log('- 条件检查: players.length >= 2:', gameState.players.length >= 2);

  if (gameState.phase === 'WAITING' && gameState.players.length >= 2) {
    console.log('尝试调用startNewHand...');
    const startResult = server.game.startNewHand();
    console.log('startNewHand返回:', startResult);

    if (startResult) {
      // 记录HAND_STARTED事件（用于事件日志与快照时机）
      try {
        const hn = server.game?.gameState?.handNumber;
        server.handleGameEvents([{ type: 'HAND_STARTED', handNumber: hn }]);
      } catch (_) { /* ignore */ }

      console.log('新一轮游戏开始！');
      server.playerRegistry.broadcastToAll(
        createGameEventMessage(GAME_EVENTS.GAME_STARTED)
      );
      server.broadcastGameState();
      const ct = server.game.gameState.currentTurn;
      if (ct) {
        server._cancelTurnTimer();
        server._startTurnTimerFor(ct);
      }
      return true;
    } else {
      console.log('startNewHand返回false，游戏启动失败');
    }
  } else {
    console.log('启动游戏条件不满足');
  }
  return false;
}


