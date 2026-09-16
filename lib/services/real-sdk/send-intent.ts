// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Session-only send intents on the unlocked runtime. WeakMap RAM — no IndexedDB,
 * no parked hex / `outbox:`. Auto rows retry after synced wait ticks; hung rows
 * watch a local hash only. Callers (send + finalize) land in later tasks.
 */
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import { queueCopy } from "@/lib/ui/queue-copy";

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
  lastError?: string;
  sent?: boolean;
};

const stores = new WeakMap<SdkRuntime, SendIntent[]>();

let nextSeq = 0;
let dropToast: string | undefined;

function nextId(): string {
  nextSeq += 1;
  return `intent-${nextSeq}`;
}

function rowsFor(rt: SdkRuntime): SendIntent[] {
  const cached = stores.get(rt);
  if (cached) return cached;
  const rows: SendIntent[] = [];
  stores.set(rt, rows);
  return rows;
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
    noteDropToast(queueCopy.exhaustToast);
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
  stores.delete(rt);
  dropToast = undefined;
}

export function noteDropToast(message: string): void {
  dropToast = message;
}

export function takeDropToast(): string | undefined {
  const message = dropToast;
  dropToast = undefined;
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
