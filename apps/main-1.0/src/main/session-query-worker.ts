import { parentPort, workerData } from "node:worker_threads";
import type {
  SessionQueryWorkerInput,
  SessionQueryWorkerRequest,
  SessionQueryWorkerResponse,
} from "./session-query-worker-protocol";
import { serializeSessionQueryWorkerError } from "./session-query-worker-protocol";
import { SessionQueryWorkerRunner } from "./session-query-worker-runner";

const port = parentPort;
if (!port) throw new Error("Session query worker requires a parent port.");

const runner = new SessionQueryWorkerRunner(workerData as SessionQueryWorkerInput);

port.on("message", (request: SessionQueryWorkerRequest) => {
  let response: SessionQueryWorkerResponse;
  try {
    response = {
      type: "result",
      requestId: request.requestId,
      result: runner.execute(request),
    };
  } catch (error) {
    response = {
      type: "error",
      requestId: request.requestId,
      error: serializeSessionQueryWorkerError(error),
    };
  }
  port.postMessage(response);
});

process.once("exit", () => runner.close());
