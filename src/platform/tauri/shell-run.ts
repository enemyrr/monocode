import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type OutputPayload = { id: string; data: string };

export type ShellRunExit = {
  id: string;
  code: number | null;
  cancelled: boolean;
  /** Output kept after the streamed head filled up. */
  tail: string;
  droppedBytes: number;
};

/** Runs `command` with the login shell in `cwd`. Resolves once it started. */
export async function startShellRun(
  id: string,
  cwd: string,
  command: string,
  handlers: {
    onOutput: (data: string) => void;
    onExit: (exit: ShellRunExit) => void;
  },
): Promise<void> {
  const unlisten = await Promise.all([
    listen<OutputPayload>("shell-run-output", ({ payload }) => {
      if (payload.id === id) handlers.onOutput(payload.data);
    }),
    listen<ShellRunExit>("shell-run-exit", ({ payload }) => {
      if (payload.id !== id) return;
      stop();
      handlers.onExit(payload);
    }),
  ]);
  const stop = () => unlisten.forEach((off) => off());
  try {
    await invoke("shell_run_start", { id, cwd, command });
  } catch (error) {
    stop();
    throw error;
  }
}

export function cancelShellRun(id: string): Promise<void> {
  return invoke("shell_run_cancel", { id });
}
