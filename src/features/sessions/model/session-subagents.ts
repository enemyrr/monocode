import { formatTokens } from "./contextUsage";
import type { Block, HarnessId } from "./session";
import {
  isSubagentBlock,
  subagentModelName,
  subagentName,
  toolCallState,
} from "./transcriptActivity";

/** "stopped" is a run still marked pending in a session that is no longer working. */
export type SessionSubagentStatus = "running" | "done" | "failed" | "stopped";

/**
 * One delegated run in a session, whoever spawned it. Today every entry is a
 * subagent tool block; a child session on another harness fits the same shape.
 */
export type SessionSubagent = {
  /** The block that holds the run, so the transcript can reveal it. */
  id: string;
  title: string;
  harness?: HarnessId;
  subagentType?: string;
  /** Display name, not the provider id. */
  model?: string;
  effort?: string;
  tokens?: number;
  status: SessionSubagentStatus;
};

/** Every delegated run in a session, oldest first. */
export function collectSessionSubagents(
  blocks: Block[],
  options?: { live?: boolean },
): SessionSubagent[] {
  const live = options?.live ?? false;
  let harness: HarnessId | undefined;
  const subagents: SessionSubagent[] = [];
  for (const block of blocks) {
    // A run belongs to the harness of the turn that spawned it.
    if (block.role === "user" && block.turnModel) {
      harness = block.turnModel.harness;
    }
    if (!isSubagentBlock(block)) continue;
    const state = toolCallState(block);
    const subagentType = block.agentRun?.agentType?.trim();
    const model = subagentModelName(block);
    const effort = block.agentRun?.effort?.trim();
    const tokens = block.agentRun?.tokens;
    subagents.push({
      id: block.id,
      title: subagentName(block),
      ...(harness ? { harness } : {}),
      ...(subagentType
        ? { subagentType: formatSubagentType(subagentType) }
        : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort: formatEffort(effort) } : {}),
      ...(tokens ? { tokens } : {}),
      status:
        state === "rejected"
          ? "failed"
          : state === "pending"
            ? live
              ? "running"
              : "stopped"
            : "done",
    });
  }
  return subagents;
}

/** "general-purpose" reads as "General purpose", "Explore" stays as it is. */
function formatSubagentType(type: string): string {
  const spaced = type.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "xhigh" reads as "Extra High", "high" as "High". */
function formatEffort(effort: string): string {
  if (effort.toLowerCase() === "xhigh") return "Extra High";
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function isFinishedSubagent(subagent: SessionSubagent): boolean {
  return subagent.status !== "running";
}

/** "Explore · Opus 4.7 · High · 106K tokens", from whatever is known. */
export function sessionSubagentMeta(subagent: SessionSubagent): string {
  return [
    subagent.subagentType,
    subagent.model,
    subagent.effort,
    subagent.tokens != null && subagent.tokens > 0
      ? `${formatTokens(subagent.tokens)} tokens`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function subagentCountLabel(count: number): string {
  return count === 1 ? "1 subagent" : `${count} subagents`;
}

/** A run is archived only once finished, so one still going never hides. */
export function unarchivedSubagents(
  subagents: SessionSubagent[],
  archived: ReadonlySet<string>,
): SessionSubagent[] {
  return subagents.filter(
    (subagent) => !(archived.has(subagent.id) && isFinishedSubagent(subagent)),
  );
}

export function archiveFinishedSubagents(
  subagents: SessionSubagent[],
  archived: ReadonlySet<string>,
): ReadonlySet<string> {
  const next = new Set(archived);
  for (const subagent of subagents) {
    if (isFinishedSubagent(subagent)) next.add(subagent.id);
  }
  return next;
}
