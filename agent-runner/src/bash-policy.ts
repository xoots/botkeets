const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\s)(sudo|su|doas)(\s|$)/, reason: 'privilege escalation is not allowed' },
  { pattern: /(^|\s)(shutdown|reboot|halt|poweroff|launchctl|systemctl|service)(\s|$)/, reason: 'system administration commands are not allowed' },
  { pattern: /(^|\s)(mkfs|fdisk|diskutil|dd)(\s|$)/, reason: 'disk and volume modification commands are not allowed' },
  { pattern: /rm\s+-(?:rf|fr|r)\s+(?:--\s+)?\/workspace\/(?:group|project|global|ipc)(?:\/|\b)/, reason: 'destructive deletion of protected workspace mounts is not allowed' },
  { pattern: /rm\s+-(?:rf|fr|r)\s+(?:--\s+)?\/home\/node\/\.claude(?:\/|\b)/, reason: 'destructive deletion of Claude session state is not allowed' },
  { pattern: /(curl|wget)[^|\n]*\|\s*(sh|bash)\b/, reason: 'remote shell bootstrap patterns are not allowed' },
];

export function validateBashCommand(command: string): { allowed: true } | { allowed: false; reason: string } {
  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.pattern.test(command)) {
      return { allowed: false, reason: blocked.reason };
    }
  }

  return { allowed: true };
}
