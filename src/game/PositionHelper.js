/**
 * PositionHelper.js - 位置管理辅助类
 * 职责：计算和查找玩家位置
 * 依赖：GameState
 */

class PositionHelper {
  /**
   * 获取指定玩家之后的下一个活跃玩家
   * @param {GameState} gameState 
   * @param {string} playerId 
   * @returns {string|null}
   */
  static getNextActivePlayer(gameState, playerId) {
    if (!playerId) return null;

    const allPlayers = gameState.players.sort((a, b) => a.position - b.position);
    const currentIndex = allPlayers.findIndex(p => p.id === playerId);
    
    // 如果起始玩家不存在，从第一个玩家开始查找活跃玩家
    if (currentIndex === -1) {
      for (let i = 0; i < allPlayers.length; i++) {
        const player = allPlayers[i];
        if (player.status !== 'SITTING_OUT' && player.status !== 'FOLDED' && player.status !== 'ALL_IN') {
          return player.id;
        }
      }
      return null;
    }

    // 从当前玩家的下一个位置开始查找，包括最后回绕到起始玩家
    for (let i = 1; i <= allPlayers.length; i++) {
      const nextIndex = (currentIndex + i) % allPlayers.length;
      const nextPlayer = allPlayers[nextIndex];
      
      if (nextPlayer.status !== 'SITTING_OUT' && nextPlayer.status !== 'FOLDED' && nextPlayer.status !== 'ALL_IN') {
        return nextPlayer.id;
      }
    }

    return null;
  }

  /**
   * 清除所有位置标记
   * @param {GameState} gameState 
   */
  static clearPositionMarkers(gameState) {
    gameState.players.forEach(player => {
      player.isDealer = false;
      player.isSmallBlind = false;
      player.isBigBlind = false;
    });
  }

  /**
   * 设置按钮位置
   * @param {GameState} gameState 
   */
  static setButtonPosition(gameState) {
    if (gameState.buttonIndex >= gameState.players.length) {
      gameState.buttonIndex = 0;
    }
    
    const buttonPlayer = gameState.players[gameState.buttonIndex];
    if (buttonPlayer) {
      buttonPlayer.isDealer = true;
    }
  }

  /**
   * 设置双人局盲注（按钮位即小盲）
   * @param {GameState} gameState 
   */
  static setHeadsUpBlinds(gameState) {
    const buttonPlayer = gameState.players.find(p => p.isDealer);
    if (!buttonPlayer) return;

    // 按钮位即小盲
    buttonPlayer.isSmallBlind = true;
    
    // 大盲是另一位玩家
    const otherPlayer = gameState.players.find(p => p.id !== buttonPlayer.id && p.status !== 'SITTING_OUT');
    if (otherPlayer) {
      otherPlayer.isBigBlind = true;
    }
  }

  /**
   * 设置多人局盲注
   * @param {GameState} gameState 
   */
  static setMultiPlayerBlinds(gameState) {
    const buttonPlayer = gameState.players.find(p => p.isDealer);
    if (!buttonPlayer) return;

    // 小盲是按钮左侧第一位
    const smallBlindId = this.getNextActivePlayer(gameState, buttonPlayer.id);
    const smallBlindPlayer = gameState.getPlayer(smallBlindId);
    if (smallBlindPlayer) {
      smallBlindPlayer.isSmallBlind = true;
    }

    // 大盲是小盲左侧第一位
    const bigBlindId = this.getNextActivePlayer(gameState, smallBlindId);
    const bigBlindPlayer = gameState.getPlayer(bigBlindId);
    if (bigBlindPlayer) {
      bigBlindPlayer.isBigBlind = true;
    }
  }
}

export default PositionHelper;