/**
 * 德州扑克通信协议定义
 * 统一客户端和服务端的消息格式，避免魔法字符串
 */

// 客户端到服务端的消息类型
export const CLIENT_MESSAGES = {
  // 阶段2新增：会话管理
  HELLO: 'hello',
  
  // 玩家连接相关
  JOIN_GAME: 'join_game',
  LEAVE_GAME: 'leave_game',
  
  // 游戏控制
  START_GAME: 'start_game',
  HOST_END_GAME: 'host_end_game',  // 阶段1.5新增：房主结束整局
  
  // 游戏动作
  PLAYER_ACTION: 'player_action',
  
  // 阶段2新增：生命周期操作
  TAKE_SEAT: 'take_seat',
  LEAVE_SEAT: 'leave_seat',
  LEAVE_TABLE: 'leave_table',
  ADD_ON: 'add_on',
  
  // 状态查询
  REQUEST_GAME_STATE: 'request_game_state'
};

// 服务端到客户端的消息类型
export const SERVER_MESSAGES = {
  // 连接状态
  CONNECTION_SUCCESS: 'connection_success',
  CONNECTION_ERROR: 'connection_error',
  SESSION_ACCEPTED: 'session_accepted',  // 阶段2新增：会话确认
  
  // 游戏状态
  GAME_STATE: 'game_state',
  PRIVATE_STATE: 'private_state',
  GAME_ENDED: 'game_ended',  // 阶段1.5新增：整局结束通知
  
  // 游戏事件
  GAME_EVENT: 'game_event',
  
  // 错误信息
  ACTION_ERROR: 'action_error',
  SYSTEM_ERROR: 'system_error'
};

// 玩家动作类型
export const PLAYER_ACTIONS = {
  CHECK: 'check',
  BET: 'bet',
  CALL: 'call',
  RAISE: 'raise',
  FOLD: 'fold',
  ALL_IN: 'all-in'
};

// 游戏事件类型
export const GAME_EVENTS = {
  GAME_STARTED: 'game_started',
  GAME_ENDED: 'game_ended',
  ROUND_CLOSED: 'round_closed',
  STREET_ADVANCED: 'street_advanced',
  FLOP_DEALT: 'flop_dealt',
  TURN_DEALT: 'turn_dealt',
  RIVER_DEALT: 'river_dealt',
  SHOWDOWN_STARTED: 'showdown_started',
  TURN_CHANGED: 'turn_changed',
  POTS_DISTRIBUTED: 'pots_distributed',
  HAND_FINISHED: 'hand_finished'
};

// 错误类型
export const ERROR_TYPES = {
  INVALID_ACTION: 'invalid_action',
  INSUFFICIENT_CHIPS: 'insufficient_chips',
  INVALID_AMOUNT: 'invalid_amount',
  ACTION_NOT_ALLOWED: 'action_not_allowed',
  PLAYER_NOT_FOUND: 'player_not_found',
  OUT_OF_TURN: 'out_of_turn',
  GAME_FULL: 'game_full',
  INVALID_BUY_IN: 'invalid_buy_in',
  GAME_IN_PROGRESS: 'game_in_progress',
  NOT_ROOM_HOST: 'not_room_host',
  SESSION_NOT_INITIALIZED: 'session_not_initialized',  // 阶段1.5新增：会话未初始化
  GAME_ERROR: 'game_error',
  SYSTEM_ERROR: 'system_error',
  
  // 阶段2新增：生命周期错误类型
  ONLY_IN_WAITING_STATE: 'only_in_waiting_state',
  SEAT_TAKEN: 'seat_taken',
  BUYIN_OUT_OF_RANGE: 'buyin_out_of_range',
  ADDON_OVER_MAX: 'addon_over_max',
  PLAYER_NOT_SEATED: 'player_not_seated',
  ALREADY_SEATED: 'already_seated',
  NO_SEATS_AVAILABLE: 'no_seats_available',
  INVALID_SESSION_TOKEN: 'invalid_session_token',
  SESSION_EXPIRED: 'session_expired'
};

/**
 * 验证客户端消息格式
 * @param {Object} message - 客户端消息
 * @returns {Object|null} 验证错误或null
 */
