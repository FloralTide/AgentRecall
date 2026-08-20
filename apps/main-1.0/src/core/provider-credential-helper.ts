import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export interface ProviderCredentialCommand {
  command: string;
  args?: string[];
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/**
 * Runs a provider-owned credential helper without stdin and keeps its output out of errors.
 * Credential commands are only invoked from explicit probe/apply actions, never while rendering
 * a config snapshot.
 */
export function runProviderCredentialCommand(spec: ProviderCredentialCommand): Promise<string> {
  const command = spec.command.trim();
  if (!command) return Promise.reject(new Error("Credential helper command is empty."));
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, spec.timeoutMs ?? DEFAULT_TIMEOUT_MS));

  return new Promise((resolve, reject) => {
    let stdout = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const child = spawn(command, spec.args ?? [], {
      env: spec.env ?? process.env,
      cwd: spec.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? "");
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") <= MAX_OUTPUT_BYTES) return;
      child.kill();
      finish(new Error("Credential helper output exceeded the allowed size."));
    });
    // Drain stderr without retaining it: helper diagnostics can accidentally contain credentials.
    child.stderr.resume();
    child.once("error", () => finish(new Error("Credential helper could not be started.")));
    child.once("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(signal ? "Credential helper was terminated." : "Credential helper failed."));
        return;
      }
      const value = stdout.trim();
      if (!value) {
        finish(new Error("Credential helper returned an empty value."));
        return;
      }
      finish(undefined, value);
    });

    timer = setTimeout(() => {
      child.kill();
      finish(new Error("Credential helper timed out."));
    }, timeoutMs);
    timer.unref();
  });
}
