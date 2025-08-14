/**
 * PotManager - 彩池管理器
 * 
 * 负责德州扑克的彩池管理和多层边池分配：
 * - 每街下注归集
 * - 基于all-in金额的多层边池拆分
 * - 摊牌时的彩池分配
 * - 余数处理（按钮位后顺时针顺序分配）
 * 
 * 严格遵循计划文档12.3的每街清算原则
 */

export default class PotManager {
  /**
   * 从当前街道收集所有玩家的下注到彩池
   * @param {Object[]} players - 玩家数组
   * @param {Object[]} pots - 彩池数组（会被修改）
   * @returns {Object[]} - 更新后的彩池数组
   */
  static collectBetsFromStreet(players, pots = []) {
    // 收集有下注的玩家
    const playersWithBets = players.filter(player => player.currentBet > 0);
    
    if (playersWithBets.length === 0) {
      return pots;
    }

    // 按总投入金额升序排序，用于分层构建边池
    const sortedByTotalBet = [...playersWithBets].sort((a, b) => a.totalBet - b.totalBet);
    
    // 构建多层边池
    const newPots = this._buildSidePots(sortedByTotalBet, pots);
    
    // 清零所有玩家的当前街下注
    players.forEach(player => {
      player.currentBet = 0;
    });
    
    return newPots;
  }

  /**
   * 构建多层边池
   * @param {Object[]} sortedPlayers - 按总投入排序的玩家
   * @param {Object[]} existingPots - 现有彩池
   * @returns {Object[]} - 包含新边池的彩池数组
   */
  static _buildSidePots(sortedPlayers, existingPots) {
    const pots = [...existingPots];
    let previousThreshold = 0;
    
    // 获取所有不同的投入阈值
    const thresholds = [...new Set(sortedPlayers.map(p => p.totalBet))].sort((a, b) => a - b);
    
    for (const threshold of thresholds) {
      // 获取达到此阈值的玩家
      const eligiblePlayers = sortedPlayers
        .filter(player => player.totalBet >= threshold)
        .map(player => player.id);
      
      if (eligiblePlayers.length === 0) continue;
      
      // 计算这一层的金额（每人贡献的差额）
      const layerAmount = threshold - previousThreshold;
      const potAmount = layerAmount * eligiblePlayers.length;
      
      if (potAmount > 0) {
        // 查找是否已存在相同参与者的池
        let existingPot = pots.find(pot => 
          this._arraysEqual(pot.eligiblePlayers.sort(), eligiblePlayers.sort())
        );
        
        if (existingPot) {
          // 添加到现有池
          existingPot.amount += potAmount;
        } else {
          // 创建新池
          pots.push({
            id: `pot_${pots.length + 1}`,
            amount: potAmount,
            eligiblePlayers: [...eligiblePlayers],
            threshold: threshold,
            type: eligiblePlayers.length === sortedPlayers.length ? 'main' : 'side'
          });
        }
      }
      
      previousThreshold = threshold;
    }
    
    return pots;
  }

  /**
   * 在摊牌时分配所有彩池
   * @param {Object[]} pots - 彩池数组
   * @param {Object[]} players - 所有玩家（包含手牌）
   * @param {string[]} board - 公共牌
   * @param {Object} handEvaluator - 牌力评估器
   * @param {number} buttonIndex - 按钮位索引（用于余数分配）
   * @returns {Object[]} - 分配结果数组
   */
  static distributePots(pots, players, board, handEvaluator, buttonIndex = 0) {
    const results = [];
    
    for (const pot of pots) {
      if (pot.amount === 0) continue;
      
      // 获取有资格参与此池的在局玩家
      const eligiblePlayers = players.filter(player => 
        pot.eligiblePlayers.includes(player.id) && 
        player.status !== 'FOLDED'
      );
      
      if (eligiblePlayers.length === 0) {
        // 无人有资格，池子保留（实际上这种情况不应该发生）
        continue;
      }
      
      if (eligiblePlayers.length === 1) {
        // 只有一人有资格，直接获得全部
        const winner = eligiblePlayers[0];
        winner.chips += pot.amount;
        results.push({
          potId: pot.id,
          amount: pot.amount,
          winners: [winner.id],
          reason: 'only_eligible'
        });
        continue;
      }
      
      // 多人比牌
      const potResult = this._distributeSinglePot(
        pot, eligiblePlayers, board, handEvaluator, buttonIndex, players
      );
      results.push(potResult);
    }
    
    return results;
  }

