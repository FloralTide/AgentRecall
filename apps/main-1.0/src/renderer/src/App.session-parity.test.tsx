// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedSearch } from "../../core/store/saved-searches";
import type { SessionSearchResult } from "../../core/types";
import type { ContentAreaProps } from "./layout/content-area";

const harness = vi.hoisted(() => ({
  contentAreaProps: null as ContentAreaProps | null,
  detailSession: null as SessionSearchResult | null,
  openSessionListener: null as ((sessionKey: string) => void) | null,
  getSession: vi.fn(),
  searchSessionPage: vi.fn(async () => ({ sessions: [], totalCount: 0, hasMore: false })),
}));

vi.mock("./layout/sidebar", () => ({ Sidebar: () => null }));
vi.mock("./layout/content-area", () => ({
  ContentArea: (props: ContentAreaProps) => {
    harness.contentAreaProps = props;
    return null;
  },
}));
vi.mock("./features/session-detail/detail-panel", () => ({
  DetailPanel: ({ session }: { session: SessionSearchResult }) => {
    harness.detailSession = session;
    return null;
  },
}));
vi.mock("./features/session-detail/use-session-family", () => ({
  useSessionFamily: () => ({
    family: { parent: null, children: [], truncated: false },
    loadFailed: false,
    retry: vi.fn(),
    open: vi.fn(),
  }),
}));
vi.mock("./features/remote-sessions/use-remote-sessions-cache", () => ({
  useRemoteSessionsCache: () => ({
    cache: {
      status: null,
      items: [],
      initialized: true,
      loading: false,
      refreshing: false,
      error: null,
      uploadTasks: {},
      uploadBatch: null,
      deleteTasks: {},
      deleteBatch: null,
    },
    ensureLoaded: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    invalidate: vi.fn(),
    queueUploads: vi.fn(),
    queueDeletions: vi.fn(),
  }),
}));
vi.mock("./features/search/use-main-search-shortcut", () => ({ useMainSearchShortcut: () => undefined }));

describe("V1 session parity", () => {
  let App: typeof import("./App").App;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    const unsubscribe = (): (() => void) => vi.fn();
    Reflect.set(window, "sessionSearch", {
      platform: "win32",
      searchSessionPage: harness.searchSessionPage,
      listEnvironments: vi.fn(async () => []),
      listTags: vi.fn(async () => []),
      listProjects: vi.fn(async () => []),
      listTagsByProject: vi.fn(async () => []),
      getStats: vi.fn(async () => ({
        total: {
          sessionCount: 0,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
        },
        bySource: [],
        range: { period: "today", since: null, until: 0 },
        previousTotal: null,
      })),
      getStatsTrend: vi.fn(async () => ({ period: "today", granularity: null, buckets: [] })),
      getQuotas: vi.fn(async () => ({ generatedAt: "", providers: [] })),
      getLiveSessions: vi.fn(async () => ({ generatedAt: "", sessions: [] })),
      getSettings: vi.fn(async () => null),
      getIndexStatus: vi.fn(async () => ({
        running: false,
        indexed: 0,
        skipped: 0,
        total: 0,
        lastIndexedAt: null,
        error: null,
      })),
      getAppUpdateStatus: vi.fn(async () => null),
      setInterfaceZoomFactor: vi.fn(async () => undefined),
      setOpenSession: vi.fn(async () => undefined),
      getSession: harness.getSession,
      getMessages: vi.fn(async () => []),
      getTraceEvents: vi.fn(async () => []),
      touchSavedSearch: vi.fn(async () => undefined),
      onQuotaUpdated: unsubscribe,
      onIndexStatus: unsubscribe,
      onFocusSearch: unsubscribe,
      onOpenSettings: unsubscribe,
      onAppUpdateStatus: unsubscribe,
      onAppUpdateProgress: unsubscribe,
      onEnvironmentsUpdated: unsubscribe,
      onMigrationProgress: unsubscribe,
      onOpenSession: (listener: (sessionKey: string) => void) => {
        harness.openSessionListener = listener;
        return () => {
          if (harness.openSessionListener === listener) harness.openSessionListener = null;
        };
      },
    });
    ({ App } = await import("./App"));
  });

  beforeEach(async () => {
    window.localStorage.clear();
    harness.contentAreaProps = null;
    harness.detailSession = null;
    harness.getSession.mockReset();
    harness.searchSessionPage.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(App)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens the requested session detail after a quick-search selection", async () => {
    const session = {
      sessionKey: "codex:quick-search-result",
      source: "codex-cli",
      displayTitle: "Quick search result",
      messageCount: 0,
    } as SessionSearchResult;
    harness.getSession.mockResolvedValue(session);

    await act(async () => {
      harness.openSessionListener?.(session.sessionKey);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.getSession).toHaveBeenCalledWith(session.sessionKey);
    expect(harness.detailSession).toEqual(session);
  });

  it("applies the exact date range stored in a saved search", async () => {
    const dateFrom = Date.parse("2026-07-01T00:00:00.000Z");
    const dateTo = Date.parse("2026-07-31T23:59:59.999Z");
    const saved = savedSearch({ query: "migration", dateFrom, dateTo });
    harness.searchSessionPage.mockClear();

    await act(async () => harness.contentAreaProps?.onApplySavedSearch(saved));

    await vi.waitFor(() => expect(harness.searchSessionPage).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom, dateTo }),
    ));
    expect(harness.contentAreaProps?.toolbar.customDateRange).toEqual({ dateFrom, dateTo });
  });

  it("clears an existing exact date range when the saved search has no dates", async () => {
    const exact = savedSearch({
      dateFrom: Date.parse("2026-07-01T00:00:00.000Z"),
      dateTo: Date.parse("2026-07-31T23:59:59.999Z"),
    });
    await act(async () => harness.contentAreaProps?.onApplySavedSearch(exact));
    harness.searchSessionPage.mockClear();

    await act(async () => harness.contentAreaProps?.onApplySavedSearch(savedSearch({ query: "all time" })));

    await vi.waitFor(() => expect(harness.searchSessionPage).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
    ));
    expect(harness.contentAreaProps?.toolbar.customDateRange).toBeNull();
  });
});

function savedSearch(options: SavedSearch["options"]): SavedSearch {
  return {
    id: 1,
    name: "Saved search",
    options,
    createdAt: 0,
    lastUsedAt: null,
    useCount: 0,
  };
}
