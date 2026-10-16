import { useRef, useState } from "react";
import {
  ExplorerMenu,
  type ExplorerMenuItem,
} from "../../features/files/ui/ExplorerMenu";
import { asTerminalProfileId } from "../../features/terminal/model/terminal-profiles";
import type { TerminalProfileId } from "../../features/terminal/model/terminal-profiles";
import { useTerminalProfiles } from "../../features/terminal/ui/use-terminal-profiles";
import { MOD, SHIFT } from "../../platform/tauri/platform";
import { Plus } from "../../shared/ui/icons";
import { IconButton } from "./TitleBar";

/** The "+" that asks what to open: an agent session, a shell, or an agent CLI. */
export function NewTabButton({
  onNewSession,
  onNewTerminal,
  onNewProfileTerminal,
}: {
  onNewSession: () => void;
  onNewTerminal?: () => void;
  onNewProfileTerminal?: (profile: TerminalProfileId) => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const profiles = useTerminalProfiles(open && !!onNewProfileTerminal);

  if (!onNewTerminal && !onNewProfileTerminal)
    return (
      <IconButton label={`New session (${MOD}N)`} onClick={onNewSession}>
        <Plus className="size-3.5" strokeWidth={1.75} />
      </IconButton>
    );

  const items: ExplorerMenuItem[] = [
    {
      kind: "item",
      id: "session",
      label: "New session",
      shortcut: `${MOD}N`,
    },
    ...(onNewTerminal
      ? [
          {
            kind: "item" as const,
            id: "terminal",
            label: "New terminal",
            shortcut: `${MOD}${SHIFT}T`,
          },
        ]
      : []),
    ...(onNewProfileTerminal && profiles.length > 0
      ? [
          { kind: "sep" as const },
          ...profiles.map((profile) => ({
            kind: "item" as const,
            id: profile.id,
            label: profile.label,
          })),
        ]
      : []),
  ];

  const pick = (id: string) => {
    setOpen(false);
    if (id === "session") return onNewSession();
    if (id === "terminal") return onNewTerminal?.();
    const profile = asTerminalProfileId(id);
    if (profile) onNewProfileTerminal?.(profile);
  };

  return (
    <span ref={anchorRef} className="flex">
      <IconButton label="New…" active={open} onClick={() => setOpen(!open)}>
        <Plus className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      {open && anchorRef.current ? (
        <ExplorerMenu
          anchor={anchorRef.current}
          ariaLabel="New"
          items={items}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}
