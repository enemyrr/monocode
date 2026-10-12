// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderComposer(onRun: (command: string) => void | false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSubmit = vi.fn();
  await act(async () =>
    root.render(
      createElement(Composer, {
        sessionId: "s1",
        focused: true,
        harness: "codex",
        model: "",
        runtimeMode: "supervised",
        executionCwd: "/repo",
        hideTopBar: true,
        canSaveDraft: true,
        onSaveDraft: vi.fn(),
        onGitAction: vi.fn(),
        onFocus: vi.fn(),
        onCwdChange: vi.fn(),
        onModelChange: vi.fn(),
        onRuntimeModeChange: vi.fn(),
        onSubmit,
        shellCommand: { cwd: "/repo", onRun },
      }),
    ),
  );
  const textarea = container.querySelector("textarea")!;
  const type = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, value);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { container, textarea, type, onSubmit, cleanup };
}

it("runs a shell draft from the Send button", async () => {
  const onRun = vi.fn();
  const view = await renderComposer(onRun);
  try {
    await view.type('!echo "hello world"');
    const send = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Send"]',
    )!;
    expect(send.disabled).toBe(false);
    await act(async () => send.click());
    expect(onRun).toHaveBeenCalledWith('echo "hello world"');
    expect(view.onSubmit).not.toHaveBeenCalled();
    expect(view.textarea.value).toBe("");
  } finally {
    view.cleanup();
  }
});

it("runs a shell draft on Enter", async () => {
  const onRun = vi.fn();
  const view = await renderComposer(onRun);
  try {
    await view.type('!echo "hello world"');
    await act(async () => {
      view.textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onRun).toHaveBeenCalledWith('echo "hello world"');
    expect(view.textarea.value).toBe("");
  } finally {
    view.cleanup();
  }
});
