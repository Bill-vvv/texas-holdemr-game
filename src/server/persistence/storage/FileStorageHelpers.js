/**
 * FileStorageHelpers - 文件存储辅助工具
 * 
 * 提供FileStorage的辅助功能，包括目录管理、文件操作等。
 * 分离出来以保持FileStorage主文件的简洁性。
 */

import fs from 'fs/promises';
import path from 'path';

export class SessionDirManager {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
  }

  getSessionDir(sessionId) {
    return path.join(this.dataDir, sessionId);
  }

  async ensureSessionDir(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  async sessionExists(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    try {
      const stats = await fs.stat(sessionDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }
}

export class FileOperations {
  /**
   * 原子保存文件（临时文件+重命名）
   */
  static async atomicSave(filePath, content) {
    const tempFile = `${filePath}.tmp.${Date.now()}`;
    
    try {
      await fs.writeFile(tempFile, content, 'utf8');
      await fs.rename(tempFile, filePath);
    } catch (error) {
      // 清理临时文件
      try {
        await fs.unlink(tempFile);
      } catch (cleanupError) {
        // 忽略清理错误
      }
      throw error;
    }
  }

  /**
   * 安全追加文件
   */
  static async safeAppend(filePath, content) {
    await fs.appendFile(filePath, content, 'utf8');
  }

  /**
   * 安全读取JSON文件
   */
  static async readJSON(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

export class SessionListManager {
  constructor(dirManager) {
    this.dirManager = dirManager;
  }

  async listSessions() {
    try {
      const entries = await fs.readdir(this.dirManager.dataDir, { withFileTypes: true });
      const sessions = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionId = entry.name;
          const sessionDir = this.dirManager.getSessionDir(sessionId);
          const snapshotFile = path.join(sessionDir, 'session.json');
          
          try {
            const stats = await fs.stat(snapshotFile);
            const snapshot = await FileOperations.readJSON(snapshotFile);
            sessions.push({
              sessionId,
              startedAt: snapshot?.session?.startedAt || stats.mtime.getTime(),
              handsPlayed: snapshot?.session?.handsPlayed || 0,
              lastModified: stats.mtime.getTime()
            });
          } catch (error) {
            // 跳过损坏的会话
            continue;
          }
        }
      }
      
      return sessions.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Failed to list sessions: ${error.message}`);
    }
  }
}