import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function enableDevReload(io) {
	try {
		const publicDir = path.join(__dirname, '../ui/public');
		let reloadTimer = null;

		const scheduleReload = () => {
			if (reloadTimer) return;
			reloadTimer = setTimeout(() => {
				reloadTimer = null;
				try {
					io.emit('reload');
					console.log('检测到前端资源变更，已通知客户端刷新');
				} catch (e) {
					// 忽略发送失败
				}
			}, 200);
		};

		// Windows/macOS 支持 recursive 递归监听
		fs.watch(publicDir, { recursive: true }, (eventType, filename) => {
			if (!filename) return;
			// 忽略 sourcemap 等无关文件
			if (filename.endsWith('.map')) return;
			scheduleReload();
		});

		console.log('开发模式：已开启静态目录热刷新监听');
	} catch (err) {
		console.warn('启用前端热刷新失败（非致命）：', err && err.message ? err.message : err);
	}
}


