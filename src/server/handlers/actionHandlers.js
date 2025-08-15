import { createErrorMessage, createGameEventMessage, ERROR_TYPES } from '../protocol.js';
import { broadcastGameState } from './broadcast.js';
import { startTurnTimer, cancelTurnTimer } from './turnTimer.js';
import { normalizeEventType } from '../protocol.js';

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

		// 事件类型归一化为协议定义（小写）
		event.type = normalizeEventType(event.type);

		if (event.type === 'turn_changed') {
			cancelTurnTimer(server);
			if (event.playerId) {
				startTurnTimer(server, event.playerId);
			}
			// 注入服务端真实截止时间，供前端对时展示
			event.deadlineAt = server.turnDeadlineAt;
		}

		if (event.type === 'hand_finished' || event.type === 'game_ended' || event.type === 'showdown_started') {
			cancelTurnTimer(server);
		}

		if (event.type === 'hand_finished' || event.type === 'game_ended') {
			const disconnectedIds = server.game.gameState.players
				.map(p => p.id)
				.filter(pid => server.playerRegistry.isPlayerDisconnected(pid));
			if (disconnectedIds.length > 0) {
				disconnectedIds.forEach(pid => server.game.removePlayer(pid));
				broadcastGameState(server);
			}
		}

		// 广播在处理所有副作用之后进行（确保携带 deadlineAt 等字段）
		server.playerRegistry.broadcastToAll(
			createGameEventMessage(event.type, event)
		);
	});
}


