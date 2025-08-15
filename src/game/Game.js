/**
 * Game - 德州扑克游戏聚合根
 * 
 * 负责协调所有游戏模块，提供统一的对外接口：
 * - 管理游戏生命周期（开始、进行、结束）
 * - 协调TurnManager、BlindsManager、ActionValidator、ActionApplier、PotManager
 * - 处理发牌逻辑（Deck、HandEvaluator）
 * - 提供公共/私有状态视图
 * - 执行完整的Game Loop流程
 * 
 * 严格遵循聚合根模式和KISS原则
 */

import GameState from './GameState.js';
import TurnManager from './TurnManager.js';
import BlindsManager from './BlindsManager.js';
import ActionValidator from './actions/ActionValidator.js';
import ActionApplier from './actions/ActionApplier.js';
import PotManager from './pot/PotManager.js';
import Deck from './core/Deck.js';
import HandEvaluator from './core/HandEvaluator.js';

export default class Game {
  constructor(tableRules) {
    this.gameState = new GameState();
    this.gameState.gameId = `game_${Date.now()}`; // 设置游戏ID
    this.tableRules = tableRules;
    this.deck = new Deck();
    this.handEvaluator = new HandEvaluator();
    this.pots = [];
  }

  /**
   * 添加玩家到游戏
   * @param {Object} playerData - 玩家数据 {id, name, chips}
   * @returns {boolean} - 是否成功添加
   */
  addPlayer(playerData) {
    try {
      if (this.gameState.phase !== 'WAITING') {
        throw new Error('游戏已开始，无法添加玩家');
      }

      // 达到人数上限时不可加入（只检查上限，不检查最少人数）
      if (this.gameState.players.length >= this.tableRules.maxPlayers) {
        throw new Error('玩家人数已达上限');
      }

      if (!this.tableRules.isValidBuyIn(playerData.chips)) {
        throw new Error('买入金额不符合规则要求');
      }

      this.gameState.addPlayer(playerData);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 移除玩家
   * @param {string} playerId - 玩家ID
   * @returns {boolean} - 是否成功移除
   */
  removePlayer(playerId) {
    try {
      if (this.gameState.phase === 'PLAYING') {
        // 游戏中只能标记为离开，不能直接移除
        const player = this.gameState.getPlayer(playerId);
        if (player) {
          player.status = 'SITTING_OUT';
          // 清理位置与本街下注标记，避免UI残留
          player.isDealer = false;
          player.isSmallBlind = false;
          player.isBigBlind = false;
          player.currentBet = 0;
          this.gameState.updateActivePlayers();
        }
      } else {
        this.gameState.removePlayer(playerId);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 开始新一轮游戏
   * @returns {boolean} - 是否成功开始
   */
  startNewHand() {
    try {
      if (!this.gameState.canStart()) {
        throw new Error('玩家数量不足，无法开始游戏');
      }

      // 阶段2新增：手局开始钩子 - 设置桌面状态为进行中
      this._onHandStart();

      // 阶段1.5：初始化会话基线（第一手牌时）
      if (this.gameState.handNumber === 0) {
        this.gameState.initializeSession();
      }

      // 阶段1.5：清空上一手的摊牌摘要
      this.gameState.clearShowdownSummary();

      // 重置游戏状态
      this.gameState.phase = 'PLAYING';
      this.gameState.street = 'PRE_FLOP';
      this.gameState.handNumber += 1;
      this.pots = PotManager.clearPots();

      // 重置玩家状态
      this.gameState.players.forEach(player => {
        if (player.status === 'SITTING_OUT') return;
        player.status = 'ACTIVE';
        player.holeCards = [];
        player.currentBet = 0;
        player.totalBet = 0;
      });

      // 设置盲注和按钮
      BlindsManager.setupBlindsAndButton(this.gameState, this.tableRules);

      // 洗牌发牌
      this.deck.reset();
      this.deck.shuffle();
      this._dealHoleCards();

      // 设置第一个行动者
      this.gameState.currentTurn = BlindsManager.getPreflopFirstActor(this.gameState);
      this.gameState.updateActivePlayers();

      // 阶段1.5：会话手数计数
      if (this.gameState.session) {
        this.gameState.session.handsPlayed += 1;
      }

      return true;
    } catch (error) {
      console.error('startNewHand错误:', error.message);
      return false;
    }
  }

  /**
   * 应用玩家动作
   * @param {Object} action - 动作对象 {type, playerId, amount?}
   * @returns {Object} - 结果 {success, error?, gameEvents?}
   */
  applyAction(action) {
    try {
      // 验证动作
      const validationError = ActionValidator.validate(action, this.gameState, this.tableRules);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // 应用动作
      ActionApplier.apply(action, this.gameState, this.tableRules);

      // 检查回合状态并推进游戏
      const gameEvents = this._processGameFlow();

      return { 
        success: true, 
        gameEvents,
        gameState: this.getPublicState()
      };
    } catch (error) {
      return { success: false, error: { error: 'INTERNAL_ERROR', message: error.message } };
    }
  }

  /**
   * 处理游戏流程推进
   * @returns {Array} - 游戏事件列表
   */
  _processGameFlow() {
    const events = [];

    // 检查是否应该结束游戏
    if (TurnManager.shouldEndGame(this.gameState)) {
      events.push({ type: 'GAME_ENDED', reason: 'only_one_player' });
      this._endHand(events);
      return events;
    }

    // 检查回合是否闭合
    if (TurnManager.isRoundClosed(this.gameState)) {
      events.push({ type: 'ROUND_CLOSED', street: this.gameState.street });
      
      // 收集本街下注到彩池
      this.pots = PotManager.collectBetsFromStreet(this.gameState.players, this.pots);
      ActionApplier.resetStreetState(this.gameState, this.tableRules);

      // 推进到下一街
      TurnManager.advanceStreet(this.gameState);
      events.push({ type: 'STREET_ADVANCED', newStreet: this.gameState.street });

      // 发公共牌
      this._dealCommunityCards(events);

      // 检查是否到摊牌阶段
      if (this.gameState.street === 'SHOWDOWN') {
        events.push({ type: 'SHOWDOWN_STARTED' });
        this._endHand(events);
      } else {
        // 设置新街道的第一个行动者
        this.gameState.currentTurn = BlindsManager.getPostflopFirstActor(this.gameState);
        events.push({ type: 'TURN_CHANGED', playerId: this.gameState.currentTurn });
      }
    } else {
      // 推进到下一个行动者
      TurnManager.advanceToNextActor(this.gameState);
      events.push({ type: 'TURN_CHANGED', playerId: this.gameState.currentTurn });
    }

    return events;
  }

  /**
   * 发手牌
   */
  _dealHoleCards() {
    const activePlayers = this.gameState.players.filter(p => p.status === 'ACTIVE');
    
    // 每个玩家发两张牌
    activePlayers.forEach(player => {
      player.holeCards = this.deck.dealMany(2);
    });
  }

  /**
   * 发公共牌
   * @param {Array} events - 事件列表
   */
  _dealCommunityCards(events) {
    switch (this.gameState.street) {
      case 'FLOP':
        const flop = this.deck.dealMany(3);
        this.gameState.communityCards = flop;
        events.push({ type: 'FLOP_DEALT', cards: flop });
        break;
      
      case 'TURN':
        const turn = this.deck.dealOne();
        this.gameState.communityCards.push(turn);
        events.push({ type: 'TURN_DEALT', card: turn });
        break;
      
      case 'RIVER':
        const river = this.deck.dealOne();
        this.gameState.communityCards.push(river);
        events.push({ type: 'RIVER_DEALT', card: river });
        break;
    }
  }

  /**
   * 结束当前手牌
   * @param {Array} events - 事件列表
   */
  _endHand(events) {
    // 最后一次收集下注
    this.pots = PotManager.collectBetsFromStreet(this.gameState.players, this.pots);

    // 分配彩池
    const distributionResults = PotManager.distributePots(
      this.pots,
      this.gameState.players,
      this.gameState.communityCards,
      this.handEvaluator,
      this.gameState.buttonIndex
    );

    events.push({ 
      type: 'POTS_DISTRIBUTED', 
      results: distributionResults,
      totalAmount: this.pots.reduce((sum, pot) => sum + pot.amount, 0)
    });

    // 阶段1.5：如果是摊牌结束，生成摊牌摘要
    if (this.gameState.street === 'SHOWDOWN') {
      this._generateShowdownSummary(distributionResults);
    }

    // 移动按钮位
    BlindsManager.moveButton(this.gameState);

    // 设置为等待状态
    this.gameState.phase = 'WAITING';
    this.gameState.currentTurn = null;
    this.pots = [];

    // 阶段2新增：手局结束钩子 - 设置桌面状态回到等待
    this._onHandEnd();

    events.push({ type: 'HAND_FINISHED', handNumber: this.gameState.handNumber });
  }

  /**
   * 获取公共游戏状态
   * @returns {Object} - 公共状态
   */
  getPublicState() {
    const state = this.gameState.getPublicState();
    return {
      ...state,
      pots: PotManager.getPotsSummary(this.pots),
      tableRules: {
        smallBlind: this.tableRules.smallBlind,
        bigBlind: this.tableRules.bigBlind,
        minBuyIn: this.tableRules.minBuyIn,
        maxBuyIn: this.tableRules.maxBuyIn
      }
    };
  }

  /**
   * 获取特定玩家的私有状态
   * @param {string} playerId - 玩家ID
   * @returns {Object} - 私有状态
   */
  getPrivateStateFor(playerId) {
    return this.gameState.getPrivateStateFor(playerId);
  }

  /**
   * 获取游戏摘要信息
   * @returns {Object} - 游戏摘要
   */
  getGameSummary() {
    return {
      gameId: this.gameState.gameId,
      phase: this.gameState.phase,
      street: this.gameState.street,
      handNumber: this.gameState.handNumber,
      playerCount: this.gameState.players.length,
      activePlayerCount: this.gameState.activePlayersCount,
      currentTurn: this.gameState.currentTurn,
      potTotal: this.pots.reduce((sum, pot) => sum + pot.amount, 0),
      tableRules: this.tableRules.getSummary()
    };
  }

  /**
   * 阶段1.5新增：生成摊牌摘要
   * @private
   * @param {Array} distributionResults - 彩池分配结果
   */
  _generateShowdownSummary(distributionResults) {
    const winners = [];
    const winnersSet = new Set();

    // 从分配结果中提取获胜者信息
    distributionResults.forEach(result => {
      result.winners.forEach(winnerId => {
        if (!winnersSet.has(winnerId)) {
          winnersSet.add(winnerId);
          
          const player = this.gameState.getPlayer(winnerId);
          if (player && player.holeCards.length > 0) {
            // 使用HandEvaluator的新方法获取详细信息
            const detailed = this.handEvaluator.describeBestHand(
              player.holeCards,
              this.gameState.communityCards
            );
            
            winners.push({
              playerId: winnerId,
              rankName: detailed.rankName,
              bestFive: detailed.bestFive,
              usedHole: detailed.usedHole
            });
          }
        }
      });
    });

    // 设置摊牌摘要
    if (winners.length > 0) {
      this.gameState.setShowdownSummary(winners);
    }
  }

  /**
   * 阶段1.5新增：结束会话并生成整局结算
   * @returns {Object|null} - 结算数据或null（如果会话未初始化）
   */
  endSession() {
    if (!this.gameState.session) {
      return null; // 会话未初始化
    }

    // 修复：在结算前先处理筹码返还，避免筹码丢失
    this._refundChipsOnGameEnd();

    const finalSettlement = {
      sessionId: this.gameState.session.id,
      startedAt: this.gameState.session.startedAt,
      endedAt: Date.now(),
      handsPlayed: this.gameState.session.handsPlayed,
      perPlayer: [],
      totalChips: 0
    };

    // 计算每个玩家的盈亏
    this.gameState.players.forEach(player => {
      const baseline = this.gameState.session.baselineStacks[player.id] || 0;
      const current = player.chips;
      const pnl = current - baseline;

      finalSettlement.perPlayer.push({
        playerId: player.id,
        playerName: player.name,
        baseline: baseline,
        current: current,
        pnl: pnl
      });

      finalSettlement.totalChips += current;
    });

    // 标记会话已结束（可选，用于防止重复结束）
    this.gameState.session.ended = true;
    this.gameState.session.endedAt = Date.now();

    return finalSettlement;
  }

  /**
   * 游戏强制结束时的筹码返还处理
   * 方案A：返还所有currentBet，并将已形成的彩池按贡献等额退回给有资格参与该池的玩家
   * @private
   */
  _refundChipsOnGameEnd() {
    // 1) 返还所有玩家的当前街下注（未归入彩池的部分）
    this.gameState.players.forEach(player => {
      player.chips += player.currentBet;
      player.currentBet = 0;
    });

    // 2) 将已形成的彩池按贡献者等额退回
    if (this.pots && this.pots.length > 0) {
      for (const pot of this.pots) {
        if (!pot || !pot.amount || pot.amount <= 0) continue;
        const eligiblePlayers = (pot.eligiblePlayers || [])
          .map(pid => this.gameState.getPlayer(pid))
          .filter(Boolean);
        if (eligiblePlayers.length === 0) continue;

        const baseShare = Math.floor(pot.amount / eligiblePlayers.length);
        const remainder = pot.amount % eligiblePlayers.length;

        // 均分部分
        eligiblePlayers.forEach(p => {
          p.chips += baseShare;
        });

        // 余数按按钮位后顺时针发放
        if (remainder > 0) {
          const pseudoWinners = eligiblePlayers.map(p => ({ playerId: p.id, player: p }));
          const sorted = PotManager._sortWinnersByPosition(
            pseudoWinners,
            this.gameState.buttonIndex,
            this.gameState.players
          );
          for (let i = 0; i < remainder; i++) {
            sorted[i].player.chips += 1;
          }
        }
      }
    }

    // 3) 清空彩池
    this.pots = [];
  }

  // 阶段2新增方法：手局边界钩子

  /**
   * 手局开始钩子
   * @private
   */
  _onHandStart() {
    // 设置桌面状态为手局进行中
    this.gameState.setTableStatus('HAND_IN_PROGRESS');
  }

  /**
   * 手局结束钩子
   * @private
   */
  _onHandEnd() {
    // 设置桌面状态回到等待状态
    this.gameState.setTableStatus('WAITING');
  }
}