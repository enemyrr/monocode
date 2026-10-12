import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { cancelShellRun } from "../../../platform/tauri/shell-run";
import {
  ArrowUp,
  ChevronRight,
  LoaderCircle,
  Square,
  Terminal,
} from "../../../shared/ui/icons";
import {
  shellRunAgentMessage,
  stripAnsi,
  type ShellRunMeta,
} from "../model/shell-command";
import { liveShellOutput, subscribeShellRuns } from "../model/shell-run-store";

/** Puts a finished run's result in the composer. */
export const ShellRunSendContext = createContext<
  ((text: string) => void) | undefined
>(undefined);

const COLLAPSED_LINES = 12;

export function ShellRunRow({
  run,
  embedded,
}: {
  run: ShellRunMeta;
  embedded?: boolean;
}) {
  const send = useContext(ShellRunSendContext);
  const [expanded, setExpanded] = useState(false);
  const live = useSyncExternalStore(
    subscribeShellRuns,
    () => liveShellOutput(run.runId),
    () => undefined,
  );
  const running = run.status === "running" && live !== undefined;
  const output = stripAnsi(
    (running ? live : run.output) ?? run.error ?? "",
  ).replace(/\n+$/, "");
  const lines = output ? output.split("\n") : [];
  const hidden = expanded ? 0 : Math.max(0, lines.length - COLLAPSED_LINES);
  const failed =
    run.status === "failed" || (run.exitCode != null && run.exitCode !== 0);

  return (
    <div className={`${embedded ? "" : "px-4"} py-1.5`}>
      <div
        data-shell-run={run.runId}
        className="min-w-0 overflow-hidden rounded-lg border border-content/8 bg-content/3"
      >
        <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5">
          <Terminal
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <code
            title={`${run.command}\n${run.cwd}`}
            className="min-w-0 flex-1 truncate font-mono text-[12px] text-content/85"
          >
            {run.command}
          </code>
          {running ? (
            <>
              <LoaderCircle
                className="size-3.5 shrink-0 animate-spin text-content/40"
                strokeWidth={1.75}
              />
              <button
                type="button"
                title="Stop command"
                aria-label="Stop command"
                onClick={() => void cancelShellRun(run.runId)}
                className="grid size-5.5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content"
              >
                <Square className="size-3" strokeWidth={2} />
              </button>
            </>
          ) : (
            <span
              className={`shrink-0 font-sans text-[11px] ${failed ? "text-red-400/80" : "text-content/40"}`}
            >
              {statusLabel(run)}
            </span>
          )}
        </div>
        {lines.length > 0 ? (
          <div className="border-t border-content/6">
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex w-full items-center gap-1 px-2.5 pt-1.5 font-sans text-[11px] text-content/40 hover:text-content/70"
              >
                <ChevronRight className="size-3" strokeWidth={1.75} />
                {hidden} earlier {hidden === 1 ? "line" : "lines"}
              </button>
            ) : null}
            <pre
              className={`min-w-0 overflow-x-auto px-2.5 py-1.5 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words ${
                failed && run.status === "failed"
                  ? "text-red-400/80"
                  : "text-content/65"
              } ${expanded ? "max-h-[60vh] overflow-y-auto" : ""}`}
            >
              {hidden > 0 ? lines.slice(hidden).join("\n") : output}
            </pre>
          </div>
        ) : null}
        {!running && send && run.status !== "failed" ? (
          <div className="flex justify-end border-t border-content/6 px-1.5 py-1">
            <button
              type="button"
              onClick={() => send(shellRunAgentMessage(run))}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px] text-content/50 transition-colors duration-(--motion-feedback-duration) hover:bg-content/8 hover:text-content"
            >
              <ArrowUp className="size-3" strokeWidth={1.75} />
              Send to agent
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function statusLabel(run: ShellRunMeta): string {
  if (run.status === "failed") return "Failed to start";
  if (run.status === "cancelled")
    return run.exitCode == null ? "Stopped" : `Stopped · exit ${run.exitCode}`;
  if (run.status === "running") return "Interrupted";
  return run.exitCode == null ? "Exited" : `exit ${run.exitCode}`;
}
