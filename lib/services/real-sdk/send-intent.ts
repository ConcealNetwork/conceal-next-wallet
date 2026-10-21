// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Session-only send intents on the unlocked runtime. WeakMap RAM — no IndexedDB,
 * no parked hex / `outbox:`. Auto rows retry after synced wait ticks; hung rows
 * watch a local hash only. Callers (send + finalize) land in later tasks.
 */
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import type { QueuedTransaction } from "@/lib/types";
import { queueCopy } from "@/lib/ui/queue-copy";
import { formatCcx, truncateAddress } from "@/lib/utils";

const DECOY_CAP = 5;
const SUBMIT_CAP = 3;
const AUTO_WAIT = 2;

export type IntentKind = "auto" | "hung";
export type FailCause = "decoy" | "submit";
export type FailNote = "kept" | "dropped";

export type IntentInput = {
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
};

export type SendIntent = {
  id: string;
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
  kind: IntentKind;
  watchedHash?: string;
  decoyFails: number;
  submitFails: number;
  waitTicks: number;
  /** Wall-clock ms when the row was (re)enqueued — display metadata, dies with the row. */
  enqueuedAt: number;
  lastError?: string;
  sent?: boolean;
};

/**
 * Per-runtime intent store: the session rows plus the runtime-scoped exhaust-toast
 * slot. Everything dies with the runtime object (WeakMap) and is cleared eagerly by
 * {@link clearIntents} on lock/switch — no process-global side channels.
 */
type IntentStore = {
  rows: SendIntent[];
  dropToast?: string;
};

const stores = new WeakMap<SdkRuntime, IntentStore>();

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

function rowsFor(rt: SdkRuntime): SendIntent[] {
  return storeFor(rt).rows;
}

/** Amount + truncated address so two retrying sends are distinguishable. */
export function intentLabel(input: Pick<IntentInput, "address" | "amount">): string {
  return `${formatCcx(input.amount)} · ${truncateAddress(input.address)}`;
}

export function mapIntent(row: SendIntent): QueuedTransaction {
  const queued: QueuedTransaction = {
    id: row.id,
    kind: row.kind,
    state: row.sent ? "sent" : row.kind === "hung" ? "hung" : "pending",
    attempts: row.decoyFails + row.submitFails,
    enqueuedAt: row.enqueuedAt,
    label: intentLabel(row),
  };
  if (row.kind === "hung" && !row.sent && row.watchedHash) {
    queued.hash = row.watchedHash;
  }
  if (row.sent !== undefined) queued.sent = row.sent;
  if (row.lastError !== undefined) queued.lastError = row.lastError;
  return queued;
}

function copyInput(input: IntentInput): IntentInput {
  const row: IntentInput = { address: input.address, amount: input.amount };
  if (input.paymentId !== undefined) row.paymentId = input.paymentId;
  if (input.message !== undefined) row.message = input.message;
  return row;
}

function findRow(rt: SdkRuntime, id: string): SendIntent | undefined {
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

export function enqueueAuto(rt: SdkRuntime, input: IntentInput, cause: FailCause): SendIntent {
  const row: SendIntent = {
    ...copyInput(input),
    id: nextId(),
    kind: "auto",
    decoyFails: cause === "decoy" ? 1 : 0,
    submitFails: cause === "submit" ? 1 : 0,
    waitTicks: AUTO_WAIT,
    enqueuedAt: Date.now(),
  };
  rowsFor(rt).push(row);
  return row;
}

export function enqueueHung(rt: SdkRuntime, input: IntentInput, watchedHash: string): SendIntent {
  const row: SendIntent = {
    ...copyInput(input),
    id: nextId(),
    kind: "hung",
    watchedHash,
    decoyFails: 0,
    submitFails: 0,
    waitTicks: 0,
    enqueuedAt: Date.now(),
  };
  rowsFor(rt).push(row);
  return row;
}

export function listIntents(rt: SdkRuntime): SendIntent[] {
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
    if (row && row.kind === "auto" && row.waitTicks > 0) {
      rows[i] = { ...row, waitTicks: row.waitTicks - 1 };
    }
  }
}

export function dueAutoIntents(rt: SdkRuntime): SendIntent[] {
  return rowsFor(rt).filter((row) => row.kind === "auto" && row.waitTicks <= 0);
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

export function resetAutoWait(rt: SdkRuntime, id: string): void {
  const rows = rowsFor(rt);
  const idx = rows.findIndex((row) => row.id === id);
  if (idx < 0) return;
  const row = rows[idx];
  if (row) rows[idx] = { ...row, waitTicks: AUTO_WAIT };
}
