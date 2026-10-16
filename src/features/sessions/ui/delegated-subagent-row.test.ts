import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { delegationBlock } from "../model/delegated-sessions";
import type { Block } from "../model/session";
import { AgentTranscript } from "./AgentTranscript";

const row = delegationBlock({
  sessionId: "child",
  title: "Review the parser",
  harness: "codex",
  model: "codex:unknown",
});

function render(delegated: Block) {
  return renderToStaticMarkup(
    createElement(AgentTranscript, {
      blocks: [
        {
          id: "user",
          role: "user",
          text: "Ask Codex to review the parser",
          startedAt: 1_000,
          durationMs: 2_000,
        },
        delegated,
        { id: "answer", role: "assistant", text: "Codex is on it." },
      ],
      onOpenDelegatedSession: () => undefined,
    }),
  );
}

describe("a delegated subagent row", () => {
  it("stays out of the settled turn's fold while its session runs", () => {
    const markup = render(row);
    expect(markup).toContain('aria-label="Subagent: Review the parser"');
    expect(markup).toContain("running");
    expect(markup).toContain("codex:unknown");
    expect(markup).toContain('aria-label="Open Review the parser"');
  });

  it("reports the child's answer once it is done", () => {
    const markup = render({
      ...row,
      tool: { ...row.tool, status: "completed", detail: "The parser is fine." },
      delegation: { ...row.delegation!, delivered: true },
    });
    expect(markup).toContain("done");
    expect(markup).toContain('aria-label="Show Review the parser&#x27;s work"');
    expect(markup).toContain('aria-label="Open Review the parser"');
  });

  it("points a child that waits on input at its session", () => {
    const markup = render({
      ...row,
      tool: { ...row.tool, status: "needs_input" },
    });
    expect(markup).toContain("needs input");
    expect(markup).toContain("Open to answer");
    expect(markup).not.toContain("<span>running</span>");
  });

  it("does not show a stopped child as failed", () => {
    const markup = render({
      ...row,
      tool: { ...row.tool, status: "cancelled", detail: "Partial notes." },
    });
    expect(markup).toContain("stopped");
    expect(markup).not.toContain("text-red-400");
    // A failure opens itself; a stop stays closed.
    expect(markup).not.toContain("Partial notes.");
  });
});
