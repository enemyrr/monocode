import type { BuiltinSkill } from "../../skills/model/skills";

export const NEW_SESSION_COMMAND: BuiltinSkill = {
  kind: "builtin",
  name: "new",
  invocation: "new",
  description: "Start a new session in this project.",
  scope: "builtin",
  source: "monocode",
};

/** `/new` or `/clear` on its own, which headless harnesses would ignore. */
export function isNewSessionCommand(text: string): boolean {
  return /^\s*\/(new|clear)\s*$/i.test(text);
}
