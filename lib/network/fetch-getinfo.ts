import { type ParsedGetInfo, parseGetInfo } from "@/lib/network/parse-getinfo";

function normalizeNodeUrl(nodeUrl: string): string {
  const trimmed = nodeUrl.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** One daemon `getinfo` fetch — keeps Conceal-only fields the SDK drops. */
export async function fetchDaemonGetInfo(
  nodeUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedGetInfo> {
  const response = await fetchImpl(`${normalizeNodeUrl(nodeUrl)}getinfo`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Daemon getinfo returned HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Daemon getinfo response was not a JSON object.");
  }

  return parseGetInfo(body as Record<string, unknown>);
}
