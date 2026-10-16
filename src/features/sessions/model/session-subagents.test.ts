import { describe, expect, it } from "vitest";
import type { Block } from "./session";
import {
  archiveFinishedSubagents,
  collectSessionSubagents,
  sessionSubagentMeta,
  subagentCountLabel,
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

describe("collectSessionSubagents", () => {
  it("collects runs across turns with the harness of the turn that spawned them", () => {
    const blocks: Block[] = [
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
      user("u2", "codex"),
      run("b", "failed"),
    ];
    expect(collectSessionSubagents(blocks)).toEqual([
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

  it("calls a pending run running only while the session works", () => {
    const blocks = [run("a", "in_progress")];
    expect(collectSessionSubagents(blocks, { live: true })[0].status).toBe(
      "running",
    );
    expect(collectSessionSubagents(blocks)[0].status).toBe("stopped");
  });

  it("skips a spawn still waiting on approval", () => {
    expect(
      collectSessionSubagents([
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
