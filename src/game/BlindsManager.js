/**
 * BlindsManager.js - 德州扑克盲注和按钮位管理
 * 职责：设置按钮位、小盲/大盲、处理双人局特例
 * 依赖：GameState, TableRules, PositionHelper, BlindsCollector
 */

import PositionHelper from './PositionHelper.js';
import BlindsCollector from './BlindsCollector.js';

class BlindsManager {
  /**
   * 为新一轮设置按钮位和盲注
   * @param {GameState} gameState 游戏状态
   * @param {TableRules} rules 桌面规则
   */
  static setupBlindsAndButton(gameState, rules) {
    if (gameState.players.length < 2) {
      throw new Error('At least 2 players required to set blinds');
    }

    // 清除之前的位置标记
    PositionHelper.clearPositionMarkers(gameState);
    
    // 设置按钮位
    PositionHelper.setButtonPosition(gameState);
    
    // 设置盲注位置和金额
    this._setBlindsPositions(gameState, rules);
    
    // 收取盲注
    BlindsCollector.collectBlinds(gameState, rules);
  }

  /**
   * 移动按钮到下一位置（新手牌开始时调用）
   * @param {GameState} gameState 游戏状态
   */
  static moveButton(gameState) {
    if (gameState.players.length === 0) return;
    
    const activePlayers = gameState.players.filter(p => p.status !== 'SITTING_OUT');
    if (activePlayers.length < 2) return;
    
    // 找到下一个应该做庄的玩家位置
    let nextButtonIndex = (gameState.buttonIndex + 1) % gameState.players.length;
    
    // 确保按钮位玩家是活跃状态
    let attempts = 0;
    while (attempts < gameState.players.length) {
      const candidate = gameState.players[nextButtonIndex];
      if (candidate && candidate.status !== 'SITTING_OUT') {
        gameState.buttonIndex = nextButtonIndex;
        break;
      }
      nextButtonIndex = (nextButtonIndex + 1) % gameState.players.length;
      attempts++;
    }
  }

  /**
   * 获取Preflop第一个行动玩家ID
   * @param {GameState} gameState 游戏状态
   * @returns {string|null}
   */
  static getPreflopFirstActor(gameState) {
    if (gameState.players.length === 2) {
      // 双人局：按钮位（小盲）先行动
      const buttonPlayer = gameState.players.find(p => p.isDealer);
      return buttonPlayer ? buttonPlayer.id : null;
    } else {
      // 多人局：大盲左侧第一位（UTG）先行动
      const bigBlindPlayer = gameState.players.find(p => p.isBigBlind);
      if (!bigBlindPlayer) return null;
      
      return PositionHelper.getNextActivePlayer(gameState, bigBlindPlayer.id);
    }
  }

  /**
   * 获取Postflop第一个行动玩家ID
   * @param {GameState} gameState 游戏状态
   * @returns {string|null}
   */
  static getPostflopFirstActor(gameState) {
    // 翻牌后各街：按钮左侧第一位在局玩家开始
    const buttonPlayer = gameState.players.find(p => p.isDealer);
    if (!buttonPlayer) {
      // 如果没有按钮位，从第一个活跃玩家开始
      const activePlayers = gameState.players.filter(p => p.status === 'ACTIVE');
      return activePlayers.length > 0 ? activePlayers[0].id : null;
    }

    return PositionHelper.getNextActivePlayer(gameState, buttonPlayer.id);
  }

  /**
   * 检查盲注是否已正确设置
   * @param {GameState} gameState 游戏状态
   * @returns {boolean}
   */
  static areBlindsSet(gameState) {
    const smallBlindCount = gameState.players.filter(p => p.isSmallBlind).length;
    const bigBlindCount = gameState.players.filter(p => p.isBigBlind).length;
    
    if (gameState.players.length === 2) {
      // 双人局：按钮位即小盲，只需要1个小盲和1个大盲
      return smallBlindCount === 1 && bigBlindCount === 1;
    } else {
      // 多人局：需要分别的小盲和大盲
      return smallBlindCount === 1 && bigBlindCount === 1;
    }
  }

  /**
   * 获取当前盲注信息摘要
   * @param {GameState} gameState 
   * @param {TableRules} rules 
   * @returns {Object}
   */
  static getBlindsInfo(gameState, rules) {
    return BlindsCollector.getBlindsInfo(gameState, rules);
  }

  /**
   * 设置盲注位置
   * @private
   * @param {GameState} gameState 
   * @param {TableRules} rules 
   */
  static _setBlindsPositions(gameState, rules) {
    const activePlayers = gameState.players.filter(p => p.status !== 'SITTING_OUT');
    
    if (activePlayers.length === 2) {
      PositionHelper.setHeadsUpBlinds(gameState);
    } else {
      PositionHelper.setMultiPlayerBlinds(gameState);
    }
  }
}

export default BlindsManager;