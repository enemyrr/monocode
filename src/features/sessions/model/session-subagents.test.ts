import { describe, expect, it } from "vitest";
import type { Block } from "./session";
import {
  archiveFinishedSubagents,
  SessionSubagentCache,
  sessionSubagentMeta,
  subagentCountLabel,
  turnSubagents,
  unarchivedSubagents,
  type SessionSubagent,
} from "./session-subagents";

function run(id: string, status: string, patch: Partial<Block> = {}): Block {
  return {
    id,
    role: "tool",
    text: "Agent",
    tool: { kind: "agent", title: "Agent", status },
    agentRun: { name: `Run ${id}`, steps: [] },
    ...patch,
  };
}

function user(id: string, harness: "claude" | "codex"): Block {
  return {
    id,
    role: "user",
    text: "go",
    turnModel: { harness, id: "m", name: "M" },
  };
}

describe("SessionSubagentCache", () => {
  it("collects runs across turns with the harness of the turn that spawned them", () => {
    const turns: Block[][] = [
      [
        user("u1", "claude"),
        run("a", "completed", {
          agentRun: {
            name: "Map company data. Then check the AI.",
            agentType: "general-purpose",
            model: "custom-model-x",
            steps: [],
          },
        }),
        { id: "t", role: "tool", text: "Read", tool: { kind: "read" } },
      ],
      [user("u2", "codex"), run("b", "failed")],
    ];
    expect(new SessionSubagentCache().collect(turns)).toEqual([
      {
        id: "a",
        title: "Map company data.",
        harness: "claude",
        subagentType: "General purpose",
        model: "custom-model-x",
        status: "done",
      },
      { id: "b", title: "Run b", harness: "codex", status: "failed" },
    ]);
  });

  it("reads the effort and token count the provider reported", () => {
    const [subagent] = turnSubagents([
      run("a", "completed", {
        agentRun: {
          name: "Explore",
          effort: "xhigh",
          tokens: 106_300,
          steps: [],
        },
      }),
    ]);
    expect(subagent).toMatchObject({ effort: "Extra High", tokens: 106_300 });
    expect(sessionSubagentMeta(subagent)).toBe("Extra High · 106K tokens");
  });

  it("calls a pending run running only in the active turn", () => {
    const old = [user("u1", "claude"), run("a", "in_progress")];
    const current = [user("u2", "claude"), run("b", "in_progress")];
    const statuses = new SessionSubagentCache()
      .collect([old, current], current)
      .map((subagent) => subagent.status);
    expect(statuses).toEqual(["stopped", "running"]);
  });

  it("keeps the same list while nothing a row shows changed", () => {
    const cache = new SessionSubagentCache();
    const settled = [user("u1", "claude"), run("a", "completed")];
    const first = cache.collect(
      [settled, [user("u2", "claude"), run("b", "in_progress")]],
      undefined,
    );
    const streamed = [
      user("u2", "claude"),
      run("b", "in_progress"),
      { id: "p", role: "assistant", text: "more" } satisfies Block,
    ];
    expect(cache.collect([settled, streamed])).toBe(first);
  });

  it("calls a run cancelled on relaunch stopped, not failed", () => {
    expect(
      turnSubagents([run("a", "cancelled"), run("b", "canceled")]).map(
        (subagent) => subagent.status,
      ),
    ).toEqual(["stopped", "stopped"]);
  });

  it("skips a spawn still waiting on approval", () => {
    expect(
      turnSubagents([
        run("a", "pending", { role: "approval", approval: { requestId: 1 } }),
      ]),
    ).toEqual([]);
  });
});

describe("sessionSubagentMeta", () => {
  it("joins only the known parts", () => {
    expect(
      sessionSubagentMeta({
        id: "a",
        title: "A",
        subagentType: "Explore",
        model: "Opus",
        effort: "High",
        tokens: 106_300,
        status: "done",
      }),
    ).toBe("Explore · Opus · High · 106K tokens");
    expect(sessionSubagentMeta({ id: "a", title: "A", status: "done" })).toBe(
      "",
    );
  });
});

describe("subagentCountLabel", () => {
  it("pluralizes", () => {
    expect(subagentCountLabel(1)).toBe("1 subagent");
    expect(subagentCountLabel(3)).toBe("3 subagents");
  });
});

describe("archiving", () => {
  const list: SessionSubagent[] = [
    { id: "done", title: "D", status: "done" },
    { id: "failed", title: "F", status: "failed" },
    { id: "running", title: "R", status: "running" },
  ];

  it("archives finished runs and keeps running ones listed", () => {
    const archived = archiveFinishedSubagents(list, new Set());
    expect([...archived].sort()).toEqual(["done", "failed"]);
    expect(unarchivedSubagents(list, archived).map((s) => s.id)).toEqual([
      "running",
    ]);
  });

  it("never hides a run that is still going", () => {
    expect(
      unarchivedSubagents(list, new Set(["running"])).map((s) => s.id),
    ).toEqual(["done", "failed", "running"]);
  });
});

describe("delegated sessions in the chip", () => {
  const delegated = (id: string, status: string): Block =>
    run(id, status, {
      delegation: { sessionId: `child-${id}`, harness: "codex" },
    });

  it("reads status from the row and the harness from the child", () => {
    const turn = [
      user("u1", "claude"),
      delegated("working", "in_progress"),
      delegated("waiting", "needs_input"),
      delegated("done", "completed"),
      delegated("failed", "failed"),
      delegated("stopped", "cancelled"),
    ];
    // A settled parent turn does not stop a child that is still working.
    for (const live of [false, true]) {
      const runs = turnSubagents(turn, { live });
      expect(runs.map((entry) => [entry.id, entry.status])).toEqual([
        ["working", "running"],
        ["waiting", "input"],
        ["done", "done"],
        ["failed", "failed"],
        ["stopped", "stopped"],
      ]);
      expect(runs.every((entry) => entry.harness === "codex")).toBe(true);
    }
  });

  it("never archives a child that waits on input", () => {
    const [waiting] = turnSubagents([delegated("waiting", "needs_input")]);
    expect(
      unarchivedSubagents(
        [waiting],
        archiveFinishedSubagents([waiting], new Set()),
      ),
    ).toEqual([waiting]);
  });
});
