import type { LoadLiveSessionOptions } from "../core/session-activity";
import type { LiveSessionSnapshot } from "../core/types";

export type LiveSessionWorkerOptions = Omit<LoadLiveSessionOptions, "runner">;

export interface LiveSessionWorkerRequest {
  type: "load";
  requestId: number;
  options: LiveSessionWorkerOptions;
}

export interface LiveSessionWorkerError {
  name: string;
  message: string;
  stack?: string;
}

export type LiveSessionWorkerResponse =
  | {
      type: "result";
      requestId: number;
      result: LiveSessionSnapshot;
    }
  | {
      type: "error";
      requestId: number;
      error: LiveSessionWorkerError;
    };

export function serializeLiveSessionWorkerError(error: unknown): LiveSessionWorkerError {
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
