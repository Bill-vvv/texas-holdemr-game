/**
 * 德州扑克客户端JavaScript
 * 处理WebSocket通信、UI更新和用户交互
 */

class PokerClient {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.playerName = null;
    this.gameState = null;
    this.privateState = null;
    this.isRoomHost = false;
    this.roomHostId = null;
    
    this.initializeSocket();
  }

  /**
   * 初始化Socket连接
   */
  initializeSocket() {
    this.socket = io();
    
    // 连接状态处理
    this.socket.on('connect', () => {
      this.updateConnectionStatus('connecting', '连接中...');
      console.log('已连接到服务器');
    });

    this.socket.on('disconnect', () => {
      this.updateConnectionStatus('disconnected', '连接断开');
      console.log('与服务器断开连接');
    });

    // 消息处理
    this.socket.on('message', (message) => {
      this.handleServerMessage(message);
    });
  }

  /**
   * 处理服务器消息
   */
  handleServerMessage(message) {
    console.log('收到服务器消息:', message);

    switch (message.type) {
      case 'connection_success':
        this.handleConnectionSuccess(message.data);
        break;

      case 'connection_error':
        this.handleConnectionError(message.data);
        break;

      case 'game_state':
        this.handleGameState(message.data);
        break;

      case 'private_state':
        this.handlePrivateState(message.data);
        break;

      case 'game_event':
        this.handleGameEvent(message.data);
        break;

      case 'action_error':
        this.handleActionError(message.data);
        break;

      case 'game_ended':  // 阶段1.5新增
        this.handleGameEnded(message.data);
        break;

      default:
        console.warn('未知消息类型:', message.type);
    }
  }

  /**
   * 处理连接成功
   */
  handleConnectionSuccess(data) {
    this.playerId = data.playerId;
    this.playerName = data.playerName;
    this.isRoomHost = data.isRoomHost || false;
    this.roomHostId = data.roomHostId;
    
    this.updateConnectionStatus('connected', `已连接: ${data.playerName}${this.isRoomHost ? ' (房主)' : ''}`);
    
    // 隐藏加入表单，显示游戏界面
    document.getElementById('joinForm').style.display = 'none';
    document.getElementById('gameInterface').style.display = 'block';
    
    this.addLogEntry(`成功加入游戏，欢迎 ${data.playerName}！${this.isRoomHost ? ' 您是房主。' : ''}`, 'success');
  }

  /**
   * 处理连接错误
   */
  handleConnectionError(data) {
    this.showJoinError(data.message);
    this.updateConnectionStatus('disconnected', '连接失败');
  }

  /**
   * 处理游戏状态更新
   */
  handleGameState(gameState) {
    this.gameState = gameState;
    
    // 更新房主信息
    if (gameState.roomHostId) {
      this.roomHostId = gameState.roomHostId;
      this.isRoomHost = this.playerId === gameState.roomHostId;
    }
    
    this.updateGameInterface();
  }

  /**
   * 处理私有状态（手牌）
   */
  handlePrivateState(privateState) {
    this.privateState = privateState;
    this.updateMyCards();
  }

  /**
   * 处理游戏事件
   */
  handleGameEvent(eventData) {
    const eventMessages = {
      'game_started': '🎮 新一轮游戏开始！',
      'game_ended': '🏁 游戏结束',
      'round_closed': '⏭️ 本轮下注结束',
      'street_advanced': `📋 进入 ${eventData.newStreet} 街道`,
      'flop_dealt': `🃏 翻牌: ${eventData.cards ? eventData.cards.join(' ') : ''}`,
      'turn_dealt': `🃏 转牌: ${eventData.card || ''}`,
      'river_dealt': `🃏 河牌: ${eventData.card || ''}`,
      'showdown_started': '🔍 摊牌开始',
      'turn_changed': `👤 轮到 ${eventData.playerId} 行动`,
      'pots_distributed': '💰 彩池分配完成',
      'hand_finished': '✅ 本手牌结束'
    };

    const message = eventMessages[eventData.event] || `事件: ${eventData.event}`;
    this.addLogEntry(message, 'event');
  }

  /**
   * 处理动作错误
   */
  handleActionError(error) {
    this.addLogEntry(`❌ 动作无效: ${error.message}`, 'error');
    this.showActionError(error.message);
  }

  /**
   * 阶段1.5新增：处理整局结束
   */
  handleGameEnded(finalSettlement) {
    console.log('整局结束:', finalSettlement);
    this.addLogEntry('🏁 整局结束！正在显示结算...', 'event');
    
    // 显示结算界面
    this.updateSettlementResults(finalSettlement);
    
    // 隐藏其他界面元素
    document.getElementById('showdownSummary').style.display = 'none';
  }

  /**
   * 加入游戏
   */
  joinGame() {
    const playerName = document.getElementById('playerName').value.trim();
    const buyInAmount = parseInt(document.getElementById('buyInAmount').value);

    if (!playerName) {
      this.showJoinError('请输入玩家名称');
      return;
    }

    if (!buyInAmount || buyInAmount < 800 || buyInAmount > 2000) {
      this.showJoinError('买入金额必须在800-2000之间');
      return;
    }

    // 发送加入游戏请求
    this.sendMessage({
      type: 'join_game',
      payload: {
        playerName: playerName,
        buyIn: buyInAmount
      }
    });

    this.updateConnectionStatus('connecting', '加入中...');
  }

  /**
   * 开始游戏（房主功能）
   */
  startGame() {
    if (!this.isRoomHost) {
      this.addLogEntry('只有房主可以开始游戏', 'error');
      return;
    }

    if (!this.gameState || this.gameState.phase !== 'WAITING') {
      this.addLogEntry('游戏状态不正确，无法开始', 'error');
      return;
    }

    // 发送开始游戏消息
    this.sendMessage({
      type: 'start_game'
    });

    this.addLogEntry('正在开始游戏...', 'info');
  }

  /**
   * 阶段1.5新增：结束整局（房主功能）
   */
  endGame() {
    if (!this.isRoomHost) {
      this.addLogEntry('只有房主可以结束整局', 'error');
      return;
    }

    if (!confirm('确定要结束整局吗？这将显示最终结算并结束当前会话。')) {
      return;
    }

    // 发送结束整局消息
    this.sendMessage({
      type: 'host_end_game',
      payload: {}
    });

    this.addLogEntry('正在结束整局...', 'info');
  }

  /**
   * 执行游戏动作
   */
  performAction(action) {
    if (!this.gameState || !this.playerId) {
      this.addLogEntry('游戏未就绪，无法执行动作', 'error');
      return;
    }

    if (this.gameState.currentTurn !== this.playerId) {
      this.addLogEntry('还没轮到您行动', 'error');
      return;
    }

    let amount = 0;
    
    // 对于需要金额的动作，获取输入值
    if (['bet', 'raise', 'all-in'].includes(action)) {
      const betInput = document.getElementById('betAmount');
      amount = parseInt(betInput.value) || 0;
      
      if (action === 'all-in') {
        // all-in使用当前玩家的所有筹码
        const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (myPlayer) {
          amount = myPlayer.chips;
        }
      }
      
      if (amount <= 0 && action !== 'all-in') {
        this.addLogEntry('请输入有效的金额', 'error');
        return;
      }
      
      // 清空输入框
      betInput.value = '';
    }

    // 发送动作
    this.sendMessage({
      type: 'player_action',
      payload: {
        action: action,
        amount: amount
      }
    });

    this.addLogEntry(`执行动作: ${this.getActionText(action, amount)}`, 'action');
  }

  /**
   * 获取动作的中文描述
   */
  getActionText(action, amount) {
    const actionTexts = {
      'fold': '弃牌',
      'check': '过牌',
      'call': '跟注',
      'bet': `下注 ${amount}`,
      'raise': `加注到 ${amount}`,
      'all-in': `全押 ${amount}`
    };
    
    return actionTexts[action] || action;
  }

  /**
   * 发送消息到服务器
   */
  sendMessage(message) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('message', message);
    } else {
      this.addLogEntry('连接已断开，无法发送消息', 'error');
    }
  }

  /**
   * 更新游戏界面
   */
  updateGameInterface() {
    if (!this.gameState) return;

    // 更新游戏信息
    document.getElementById('currentStreet').textContent = this.getStreetText(this.gameState.street);
    document.getElementById('totalPot').textContent = this.gameState.pots?.totalAmount || 0;
    document.getElementById('currentTurn').textContent = this.getCurrentTurnText();
    document.getElementById('amountToCall').textContent = this.gameState.amountToCall || 0;

    // 更新公共牌
    this.updateCommunityCards();

    // 更新玩家信息
    this.updatePlayersTable();

    // 更新动作按钮
    this.updateActionButtons();

    // 阶段1.5：更新摊牌摘要显示
    this.updateShowdownSummary();
  }

  /**
   * 获取街道中文名称
   */
  getStreetText(street) {
    const streetTexts = {
      'PRE_FLOP': '翻牌前',
      'FLOP': '翻牌',
      'TURN': '转牌',  
      'RIVER': '河牌',
      'SHOWDOWN': '摊牌'
    };
    return streetTexts[street] || street;
  }

  /**
   * 获取当前行动者显示文本
   */
  getCurrentTurnText() {
    if (!this.gameState.currentTurn) return '-';
    
    const player = this.gameState.players.find(p => p.id === this.gameState.currentTurn);
    return player ? player.name : this.gameState.currentTurn;
  }

  /**
   * 更新公共牌显示
   */
  updateCommunityCards() {
    const container = document.getElementById('communityCards');
    container.innerHTML = '';

    if (this.gameState.communityCards && this.gameState.communityCards.length > 0) {
      this.gameState.communityCards.forEach(card => {
        const cardElement = this.createCardElement(card);
        container.appendChild(cardElement);
      });
    } else {
      container.innerHTML = '<div class="card">等待发牌...</div>';
    }
  }

  /**
   * 更新我的手牌显示
   */
  updateMyCards() {
    const container = document.getElementById('myCards');
    container.innerHTML = '';

    if (this.privateState && this.privateState.holeCards && this.privateState.holeCards.length > 0) {
      this.privateState.holeCards.forEach(card => {
        const cardElement = this.createCardElement(card);
        container.appendChild(cardElement);
      });
    } else {
      container.innerHTML = '<div class="card">等待发牌...</div>';
    }
  }

  /**
   * 更新玩家表格
   */
  updatePlayersTable() {
    const container = document.getElementById('playersTable');
    container.innerHTML = '';

    if (this.gameState.players) {
      this.gameState.players.forEach(player => {
        const playerElement = this.createPlayerElement(player);
        container.appendChild(playerElement);
      });
    }
  }

  /**
   * 创建牌的HTML元素
   */
  createCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    
    // 判断花色颜色
    if (card.includes('H') || card.includes('D')) {
      cardElement.classList.add('red');
    }
    
    // 显示牌面
    cardElement.textContent = this.formatCard(card);
    
    return cardElement;
  }

  /**
   * 格式化牌面显示
   */
  formatCard(card) {
    const suitSymbols = {
      'S': '♠',
      'H': '♥',
      'D': '♦',
      'C': '♣'
    };
    
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    
    return rank + (suitSymbols[suit] || suit);
  }

  /**
   * 创建玩家元素
   */
  createPlayerElement(player) {
    const playerElement = document.createElement('div');
    playerElement.className = 'player';
    
    // 如果是当前行动者，添加高亮
    if (this.gameState.currentTurn === player.id) {
      playerElement.classList.add('current-turn');
    }

    playerElement.innerHTML = `
      <div class="player-name">${player.name} ${player.id === this.playerId ? '(我)' : ''}</div>
      <div class="player-chips">筹码: ${player.chips}</div>
      <div class="player-bet">本街下注: ${player.currentBet || 0}</div>
      <div class="player-status">状态: ${this.getPlayerStatusText(player.status)}</div>
      ${this.getPlayerPositionText(player)}
    `;

    return playerElement;
  }

  /**
   * 获取玩家状态文本
   */
  getPlayerStatusText(status) {
    const statusTexts = {
      'ACTIVE': '游戏中',
      'FOLDED': '已弃牌',
      'ALL_IN': '全押',
      'SITTING_OUT': '坐出'
    };
    return statusTexts[status] || status;
  }

  /**
   * 获取玩家位置信息
   */
  getPlayerPositionText(player) {
    const positions = [];
    if (player.isDealer) positions.push('庄家');
    if (player.isSmallBlind) positions.push('小盲');
    if (player.isBigBlind) positions.push('大盲');
    
    return positions.length > 0 ? 
      `<div class="player-position">位置: ${positions.join(', ')}</div>` : '';
  }

  /**
   * 更新动作按钮状态
   */
  updateActionButtons() {
    const isMyTurn = this.gameState && this.gameState.currentTurn === this.playerId;
    const amountToCall = this.gameState ? this.gameState.amountToCall : 0;
    const myPlayer = this.gameState ? 
      this.gameState.players.find(p => p.id === this.playerId) : null;
    
    // 获取按钮元素
    const checkBtn = document.getElementById('checkBtn');
    const callBtn = document.getElementById('callBtn');
    const betBtn = document.getElementById('betBtn');
    const raiseBtn = document.getElementById('raiseBtn');
    const allinBtn = document.getElementById('allinBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    
    // 所有游戏动作按钮默认禁用
    const gameButtons = [checkBtn, callBtn, betBtn, raiseBtn, allinBtn];
    gameButtons.forEach(btn => {
      btn.disabled = !isMyTurn;
      btn.style.display = 'inline-block';
    });

    // 检查是否是等待状态
    if (this.gameState && this.gameState.phase === 'WAITING') {
      // 隐藏游戏动作按钮
      gameButtons.forEach(btn => {
        btn.style.display = 'none';
      });

      // 显示/隐藏开始游戏按钮
      if (startGameBtn) {
        if (this.isRoomHost) {
          startGameBtn.style.display = 'inline-block';
          startGameBtn.disabled = this.gameState.players.length < 2;
        } else {
          startGameBtn.style.display = 'none';
        }
      }
    } else {
      // 游戏进行中，隐藏开始游戏按钮
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
      }

      // 显示游戏动作按钮
      if (isMyTurn && myPlayer) {
        // 根据游戏状态启用相应按钮
        if (amountToCall === 0 || (myPlayer.currentBet >= amountToCall)) {
          // 可以过牌
          checkBtn.disabled = false;
        } else {
          checkBtn.disabled = true;
        }

        if (amountToCall > myPlayer.currentBet) {
          // 需要跟注
          callBtn.disabled = false;
          callBtn.textContent = `跟注 ${amountToCall - myPlayer.currentBet}`;
        } else {
          callBtn.disabled = true;
          callBtn.textContent = '跟注';
        }

        // 下注按钮
        if (amountToCall === 0) {
          betBtn.disabled = false;
          betBtn.textContent = '下注';
        } else {
          betBtn.disabled = true;
        }

        // 加注按钮
        if (amountToCall > 0) {
          raiseBtn.disabled = false;
          raiseBtn.textContent = '加注';
        } else {
          raiseBtn.disabled = true;
        }

        // 全押按钮
        allinBtn.disabled = myPlayer.chips <= 0;
      }
    }

    // 阶段1.5：显示/隐藏结束整局按钮（房主功能）
    const endGameBtn = document.getElementById('endGameBtn');
    if (endGameBtn) {
      if (this.isRoomHost && this.gameState.phase === 'PLAYING') {
        endGameBtn.style.display = 'inline-block';
      } else {
        endGameBtn.style.display = 'none';
      }
    }

    // 更新帮助文本
    const helpElement = document.getElementById('actionHelp');
    if (this.gameState && this.gameState.phase === 'WAITING') {
      if (this.isRoomHost) {
        if (this.gameState.players.length < 2) {
          helpElement.textContent = '等待更多玩家加入（至少需要2人）...';
        } else {
          helpElement.textContent = '点击"开始游戏"按钮开始新一轮';
        }
      } else {
        helpElement.textContent = '等待房主开始游戏...';
      }
    } else if (isMyTurn) {
      helpElement.textContent = '轮到您行动，请选择动作';
    } else {
      helpElement.textContent = '等待其他玩家行动...';
    }
  }

  /**
   * 更新连接状态显示
   */
  updateConnectionStatus(status, text) {
    const statusElement = document.getElementById('connectionStatus');
    statusElement.className = `connection-status ${status}`;
    statusElement.textContent = text;
  }

  /**
   * 显示加入游戏错误
   */
  showJoinError(message) {
    const errorElement = document.getElementById('joinError');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }

  /**
   * 显示动作错误
   */
  showActionError(message) {
    // 临时显示错误信息
    const helpElement = document.getElementById('actionHelp');
    const originalText = helpElement.textContent;
    helpElement.textContent = `错误: ${message}`;
    helpElement.style.color = '#f44336';
    
    setTimeout(() => {
      helpElement.textContent = originalText;
      helpElement.style.color = '';
    }, 3000);
  }

  /**
   * 阶段1.5新增：更新整局结算显示
   */
  updateSettlementResults(finalSettlement) {
    const settlementContainer = document.getElementById('finalSettlement');
    const resultsContainer = document.getElementById('settlementResults');
    
    if (!finalSettlement || !resultsContainer) return;

    // 创建结算结果HTML
    const duration = finalSettlement.endedAt - finalSettlement.startedAt;
    const durationMinutes = Math.round(duration / 60000);
    
    let html = `
      <div style="margin-bottom: 20px; text-align: center;">
        <p><strong>会话ID:</strong> ${finalSettlement.sessionId}</p>
        <p><strong>游戏时长:</strong> ${durationMinutes} 分钟</p>
        <p><strong>总手数:</strong> ${finalSettlement.handsPlayed}</p>
        <p><strong>总筹码:</strong> ${finalSettlement.totalChips}</p>
      </div>
      <div style="margin-top: 20px;">
        <h4>玩家结算:</h4>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background: rgba(255,255,255,0.1);">
              <th style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">玩家</th>
              <th style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">初始</th>
              <th style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">当前</th>
              <th style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">盈亏</th>
            </tr>
          </thead>
          <tbody>`;
    
    finalSettlement.perPlayer.forEach(player => {
      const pnlColor = player.pnl > 0 ? '#4caf50' : 
                       player.pnl < 0 ? '#f44336' : '#ffffff';
      const pnlText = player.pnl > 0 ? `+${player.pnl}` : player.pnl;
      
      html += `
        <tr>
          <td style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">${player.playerName}</td>
          <td style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">${player.baseline}</td>
          <td style="padding: 8px; border: 1px solid rgba(255,255,255,0.2);">${player.current}</td>
          <td style="padding: 8px; border: 1px solid rgba(255,255,255,0.2); color: ${pnlColor}; font-weight: bold;">${pnlText}</td>
        </tr>`;
    });
    
    html += `
          </tbody>
        </table>
      </div>`;
    
    resultsContainer.innerHTML = html;
    settlementContainer.style.display = 'block';
  }

  /**
   * 阶段1.5新增：更新摊牌摘要显示
   */
  updateShowdownSummary() {
    const summaryContainer = document.getElementById('showdownSummary');
    const resultsContainer = document.getElementById('showdownResults');
    
    if (!this.gameState || !this.gameState.lastShowdownSummary || !resultsContainer) {
      if (summaryContainer) {
        summaryContainer.style.display = 'none';
      }
      return;
    }

    const winners = this.gameState.lastShowdownSummary.winners;
    let html = '';
    
    winners.forEach((winner, index) => {
      const player = this.gameState.players.find(p => p.id === winner.playerId);
      const playerName = player ? player.name : winner.playerId;
      
      html += `
        <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,215,0,0.1); border-radius: 8px;">
          <div style="font-weight: bold; margin-bottom: 5px;">🏆 ${playerName}</div>
          <div style="margin-bottom: 5px;"><strong>牌型:</strong> ${winner.rankName}</div>
          <div style="margin-bottom: 5px;"><strong>最佳五张:</strong> ${this.formatCards(winner.bestFive)}</div>
          <div><strong>使用底牌:</strong> ${this.formatCards(winner.usedHole)}</div>
        </div>`;
    });
    
    resultsContainer.innerHTML = html;
    summaryContainer.style.display = 'block';
  }

  /**
   * 阶段1.5新增：格式化牌组显示
   */
  formatCards(cards) {
    if (!cards || cards.length === 0) return '无';
    return cards.map(card => this.formatCard(card)).join(' ');
  }

  /**
   * 添加日志条目
   */
  addLogEntry(message, type = 'info') {
    const logContainer = document.getElementById('gameLog');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${message}`;
    
    logContainer.appendChild(logEntry);
    
    // 滚动到底部
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // 限制日志条目数量
    while (logContainer.children.length > 50) {
      logContainer.removeChild(logContainer.firstChild);
    }
  }
}

// 全局函数供HTML调用
let pokerClient;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  pokerClient = new PokerClient();
});

// 全局函数
function joinGame() {
  if (pokerClient) {
    pokerClient.joinGame();
  }
}

function startGame() {
  if (pokerClient) {
    pokerClient.startGame();
  }
}

function performAction(action) {
  if (pokerClient) {
    pokerClient.performAction(action);
  }
}

function endGame() {
  if (pokerClient) {
    pokerClient.endGame();
  }
}