  /**
   * 分配单个彩池
   * @param {Object} pot - 彩池对象
   * @param {Object[]} eligiblePlayers - 有资格的玩家
   * @param {string[]} board - 公共牌
   * @param {Object} handEvaluator - 牌力评估器
   * @param {number} buttonIndex - 按钮位索引
   * @param {Object[]} allPlayers - 所有玩家（用于位置判断）
   * @returns {Object} - 分配结果
   */
  static _distributeSinglePot(pot, eligiblePlayers, board, handEvaluator, buttonIndex, allPlayers) {
    // 评估所有有资格玩家的牌力
    const evaluations = eligiblePlayers.map(player => ({
      playerId: player.id,
      player: player,
      hand: handEvaluator.evaluate(player.holeCards, board)
    }));
    
    // 找出最高牌力
    let bestRank = -1;
    let bestScore = -1;
    evaluations.forEach(evaluation => {
      if (evaluation.hand.rank > bestRank || 
          (evaluation.hand.rank === bestRank && evaluation.hand.score > bestScore)) {
        bestRank = evaluation.hand.rank;
        bestScore = evaluation.hand.score;
      }
    });
    
    // 找出所有并列最佳的玩家
    const winners = evaluations.filter(evaluation => 
      evaluation.hand.rank === bestRank && evaluation.hand.score === bestScore
    );
    
    // 分配筹码
    const sharePerWinner = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;
    
    // 基础分配
    winners.forEach(winner => {
      winner.player.chips += sharePerWinner;
    });
    
    // 余数分配：按钮位后顺时针顺序分配给获胜者
    if (remainder > 0) {
      const sortedWinners = this._sortWinnersByPosition(winners, buttonIndex, allPlayers);
      for (let i = 0; i < remainder; i++) {
        sortedWinners[i].player.chips += 1;
      }
    }
    
    return {
      potId: pot.id,
      amount: pot.amount,
      winners: winners.map(w => w.playerId),
      winningHand: {
        rank: bestRank,
        name: handEvaluator.getRankName(bestRank),
        cards: winners[0].hand.cards // 所有获胜者牌型相同
      },
      distribution: {
        sharePerWinner,
        remainder,
        remainderRecipients: remainder > 0 ? 
          this._sortWinnersByPosition(winners, buttonIndex, allPlayers)
            .slice(0, remainder).map(w => w.playerId) : []
      }
    };
  }

  /**
   * 按位置排序获胜者（按钮位后顺时针顺序）
   * @param {Object[]} winners - 获胜者列表
   * @param {number} buttonIndex - 按钮位索引
   * @param {Object[]} allPlayers - 所有玩家
   * @returns {Object[]} - 排序后的获胜者
   */
  static _sortWinnersByPosition(winners, buttonIndex, allPlayers) {
    return winners.sort((a, b) => {
      const posA = allPlayers.findIndex(p => p.id === a.playerId);
      const posB = allPlayers.findIndex(p => p.id === b.playerId);
      
      // 计算相对于按钮位的顺时针距离，按钮位距离为最大（最后分配余数）
      const distanceA = posA === buttonIndex ? allPlayers.length : (posA - buttonIndex + allPlayers.length) % allPlayers.length;
      const distanceB = posB === buttonIndex ? allPlayers.length : (posB - buttonIndex + allPlayers.length) % allPlayers.length;
      
      return distanceA - distanceB;
    });
  }

  /**
   * 获取彩池摘要信息
   * @param {Object[]} pots - 彩池数组
   * @returns {Object} - 彩池摘要
   */
  static getPotsSummary(pots) {
    const totalAmount = pots.reduce((sum, pot) => sum + pot.amount, 0);
    const mainPots = pots.filter(pot => pot.type === 'main');
    const sidePots = pots.filter(pot => pot.type === 'side');
    
    return {
      totalAmount,
      potCount: pots.length,
      mainPotAmount: mainPots.reduce((sum, pot) => sum + pot.amount, 0),
      sidePotAmount: sidePots.reduce((sum, pot) => sum + pot.amount, 0),
      pots: pots.map(pot => ({
        id: pot.id,
        amount: pot.amount,
        type: pot.type,
        eligiblePlayerCount: pot.eligiblePlayers.length
      }))
    };
  }

  /**
   * 清空所有彩池（新一轮开始时）
   * @returns {Object[]} - 空彩池数组
   */
  static clearPots() {
    return [];
  }

  /**
   * 辅助方法：比较两个数组是否相等
   */
  static _arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, index) => val === arr2[index]);
  }
}