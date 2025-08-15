import { CLIENT_MESSAGES } from './protocol.js';

export function createMessageHandlers(server) {
	return {
		[CLIENT_MESSAGES.HELLO]: (socket, payload) => server.handleHello(socket, payload),
		[CLIENT_MESSAGES.JOIN_GAME]: (socket, payload) => server.handlePlayerJoin(socket, payload),
		[CLIENT_MESSAGES.START_GAME]: (socket) => server.handleStartGame(socket),
		[CLIENT_MESSAGES.PLAYER_ACTION]: (socket, payload) => server.handlePlayerAction(socket, payload),
		[CLIENT_MESSAGES.REQUEST_GAME_STATE]: (socket) => server.handleGameStateRequest(socket),
		[CLIENT_MESSAGES.LEAVE_GAME]: (socket) => server.handlePlayerLeave(socket.id),
		[CLIENT_MESSAGES.HOST_END_GAME]: (socket) => server.handleHostEndGame(socket),
		[CLIENT_MESSAGES.TAKE_SEAT]: (socket, payload) => server.handleTakeSeat(socket, payload),
		[CLIENT_MESSAGES.LEAVE_SEAT]: (socket, payload) => server.handleLeaveSeat(socket, payload),
		[CLIENT_MESSAGES.LEAVE_TABLE]: (socket, payload) => server.handleLeaveTable(socket, payload),
		[CLIENT_MESSAGES.ADD_ON]: (socket, payload) => server.handleAddOn(socket, payload)
	};
}


