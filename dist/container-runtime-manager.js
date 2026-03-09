import { appleContainerRuntime } from './apple-container-runtime.js';
import { dockerContainerRuntime } from './docker-container-runtime.js';
import { CONTAINER_RUNTIME_TYPE } from './config.js'; // Assuming this config exists
import { logger } from './logger.js';
let activeContainerRuntime;
switch (CONTAINER_RUNTIME_TYPE) {
    case 'docker':
        activeContainerRuntime = dockerContainerRuntime;
        logger.info('Using Docker container runtime');
        break;
    case 'apple':
        activeContainerRuntime = appleContainerRuntime;
        logger.info('Using Apple container runtime');
        break;
    default:
        logger.warn(`Unknown CONTAINER_RUNTIME_TYPE: ${CONTAINER_RUNTIME_TYPE}. Defaulting to Apple container runtime.`);
        activeContainerRuntime = appleContainerRuntime;
        break;
}
export const containerRuntime = activeContainerRuntime;
//# sourceMappingURL=container-runtime-manager.js.map