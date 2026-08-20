import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CodexChatProxy } from "./codex-chat-proxy";

const runningProxies: CodexChatProxy[] = [];

afterEach(async () => {
  await Promise.all(runningProxies.splice(0).map((proxy) => proxy.stop()));
});

describe("Codex Chat proxy upstream lifecycle", () => {
  it("releases a completed upstream request before the proxy stops", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const proxy = createProxy(async (_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return chatResponse("OK");
    });
    const status = await proxy.start();

    const response = await requestCompletion(status.baseUrl);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"delta":"OK"');
    expect(upstreamSignal?.aborted).toBe(false);

    await proxy.stop();
    expect(upstreamSignal?.aborted).toBe(false);
  });

  it("releases failed upstream requests and redacts reflected credentials", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const proxy = createProxy(async (_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return new Response("gateway rejected lifecycle-secret for tenant demo", { status: 401 });
    });
    const status = await proxy.start();

    const response = await requestCompletion(status.baseUrl);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { message: "gateway rejected [REDACTED] for tenant demo" },
    });

    await proxy.stop();
    expect(upstreamSignal?.aborted).toBe(false);
  });

  it("redacts credentials from thrown upstream transport errors", async () => {
    const proxy = createProxy(async () => {
      throw new Error("transport lifecycle-secret failed");
    });
    const status = await proxy.start();

    const response = await requestCompletion(status.baseUrl);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { message: "transport [REDACTED] failed" },
    });
  });

  it("aborts a hanging upstream request so stop can complete", async () => {
    let upstreamSignal: AbortSignal | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const proxy = createProxy((_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => reject(abortError()), { once: true });
        markStarted();
      });
    });
    const status = await proxy.start();
    const clientRequest = requestCompletion(status.baseUrl).catch(() => null);
    await started;

    await expect(proxy.stop()).resolves.toBeUndefined();
    expect(upstreamSignal?.aborted).toBe(true);
    await clientRequest;
  });

  it("stops while a client is still uploading its request body", async () => {
    let upstreamCalled = false;
    const proxy = createProxy(async () => {
      upstreamCalled = true;
      return chatResponse("unexpected");
    });
    const status = await proxy.start();
    const request = http.request(`${status.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1024",
      },
    });
    request.on("error", () => undefined);
    await new Promise<void>((resolve) => {
      request.once("socket", (socket) => {
        socket.once("connect", () => {
          request.write('{"model":"test-model",');
          setImmediate(resolve);
        });
      });
    });

    await expect(proxy.stop()).resolves.toBeUndefined();
    expect(upstreamCalled).toBe(false);
  });

  it("aborts the matching upstream request when its client disconnects", async () => {
    let upstreamSignal: AbortSignal | undefined;
    let markStarted!: () => void;
    let markAborted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const aborted = new Promise<void>((resolve) => {
      markAborted = resolve;
    });
    const proxy = createProxy((_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => {
          markAborted();
          reject(abortError());
        }, { once: true });
        markStarted();
      });
    });
    const status = await proxy.start();
    const request = http.request(`${status.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    request.on("error", () => undefined);
    request.end(requestBody());
    await started;

    request.destroy();
    await aborted;

    expect(upstreamSignal?.aborted).toBe(true);
    await expect(proxy.stop()).resolves.toBeUndefined();
  });
});

function createProxy(
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): CodexChatProxy {
  const proxy = new CodexChatProxy({
    upstreamBaseUrl: "https://upstream.invalid/v1",
    apiKey: "lifecycle-secret",
    model: "test-model",
    fetchImpl: fetchImpl as typeof fetch,
  });
  runningProxies.push(proxy);
  return proxy;
}

function requestCompletion(baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody(),
  });
}

function requestBody(): string {
  return JSON.stringify({
    model: "test-model",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Reply OK." }] }],
    stream: false,
  });
}

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({
    model: "test-model",
    choices: [{ message: { content } }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function abortError(): Error {
  const error = new Error("upstream request aborted");
  error.name = "AbortError";
  return error;
}
