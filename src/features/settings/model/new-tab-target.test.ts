import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadNewTabTarget,
  newTabTerminal,
  saveNewTabTarget,
} from "./new-tab-target";

const KEY = "monocode.newTabTarget";

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("new tab target setting", () => {
  it("opens an agent chat by default", () => {
    expect(loadNewTabTarget()).toBe("agent");
  });

  it("persists a terminal profile", () => {
    saveNewTabTarget("codex");
    expect(localStorage.getItem(KEY)).toBe("codex");
    expect(loadNewTabTarget()).toBe("codex");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem(KEY, "vim");
    expect(loadNewTabTarget()).toBe("agent");
  });
});

describe("newTabTerminal", () => {
  it("resolves each target to a chat, a shell, or a profile terminal", () => {
    expect(newTabTerminal("agent")).toBeUndefined();
    expect(newTabTerminal("terminal")).toEqual({});
    expect(newTabTerminal("claude")).toEqual({ profile: "claude" });
  });
});
