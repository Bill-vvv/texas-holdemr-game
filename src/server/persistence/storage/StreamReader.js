/**
 * StreamReader - 流式事件读取器
 * 
 * 专门负责从NDJSON文件中流式读取事件，支持序号过滤和错误恢复。
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';

export default class StreamReader {
  constructor(sessionDirManager) {
    this.sessionDirManager = sessionDirManager;
  }

  /**
   * 流式读取公共事件
   */
  async *streamPublicEvents(sessionId, fromSeq = 0) {
    const sessionDir = this.sessionDirManager.getSessionDir(sessionId);
    const eventsFile = path.join(sessionDir, 'events.ndjson');
    
    yield* this._streamEventsFromFile(eventsFile, fromSeq);
  }

  /**
   * 流式读取私有事件
   */
  async *streamPrivateEvents(sessionId, fromSeq = 0) {
    const sessionDir = this.sessionDirManager.getSessionDir(sessionId);
    const privateFile = path.join(sessionDir, 'private.ndjson');
    
    yield* this._streamEventsFromFile(privateFile, fromSeq);
  }

  /**
   * 从指定文件流式读取事件
   */
  async *_streamEventsFromFile(filePath, fromSeq = 0) {
    try {
      const fileStream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
      
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            if (!event.seq || event.seq >= fromSeq) {
              yield event;
            }
          } catch (parseError) {
            // 跳过损坏的事件行，继续处理
            continue;
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to stream events from ${filePath}: ${error.message}`);
      }
      // 文件不存在时返回空迭代器
    }
  }

  /**
   * 统计事件文件中的事件数量（EventLogger支持）
   */
  async countEvents(filePath) {
    try {
      const fileStream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
      
      let count = 0;
      for await (const line of rl) {
        if (line.trim()) {
          try {
            JSON.parse(line); // 验证JSON格式
            count++;
          } catch (parseError) {
            // 跳过损坏的行
            continue;
          }
        }
      }
      
      return count;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // 文件不存在时返回0
      }
      throw new Error(`Failed to count events in ${filePath}: ${error.message}`);
    }
  }
}