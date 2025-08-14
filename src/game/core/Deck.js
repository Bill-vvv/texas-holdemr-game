/**
 * Deck.js - 德州扑克牌堆管理
 * 职责：52张牌定义、洗牌、发牌
 * 依赖：无
 */

class Deck {
  constructor() {
    this.reset();
  }

  /**
   * 重置牌堆到初始状态（52张牌）
   */
  reset() {
    this.cards = [];
    this._createStandardDeck();
  }

  /**
   * 创建标准52张牌
   * 花色：S=黑桃, H=红心, D=方块, C=梅花
   * 点数：2-9, T=10, J=11, Q=12, K=13, A=14
   */
  _createStandardDeck() {
    const suits = ['S', 'H', 'D', 'C'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    
    for (const suit of suits) {
      for (const rank of ranks) {
        this.cards.push(rank + suit);
      }
    }
  }

  /**
   * Fisher-Yates算法洗牌
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * 发一张牌
   * @returns {string|null} 牌面字符串，如'AH'（红心A），牌堆空时返回null
   */
  dealOne() {
    return this.cards.length > 0 ? this.cards.pop() : null;
  }

  /**
   * 发多张牌
   * @param {number} count 要发的牌数
   * @returns {string[]} 牌面数组，不足时返回剩余所有牌
   */
  dealMany(count) {
    const dealt = [];
    for (let i = 0; i < count && this.cards.length > 0; i++) {
      dealt.push(this.cards.pop());
    }
    return dealt;
  }

  /**
   * 获取剩余牌数
   * @returns {number}
   */
  getRemainingCount() {
    return this.cards.length;
  }

  /**
   * 检查是否还有足够的牌
   * @param {number} needed 需要的牌数
   * @returns {boolean}
   */
  hasEnough(needed) {
    return this.cards.length >= needed;
  }
}

export default Deck;