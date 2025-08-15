/**
 * ScriptedDeck - 受控发牌机制
 * 
 * 用于回放时的确定性发牌，支持两种模式：
 * 1. 公共模式：基于事件流中的公共牌信息进行回放
 * 2. 管理员模式：基于私有日志中的完整牌序进行100%保真回放
 * 
 * 设计原则：
 * - 替代随机Deck，提供确定性发牌
 * - 维护与原Deck相同的接口
 * - 支持牌序预设和顺序发牌
 * - 处理牌不足等边界情况
 */

class ScriptedDeck {
  constructor() {
    this.orderedCards = [];  // 预设的牌序
    this.currentIndex = 0;   // 当前发牌位置
    this.mode = 'public';    // 'public' | 'admin'
    this.publicCards = new Map(); // 街道 -> 公共牌映射
  }

  /**
   * 设置管理员模式（完整牌序）
   * @param {string[]} orderedCards - 完整的牌序数组
   */
  setAdminMode(orderedCards) {
    this.mode = 'admin';
    this.orderedCards = [...orderedCards];
    this.currentIndex = 0;
  }

  /**
   * 设置公共模式（基于事件的公共牌）
   * @param {Object} publicCards - 街道公共牌映射
   */
  setPublicMode(publicCards = {}) {
    this.mode = 'public';
    this.publicCards = new Map();
    
    // 预设公共牌信息
    if (publicCards.flop) this.publicCards.set('FLOP', publicCards.flop);
    if (publicCards.turn) this.publicCards.set('TURN', publicCards.turn);
    if (publicCards.river) this.publicCards.set('RIVER', publicCards.river);
  }

  /**
   * 重置发牌状态
   */
  reset() {
    this.currentIndex = 0;
  }

  /**
   * 洗牌（对于ScriptedDeck是空操作）
   */
  shuffle() {
    // ScriptedDeck不需要洗牌，牌序已预设
  }

  /**
   * 发一张牌
   * @returns {string|null} 牌面字符串或null（牌不足）
   */
  dealCard() {
    if (this.mode === 'admin') {
      return this._dealFromAdminSequence();
    } else {
      return this._dealFromPublicMode();
    }
  }

  /**
   * 发多张牌
   * @param {number} count - 发牌数量
   * @returns {string[]} 牌面数组
   */
  dealCards(count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
      const card = this.dealCard();
      if (card) {
        cards.push(card);
      } else {
        break;
      }
    }
    return cards;
  }

  /**
   * 发底牌给玩家
   * @param {number} playerCount - 玩家数量
   * @returns {string[][]} 每个玩家的底牌数组
   */
  dealHoleCards(playerCount) {
    if (this.mode === 'admin') {
      // 管理员模式：按牌序发牌
      const holeCards = [];
      for (let i = 0; i < playerCount; i++) {
        holeCards.push([]);
      }
      
      // 每轮给每个玩家发一张，共发两轮
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < playerCount; i++) {
          const card = this.dealCard();
          if (card) {
            holeCards[i].push(card);
          }
        }
      }
      
      return holeCards;
    } else {
      // 公共模式：返回空底牌（不可见）
      return Array(playerCount).fill().map(() => []);
    }
  }

  /**
   * 发翻牌（3张）
   * @returns {string[]} 翻牌数组
   */
  dealFlop() {
    if (this.mode === 'admin') {
      // 烧牌
      this.dealCard();
      return this.dealCards(3);
    } else {
      // 从预设的公共牌中获取
      return this.publicCards.get('FLOP') || [];
    }
  }

  /**
   * 发转牌（1张）
   * @returns {string|null} 转牌
   */
  dealTurn() {
    if (this.mode === 'admin') {
      // 烧牌
      this.dealCard();
      return this.dealCard();
    } else {
      const turnCards = this.publicCards.get('TURN');
      return turnCards && turnCards.length > 0 ? turnCards[0] : null;
    }
  }

  /**
   * 发河牌（1张）
   * @returns {string|null} 河牌
   */
  dealRiver() {
    if (this.mode === 'admin') {
      // 烧牌
      this.dealCard();
      return this.dealCard();
    } else {
      const riverCards = this.publicCards.get('RIVER');
      return riverCards && riverCards.length > 0 ? riverCards[0] : null;
    }
  }

  /**
   * 获取剩余牌数
   * @returns {number} 剩余牌数
   */
  getRemainingCardCount() {
    if (this.mode === 'admin') {
      return Math.max(0, this.orderedCards.length - this.currentIndex);
    } else {
      // 公共模式无法准确知道剩余牌数
      return 52; // 假设充足
    }
  }

  /**
   * 检查是否还有牌
   * @returns {boolean} 是否还有牌
   */
  hasCards() {
    return this.getRemainingCardCount() > 0;
  }

  /**
   * 从管理员序列中发牌
   * @private
   */
  _dealFromAdminSequence() {
    if (this.currentIndex >= this.orderedCards.length) {
      return null;
    }
    return this.orderedCards[this.currentIndex++];
  }

  /**
   * 从公共模式发牌（用于非公共牌的情况）
   * @private
   */
  _dealFromPublicMode() {
    // 公共模式下，只能提供公共牌
    // 对于底牌等私有信息，返回null或占位符
    return null;
  }

  /**
   * 获取当前状态信息
   * @returns {Object} 状态信息
   */
  getState() {
    return {
      mode: this.mode,
      currentIndex: this.currentIndex,
      totalCards: this.orderedCards.length,
      remainingCards: this.getRemainingCardCount(),
      publicCardsCount: this.publicCards.size
    };
  }

  /**
   * 设置当前发牌位置（用于回放状态恢复）
   * @param {number} index - 发牌位置
   */
  setCurrentIndex(index) {
    this.currentIndex = Math.max(0, Math.min(index, this.orderedCards.length));
  }
}

export default ScriptedDeck;