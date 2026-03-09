/**
 * Skill Loader — loads SKILL.md routing hints for micro-task roles.
 * Cached in memory after first load. Returns empty string if not found.
 */
import type { KvRole } from './drip-feed-kv.js';
export declare function loadSkill(role: KvRole): string;
export declare function inferRole(description: string): KvRole;
export declare function getSkillHints(description: string): string;
export declare function clearSkillCache(): void;
//# sourceMappingURL=skill-loader.d.ts.map