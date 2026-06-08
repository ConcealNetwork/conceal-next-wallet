import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type { AddressEntry } from "@/lib/types";
import type { AddressEntryInput } from "@/lib/services/address-book.service";
import { addressIsValid, paymentIdIsValid } from "@/lib/validation/ccx";
import { flushRuntimeWalletPersistence, getRuntimeWallet } from "./wallet-runtime";

function requireOpenWallet() {
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  return wallet;
}

function validateEntryInput(input: AddressEntryInput) {
  const label = input.label.trim();
  const address = input.address.trim();
  const paymentId = input.paymentId?.trim() ?? "";

  if (!label) throw new Error("Label is required.");
  if (!addressIsValid(address)) {
    throw new Error("Address must start with ccx7 and be exactly 98 characters.");
  }
  if (!paymentIdIsValid(paymentId)) {
    throw new Error("Payment ID must be 64 or 16 hexadecimal characters.");
  }

  return {
    label,
    address,
    paymentId: paymentId || undefined,
    avatar: input.avatar?.trim() || undefined,
  };
}

function toAddressEntry(raw: {
  id: string;
  label: string;
  address: string;
  paymentId?: string;
  avatar?: string;
}): AddressEntry {
  return {
    id: raw.id,
    label: raw.label,
    address: raw.address,
    paymentId: raw.paymentId,
    avatar: raw.avatar,
  };
}

export async function listAddressBookOperation(): Promise<AddressEntry[]> {
  await ensureAllWalletLegacyLibs();
  return requireOpenWallet().listAddressBook().map(toAddressEntry);
}

export async function createAddressEntryOperation(input: AddressEntryInput): Promise<AddressEntry> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  const validated = validateEntryInput(input);
  const entry = wallet.createAddressEntry({
    id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...validated,
  });
  await flushRuntimeWalletPersistence();
  return toAddressEntry(entry);
}

export async function updateAddressEntryOperation(
  id: string,
  input: AddressEntryInput,
): Promise<AddressEntry> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  const validated = validateEntryInput(input);
  const updated = wallet.updateAddressEntry(id, validated);
  if (updated === null) throw new Error("Address book entry not found.");
  await flushRuntimeWalletPersistence();
  return toAddressEntry(updated);
}

export async function deleteAddressEntryOperation(id: string): Promise<{ ok: true }> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  if (!wallet.deleteAddressEntry(id)) {
    throw new Error("Address book entry not found.");
  }
  await flushRuntimeWalletPersistence();
  return { ok: true };
}
