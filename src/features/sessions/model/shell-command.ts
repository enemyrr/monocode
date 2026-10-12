import type { Block, Session } from "./session";

/** A `!<command>` the user ran in the session's working directory. */
export type ShellRunMeta = {
  runId: string;
  command: string;
  cwd: string;
  status: "running" | "done" | "cancelled" | "failed";
  startedAt: number;
  exitCode?: number;
  output?: string;
  error?: string;
  /** Started while an agent turn was running, so it sits inside that turn. */
  inTurn?: boolean;
};

/** Output kept in the saved session; the live run keeps up to 256 KB. */
export const PERSISTED_OUTPUT_CHARS = 32_000;
/** Output put in front of the agent by "Send to agent". */
export const AGENT_OUTPUT_CHARS = 8_000;

/** The command in a `!<command>` draft, or null when the draft is a prompt. */
export function parseShellCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("!")) return null;
  const command = trimmed.slice(1).trim();
  return command || null;
}

/** True while the draft reads as a shell command, including a bare `!`. */
export function isShellDraft(text: string): boolean {
  return text.trimStart().startsWith("!");
}

const ANSI =
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Joins the streamed head and the kept tail around a note of what was cut. */
export function joinCappedOutput(
  head: string,
  tail: string,
  droppedBytes: number,
): string {
  if (droppedBytes > 0)
    return `${head}\n… ${formatBytes(droppedBytes)} of output truncated …\n${tail}`;
  return head + tail;
}

const TRUNCATED = "… earlier output truncated …\n";

/** Fits `text` in `limit` characters by keeping its end, from a line start when it can. */
export function keepTail(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(text.length - (limit - TRUNCATED.length));
  const newline = cut.indexOf("\n");
  return (
    TRUNCATED +
    (newline >= 0 && newline < cut.length / 2 ? cut.slice(newline + 1) : cut)
  );
}

/** The message "Send to agent" puts in the composer. */
export function shellRunAgentMessage(run: ShellRunMeta): string {
  const output = keepTail(
    stripAnsi(run.output ?? "").trimEnd(),
    AGENT_OUTPUT_CHARS,
  );
  const result =
    run.status === "cancelled"
      ? "was cancelled"
      : run.status === "failed"
        ? `failed to start: ${run.error ?? "unknown error"}`
        : `exited with code ${run.exitCode ?? "unknown"}`;
  const lines = [`I ran \`${run.command}\` in \`${run.cwd}\`. It ${result}.`];
  if (output) {
    const fence = "`".repeat(Math.max(3, longestBacktickRun(output) + 1));
    lines.push("", `${fence}text`, output, fence);
  }
  return lines.join("\n");
}

export function shellRunBlock(run: ShellRunMeta): Block {
  return {
    id: run.runId,
    role: "system",
    text: `$ ${run.command}`,
    shellRun: run,
  };
}

/** Replaces the run's block, or appends it when the run is new. */
export function upsertShellRunBlock(session: Session, block: Block): Session {
  const index = session.blocks.findIndex((entry) => entry.id === block.id);
  const blocks = session.blocks.slice();
  if (index >= 0) blocks[index] = block;
  else blocks.push(block);
  return { ...session, blocks };
}

/** A saved run. One saved while running was cut short by a restart. */
export function sanitizeShellRun(value: unknown): ShellRunMeta | undefined {
  if (!value || typeof value !== "object") return undefined;
  const run = value as Partial<ShellRunMeta>;
  if (
    typeof run.runId !== "string" ||
    typeof run.command !== "string" ||
    typeof run.cwd !== "string" ||
    typeof run.startedAt !== "number"
  )
    return undefined;
  const status =
    run.status === "done" || run.status === "failed" ? run.status : "cancelled";
  return {
    runId: run.runId,
    command: run.command,
    cwd: run.cwd,
    status,
    startedAt: run.startedAt,
    ...(typeof run.exitCode === "number" ? { exitCode: run.exitCode } : {}),
    ...(typeof run.output === "string"
      ? { output: keepTail(run.output, PERSISTED_OUTPUT_CHARS) }
      : {}),
    ...(typeof run.error === "string" ? { error: run.error } : {}),
    ...(run.inTurn ? { inTurn: true } : {}),
  };
}

function longestBacktickRun(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`;
}
