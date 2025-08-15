/**
 * Storage - 持久化存储抽象接口
 * 
 * 为阶段三持久化功能提供统一的存储抽象层，支持快照保存、
 * 事件追加和会话管理。实现类需要提供具体的存储后端。
 * 
 * 设计原则：
 * - 接口简洁明确，只包含必需方法
 * - 支持异步操作和流式读取
 * - 错误处理由实现类负责
 */

export default class Storage {
  /**
   * 保存会话快照（覆盖写入）
   * @param {string} sessionId - 会话ID
   * @param {Object} data - 快照数据对象
   * @returns {Promise<void>}
   */
  async saveSnapshot(sessionId, data) {
    throw new Error('saveSnapshot not implemented');
  }

  /**
   * 读取会话快照
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 快照数据对象
   */
  async readSnapshot(sessionId) {
    throw new Error('readSnapshot not implemented');
  }

  /**
   * 读取会话信息（与readSnapshot等价，为了与文档接口一致保留）
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 会话数据对象
   */
  async readSession(sessionId) {
    throw new Error('readSession not implemented');
  }

  /**
   * 追加公共事件到日志
   * @param {string} sessionId - 会话ID
   * @param {Object} event - 事件对象
   * @returns {Promise<void>}
   */
  async appendPublicEvent(sessionId, event) {
    throw new Error('appendPublicEvent not implemented');
  }

  /**
   * 追加私有事件到日志（可选功能）
   * @param {string} sessionId - 会话ID
   * @param {Object} event - 私有事件对象
   * @returns {Promise<void>}
   */
  async appendPrivateEvent(sessionId, event) {
    throw new Error('appendPrivateEvent not implemented');
  }

  /**
   * 列出所有会话
   * @returns {Promise<Array>} 会话信息数组
   */
  async listSessions() {
    throw new Error('listSessions not implemented');
  }

  /**
   * 检查会话是否存在
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>} 是否存在
   */
  async sessionExists(sessionId) {
    throw new Error('sessionExists not implemented');
  }

  /**
   * 流式读取公共事件（支持从指定序号开始）
   * @param {string} sessionId - 会话ID
   * @param {number} fromSeq - 起始序号，默认0
   * @returns {AsyncIterator<Object>} 事件对象迭代器
   */
  async *streamPublicEvents(sessionId, fromSeq = 0) {
    throw new Error('streamPublicEvents not implemented');
  }

  /**
   * 流式读取私有事件（管理员模式，可选功能）
   * @param {string} sessionId - 会话ID
   * @param {number} fromSeq - 起始序号，默认0
   * @returns {AsyncIterator<Object>} 私有事件对象迭代器
   */
  async *streamPrivateEvents(sessionId, fromSeq = 0) {
    throw new Error('streamPrivateEvents not implemented');
  }
}