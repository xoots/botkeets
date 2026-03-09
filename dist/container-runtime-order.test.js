import { describe, expect, it } from 'vitest';
import { appleContainerRuntime } from './apple-container-runtime.js';
import { dockerContainerRuntime } from './docker-container-runtime.js';
describe('container runtime env ordering', () => {
    it('builds the Docker run command deterministically', () => {
        const command = dockerContainerRuntime.getRunCommand('test-name', 'test-image', ['--flag', 'value'], [
            { hostPath: '/tmp/group', containerPath: '/workspace/group', readonly: false },
            { hostPath: '/tmp/global', containerPath: '/workspace/global', readonly: true },
        ], {
            USER_ID: '501',
            AGENT_RUNNER: 'openrouter',
            OPENROUTER_MODEL: 'gpt',
            GROUP_ID: '20',
        }, [{ hostPort: 8765, containerPort: 8765 }], '/workspace/group', ['--pull=never']);
        expect(command).toMatchInlineSnapshot(`
      {
        "args": [
          "run",
          "-i",
          "--rm",
          "--name=test-name",
          "-w",
          "/workspace/group",
          "-v",
          "/tmp/group:/workspace/group",
          "-v",
          "/tmp/global:/workspace/global:ro",
          "-e",
          "AGENT_RUNNER=openrouter",
          "-e",
          "GROUP_ID=20",
          "-e",
          "OPENROUTER_MODEL=gpt",
          "-e",
          "USER_ID=501",
          "-p",
          "8765:8765",
          "--pull=never",
          "test-image",
          "--flag",
          "value",
        ],
        "command": "docker",
      }
    `);
    });
    it('builds the Apple Container run command deterministically', () => {
        const command = appleContainerRuntime.getRunCommand('test-name', 'test-image', ['--flag', 'value'], [
            { hostPath: '/tmp/group', containerPath: '/workspace/group', readonly: false },
            { hostPath: '/tmp/global', containerPath: '/workspace/global', readonly: true },
        ], {
            USER_ID: '501',
            AGENT_RUNNER: 'ollama',
            OLLAMA_MODEL: 'llama3',
            GROUP_ID: '20',
        }, [{ hostPort: 8765, containerPort: 8765 }], '/workspace/group', ['--pull=never']);
        expect(command).toMatchInlineSnapshot(`
      {
        "args": [
          "run",
          "-i",
          "--rm",
          "--name=test-name",
          "-w",
          "/workspace/group",
          "-v",
          "/tmp/group:/workspace/group",
          "-v",
          "/tmp/global:/workspace/global:ro",
          "-e",
          "AGENT_RUNNER=ollama",
          "-e",
          "GROUP_ID=20",
          "-e",
          "OLLAMA_MODEL=llama3",
          "-e",
          "USER_ID=501",
          "-p",
          "8765:8765",
          "--pull=never",
          "test-image",
          "--flag",
          "value",
        ],
        "command": "container",
      }
    `);
    });
});
//# sourceMappingURL=container-runtime-order.test.js.map