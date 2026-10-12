import { startShellRun } from "../../../platform/tauri/shell-run";
import type { Block } from "./session";
import {
  joinCappedOutput,
  shellRunBlock,
  type ShellRunMeta,
} from "./shell-command";

/** Streamed output of runs still going, by run id. Not saved. */
const liveOutput = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeShellRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function liveShellOutput(runId: string): string | undefined {
  return liveOutput.get(runId);
}

/**
 * Starts a `!<command>` run. `onUpdate` receives the run's block when it
 * starts and again when it ends; output in between lives in this store.
 */
export function runShellCommand({
  command,
  cwd,
  inTurn,
  onUpdate,
}: {
  command: string;
  cwd: string;
  inTurn: boolean;
  onUpdate: (block: Block) => void;
}): void {
  const run: ShellRunMeta = {
    runId: crypto.randomUUID(),
    command,
    cwd,
    status: "running",
    startedAt: Date.now(),
    ...(inTurn ? { inTurn: true } : {}),
  };
  const finish = (patch: Partial<ShellRunMeta>) => {
    liveOutput.delete(run.runId);
    notify();
    onUpdate(shellRunBlock({ ...run, ...patch }));
  };
  let head = "";
  liveOutput.set(run.runId, head);
  onUpdate(shellRunBlock(run));
  startShellRun(run.runId, cwd, command, {
    onOutput: (data) => {
      head += data;
      liveOutput.set(run.runId, head);
      notify();
    },
    onExit: (exit) =>
      finish({
        status: exit.cancelled ? "cancelled" : "done",
        ...(exit.code != null ? { exitCode: exit.code } : {}),
        output: joinCappedOutput(head, exit.tail, exit.droppedBytes),
      }),
  }).catch((error: unknown) =>
    finish({ status: "failed", error: String(error) }),
  );
}
