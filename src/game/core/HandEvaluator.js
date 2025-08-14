/**
 * HandEvaluator.js - 德州扑克牌力评估
 * 职责：封装第三方评估库，提供统一的牌力比较接口
 * 依赖：pokersolver
 */

import pkg from 'pokersolver';
const { Hand } = pkg;

class HandEvaluator {
  /**
   * 评估7张牌的最佳5张组合
   * @param {string[]} holeCards 手牌，如['AH', 'KD']
   * @param {string[]} board 公共牌，如['QS', 'JC', 'TD', '9H', '8S']
   * @returns {Object} 评估结果 {rank, name, score, cards}
   */
  evaluate(holeCards, board = []) {
    if (!Array.isArray(holeCards) || holeCards.length !== 2) {
      throw new Error('holeCards必须是包含2张牌的数组');
    }
    
    if (!Array.isArray(board)) {
      throw new Error('board必须是数组');
    }

    // 合并所有牌
    const allCards = [...holeCards, ...board];
    
    if (allCards.length < 5) {
      throw new Error('至少需要5张牌才能评估');
    }

    // 转换牌面格式：我们的格式'AH' -> pokersolver的格式'Ah'
    const convertedCards = allCards.map(card => this._convertCardFormat(card));
    
    try {
      const hand = Hand.solve(convertedCards);
      
      return {
        rank: hand.rank,           // 牌型等级(1-9, 数字越大越好)
        name: hand.name,           // 牌型名称
        score: hand.rank,          // 用于比较的分数(越大越好)
        cards: hand.cards,         // 最佳5张牌
        description: hand.descr    // 详细描述
      };
    } catch (error) {
      throw new Error(`牌力评估失败: ${error.message}`);
    }
  }

  /**
   * 比较两手牌的大小
   * @param {Object} hand1 第一手牌的评估结果
   * @param {Object} hand2 第二手牌的评估结果
   * @returns {number} 1=hand1胜, -1=hand2胜, 0=平局
   */
  compare(hand1, hand2) {
    if (hand1.rank > hand2.rank) return 1;    // rank越大越好
    if (hand1.rank < hand2.rank) return -1;
    
    // 同等牌型时，需要比较具体牌面
    // pokersolver已经处理了kicker比较
    const h1 = Hand.solve(hand1.cards.map(c => c.value + c.suit.toLowerCase()));
    const h2 = Hand.solve(hand2.cards.map(c => c.value + c.suit.toLowerCase()));
    
    const winner = Hand.winners([h1, h2]);
    
    if (winner.length > 1) return 0;          // 平局
    return winner[0] === h1 ? 1 : -1;
  }

  /**
   * 从多个玩家中找出获胜者
   * @param {Array} players 玩家数组，每个玩家包含{id, holeCards}
   * @param {string[]} board 公共牌
   * @returns {Array} 获胜者ID数组（可能平局多人）
   */
  findWinners(players, board = []) {
    if (!Array.isArray(players) || players.length === 0) {
      return [];
    }

    // 评估所有玩家的牌力
    const evaluatedHands = players.map(player => {
      const evaluation = this.evaluate(player.holeCards, board);
      return {
        playerId: player.id,
        evaluation,
        holeCards: player.holeCards
      };
    });

    // 转换为pokersolver的Hand对象进行比较
    const pokerHands = evaluatedHands.map(eh => {
      const allCards = [...eh.holeCards, ...board];
      const converted = allCards.map(card => this._convertCardFormat(card));
      return {
        hand: Hand.solve(converted),
        playerId: eh.playerId
      };
    });

    // 找出获胜者
    const winners = Hand.winners(pokerHands.map(ph => ph.hand));
    const winnerIds = pokerHands
      .filter(ph => winners.includes(ph.hand))
      .map(ph => ph.playerId);

    return winnerIds;
  }

  /**
   * 转换牌面格式
   * 从我们的格式'AH'转换为pokersolver的格式'Ah'
   * @private
   * @param {string} card 我们的牌面格式
   * @returns {string} pokersolver的牌面格式
   */
  _convertCardFormat(card) {
    if (typeof card !== 'string' || card.length !== 2) {
      throw new Error(`无效的牌面格式: ${card}`);
    }

    const rank = card[0];
    const suit = card[1].toLowerCase();

    return rank + suit;
  }

  /**
   * 获取牌型等级名称（用于调试和显示）
   * @param {number} rank 牌型等级
   * @returns {string} 牌型名称
   */
  getRankName(rank) {
    const rankNames = {
      1: '高牌',
      2: '一对',
      3: '两对',
      4: '三条',
      5: '顺子',
      6: '同花',
      7: '葫芦',
      8: '四条',
      9: '同花顺' // 包含皇家同花顺
    };
    
    return rankNames[rank] || '未知';
  }

  /**
   * 阶段1.5新增：描述最佳手牌组合
   * 用于摊牌时展示获胜者的详细牌型信息
   * @param {string[]} holeCards 手牌，如['AH', 'KD']
   * @param {string[]} board 公共牌，如['QS', 'JC', 'TD', '9H', '8S']
   * @returns {Object} 详细牌型信息 {score, rankName, bestFive, usedHole}
   */
  describeBestHand(holeCards, board = []) {
    // 基于现有evaluate方法获取基础信息
    const evaluation = this.evaluate(holeCards, board);
    
    // 获取中文牌型名称
    const rankName = this.getRankName(evaluation.rank);
    
    // 提取最佳5张牌（pokersolver返回的格式需要转换回我们的格式）
    const bestFive = evaluation.cards.map(card => {
      return card.value + card.suit.toUpperCase();
    });
    
    // 确定使用的底牌
    const usedHole = this._determineUsedHoleCards(holeCards, bestFive);
    
    return {
      score: evaluation.score,
      rankName: rankName,
      bestFive: bestFive,
      usedHole: usedHole
    };
  }

  /**
   * 确定最佳手牌中使用了哪些底牌
   * @private
   * @param {string[]} holeCards 玩家手牌
   * @param {string[]} bestFive 最佳5张牌
   * @returns {string[]} 使用的底牌
   */
  _determineUsedHoleCards(holeCards, bestFive) {
    const usedHole = [];
    
    holeCards.forEach(holeCard => {
      if (bestFive.includes(holeCard)) {
        usedHole.push(holeCard);
      }
    });
    
    return usedHole;
  }
}

export default HandEvaluator;