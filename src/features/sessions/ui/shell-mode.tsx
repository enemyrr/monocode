import { prettyCwd } from "../../../shared/lib/paths";
import { Terminal } from "../../../shared/ui/icons";

/** What the composer needs to run a `!<command>` draft. */
export type ComposerShellCommand = {
  cwd: string;
  /** Why commands can't run here. Shell mode shows it and blocks the send. */
  unavailable?: string;
  onRun: (command: string) => boolean | void;
};

export const SHELL_PREFIX_CLASS = "text-emerald-700 dark:text-emerald-300/90";

export function ShellModeHint({ shell }: { shell: ComposerShellCommand }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 px-3 pt-2 font-sans text-[11px] text-content/45">
      <Terminal
        className={`size-3.5 shrink-0 ${shell.unavailable ? "text-content/35" : SHELL_PREFIX_CLASS}`}
        strokeWidth={1.75}
      />
      {shell.unavailable ? (
        <span className="truncate">{shell.unavailable}</span>
      ) : (
        <span className="truncate">
          Run in <span className="font-mono">{prettyCwd(shell.cwd)}</span>
          {" · not sent to the agent"}
        </span>
      )}
    </p>
  );
}
