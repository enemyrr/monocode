import {
  asTerminalProfileId,
  type TerminalProfileId,
} from "../../terminal/model/terminal-profiles";

/** What ⌘T and the sidebar "+" open: an agent chat, a shell, or a CLI profile. */
export type NewTabTarget = "agent" | "terminal" | TerminalProfileId;

export const NEW_TAB_TARGET_DEFAULT: NewTabTarget = "agent";

const KEY = "monocode.newTabTarget";

export function asNewTabTarget(value: unknown): NewTabTarget | undefined {
  if (value === "agent" || value === "terminal") return value;
  return asTerminalProfileId(value);
}

export function loadNewTabTarget(): NewTabTarget {
  try {
    return asNewTabTarget(localStorage.getItem(KEY)) ?? NEW_TAB_TARGET_DEFAULT;
  } catch {
    return NEW_TAB_TARGET_DEFAULT;
  }
}

export function saveNewTabTarget(value: NewTabTarget) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // private mode / quota
  }
}

/** `undefined` for an agent chat; otherwise the terminal profile, if any. */
export function newTabTerminal(
  target: NewTabTarget,
): { profile?: TerminalProfileId } | undefined {
  if (target === "agent") return undefined;
  return target === "terminal" ? {} : { profile: target };
}
