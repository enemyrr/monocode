import { useEffect, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { gitPrDetails, type GitPrDetails } from "../../../platform/tauri/fs";
import { Modal } from "../../../shared/ui/Modal";
import {
  CircleAlert,
  ExternalLink,
  GitMerge,
  Loader,
} from "../../../shared/ui/icons";
import {
  MergeTargetChanged,
  mergePullRequest,
  type MergeMethod,
} from "../model/git-actions";

const METHODS: { method: MergeMethod; label: string; description: string }[] = [
  {
    method: "squash",
    label: "Squash and merge",
    description: "Combine the commits into one.",
  },
  {
    method: "merge",
    label: "Create a merge commit",
    description: "Add every commit to the base branch.",
  },
  {
    method: "rebase",
    label: "Rebase and merge",
    description: "Add the commits without a merge commit.",
  },
];

const PRESS = "active:scale-[0.97] motion-reduce:transform-none";

/** Why this PR cannot be merged from here, if it cannot. */
function mergeBlocker(pr: GitPrDetails): string | null {
  if (pr.state !== "open") return `This pull request is ${pr.state}.`;
  if (pr.isDraft) return "This pull request is a draft.";
  if (pr.mergeable === "CONFLICTING")
    return "This pull request has merge conflicts. Run /fix-conflicts first.";
  return null;
}

export function MergePrDialog({
  cwd,
  initialMethod = "squash",
  onClose,
}: {
  cwd: string;
  initialMethod?: MergeMethod;
  onClose: () => void;
}) {
  const [pr, setPr] = useState<GitPrDetails | null | undefined>(undefined);
  const [method, setMethod] = useState<MergeMethod>(initialMethod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<string>();

  useEffect(() => {
    let live = true;
    gitPrDetails(cwd).then(
      (next) => live && setPr(next),
      (reason: unknown) => {
        if (!live) return;
        setPr(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [cwd]);

  const blocker = pr ? mergeBlocker(pr) : null;
  const selected = METHODS.find((entry) => entry.method === method)!;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pr || blocker || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { merged } = await mergePullRequest(cwd, pr, method);
      setResult(
        merged
          ? `Merged pull request #${pr.number}.`
          : "Merge queued or auto-merge enabled.",
      );
    } catch (reason) {
      if (reason instanceof MergeTargetChanged) setPr(reason.fresh);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal title="Merge pull request" size="sm" onClose={close}>
      <form
        className="flex flex-col gap-3.5 p-4 text-[13px] leading-[1.5]"
        onSubmit={(event) => void submit(event)}
      >
        {pr === undefined ? (
          <p className="flex items-center gap-2 text-[12px] text-content/55">
            <Loader className="size-3.5 animate-spin" />
            Finding the pull request for this branch…
          </p>
        ) : pr === null ? (
          !error && (
            <p className="text-content/65">
              This branch has no pull request. Run /pr to create one.
            </p>
          )
        ) : (
          <>
            <div className="rounded-lg border border-content/10 bg-content/5 p-3">
              <button
                type="button"
                onClick={() => void openUrl(pr.url)}
                className="group flex w-full min-w-0 items-start gap-2 text-left"
              >
                <span className="shrink-0 text-content/45">#{pr.number}</span>
                <span className="min-w-0 flex-1 font-medium text-content group-hover:underline">
                  {pr.title}
                </span>
                <ExternalLink className="mt-1 size-3 shrink-0 text-content/35" />
              </button>
              <p className="mt-1.5 truncate font-mono text-[11px] text-content/45">
                {pr.baseRefName} ← {pr.headRefName}
              </p>
              {pr.checks.failed > 0 || pr.checks.pending > 0 ? (
                <p className="mt-1.5 text-[11.5px] text-amber-500 dark:text-amber-400">
                  {pr.checks.failed > 0
                    ? `${pr.checks.failed} failing ${pr.checks.failed === 1 ? "check" : "checks"}`
                    : `${pr.checks.pending} ${pr.checks.pending === 1 ? "check" : "checks"} still running`}
                </p>
              ) : null}
            </div>
            {blocker ? (
              <p className="flex items-start gap-2 text-[12.5px] text-content/65">
                <CircleAlert className="mt-px size-3.5 shrink-0 text-amber-400" />
                {blocker}
              </p>
            ) : result ? null : (
              <div
                role="radiogroup"
                aria-label="Merge method"
                className="flex flex-col"
              >
                {METHODS.map((entry) => (
                  <button
                    key={entry.method}
                    type="button"
                    role="radio"
                    aria-checked={entry.method === method}
                    disabled={busy}
                    onClick={() => setMethod(entry.method)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-content/8 ${
                      entry.method === method
                        ? "bg-content/6 text-content"
                        : "text-content/70"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                        entry.method === method
                          ? "bg-emerald-400"
                          : "bg-content/20"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium leading-tight">
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-content/45">
                        {entry.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {result ? (
          <p role="status" className="text-[12.5px] text-content/75">
            {result}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="break-words text-[12.5px] text-red-400">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          {result ? (
            <button
              type="button"
              onClick={onClose}
              className={`rounded-md bg-content px-3 py-1.5 font-medium text-background-base hover:bg-content/80 ${PRESS}`}
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={close}
                className={`rounded-md px-3 py-1.5 hover:bg-content/8 ${PRESS}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!pr || !!blocker || busy}
                className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-500/30 disabled:opacity-40 disabled:hover:bg-emerald-500/20 dark:text-emerald-300 ${PRESS}`}
              >
                {busy ? (
                  <Loader className="size-3.5 animate-spin" />
                ) : (
                  <GitMerge className="size-3.5" />
                )}
                {busy ? "Merging…" : selected.label}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
