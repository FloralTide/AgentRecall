import type {
  ProjectQueryOptions,
  ProjectSummary,
  ProjectTagEntry,
  SearchOptions,
  SessionSearchPage,
  SessionSearchResult,
  SessionStats,
  SessionStatsOptions,
  SessionStatsTrend,
  TagListOptions,
} from "../core/types";

export interface SessionQueryWorkerInput {
  dbPath: string;
  codexHome: string;
}

export interface SessionQueryWorkerOperations {
  searchSessions: {
    options: SearchOptions;
    result: SessionSearchResult[];
  };
  searchSessionPage: {
    options: SearchOptions;
    result: SessionSearchPage;
  };
  getStats: {
    options: SessionStatsOptions;
    result: SessionStats;
  };
  getStatsTrend: {
    options: SessionStatsOptions;
    result: SessionStatsTrend;
  };
  listTags: {
    options: TagListOptions;
    result: string[];
  };
  listProjects: {
    options: ProjectQueryOptions;
    result: ProjectSummary[];
  };
  listTagsByProject: {
    options: { excludeSubagents?: boolean };
    result: ProjectTagEntry[];
  };
}

export type SessionQueryWorkerMethod = keyof SessionQueryWorkerOperations;
export type SessionQueryWorkerResult =
  SessionQueryWorkerOperations[SessionQueryWorkerMethod]["result"];

export type SessionQueryWorkerRequest = {
  [Method in SessionQueryWorkerMethod]: {
    type: "request";
    requestId: number;
    method: Method;
    options: SessionQueryWorkerOperations[Method]["options"];
  };
}[SessionQueryWorkerMethod];

export interface SessionQueryWorkerError {
  name: string;
  message: string;
  stack?: string;
}

export type SessionQueryWorkerResponse =
  | {
      type: "result";
      requestId: number;
      result: SessionQueryWorkerResult;
    }
  | {
      type: "error";
      requestId: number;
      error: SessionQueryWorkerError;
    };

export function serializeSessionQueryWorkerError(error: unknown): SessionQueryWorkerError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}
