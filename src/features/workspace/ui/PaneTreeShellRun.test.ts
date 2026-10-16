// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Block, Session } from "../../sessions/model/session";
import { upsertShellRunBlock } from "../../sessions/model/shell-command";
import type { ComposerShellCommand } from "../../sessions/ui/shell-mode";
import { PaneTree } from "./PaneTree";

const probes = vi.hoisted(() => ({
  shellCommand: undefined as ComposerShellCommand | undefined,
  exit: undefined as ((code: number) => void) | undefined,
  runs: [],
}));

vi.mock("../../sessions/ui/Composer", () => ({
  Composer: (props: { shellCommand?: ComposerShellCommand }) => {
    probes.shellCommand = props.shellCommand;
    return null;
  },
}));
vi.mock("../../sessions/ui/AgentTranscript", () => ({
  AgentTranscript: () => null,
}));
vi.mock("../../sessions/hooks/useFileDrop", () => ({ useFileDrop: () => false }));
vi.mock("../../orchestration/model/orchestration", async (original) => ({
  ...(await original<
    typeof import("../../orchestration/model/orchestration")
  >()),
  orchestrator: {
    subscribe: () => () => {},
    snapshot: () => probes.runs,
    hydrate: async () => {},
  },
}));
vi.mock("../../../platform/tauri/shell-run", () => ({
  startShellRun: async (
    _id: string,
    _cwd: string,
    _command: string,
    handlers: {
      onExit: (exit: {
        code: number;
        cancelled: boolean;
        tail: string;
        droppedBytes: number;
      }) => void;
    },
  ) => {
    probes.exit = (code) =>
      handlers.onExit({ code, cancelled: false, tail: "", droppedBytes: 0 });
  },
}));

it("adds a shell run from a pane's composer to its session transcript", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let session: Session = {
    id: "chat",
    title: "Chat",
    cwd: "/repo",
    harness: "codex",
    model: "",
    modelSettings: {},
    runtimeMode: "supervised",
    blocks: [
      { id: "user", role: "user", text: "Hello" },
      { id: "reply", role: "assistant", text: "Hi" },
    ],
  };
  const onShellRunBlock = vi.fn((sessionId: string, block: Block) => {
    if (sessionId === session.id) session = upsertShellRunBlock(session, block);
  });
  const noop = vi.fn();
  const props: ComponentProps<typeof PaneTree> = {
    visible: true,
    layout: { type: "leaf", id: "chat" },
    sessions: [session],
    editorPanes: [],
    dirtyFileIds: new Set(),
    fileErrorCounts: new Map(),
    focusedId: "chat",
    composerFocused: false,
    recents: [],
    onFocus: noop,
    onClose: noop,
    onSelectFile: noop,
    onCloseFile: noop,
    onCloseOtherFiles: noop,
    onReorderFiles: noop,
    onFileDirtyChange: noop,
    onFileErrorCountChange: noop,
    onRatio: noop,
    onCwdChange: noop,
    onBranchChange: noop,
    onWorkspaceModeChange: noop,
    onWorktreeBaseChange: noop,
    onModelChange: noop,
    onModelSettingsChange: noop,
    onRuntimeModeChange: noop,
    onSubmit: noop,
    onSaveDraft: noop,
    onRemoveDraft: noop,
    onStop: noop,
    onCompactContext: () => false,
    onPlaceSessionInFolder: noop,
    onDeleteQueuedMessage: noop,
    onEditQueuedMessage: noop,
    onQueuedMessageEditingChange: noop,
    onSteerQueuedMessage: noop,
    onResumeQueue: noop,
    onUsageLimitResume: noop,
    onUsageLimitResumeAtReset: noop,
    onUsageLimitDismiss: noop,
    onApproval: noop,
    onQuestionReply: noop,
    onOpenFile: noop,
    onOpenDiff: noop,
    onOpenPlan: noop,
    onUpdatePlan: noop,
    onBuildPlan: noop,
    onMovePane: noop,
    onDetachPane: noop,
    onNewTerminal: noop,
    onShellRunBlock,
  };
  try {
    await act(async () => root.render(createElement(PaneTree, props)));
    const shell = probes.shellCommand!;
    expect(shell.unavailable).toBeUndefined();

    let accepted: void | false = false;
    await act(async () => {
      accepted = shell.onRun('echo "hello world"');
    });
    expect(accepted).not.toBe(false);
    expect(session.blocks.at(-1)?.shellRun).toMatchObject({
      command: 'echo "hello world"',
      cwd: "/repo",
      status: "running",
    });

    act(() => probes.exit!(0));
    expect(session.blocks).toHaveLength(3);
    expect(session.blocks.at(-1)).toMatchObject({
      role: "system",
      text: '$ echo "hello world"',
      shellRun: { status: "done", exitCode: 0 },
    });
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