export function validateClientMessage(message) {
  if (!message || typeof message !== 'object') {
    return { error: ERROR_TYPES.SYSTEM_ERROR, message: '消息格式无效' };
  }

  if (!message.type || !Object.values(CLIENT_MESSAGES).includes(message.type)) {
    return { error: ERROR_TYPES.SYSTEM_ERROR, message: '未知的消息类型' };
  }

  // 验证JOIN_GAME消息
  if (message.type === CLIENT_MESSAGES.JOIN_GAME) {
    if (!message.payload?.playerName || !message.payload?.buyIn) {
      return { error: ERROR_TYPES.SYSTEM_ERROR, message: 'JOIN_GAME消息缺少必要参数' };
    }
  }

  // 验证PLAYER_ACTION消息
  if (message.type === CLIENT_MESSAGES.PLAYER_ACTION) {
    const { action, amount } = message.payload || {};
    
    if (!action || !Object.values(PLAYER_ACTIONS).includes(action)) {
      return { error: ERROR_TYPES.INVALID_ACTION, message: '无效的动作类型' };
    }
    
    // BET/RAISE/ALL_IN需要金额参数
    if ([PLAYER_ACTIONS.BET, PLAYER_ACTIONS.RAISE, PLAYER_ACTIONS.ALL_IN].includes(action)) {
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return { error: ERROR_TYPES.INVALID_AMOUNT, message: '无效的动作金额' };
      }
    }
  }

  // 阶段1.5新增：验证HOST_END_GAME消息
  if (message.type === CLIENT_MESSAGES.HOST_END_GAME) {
    // HOST_END_GAME消息不需要额外参数验证
    // 房主权限由服务端处理
  }

  // 阶段2新增：验证HELLO消息
  if (message.type === CLIENT_MESSAGES.HELLO) {
    // sessionToken是可选的，可以为空
    const { sessionToken } = message.payload || {};
    if (sessionToken && typeof sessionToken !== 'string') {
      return { error: ERROR_TYPES.INVALID_SESSION_TOKEN, message: '会话令牌格式无效' };
    }
  }

  // 阶段2新增：验证TAKE_SEAT消息
  if (message.type === CLIENT_MESSAGES.TAKE_SEAT) {
    const { buyIn } = message.payload || {};
    if (typeof buyIn !== 'number' || buyIn <= 0) {
      return { error: ERROR_TYPES.SYSTEM_ERROR, message: 'TAKE_SEAT消息缺少必要参数: buyIn' };
    }
  }

  // 阶段2新增：验证LEAVE_SEAT消息
  if (message.type === CLIENT_MESSAGES.LEAVE_SEAT) {
    // LEAVE_SEAT消息不需要额外参数
  }

  // 阶段2新增：验证LEAVE_TABLE消息
  if (message.type === CLIENT_MESSAGES.LEAVE_TABLE) {
    // LEAVE_TABLE消息不需要额外参数
  }

  // 阶段2新增：验证ADD_ON消息
  if (message.type === CLIENT_MESSAGES.ADD_ON) {
    const { amount } = message.payload || {};
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return { error: ERROR_TYPES.INVALID_AMOUNT, message: '增购金额必须为正数' };
    }
  }

  return null; // 验证通过
}

/**
 * 创建标准的服务端响应消息
 * @param {string} type - 消息类型
 * @param {Object} data - 消息数据
 * @returns {Object} 格式化的消息
 */
export function createServerMessage(type, data = {}) {
  return {
    type,
    data,
    timestamp: Date.now()
  };
}

/**
 * 创建错误响应消息
 * @param {string} error - 错误类型
 * @param {string} message - 错误描述
 * @returns {Object} 错误消息
 */
export function createErrorMessage(error, message) {
  return createServerMessage(SERVER_MESSAGES.ACTION_ERROR, {
    error,
    message
  });
}

/**
 * 创建游戏事件消息
 * @param {string} eventType - 事件类型
 * @param {Object} eventData - 事件数据
 * @returns {Object} 事件消息
 */
export function createGameEventMessage(eventType, eventData = {}) {
  return createServerMessage(SERVER_MESSAGES.GAME_EVENT, {
    event: eventType,
    ...eventData
  });
}