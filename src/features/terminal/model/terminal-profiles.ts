import type { HarnessId } from "../../sessions/model/session";

/** A coding-agent CLI run as its own TUI in a terminal tab, not a MonoCode session. */
export type TerminalProfile = {
  id: TerminalProfileId;
  label: string;
  command: string;
  args: string[];
};

export type TerminalProfileId = Extract<HarnessId, "claude" | "codex" | "opencode">;

const PROFILES: Record<TerminalProfileId, TerminalProfile> = {
  claude: { id: "claude", label: "Claude Code", command: "claude", args: [] },
  codex: { id: "codex", label: "Codex", command: "codex", args: [] },
  opencode: { id: "opencode", label: "OpenCode", command: "opencode", args: [] },
};

export const TERMINAL_PROFILES: readonly TerminalProfile[] =
  Object.values(PROFILES);

export function terminalProfile(id: TerminalProfileId): TerminalProfile {
  return PROFILES[id];
}

export function asTerminalProfileId(
  value: unknown,
): TerminalProfileId | undefined {
  return TERMINAL_PROFILES.some((profile) => profile.id === value)
    ? (value as TerminalProfileId)
    : undefined;
}

/** Command and argv for `pty_spawn`; a plain terminal has none. */
export function terminalLaunch(
  id: TerminalProfileId | undefined,
): { command: string; args: string[] } | undefined {
  if (!id) return undefined;
  const { command, args } = terminalProfile(id);
  return { command, args: [...args] };
}

/** Before the first probe every profile shows; after it, only installed CLIs. */
export function availableTerminalProfiles(
  installed: (id: HarnessId) => boolean,
  probed: boolean,
): TerminalProfile[] {
  return TERMINAL_PROFILES.filter((profile) => !probed || installed(profile.id));
}
