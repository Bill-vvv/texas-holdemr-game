import { PLAYER_ACTIONS } from '../protocol.js';
import TurnManager from '../../game/TurnManager.js';

export function startTurnTimer(server, playerId) {
	if (!playerId) return;
	if (!server.game || server.game.gameState.phase !== 'PLAYING') return;
	server.turnPlayerId = playerId;
	server.turnDeadlineAt = Date.now() + server.TURN_TIMEOUT_MS;
	server.turnTimer = setTimeout(() => handleTurnTimeout(server, playerId), server.TURN_TIMEOUT_MS);
}

export function cancelTurnTimer(server) {
	if (server.turnTimer) {
		clearTimeout(server.turnTimer);
		server.turnTimer = null;
		server.turnPlayerId = null;
		server.turnDeadlineAt = null;
	}
}

export function handleTurnTimeout(server, expectedPlayerId) {
	try {
		const gameState = server.game && server.game.gameState;
		if (!gameState || gameState.phase !== 'PLAYING') return;
		if (gameState.currentTurn !== expectedPlayerId) return;

		const player = gameState.getPlayer(expectedPlayerId);
		if (!player) return;

		const amountToCall = gameState.amountToCall || 0;
		const currentBet = player.currentBet || 0;
		const callCost = Math.max(0, amountToCall - currentBet);
		const canCheck = callCost === 0;

		const actionType = canCheck ? PLAYER_ACTIONS.CHECK : PLAYER_ACTIONS.FOLD;
		const result = server.game.applyAction({ type: actionType, playerId: expectedPlayerId });

		if (result && result.success) {
			if (result.gameEvents && result.gameEvents.length > 0) {
				server.handleGameEvents(result.gameEvents);
			}
			server.broadcastGameState();
		}
	} catch (e) {
		console.warn('回合超时自动处理失败:', e && e.message ? e.message : e);
	} finally {
		cancelTurnTimer(server);
	}
}


