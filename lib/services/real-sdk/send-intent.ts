// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
/**
 * Session-only wallet intents on the unlocked runtime. WeakMap RAM — no IndexedDB,
 * no parked hex / `outbox:`. Auto rows retry after synced wait ticks; hung rows
 * watch every hash that submit produced. One shared store serves every intent kind (send,
 * deposit, withdraw, message, fusion); each kind carries its own payload and
 * rebuild function (see intent-drain.ts).
 *
 * @see docs/decisions/003-session-intent-creation.md
 */
import type { QueuedTransaction, WalletIntentKind } from "@/lib/types";
import { queueCopy } from "@/lib/ui/queue-copy";
import { formatCcx, truncateAddress } from "@/lib/utils";

const DECOY_CAP = 5;
const SUBMIT_CAP = 3;
const AUTO_WAIT = 2;

/** Retry state of an intent row: auto-retrying or hash-watching (hung). */
export type IntentState = "auto" | "hung";
export type FailCause = "decoy" | "submit";
export type FailNote = "kept" | "dropped";

export type SendIntentPayload = {
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
};

export type DepositIntentPayload = {
  amount: number;
  durationMonths: number;
};

export type WithdrawIntentPayload = {
  txHash: string;
  globalOutputIndex: number;
};

export type MessageIntentPayload = {
  recipientAddress: string;
  body: string;
  paymentId?: string;
  /** Mempool TTL (unix seconds); 0/absent = mined message. */
  ttlUnixSeconds?: number;
};

export type FusionIntentPayload = Record<string, never>;

/** What a parked intent rebuilds, flat per kind — the enqueue input shape. */
export type IntentDraft =
  | ({ kind: "send" } & SendIntentPayload)
  | ({ kind: "deposit" } & DepositIntentPayload)
  | ({ kind: "withdraw" } & WithdrawIntentPayload)
  | ({ kind: "message" } & MessageIntentPayload)
  | { kind: "fusion" };

type IntentBase = {
  id: string;
  state: IntentState;
  /** Latest hash. The card shows this one. */
  watchedHash?: string;
  /** Every hash this hung row has produced. Any one of them marks it sent. */
  watchedHashes?: string[];
  decoyFails: number;
  submitFails: number;
  waitTicks: number;
  /** Wall-clock ms when the row was (re)enqueued — display metadata, dies with the row. */
  enqueuedAt: number;
  lastError?: string;
  sent?: boolean;
};

/** One parked broadcast, tagged by kind — payloads never store signed hex. */
type IntentMember =
  | { kind: "send"; payload: SendIntentPayload }
  | { kind: "deposit"; payload: DepositIntentPayload }
  | { kind: "withdraw"; payload: WithdrawIntentPayload }
  | { kind: "message"; payload: MessageIntentPayload }
  | { kind: "fusion"; payload: FusionIntentPayload };

export type WalletIntent = IntentBase & IntentMember;

/** Copy a draft's fields into the stored payload for its kind. */
function toMember(draft: IntentDraft): IntentMember {
  switch (draft.kind) {
    case "send": {
      const payload: SendIntentPayload = { address: draft.address, amount: draft.amount };
      if (draft.paymentId !== undefined) payload.paymentId = draft.paymentId;
      if (draft.message !== undefined) payload.message = draft.message;
      return { kind: "send", payload };
    }
    case "deposit":
      return {
        kind: "deposit",
        payload: { amount: draft.amount, durationMonths: draft.durationMonths },
      };
    case "withdraw":
      return {
        kind: "withdraw",
        payload: { txHash: draft.txHash, globalOutputIndex: draft.globalOutputIndex },
      };
    case "message": {
      const payload: MessageIntentPayload = {
        recipientAddress: draft.recipientAddress,
        body: draft.body,
      };
      if (draft.paymentId !== undefined) payload.paymentId = draft.paymentId;
      if (draft.ttlUnixSeconds !== undefined) payload.ttlUnixSeconds = draft.ttlUnixSeconds;
      return { kind: "message", payload };
    }
    case "fusion":
      return { kind: "fusion", payload: {} };
  }
}

