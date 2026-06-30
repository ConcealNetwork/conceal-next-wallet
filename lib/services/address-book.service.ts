import type { AddressEntry } from "@/lib/types";

export type AddressEntryInput = {
  label: string;
  address: string;
  paymentId?: string;
  avatar?: string;
};

export interface AddressBookService {
  listEntries(): Promise<AddressEntry[]>;
  createEntry(input: AddressEntryInput): Promise<AddressEntry>;
  updateEntry(id: string, input: AddressEntryInput): Promise<AddressEntry>;
  deleteEntry(id: string): Promise<{ ok: true }>;
  /** After send — overwrites `paymentIdTo`. */
  saveOutboundPid(recipientAddress: string, paymentId: string): Promise<void>;
  /** From thread — fills `paymentIdTo` only when unset, then evals `relationship`. */
  fillOutboundPid(recipientAddress: string, paymentId: string): Promise<void>;
}
