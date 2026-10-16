import { formatTokens } from "./contextUsage";
import type { Block, HarnessId } from "./session";
import {
  isSubagentBlock,
  subagentModelName,
  subagentName,
  toolCallState,
} from "./transcriptActivity";

/**
 * "stopped" is a run cancelled on relaunch, or one still marked pending in a
 * turn that is no longer working.
 */
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

/**
 * The delegated runs in one turn. Only the turn the agent is working on can
 * hold a running one; a run left pending in any other turn has stopped.
 */
export function turnSubagents(
  turn: Block[],
  options?: { live?: boolean },
): SessionSubagent[] {
  const live = options?.live ?? false;
  const harness = turn.find((block) => block.role === "user" && block.turnModel)
    ?.turnModel?.harness;
  const subagents: SessionSubagent[] = [];
  for (const block of turn) {
    if (!isSubagentBlock(block)) continue;
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
      status: subagentStatus(block, live),
    });
  }
  return subagents;
}

function subagentStatus(block: Block, live: boolean): SessionSubagentStatus {
  // A relaunch cancels the work it found open; that run did not fail.
  if (/^cancell?ed$/i.test(block.tool?.status ?? "")) return "stopped";
  const state = toolCallState(block);
  if (state === "rejected") return "failed";
  if (state === "pending") return live ? "running" : "stopped";
  return "done";
}

/**
 * Every delegated run in a session, oldest first. Settled turns keep their
 * array identity between updates, so their runs are read once; a streamed
 * token only rescans the active turn, and an unchanged list keeps its identity.
 */
export class SessionSubagentCache {
  private settled = new WeakMap<Block[], SessionSubagent[]>();
  private last: SessionSubagent[] = [];

  collect(turns: Block[][], activeTurn?: Block[]): SessionSubagent[] {
    const next = turns.flatMap((turn) => {
      if (turn === activeTurn) return turnSubagents(turn, { live: true });
      let runs = this.settled.get(turn);
      if (!runs) {
        runs = turnSubagents(turn);
        this.settled.set(turn, runs);
      }
      return runs;
    });
    if (sameSubagents(next, this.last)) return this.last;
    this.last = next;
    return next;
  }
}

function sameSubagents(a: SessionSubagent[], b: SessionSubagent[]): boolean {
  return (
    a.length === b.length &&
    a.every((run, index) => {
      const other = b[index];
      return (
        run.id === other.id &&
        run.title === other.title &&
        run.harness === other.harness &&
        run.subagentType === other.subagentType &&
        run.model === other.model &&
        run.effort === other.effort &&
        run.tokens === other.tokens &&
        run.status === other.status
      );
    })
  );
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
