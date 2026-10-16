import { useRef, useState } from "react";
import {
  Archive,
  Bot,
  Check,
  CircleAlert,
  Minus,
} from "../../../shared/ui/icons";
import { Popover } from "../../../shared/ui/Popover";
import {
  isFinishedSubagent,
  sessionSubagentMeta,
  subagentCountLabel,
  type SessionSubagent,
} from "../model/session-subagents";
import { TerminalSpinner } from "./TerminalSpinner";

/**
 * Every delegated run in the session behind one pill, so a run spawned turns
 * ago is one click away instead of a scroll back through the transcript.
 */
export function SubagentChip({
  subagents,
  onSelect,
  onArchiveFinished,
}: {
  subagents: SessionSubagent[];
  onSelect: (id: string) => void;
  onArchiveFinished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (subagents.length === 0) return null;
  const running = subagents.some((subagent) => subagent.status === "running");
  const finished = subagents.some(isFinishedSubagent);

  return (
    <div className="px-4 pt-1 pb-2">
      <button
        ref={trigger}
        type="button"
        data-subagent-chip=""
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-6 items-center gap-1.5 rounded-full border border-content/10 px-2.5 font-sans text-[12px] leading-none transition-colors duration-200 hover:bg-content/5 hover:text-content ${
          open ? "bg-content/5 text-content" : "text-content/60"
        }`}
      >
        {running ? (
          <TerminalSpinner className="inline-block w-3.5 shrink-0 select-none text-center text-[11px] leading-none text-content/45" />
        ) : (
          <Bot
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
        )}
        {subagentCountLabel(subagents.length)}
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          side="top"
          align="start"
          width={380}
          maxHeight={360}
          onDismiss={() => setOpen(false)}
          ignore="[data-subagent-chip]"
          role="menu"
          aria-label="Subagents"
          className="overflow-y-auto overscroll-none p-1"
        >
          {finished ? (
            <>
              <button
                type="button"
                role="menuitem"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onArchiveFinished();
                  if (!running) setOpen(false);
                }}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] leading-none text-content/70 hover:bg-content/5 hover:text-content"
              >
                <Archive className="size-3.5 shrink-0" strokeWidth={1.75} />
                Archive finished subagents
              </button>
              <div role="separator" className="my-1 h-px bg-content/10" />
            </>
          ) : null}
          {subagents.map((subagent) => {
            const meta = sessionSubagentMeta(subagent);
            return (
              <button
                key={subagent.id}
                type="button"
                role="menuitem"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onSelect(subagent.id);
                }}
                className="flex h-7 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-[13px] leading-none hover:bg-content/5"
              >
                <SubagentStatusIcon status={subagent.status} />
                <span
                  className={`min-w-0 truncate ${
                    subagent.status === "failed"
                      ? "text-red-400"
                      : "text-content/80"
                  }`}
                >
                  {subagent.title}
                </span>
                {meta ? (
                  <span className="ml-auto min-w-0 max-w-[55%] shrink-0 truncate text-[12px] text-content/40">
                    {meta}
                  </span>
                ) : null}
              </button>
            );
          })}
        </Popover>
      ) : null}
    </div>
  );
}

function SubagentStatusIcon({ status }: { status: SessionSubagent["status"] }) {
  if (status === "running") {
    return (
      <TerminalSpinner className="inline-block w-3.5 shrink-0 select-none text-center text-[11px] leading-none text-content/60" />
    );
  }
  const Icon =
    status === "failed" ? CircleAlert : status === "stopped" ? Minus : Check;
  return (
    <Icon
      className={`size-3.5 shrink-0 ${
        status === "failed" ? "text-red-400" : "text-content/45"
      }`}
      strokeWidth={1.75}
    />
  );
}
