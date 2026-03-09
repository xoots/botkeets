export const SUPPORTED_WORKER_RUNNERS: readonly [
  'claude',
  'openrouter',
  'dashscope',
  'deepseek',
  'ollama',
];

export type SupportedWorkerRunner = typeof SUPPORTED_WORKER_RUNNERS[number];
export type WorkerRuntimeManifest = Record<SupportedWorkerRunner, string>;

export type WorkerRuntimeManifestValidationResult =
  | { ok: true; manifest: WorkerRuntimeManifest }
  | { ok: false; detail: string };

export function validateWorkerRuntimeManifest(
  manifest: unknown,
  availableArtifacts?: Iterable<string>,
): WorkerRuntimeManifestValidationResult;