/**
 * Per-runtime intent store: the session rows plus the runtime-scoped exhaust-toast
 * slot. Everything dies with the runtime object (WeakMap) and is cleared eagerly by
 * {@link clearIntents} on lock/switch — no process-global side channels.
 */
type IntentStore = {
  rows: WalletIntent[];
  dropToast?: string;
};

const stores = new WeakMap<object, IntentStore>();

/** Most recent store that raised a drop toast, so the UI can take it without a runtime handle. */
let lastToastStore: IntentStore | undefined;

let nextSeq = 0;

function nextId(): string {
  nextSeq += 1;
  return `intent-${nextSeq}`;
}

function storeFor(rt: SdkRuntime): IntentStore {
  const cached = stores.get(rt);
  if (cached) return cached;
  const store: IntentStore = { rows: [] };
  stores.set(rt, store);
  return store;
}

function rowsFor(rt: SdkRuntime): WalletIntent[] {
  return storeFor(rt).rows;
}

/** Distinguishable one-line label per kind (amount · recipient, term, deposit ref…). */
export function intentLabel(member: IntentMember): string {
  switch (member.kind) {
    case "send":
      return `${formatCcx(member.payload.amount)} · ${truncateAddress(member.payload.address)}`;
    case "deposit":
      return `Deposit ${formatCcx(member.payload.amount)} · ${member.payload.durationMonths} mo`;
    case "withdraw":
      return `Withdraw deposit ${member.payload.txHash.slice(0, 12)}…`;
    case "message":
      return `Message to ${truncateAddress(member.payload.recipientAddress)}`;
    case "fusion":
      return "Fusion transaction";
  }
}

export function mapIntent(row: WalletIntent): QueuedTransaction {
  const queued: QueuedTransaction = {
    id: row.id,
    kind: row.state,
    intentKind: row.kind satisfies WalletIntentKind,
    state: row.sent ? "sent" : row.state === "hung" ? "hung" : "pending",
    attempts: row.decoyFails + row.submitFails,
    enqueuedAt: row.enqueuedAt,
    label: intentLabel(row),
  };
  if (row.state === "hung" && !row.sent && row.watchedHash) {
    queued.hash = row.watchedHash;
  }
  if (row.sent !== undefined) queued.sent = row.sent;
  if (row.lastError !== undefined) queued.lastError = row.lastError;
  return queued;
}

function findRow(rt: SdkRuntime, id: string): WalletIntent | undefined {
  return rowsFor(rt).find((row) => row.id === id);
}

function removeRow(rt: SdkRuntime, id: string): boolean {
  const rows = rowsFor(rt);
  const idx = rows.findIndex((row) => row.id === id);
  if (idx < 0) return false;
  rows.splice(idx, 1);
  return true;
}

function noteFail(
  rt: SdkRuntime,
  id: string,
  field: "decoyFails" | "submitFails",
  cap: number,
): FailNote {
  const row = findRow(rt, id);
  if (!row) return "dropped";
  row[field] += 1;
  if (row[field] >= cap) {
    removeRow(rt, id);
    noteDropToast(rt, queueCopy.exhaustToast);
    return "dropped";
  }
  return "kept";
}

function rowFrom(
  draft: IntentDraft,
  state: IntentState,
  extra: {
    decoyFails: number;
    submitFails: number;
    waitTicks: number;
    watchedHash?: string;
    watchedHashes?: string[];
  },
): WalletIntent {
  const base = {
    id: nextId(),
    state,
    ...extra,
    enqueuedAt: Date.now(),
  };
  return { ...base, ...toMember(draft) };
}

export function enqueueAuto(rt: SdkRuntime, draft: IntentDraft, cause: FailCause): WalletIntent {
  const row = rowFrom(draft, "auto", {
    decoyFails: cause === "decoy" ? 1 : 0,
    submitFails: cause === "submit" ? 1 : 0,
    waitTicks: AUTO_WAIT,
  });
  rowsFor(rt).push(row);
  return row;
}

export function enqueueHung(rt: SdkRuntime, draft: IntentDraft, watchedHash: string): WalletIntent {
  const row = rowFrom(draft, "hung", {
    watchedHash,
    watchedHashes: [watchedHash],
    decoyFails: 0,
    submitFails: 0,
    waitTicks: 0,
  });
  rowsFor(rt).push(row);
  return row;
}

