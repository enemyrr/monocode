import { useCallback, useRef, useState } from "react";
import { gitPrDetails, type GitPrDetails } from "../../../platform/tauri/fs";
import {
  buildGitActionRequest,
  type GitActionRequest,
} from "../model/git-action-prompts";
import type { GitActionCommand, MergeMethod } from "../model/git-actions";

type Options = {
  cwd: string;
  branch?: string;
  /** Sends the visible text with the full instructions; queues while the agent works. */
  submit: (request: GitActionRequest) => boolean | void;
};

/** Runs composer git commands: agent actions become instructed turns, `/merge` opens a dialog. */
export function useGitActions({ cwd, branch, submit }: Options) {
  const [merge, setMerge] = useState<{ method?: MergeMethod } | null>(null);
  const latest = useRef({ cwd, branch, submit });
  latest.current = { cwd, branch, submit };

  const run = useCallback(
    (command: GitActionCommand, known?: GitPrDetails | null): boolean => {
      if (command.action === "merge") {
        setMerge({ method: command.method });
        return true;
      }
      const send = (pr: GitPrDetails | null) => {
        const { branch, submit } = latest.current;
        const base = pr?.baseRefName || null;
        return submit(
          buildGitActionRequest(command.action, {
            branch: pr?.branch || branch,
            base: command.action === "review" && base ? `origin/${base}` : base,
            prUrl: pr?.url,
            draft: command.action === "pr" && command.draft,
            note: command.note,
          }),
        );
      };
      if (command.action === "commit" || command.action === "pr")
        return send(null) !== false;
      // The PR's base and URL make conflict, check and review instructions exact.
      void (
        known !== undefined
          ? Promise.resolve(known)
          : gitPrDetails(latest.current.cwd).catch(() => null)
      ).then(send);
      return true;
    },
    [],
  );

  const closeMerge = useCallback(() => setMerge(null), []);
  return { run, merge, closeMerge };
}
