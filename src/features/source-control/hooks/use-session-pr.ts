import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitDiffIndex,
  gitPrDetails,
  subscribeGitChanged,
  type GitDiffIndex,
  type GitPrDetails,
} from "../../../platform/tauri/fs";

const POLL_MS = 60_000;
const MIN_GAP_MS = 10_000;

function isPermanent(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("not a git repository") ||
    text.includes("not installed") ||
    text.includes("git remotes") ||
    text.includes("gh auth login")
  );
}

export type SessionPr = {
  pr: GitPrDetails | null;
  index: GitDiffIndex;
};

/**
 * The PR for a session's branch, refreshed on window focus, when a turn ends,
 * after local git changes, and every minute while visible. A folder without
 * git or `gh` stops polling until its path changes.
 */
export function useSessionPr({
  cwd,
  branch,
  enabled,
  busy,
}: {
  cwd: string;
  branch?: string;
  enabled: boolean;
  busy: boolean;
}) {
  const [data, setData] = useState<SessionPr | null>(null);
  const state = useRef({ inFlight: false, loadedAt: 0, unavailable: false });

  const refresh = useCallback(
    async (force = false) => {
      const current = state.current;
      if (current.unavailable || current.inFlight) return;
      if (!force && Date.now() - current.loadedAt < MIN_GAP_MS) return;
      current.inFlight = true;
      try {
        const index = await gitDiffIndex(cwd);
        if (!index.head || !index.remote) {
          current.unavailable = true;
          if (state.current === current) setData(null);
          return;
        }
        // gh resolves the PR from the checked-out branch, so skip it without one.
        const pr = index.branch ? await gitPrDetails(cwd) : null;
        if (state.current === current) setData({ pr, index });
      } catch (error) {
        // Not a repository, no gh, or no GitHub remote: none of these fix themselves.
        // A network error keeps the last state and retries later.
        if (isPermanent(String(error))) {
          current.unavailable = true;
          if (state.current === current) setData(null);
        }
      } finally {
        current.inFlight = false;
        current.loadedAt = Date.now();
      }
    },
    [cwd],
  );

  useEffect(() => {
    state.current = { inFlight: false, loadedAt: 0, unavailable: false };
    setData(null);
  }, [cwd]);

  useEffect(() => {
    if (enabled) void refresh(true);
  }, [enabled, refresh, branch]);

  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy && enabled) void refresh(true);
    wasBusy.current = busy;
  }, [busy, enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden && document.hasFocus()) void refresh();
    }, POLL_MS);
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeGitChanged(onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [enabled, refresh]);

  return { data, refresh };
}
