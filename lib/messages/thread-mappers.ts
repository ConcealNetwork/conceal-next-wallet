// Message-thread + address-book mappers (#91 decoupling): moved out of lib/wallet-core/mappers
// so lib/messages + services depend on a neutral module, not the engine.

import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import type { RawAddressEntry, Message as UiMessage } from "@/lib/types";
import { addressIsValid, normalizePaymentId, paymentIdsMatch } from "@/lib/validation/ccx";

export function resolveThreadKeyFromMeta(
  addressBook: RawAddressEntry[],
  counterpartyAddress: string,
  paymentId?: string,
): string {
  if (paymentId) {
    const contact = findAddressBookContact(addressBook, {
      paymentId,
      address: addressIsValid(counterpartyAddress) ? counterpartyAddress : undefined,
    });
    if (contact) {
      return buildMessageThreadKey(contact.address, paymentId);
    }
  }
  if (addressIsValid(counterpartyAddress)) {
    return buildMessageThreadKey(counterpartyAddress, paymentId);
  }
  return buildMessageThreadKey(counterpartyAddress, paymentId);
}

function findAddressBookContact(
  addressBook: RawAddressEntry[],
  options: { paymentId?: string; address?: string },
): RawAddressEntry | undefined {
  const normalizedPid = normalizePaymentId(options.paymentId);
  if (normalizedPid) {
    const byPid = addressBook.find((entry) => paymentIdsMatch(entry.paymentId, normalizedPid));
    if (byPid) return byPid;
  }
  if (options.address) {
    return addressBook.find((entry) => entry.address === options.address);
  }
  return undefined;
}

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
