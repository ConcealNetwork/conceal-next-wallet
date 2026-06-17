/**
 * Smart-message convention, kept byte-compatible with the Conceal ecosystem
 * (`Acktarius/Conceal-2fa-app` model/SmartMessage.ts): a structured command is a
 * comma-separated `{module,action,...data}` payload wrapped in braces, detected
 * by a trimmed `{` prefix + `}` suffix so it never collides with ordinary text.
 *
 * Pure module — no wallet-core, no React — so it can be used from the
 * spine-free check-in layer without pulling the engine into mock mode.
 */

const PREFIX = "{";
const SUFFIX = "}";

// Action shorthands mirrored from conceal-2fa to keep encodings identical.
const ACTION_MAP: Record<string, string> = {
  create: "c",
  update: "u",
  delete: "d",
  complete: "x",
  authorize: "a",
  execute: "e",
  register: "r",
  verify: "v",
  revoke: "k",
};

/** A body is a smart message when it's a single brace-wrapped token. */
export function isSmartMessage(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const trimmed = body.trim();
  return trimmed.length >= 2 && trimmed.startsWith(PREFIX) && trimmed.endsWith(SUFFIX);
}

/** `encodeSmartMessage("checkin","alive")` → `"{checkin,alive}"`. */
export function encodeSmartMessage(module: string, action: string, ...data: string[]): string {
  // Commas/braces are the structural delimiters — a part containing them would
  // corrupt the round-trip, so reject rather than silently mangle.
  const invalid = [module, action, ...data].find(
    (part) => part.includes(",") || part.includes("{") || part.includes("}"),
  );
  if (invalid !== undefined) {
    throw new Error(`Smart-message parts cannot contain "," "{" or "}": ${JSON.stringify(invalid)}`);
  }
  const serializedAction = Object.hasOwn(ACTION_MAP, action) ? ACTION_MAP[action] : action;
  return `${PREFIX}${[module, serializedAction, ...data].join(",")}${SUFFIX}`;
}

/** Split a smart message into its trimmed `[module, action, ...data]` parts, or null. */
export function parseSmartMessage(body: unknown): string[] | null {
  if (!isSmartMessage(body)) return null;
  const inner = (body as string).trim().slice(1, -1);
  return inner.split(",").map((part) => part.trim());
}
