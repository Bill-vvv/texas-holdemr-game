import { SERVER_MESSAGES, createServerMessage } from '../protocol.js';

export function sendGameStateToPlayer(server, socket, playerId) {
	const publicState = server.game.getPublicState();
	publicState.roomHostId = server.playerRegistry.getRoomHostId();
	socket.emit('message', createServerMessage(SERVER_MESSAGES.GAME_STATE, publicState));

	const privateState = server.game.getPrivateStateFor(playerId);
	if (privateState.holeCards) {
		socket.emit('message', createServerMessage(SERVER_MESSAGES.PRIVATE_STATE, privateState));
	}
}

export function broadcastGameState(server) {
	const publicState = server.game.getPublicState();
	publicState.roomHostId = server.playerRegistry.getRoomHostId();
	if (typeof server.playerRegistry.getDisconnectedPlayerIds === 'function') {
		publicState.disconnectedPlayerIds = server.playerRegistry.getDisconnectedPlayerIds();
	}

	const publicMessage = createServerMessage(SERVER_MESSAGES.GAME_STATE, publicState);
	server.playerRegistry.broadcastToAll(publicMessage);

	server.playerRegistry.getActivePlayerIds().forEach(playerId => {
		const privateState = server.game.getPrivateStateFor(playerId);
		if (privateState.holeCards) {
			const privateMessage = createServerMessage(SERVER_MESSAGES.PRIVATE_STATE, privateState);
			server.playerRegistry.sendToPlayer(playerId, privateMessage);
		}
	});
}


