import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "./sessionStore";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { getSession, sanitizeSessionForPersist } = await import(
  "./sessionStore"
);

/** A saved Codex session holding the one row this PR repairs. */
function codexRecord(): SessionRecord {
  return {
    id: "s1",
    harness: "codex",
    model: "gpt-5",
    cwd: "/repo",
    providerSessionId: "01a0e6f4-13e3-7692-9250-4befceed807b",
    blocks: [
      { id: "b0", role: "user", text: "list the agents" },
      {
        id: "b1",
        role: "tool",
        text: "Shell",
        tool: {
          callId: "exec-1",
          title: "Shell",
          kind: "execute",
          status: "completed",
          preview: {
            kind: "shell",
            title: "rg --files -g AGENTS.md -g '!node_modules'",
          },
        },
      },
    ],
  } as unknown as SessionRecord;
}

describe("restoring a session whose repair cannot be persisted", () => {
  beforeEach(() => invoke.mockReset());

  it("restores sidebar visibility when a hidden session is opened by id", async () => {
    const record = codexRecord();
    record.sidebarHidden = true;
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "session_get" ? record : null),
    );
    const session = await getSession(record.id);
    expect(session?.sidebarHidden).toBe(true);
    expect(session?.blocks[0].text).toBe("list the agents");
    const repaired = invoke.mock.calls.find(([cmd]) => cmd === "session_upsert");
    expect(repaired?.[1].session.sidebarHidden).toBe(true);
  });

  it("restores the turn's launched session links", async () => {
    const record = codexRecord();
    const launch = {
      sessionId: "app-review",
      cwd: "/repo",
      title: "Review",
      harness: "codex" as const,
      model: "gpt-6",
    };
    record.blocks[0].monoSpawnedSessions = [launch];
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "session_get" ? record : null),
    );
    expect((await getSession("s1"))?.blocks[0].monoSpawnedSessions).toEqual([
      launch,
    ]);
  });

  it("keeps a delegated child's link and its parent's row across a save", async () => {
    const link = { sessionId: "parent", blockId: "delegation-child" };
    const saved = sanitizeSessionForPersist({
      id: "child",
      harness: "codex",
      model: "gpt-5",
      modelSettings: {},
      runtimeMode: "supervised",
      title: "Review",
      cwd: "/repo",
      blocks: [{ id: "b0", role: "user", text: "Review the parser" }],
      delegatedBy: link,
    });
    expect(saved.blocks[0].delegatedBy).toEqual(link);
    const row = {
      id: "delegation-child",
      role: "tool",
      text: "Review",
      tool: { kind: "agent", status: "completed" },
      delegation: { sessionId: "child", harness: "codex", delivered: true },
    };
    const record = {
      ...codexRecord(),
      id: "child",
      blocks: [...saved.blocks, row],
    } as unknown as SessionRecord;
    invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "session_get" ? record : null),
    );
    const restored = await getSession("child");
    expect(restored?.delegatedBy).toEqual(link);
    expect(restored?.blocks.at(-1)?.delegation).toEqual(row.delegation);
  });

  it("still returns the repaired session when the write fails", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "session_get") return Promise.resolve(codexRecord());
      if (cmd === "session_upsert") return Promise.reject(new Error("db locked"));
      return Promise.resolve(null);
    });

    // A failed persistence must not cost the reader the session: the repair
    // stays in memory and the next load retries the write.
    const session = await getSession("s1");
    expect(session).not.toBeNull();
    expect(session?.blocks[1].text).toBe("Find files");
  });

  it("persists the repair when the write succeeds", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "session_get") return Promise.resolve(codexRecord());
      return Promise.resolve(null);
    });

    const session = await getSession("s1");
    expect(session?.blocks[1].text).toBe("Find files");
    expect(
      invoke.mock.calls.some(([cmd]) => cmd === "session_upsert"),
    ).toBe(true);
  });
});
