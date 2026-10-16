import { describe, expect, it } from "vitest";
import {
  asTerminalProfileId,
  availableTerminalProfiles,
  terminalLaunch,
} from "./terminal-profiles";
import { applyTerminalMeta } from "./terminalTab";
import { newTerminalFile } from "../../workspace/model/layout";

describe("terminal profiles", () => {
  it("resolves a profile to its CLI command", () => {
    expect(terminalLaunch("claude")).toEqual({ command: "claude", args: [] });
    expect(terminalLaunch("opencode")?.command).toBe("opencode");
    expect(terminalLaunch(undefined)).toBeUndefined();
  });

  it("accepts only built-in profile ids", () => {
    expect(asTerminalProfileId("codex")).toBe("codex");
    expect(asTerminalProfileId("cursor")).toBeUndefined();
    expect(asTerminalProfileId(42)).toBeUndefined();
  });

  it("lists every profile until the probe runs, then only installed CLIs", () => {
    const codexOnly = (id: string) => id === "codex";
    expect(availableTerminalProfiles(codexOnly, false)).toHaveLength(3);
    expect(
      availableTerminalProfiles(codexOnly, true).map((profile) => profile.id),
    ).toEqual(["codex"]);
  });

  it("keeps the profile title when the PTY reports a process or cwd", () => {
    const file = newTerminalFile("/tmp/a", undefined, undefined, "codex");
    const next = applyTerminalMeta(file, {
      title: "node",
      cwd: "/tmp/b",
      foreground: "node",
    });
    expect(next).toMatchObject({
      path: "Codex",
      cwd: "/tmp/b",
      foreground: "node",
    });
  });
});
