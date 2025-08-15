import { createErrorMessage, createGameEventMessage, ERROR_TYPES } from '../protocol.js';
import { broadcastGameState } from './broadcast.js';
import { startTurnTimer, cancelTurnTimer } from './turnTimer.js';

export function handlePlayerAction(server, socket, payload) {
	const playerId = server.playerRegistry.getPlayerBySocket(socket.id);
	if (!playerId) {
		socket.emit('message', createErrorMessage(ERROR_TYPES.PLAYER_NOT_FOUND, '玩家未找到，请重新连接'));
		return;
	}

	const action = {
		type: payload.action,
		playerId,
		amount: payload.amount || 0
	};

	try {
		if (server.eventLogger && server.eventLogger.enabled) {
			const sessionId = server.socketToSession.get(socket.id);
			const handNumber = server.game?.gameState?.handNumber;
			server.eventLogger.appendPublicEvent(sessionId, {
				type: 'PLAYER_ACTION',
				payload: { ...payload, playerId }
			}, handNumber).catch(() => {});
		}
	} catch (_) { /* ignore */ }

	const result = server.game.applyAction(action);
	if (result.success) {
		if (result.gameEvents && result.gameEvents.length > 0) {
			handleGameEvents(server, result.gameEvents);
		}
		broadcastGameState(server);
	} else {
		socket.emit('message', createErrorMessage(result.error.error, result.error.message));
	}
}

export function handleGameEvents(server, events) {
	const currentTurnId = server.game?.gameState?.currentTurn;
	const sessionIdForLog = currentTurnId
		? server.session.playerToSession.get(currentTurnId)
		: (server.session.playerToSession.size > 0
			? Array.from(server.session.playerToSession.values())[0]
			: null);

	events.forEach(event => {
		try {
			if (server.eventLogger && server.eventLogger.enabled && sessionIdForLog) {
				const handNumber = server.game?.gameState?.handNumber;
				server.eventLogger.appendPublicEvent(sessionIdForLog, {
					type: event.type,
					payload: event
				}, handNumber).catch(() => {});
			}
		} catch (_) { /* ignore */ }

		try {
			// 在HAND_STARTED事件记录之后保存手局开始快照（公共信息）
			if (server.snapshotManager && server.snapshotManager.isEnabled() && sessionIdForLog && event.type === 'HAND_STARTED') {
				server.snapshotManager.saveHandStartSnapshot(sessionIdForLog, server.game.gameState).catch(() => {});
			}
		} catch (_) { /* ignore */ }

		server.playerRegistry.broadcastToAll(
			createGameEventMessage(event.type, event)
		);

		if (event.type === 'TURN_CHANGED') {
			cancelTurnTimer(server);
			if (event.playerId) {
				startTurnTimer(server, event.playerId);
			}
		}

		if (event.type === 'HAND_FINISHED' || event.type === 'GAME_ENDED' || event.type === 'SHOWDOWN_STARTED') {
			cancelTurnTimer(server);
		}

		if (event.type === 'HAND_FINISHED' || event.type === 'GAME_ENDED') {
			const disconnectedIds = server.game.gameState.players
				.map(p => p.id)
				.filter(pid => server.playerRegistry.isPlayerDisconnected(pid));
			if (disconnectedIds.length > 0) {
				disconnectedIds.forEach(pid => server.game.removePlayer(pid));
				broadcastGameState(server);
			}
		}
	});
}


