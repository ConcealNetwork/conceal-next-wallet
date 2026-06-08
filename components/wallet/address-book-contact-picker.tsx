"use client";

import { ContactAvatar } from "@/components/wallet/contact-avatar";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AddressEntry } from "@/lib/types";
import { cn, truncateAddress } from "@/lib/utils";

const DEFAULT_SELECT_THRESHOLD = 12;

export type AddressBookContactPickerProps = {
  contacts: AddressEntry[];
  selectedId: string | null;
  onSelect: (entry: AddressEntry | null) => void;
  /** Switch from avatar strip to dropdown when contact count exceeds this. */
  selectThreshold?: number;
  className?: string;
};

export function findAddressBookContactByAddress(
  contacts: AddressEntry[],
  address: string,
): AddressEntry | undefined {
  const trimmed = address.trim();
  if (!trimmed) return undefined;
  return contacts.find((entry) => entry.address === trimmed);
}

export function AddressBookContactPicker({
  contacts,
  selectedId,
  onSelect,
  selectThreshold = DEFAULT_SELECT_THRESHOLD,
  className,
}: AddressBookContactPickerProps) {
  if (contacts.length === 0) return null;

  const useSelect = contacts.length > selectThreshold;

  if (useSelect) {
    return (
      <div className={cn("space-y-2", className)}>
        <Label className="text-xs text-muted-foreground">Saved contacts</Label>
        <Select
          value={selectedId ?? undefined}
          onValueChange={(value) => {
            const entry = contacts.find((contact) => contact.id === value);
            onSelect(entry ?? null);
          }}
        >
          <SelectTrigger aria-label="Choose from address book">
            <SelectValue placeholder="Choose from address book…" />
          </SelectTrigger>
          <SelectContent>
            {contacts.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                <span className="flex min-w-0 items-center gap-2">
                  <ContactAvatar entry={entry} className="size-6 shrink-0 rounded-md text-xs" />
                  <span className="min-w-0 truncate">{entry.label}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {truncateAddress(entry.address, 8, 6)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs text-muted-foreground">Saved contacts</Label>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="listbox"
        aria-label="Saved contacts"
      >
        {contacts.map((entry) => {
          const selected = selectedId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={selected}
              title={entry.label}
              onClick={() => onSelect(selected ? null : entry)}
              className={cn(
                "flex w-[4.5rem] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-primary/10" : "border-border hover:border-ring/50",
              )}
            >
              <ContactAvatar entry={entry} className="size-10 rounded-lg text-sm" />
              <span className="w-full truncate text-center text-xs font-medium">{entry.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
