// Stub for copaw-migration — required by keet-provider-config.ts
import { KEET_COPAW_ALLOW_LEGACY_READS } from './config.js';
export function shouldAllowLegacyReads() { return KEET_COPAW_ALLOW_LEGACY_READS; }
export function trackLegacyRead(_scope, _key) { }
export function getCoPawMigrationTelemetry() { return {}; }
export function getMigrationGateStatus() { return {}; }
//# sourceMappingURL=copaw-migration.js.map