import { describe, expect, it } from "vitest";
import type { Block } from "./session";
import {
  AGENT_OUTPUT_CHARS,
  joinCappedOutput,
  parseShellCommand,
  PERSISTED_OUTPUT_CHARS,
  sanitizeShellRun,
  shellRunAgentMessage,
  shellRunBlock,
  type ShellRunMeta,
} from "./shell-command";
import { groupTurns } from "./transcriptActivity";

const run: ShellRunMeta = {
  runId: "run-1",
  command: "git status",
  cwd: "/repo",
  status: "done",
  startedAt: 1,
  exitCode: 0,
  output: "clean\n",
};

describe("parseShellCommand", () => {
  it.each([
    ["!ls -la", "ls -la"],
    ["  ! git status \n", "git status"],
    ["!", null],
    ["!   ", null],
    ["ls", null],
    ["run !this", null],
  ])("%j → %j", (draft, command) => {
    expect(parseShellCommand(draft)).toBe(command);
  });
});

describe("joinCappedOutput", () => {
  it("marks the cut between the streamed head and the kept tail", () => {
    expect(joinCappedOutput("a", "", 0)).toBe("a");
    expect(joinCappedOutput("head", "tail", 4096)).toBe(
      "head\n… 4 KB of output truncated …\ntail",
    );
  });
});

describe("shellRunAgentMessage", () => {
  it("names the command, folder and exit code above a fenced output", () => {
    expect(shellRunAgentMessage({ ...run, exitCode: 1 })).toBe(
      "I ran `git status` in `/repo`. It exited with code 1.\n\n```text\nclean\n```",
    );
  });

  it("uses a fence longer than any backtick run in the output", () => {
    const message = shellRunAgentMessage({ ...run, output: "a ```` b" });
    expect(message).toContain("\n`````text\na ```` b\n`````");
  });

  it("keeps only the end of long output", () => {
    const output = `${"x".repeat(AGENT_OUTPUT_CHARS)}\nlast line`;
    const message = shellRunAgentMessage({ ...run, output });
    expect(message.length).toBeLessThan(AGENT_OUTPUT_CHARS + 200);
    expect(message).toContain("earlier output truncated");
    expect(message).toContain("last line\n```");
  });
});

describe("sanitizeShellRun", () => {
  it("restores a run saved mid-flight as stopped", () => {
    expect(sanitizeShellRun({ ...run, status: "running" })?.status).toBe(
      "cancelled",
    );
  });

  it("caps saved output", () => {
    const saved = sanitizeShellRun({
      ...run,
      output: "y".repeat(PERSISTED_OUTPUT_CHARS * 2),
    });
    expect(saved?.output?.length).toBeLessThanOrEqual(PERSISTED_OUTPUT_CHARS);
    // Every save sanitizes again; a saved run must not lose more each time.
    expect(sanitizeShellRun(saved)?.output).toBe(saved?.output);
  });

  it("drops malformed runs", () => {
    expect(sanitizeShellRun({ command: "ls" })).toBeUndefined();
  });
});

describe("shell runs in transcript turns", () => {
  const user: Block = { id: "u", role: "user", text: "hi" };
  const answer: Block = { id: "a", role: "assistant", text: "hello" };

  it("puts a run started between turns on its own row", () => {
    const shell = shellRunBlock(run);
    expect(groupTurns([user, answer, shell]).map((t) => t.length)).toEqual([
      2, 1,
    ]);
  });

  it("keeps a run started during a turn inside that turn", () => {
    const shell = shellRunBlock({ ...run, inTurn: true });
    expect(groupTurns([user, shell, answer]).map((t) => t.length)).toEqual([3]);
  });
});
