import { parentPort } from "node:worker_threads";
import { loadLiveSessionSnapshot } from "../core/session-activity";
import type {
  LiveSessionWorkerRequest,
  LiveSessionWorkerResponse,
} from "./live-session-worker-protocol";
import { serializeLiveSessionWorkerError } from "./live-session-worker-protocol";

const port = parentPort;
if (!port) throw new Error("Live session worker requires a parent port.");

port.on("message", (request: LiveSessionWorkerRequest) => {
  void loadLiveSessionSnapshot(request.options)
    .then((result) => {
      const response: LiveSessionWorkerResponse = {
        type: "result",
        requestId: request.requestId,
        result,
      };
      port.postMessage(response);
    })
    .catch((error) => {
      const response: LiveSessionWorkerResponse = {
        type: "error",
        requestId: request.requestId,
        error: serializeLiveSessionWorkerError(error),
      };
      port.postMessage(response);
    });
});
