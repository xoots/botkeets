import fs from 'fs';
import path from 'path';
import { IPC_DIR } from '../../../config.js';
export class IpcQueueAlertAdapter {
    publishQueueDrop(alert) {
        const sentinelDir = path.join(IPC_DIR, '_alerts');
        fs.mkdirSync(sentinelDir, { recursive: true });
        fs.writeFileSync(path.join(sentinelDir, `queue-drop-${alert.groupJid.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`), JSON.stringify(alert));
    }
}
//# sourceMappingURL=ipc-queue-alert-adapter.js.map