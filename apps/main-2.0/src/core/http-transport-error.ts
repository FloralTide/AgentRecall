const TRANSPORT_FAILURE_EXPLANATIONS: Readonly<Record<string, string>> = {
  ENOTFOUND: "the host name could not be resolved — check the Base URL, or whether this network needs a proxy",
  EAI_AGAIN: "the host name could not be resolved — check the Base URL, or whether this network needs a proxy",
  ERR_NAME_NOT_RESOLVED: "the host name could not be resolved — check the Base URL, or whether this network needs a proxy",
  ECONNREFUSED: "nothing accepted the connection on that host and port",
  ERR_CONNECTION_REFUSED: "nothing accepted the connection on that host and port",
  ECONNRESET: "the connection was closed before an answer arrived",
  ERR_CONNECTION_RESET: "the connection was closed before an answer arrived",
  ETIMEDOUT: "the connection timed out — check whether this network needs a proxy",
  UND_ERR_CONNECT_TIMEOUT: "the connection timed out — check whether this network needs a proxy",
  ERR_TIMED_OUT: "the connection timed out — check whether this network needs a proxy",
  EPROTO: "the TLS handshake failed — check whether the Base URL should use http:// instead",
  CERT_HAS_EXPIRED: "the server's TLS certificate has expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "the server uses a self-signed TLS certificate",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the server's TLS certificate could not be verified",
  ERR_INVALID_URL: "that is not a valid URL — a Base URL needs a scheme such as https://",
  ERR_INTERNET_DISCONNECTED: "the computer is offline",
  ERR_PROXY_CONNECTION_FAILED: "the configured network proxy could not be reached",
  ERR_TUNNEL_CONNECTION_FAILED: "the network proxy could not open a tunnel to the provider",
};

/** Empty for anything that is not recognizably a network transport failure. */
export function httpTransportFailureReason(error: Error): string {
  const code = transportFailureCode(error);
  if (!code) return "";
  const explanation = TRANSPORT_FAILURE_EXPLANATIONS[code];
  if (explanation) return `${explanation} (${code})`;
  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause ? `${cause} (${code})` : code;
}

/** Node fetch nests OS codes in `cause`; Electron net.fetch usually puts Chromium codes in the message. */
function transportFailureCode(error: Error): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    const chromiumCode = current.message.match(/\b(?:net::)?(ERR_[A-Z0-9_]+)\b/)?.[1];
    if (chromiumCode) return chromiumCode;
    current = current.cause;
  }
  return "";
}
