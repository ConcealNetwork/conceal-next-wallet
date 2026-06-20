"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { RailSectionHeading } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactAvatar } from "@/components/wallet/contact-avatar";
import { useAddressBook } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn, truncateAddress } from "@/lib/utils";

// Address-Book-page contextual rail (#122): a quick saved-contacts glance + an
// add affordance. Fetches its own data so it stays live as contacts change.
export function AddressBookRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const entries = useAddressBook().data;
  const shown = entries ? entries.slice(0, 7) : null;

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.addressBook")} />}
      <section>
        <RailSectionHeading icon={Users} first>
          {t("nav.addressBook")}
          {entries ? <span className="ml-auto tabular-nums">{entries.length}</span> : null}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {shown === null ? (
            <div className="space-y-4 py-3">
              {Array.from({ length: 4 }).map((_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-lg" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {t("addressBook.emptyTitle")}
            </p>
          ) : (
            shown.map((entry, index) => (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 py-3",
                  index > 0 && "border-t border-border/70",
                )}
              >
                <ContactAvatar entry={entry} className="size-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{entry.label}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {truncateAddress(entry.address, 8, 6)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <Link
          href="/wallet/address-book?new=1"
          className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-sm px-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t("addressBook.createNew")}
        </Link>
      </section>
    </div>
  );
}
