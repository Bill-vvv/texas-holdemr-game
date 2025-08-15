import { createServerMessage, createErrorMessage, SERVER_MESSAGES, ERROR_TYPES } from '../protocol.js';

export function handlePlayerJoin(server, socket, payload) {
	const { playerName, buyIn } = payload;

	const registrationResult = server.playerRegistry.registerPlayer(
		socket.id, socket, playerName, buyIn
	);

	if (!registrationResult.success) {
		socket.emit('message', registrationResult.error);
		return;
	}

	try {
		const staleIds = (server.game.gameState.players || [])
			.filter(p => p.name === playerName && p.id !== registrationResult.playerId)
			.filter(p => !server.playerRegistry.isPlayerOnline(p.id))
			.filter(p => !server.session.isWithinGrace(p.id))
			.filter(p => p.status === 'SITTING_OUT' && (p.chips || 0) === 0)
			.map(p => p.id);
		if (staleIds.length > 0) {
			staleIds.forEach(pid => server.game.gameState.removePlayer(pid));
		}
	} catch { /* ignore */ }

	try {
		const sid = server.socketToSession.get(socket.id);
		if (sid) {
			server.session.bindSessionToPlayer(sid, registrationResult.playerId, socket.id);
		} else {
			const ensured = server.session.ensureSession();
			server.session.bindSessionToPlayer(ensured.sessionId, registrationResult.playerId, socket.id);
			server.socketToSession.set(socket.id, ensured.sessionId);
		}
	} catch (e) {
		console.warn('绑定会话到玩家失败（将继续流程）:', e && e.message ? e.message : e);
	}

	const joinResult = server.lifecycle.handleJoinTable({
		gameState: server.game.gameState,
		playerId: registrationResult.playerId,
		nickname: playerName
	});

	if (!joinResult.success) {
		server.playerRegistry.unregisterPlayer(socket.id);
		socket.emit('message', createErrorMessage(
			joinResult.error.code || ERROR_TYPES.GAME_ERROR,
			joinResult.error.message || '无法加入游戏，请稍后重试'
		));
		return;
	}

	socket.emit('message', createServerMessage(SERVER_MESSAGES.CONNECTION_SUCCESS, {
		playerId: registrationResult.playerId,
		playerName: playerName,
		isRoomHost: registrationResult.isRoomHost,
		roomHostId: server.playerRegistry.getRoomHostId()
	}));

	console.log(`玩家 ${playerName} (${registrationResult.playerId}) 加入游戏`);
	server.broadcastGameState();
}


