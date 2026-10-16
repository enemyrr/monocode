import { describe, expect, it } from "vitest";
import {
  delegatedTurnOutcome,
  delegationBlock,
  delegationResidents,
  missingDelegatedChildren,
  reconcileDelegations,
  recordDelegation,
  type DelegationOutcome,
} from "./delegated-sessions";
import type { Block, Session } from "./session";

function session(
  id: string,
  blocks: Block[],
  extra: Partial<Session> = {},
): Session {
  return {
    id,
    harness: "codex",
    model: "codex:test",
    modelSettings: {},
    runtimeMode: "supervised",
    title: id,
    cwd: "/repo",
    blocks,
    ...extra,
  };
}

const row = delegationBlock({
  sessionId: "child",
  title: "Review the parser",
  harness: "codex",
  model: "codex:test",
});
const parent = session(
  "parent",
  [{ id: "u1", role: "user", text: "Delegate it" }, row],
  {
    harness: "claude",
    busy: true,
  },
);
const running = session(
  "child",
  [{ id: "c1", role: "user", text: "Review", startedAt: 1 }],
  {
    busy: true,
  },
);
function finished(...tail: Block[]): Session {
  return session("child", [
    { id: "c1", role: "user", text: "Review", startedAt: 1, durationMs: 5 },
    { id: "c2", role: "assistant", text: "Looking around." },
    { id: "c3", role: "tool", text: "Read", tool: { status: "completed" } },
    { id: "c4", role: "assistant", text: "The parser is fine." },
    ...tail,
  ]);
}

describe("delegated sessions", () => {
  it("records a child's row once, however often the launch is retried", () => {
    const once = recordDelegation(session("parent", []), row);
    expect(recordDelegation(once, row)).toBe(once);
    expect(once.blocks).toEqual([row]);
  });

  it("reads a turn as settled only once its duration is stamped", () => {
    expect(delegatedTurnOutcome(session("child", []))).toBeUndefined();
    expect(delegatedTurnOutcome(running)).toBeUndefined();
    expect(delegatedTurnOutcome({ ...running, busy: false })).toBeUndefined();
    expect(delegatedTurnOutcome(finished())).toEqual({ status: "completed" });
    expect(
      delegatedTurnOutcome(
        finished({
          id: "e",
          role: "system",
          text: "Quota exceeded",
          notice: "error",
        }),
      ),
    ).toEqual({ status: "failed", error: "Quota exceeded" });
    expect(
      delegatedTurnOutcome(
        finished({
          id: "i",
          role: "system",
          text: "Interrupted",
          notice: "interrupt",
        }),
      ),
    ).toEqual({ status: "cancelled" });
  });

  it("leaves a running child's row alone", () => {
    const sessions = [parent, running];
    expect(reconcileDelegations(sessions)).toBe(sessions);
  });

  it("delivers the final answer once and queues it behind a busy parent", () => {
    const settled = reconcileDelegations([parent, finished()]);
    const next = settled[0];
    const updated = next.blocks.find((block) => block.id === row.id)!;
    expect(updated.tool?.status).toBe("completed");
    expect(updated.tool?.detail).toBe("The parser is fine.");
    expect(updated.delegation?.delivered).toBe(true);
    expect(next.busy).toBe(true);
    expect(next.queuedMessages).toHaveLength(1);
    const [message] = next.queuedMessages!;
    expect(message.monoSessionCompletion).toEqual({
      sessionId: "child",
      title: "Review the parser",
      status: "completed",
    });
    expect(message.text).toContain('"result":"The parser is fine."');
    // A reload, a resume or the next render never hands it over again.
    expect(reconcileDelegations(settled)).toBe(settled);
    const afterDispatch = [{ ...next, queuedMessages: [] }, finished()];
    expect(reconcileDelegations(afterDispatch)).toBe(afterDispatch);
  });

  it("truncates a long answer for the parent", () => {
    const long = finished({
      id: "c5",
      role: "assistant",
      text: "x".repeat(5_000),
    });
    const [next] = reconcileDelegations([parent, long]);
    expect(next.queuedMessages?.[0].text).toContain('"truncated":true');
    expect(next.blocks[1].tool?.detail?.length).toBeLessThan(4_010);
  });

  it("trusts the launch's own outcome over the transcript", () => {
    const pending = new Map<string, DelegationOutcome | null>([
      ["child", null],
    ]);
    const sessions = [parent, finished()];
    expect(reconcileDelegations(sessions, pending)).toBe(sessions);

    const stopped = new Map([["child", { status: "cancelled" as const }]]);
    const [next] = reconcileDelegations(sessions, stopped);
    expect(next.blocks[1].tool?.status).toBe("cancelled");
    expect(next.blocks[1].delegation?.delivered).toBeUndefined();
    expect(next.queuedMessages).toBeUndefined();

    // A stopped child the user continues reports when that turn answers.
    const [continued] = reconcileDelegations([next, finished()]);
    expect(continued.blocks[1].delegation?.delivered).toBe(true);
    expect(continued.queuedMessages).toHaveLength(1);
  });

  it("names the sessions that must stay loaded or be loaded", () => {
    expect(missingDelegatedChildren([parent])).toEqual(["child"]);
    expect(missingDelegatedChildren([parent, running])).toEqual([]);
    expect([...delegationResidents([parent, running])]).toEqual([
      "parent",
      "child",
    ]);
    const [delivered] = reconcileDelegations([parent, finished()]);
    expect(missingDelegatedChildren([delivered])).toEqual([]);
    expect(delegationResidents([delivered]).size).toBe(0);
  });
});
