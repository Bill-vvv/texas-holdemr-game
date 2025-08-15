/**
 * BlindsCollector.js - 盲注收取辅助类
 * 职责：处理盲注收取逻辑
 * 依赖：GameState, TableRules
 */

class BlindsCollector {
  /**
   * 收取盲注
   * @param {GameState} gameState 
   * @param {TableRules} rules 
   */
  static collectBlinds(gameState, rules) {
    // 收取小盲
    const smallBlindPlayer = gameState.players.find(p => p.isSmallBlind);
    if (smallBlindPlayer) {
      const smallBlindAmount = Math.min(rules.smallBlind, smallBlindPlayer.chips);
      smallBlindPlayer.chips -= smallBlindAmount;
      smallBlindPlayer.currentBet = smallBlindAmount;
      smallBlindPlayer.totalBet = smallBlindAmount;
      
      // 如果筹码不够小盲，设为all-in
      if (smallBlindAmount < rules.smallBlind) {
        smallBlindPlayer.status = 'ALL_IN';
      }
    }

    // 收取大盲
    const bigBlindPlayer = gameState.players.find(p => p.isBigBlind);
    if (bigBlindPlayer) {
      const bigBlindAmount = Math.min(rules.bigBlind, bigBlindPlayer.chips);
      bigBlindPlayer.chips -= bigBlindAmount;
      bigBlindPlayer.currentBet = bigBlindAmount;
      bigBlindPlayer.totalBet = bigBlindAmount;
      
      // 如果筹码不够大盲，设为all-in
      if (bigBlindAmount < rules.bigBlind) {
        bigBlindPlayer.status = 'ALL_IN';
      }
    }

    // 设置当前需要跟注的金额为大盲注
    gameState.amountToCall = rules.bigBlind;
    // 初始化本街动态最小加注为大盲（规则只读，状态可变）
    gameState.minRaiseAmount = rules.bigBlind;
    
    // 更新活跃玩家状态
    gameState.updateActivePlayers();
  }

  /**
   * 获取当前盲注信息摘要
   * @param {GameState} gameState 
   * @param {TableRules} rules 
   * @returns {Object}
   */
  static getBlindsInfo(gameState, rules) {
    const smallBlindPlayer = gameState.players.find(p => p.isSmallBlind);
    const bigBlindPlayer = gameState.players.find(p => p.isBigBlind);
    
    return {
      smallBlind: {
        playerId: smallBlindPlayer?.id || null,
        amount: rules.smallBlind,
        actualAmount: smallBlindPlayer?.currentBet || 0
      },
      bigBlind: {
        playerId: bigBlindPlayer?.id || null,
        amount: rules.bigBlind,
        actualAmount: bigBlindPlayer?.currentBet || 0
      },
      isHeadsUp: gameState.players.filter(p => p.status !== 'SITTING_OUT').length === 2
    };
  }
}

export default BlindsCollector;