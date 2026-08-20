import type { LiveSessionSnapshot, SessionSource } from "../../core/types";
import { isSessionSource, sessionSourceDescriptor } from "../../core/session-sources";
import { LIVE_SESSION_INACTIVITY_TIMEOUT_MS } from "../../core/refresh-policy";

export type LiveSessionState = "open" | "closed";
export type LiveStatusFilter = "all" | "open" | "closed";

export interface LiveFilterableSession {
  source: SessionSource;
  rawId: string;
  lastActivityAt: number;
}

function coalesceLiveSessionSnapshotForRender(
  current: LiveSessionSnapshot,
  incoming: LiveSessionSnapshot,
): LiveSessionSnapshot {
  // The renderer consumes only the failure flag and the live key set. Preserve
  // the reference when those values match so polling does not restart searches.
  if (Boolean(current.error) !== Boolean(incoming.error)) return incoming;

  const currentKeys = new Set(current.sessions.map((session) => `${session.family}:${session.rawId}`));
  const incomingKeys = new Set(incoming.sessions.map((session) => `${session.family}:${session.rawId}`));
  if (currentKeys.size !== incomingKeys.size) return incoming;
  for (const key of currentKeys) {
    if (!incomingKeys.has(key)) return incoming;
  }
  return current;
}

export class LiveSessionSnapshotRefreshCoordinator {
  private requestSequence = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async refresh(
    load: () => Promise<LiveSessionSnapshot>,
    update: (
      updater: (current: LiveSessionSnapshot) => LiveSessionSnapshot,
    ) => void,
  ): Promise<void> {
    const requestId = ++this.requestSequence;
    let incoming: LiveSessionSnapshot;
    try {
      incoming = await load();
    } catch (error) {
      incoming = {
        generatedAt: this.now().toISOString(),
        sessions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (requestId !== this.requestSequence) return;
    update((current) => coalesceLiveSessionSnapshotForRender(current, incoming));
  }
}

export function liveSessionKeyForSession(session: LiveFilterableSession): string | null {
  // Persisted sessions can outlive a source rename or a development branch.
  // Treat an unknown runtime value as non-live instead of crashing the list.
  if (!isSessionSource(session.source)) return null;
  const family = sessionSourceDescriptor(session.source).liveFamily;
  if (!family) return null;
  return `${family}:${session.rawId}`;
}

export function getLiveSessionState(session: LiveFilterableSession, liveSessionKeys: Set<string>, liveDetectionFailed: boolean): LiveSessionState {
  if (liveDetectionFailed) return "closed";
  const liveKey = liveSessionKeyForSession(session);
  if (!liveKey) return "closed";
  if (!liveSessionKeys.has(liveKey)) return "closed";
  const activeAfter = Date.now() - LIVE_SESSION_INACTIVITY_TIMEOUT_MS;
  return Number.isFinite(session.lastActivityAt) && session.lastActivityAt > activeAfter ? "open" : "closed";
}

export function filterSessionsByLiveStatus<T extends LiveFilterableSession>(
  sessions: T[],
  liveSessionKeys: Set<string>,
  filter: LiveStatusFilter,
  liveDetectionFailed: boolean,
): T[] {
  if (filter === "all") return sessions;
  return sessions.filter((session) => getLiveSessionState(session, liveSessionKeys, liveDetectionFailed) === filter);
}

export function liveStateLabel(state: LiveSessionState): string {
  return state === "open" ? "Open" : "Closed";
}
