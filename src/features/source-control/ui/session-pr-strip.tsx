import { openUrl } from "@tauri-apps/plugin-opener";
import type { GitPrDetails } from "../../../platform/tauri/fs";
import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Wrench,
  type IconComponent,
} from "../../../shared/ui/icons";
import type {
  PrStripAction,
  PrStripState,
  PrStripTone,
} from "../model/pr-strip-state";

const TONE: Record<PrStripTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-red-500 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  merged: "text-violet-600 dark:text-violet-400",
  muted: "text-content/50",
};

const ACTIONS: Record<PrStripAction, { label: string; Icon: IconComponent }> = {
  pr: { label: "Create PR", Icon: GitPullRequest },
  "fix-conflicts": { label: "Fix conflicts", Icon: Wrench },
  "fix-checks": { label: "Fix checks", Icon: Wrench },
  merge: { label: "Merge", Icon: GitMerge },
};

const PRESS =
  "transition-[transform,background-color] duration-[var(--motion-feedback-duration)] ease-[var(--motion-ease-out)] active:scale-[0.97] motion-reduce:transition-none";

function stateIcon(pr: GitPrDetails | null): IconComponent {
  if (!pr) return GitBranch;
  if (pr.state === "merged") return GitMerge;
  if (pr.state !== "open") return GitPullRequestClosed;
  return pr.isDraft ? GitPullRequestDraft : GitPullRequest;
}

/** The branch's PR above the composer: its link, its state, and the next step. */
export function SessionPrStrip({
  pr,
  branch,
  state,
  onAction,
}: {
  pr: GitPrDetails | null;
  branch: string | null;
  state: PrStripState;
  onAction: (action: PrStripAction) => void;
}) {
  const Icon = stateIcon(pr);
  const action = state.action ? ACTIONS[state.action] : null;
  return (
    <div className="mb-1.5 flex h-8 min-w-0 items-center gap-2 rounded-lg border border-content/10 bg-content/5 pr-1 pl-2.5 text-[12px]">
      <Icon className={`size-3.5 shrink-0 ${TONE[state.tone]}`} />
      {pr ? (
        <button
          type="button"
          title={`Open #${pr.number} on GitHub`}
          onClick={() => void openUrl(pr.url)}
          className="flex min-w-0 items-center gap-1.5 text-content/80 hover:text-content"
        >
          <span className="shrink-0 text-content/45">#{pr.number}</span>
          <span className="truncate">{pr.title}</span>
        </button>
      ) : (
        <span className="min-w-0 truncate font-mono text-[11px] text-content/55">
          {branch}
        </span>
      )}
      <span className={`shrink-0 text-[11px] ${TONE[state.tone]}`}>
        {state.label}
      </span>
      <span className="flex-1" />
      {action && state.action ? (
        <button
          type="button"
          onClick={() => onAction(state.action!)}
          className={`flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
            state.action === "merge"
              ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
              : "bg-content/8 text-content/80 hover:bg-content/12 hover:text-content"
          } ${PRESS}`}
        >
          <action.Icon className="size-3.5" />
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
