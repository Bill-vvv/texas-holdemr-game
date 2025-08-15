/**
 * FileStorage - 文件系统存储实现
 * 
 * 基于本地文件系统的Storage接口实现，委托具体功能给专门的辅助类。
 * 保持主类简洁，符合单一职责原则。
 */

import path from 'path';
import Storage from './Storage.js';
import { SessionDirManager, FileOperations, SessionListManager } from './FileStorageHelpers.js';
import StreamReader from './StreamReader.js';

export default class FileStorage extends Storage {
  constructor(dataDir = './data/sessions') {
    super();
    this.sessionDirManager = new SessionDirManager(dataDir);
    this.sessionListManager = new SessionListManager(this.sessionDirManager);
    this.streamReader = new StreamReader(this.sessionDirManager);
  }

  /**
   * 原子保存快照
   */
  async saveSnapshot(sessionId, data) {
    try {
      const sessionDir = await this.sessionDirManager.ensureSessionDir(sessionId);
      const snapshotFile = path.join(sessionDir, 'session.json');
      const content = JSON.stringify(data, null, 2);
      
      await FileOperations.atomicSave(snapshotFile, content);
    } catch (error) {
      throw new Error(`Failed to save snapshot: ${error.message}`);
    }
  }

  /**
   * 读取会话快照
   */
  async readSnapshot(sessionId) {
    try {
      const sessionDir = this.sessionDirManager.getSessionDir(sessionId);
      const snapshotFile = path.join(sessionDir, 'session.json');
      
      return await FileOperations.readJSON(snapshotFile);
    } catch (error) {
      throw new Error(`Failed to read snapshot: ${error.message}`);
    }
  }

  /**
   * 追加公共事件
   */
  async appendPublicEvent(sessionId, event) {
    try {
      const sessionDir = await this.sessionDirManager.ensureSessionDir(sessionId);
      const eventsFile = path.join(sessionDir, 'events.ndjson');
      const content = JSON.stringify(event) + '\n';
      
      await FileOperations.safeAppend(eventsFile, content);
    } catch (error) {
      throw new Error(`Failed to append public event: ${error.message}`);
    }
  }

  /**
   * 追加私有事件
   */
  async appendPrivateEvent(sessionId, event) {
    try {
      const sessionDir = await this.sessionDirManager.ensureSessionDir(sessionId);
      const privateFile = path.join(sessionDir, 'private.ndjson');
      const content = JSON.stringify(event) + '\n';
      
      await FileOperations.safeAppend(privateFile, content);
    } catch (error) {
      throw new Error(`Failed to append private event: ${error.message}`);
    }
  }

  /**
   * 列出所有会话
   */
  async listSessions() {
    return await this.sessionListManager.listSessions();
  }

  /**
   * 检查会话是否存在
   */
  async sessionExists(sessionId) {
    return await this.sessionDirManager.sessionExists(sessionId);
  }

  /**
   * 流式读取公共事件
   */
  async *streamPublicEvents(sessionId, fromSeq = 0) {
    yield* this.streamReader.streamPublicEvents(sessionId, fromSeq);
  }

  /**
   * 流式读取私有事件
   */
  async *streamPrivateEvents(sessionId, fromSeq = 0) {
    yield* this.streamReader.streamPrivateEvents(sessionId, fromSeq);
  }
}