/** Hashes a hung row is watching. Falls back to the single latest hash. */
export function hungHashes(row: WalletIntent): string[] {
  if (row.watchedHashes && row.watchedHashes.length > 0) return row.watchedHashes;
  return row.watchedHash ? [row.watchedHash] : [];
}

/** Keep a new submit hash on a hung row. The row is not replaced. */
export function noteHungHash(rt: SdkRuntime, id: string, hash: string): void {
  const rows = rowsFor(rt);
  const idx = rows.findIndex((row) => row.id === id);
  const row = rows[idx];
  if (row?.state !== "hung") return;
  const prior = hungHashes(row);
  const watchedHashes = prior.includes(hash) ? prior : [...prior, hash];
  rows[idx] = { ...row, watchedHash: hash, watchedHashes };
}

export function listIntents(rt: SdkRuntime): WalletIntent[] {
  return rowsFor(rt).slice();
}

export function cancelIntent(rt: SdkRuntime, id: string): boolean {
  return removeRow(rt, id);
}

export function clearIntents(rt: SdkRuntime): void {
  const store = stores.get(rt);
  if (store && lastToastStore === store) lastToastStore = undefined;
  stores.delete(rt);
}

function noteDropToast(rt: SdkRuntime, message: string): void {
  const store = storeFor(rt);
  store.dropToast = message;
  lastToastStore = store;
}

/**
 * Take the runtime-scoped exhaust toast, if any. Pass an explicit runtime to read
 * its slot; without one, falls back to the store that last raised a toast (the UI
 * has no runtime handle). Locked/switched-away stores return nothing.
 */
export function takeDropToast(rt?: SdkRuntime): string | undefined {
  const store = rt ? stores.get(rt) : lastToastStore;
  const message = store?.dropToast;
  if (store) {
    store.dropToast = undefined;
    if (lastToastStore === store) lastToastStore = undefined;
  }
  return message;
}

export function tickSynced(rt: SdkRuntime): void {
  const rows = rowsFor(rt);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.state === "auto" && row.waitTicks > 0) {
      rows[i] = { ...row, waitTicks: row.waitTicks - 1 };
    }
  }
}

export function dueAutoIntents(rt: SdkRuntime): WalletIntent[] {
  return rowsFor(rt).filter((row) => row.state === "auto" && row.waitTicks <= 0);
}

export function noteDecoyFail(rt: SdkRuntime, id: string): FailNote {
  return noteFail(rt, id, "decoyFails", DECOY_CAP);
}

export function noteSubmitFail(rt: SdkRuntime, id: string): FailNote {
  return noteFail(rt, id, "submitFails", SUBMIT_CAP);
}

export function dropUnfunded(
  rt: SdkRuntime,
  id: string,
  spendableAtomic: number,
  needAtomic: number,
): boolean {
  if (spendableAtomic >= needAtomic) return false;
  return removeRow(rt, id);
}

export function markHungSent(rt: SdkRuntime, id: string): void {
  const row = findRow(rt, id);
  if (row) row.sent = true;
}

/** `txHash:globalOutputIndex` of every deposit a not-yet-sent withdraw intent targets. */
export function savedWithdrawKeys(rt: SdkRuntime): Set<string> {
  const keys = new Set<string>();
  for (const row of rowsFor(rt)) {
    if (row.kind === "withdraw" && !row.sent) {
      keys.add(`${row.payload.txHash}:${row.payload.globalOutputIndex}`);
    }
  }
  return keys;
}

/** True while a not-yet-sent fusion intent is saved. */
export function fusionSaved(rt: SdkRuntime): boolean {
  return rowsFor(rt).some((row) => row.kind === "fusion" && !row.sent);
}

export function resetAutoWait(rt: SdkRuntime, id: string): void {
  const rows = rowsFor(rt);
  const idx = rows.findIndex((row) => row.id === id);
  if (idx < 0) return;
  const row = rows[idx];
  if (row) rows[idx] = { ...row, waitTicks: AUTO_WAIT };
}
