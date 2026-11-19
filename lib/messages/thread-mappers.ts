// Message-thread ordering (#91 decoupling): moved out of lib/wallet-core/mappers
// so lib/messages + services depend on a neutral module, not the engine.

import type { Message as UiMessage } from "@/lib/types";

/** Thread panel: oldest at top, newest at bottom (chat order). Timestamp is primary so a
 *  still-pending message keeps its place even after a newer reply has already mined. */
function compareMessagesChronological(
  a: Pick<UiMessage, "blockHeight" | "timestamp" | "direction" | "id">,
  b: Pick<UiMessage, "blockHeight" | "timestamp" | "direction" | "id">,
): number {
  const timeA = new Date(a.timestamp).getTime();
  const timeB = new Date(b.timestamp).getTime();
  if (timeA !== timeB) return timeA - timeB;

  if (a.blockHeight !== b.blockHeight) return a.blockHeight - b.blockHeight;

  // Same instant: show incoming before outgoing (reply follows original).
  if (a.direction !== b.direction) {
    return a.direction === "received" ? -1 : 1;
  }

  return a.id.localeCompare(b.id);
}

export function sortMessagesByHeight(messages: UiMessage[]): UiMessage[] {
  return [...messages].sort(compareMessagesChronological);
}
