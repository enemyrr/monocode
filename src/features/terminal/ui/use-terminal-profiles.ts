import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getHarnessAvailabilitySnapshot,
  hasProbedHarnessAvailability,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
} from "../../../integrations/harness/core/availability";
import {
  availableTerminalProfiles,
  type TerminalProfile,
} from "../model/terminal-profiles";

/** Profiles whose CLI is installed; `enabled` gates the probe to menus that show them. */
export function useTerminalProfiles(enabled = true): TerminalProfile[] {
  const version = useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  useEffect(() => {
    if (enabled) void probeHarnessAvailability().catch(() => undefined);
  }, [enabled]);
  return useMemo(() => {
    void version;
    return availableTerminalProfiles(
      isHarnessAvailable,
      hasProbedHarnessAvailability(),
    );
  }, [version]);
}
