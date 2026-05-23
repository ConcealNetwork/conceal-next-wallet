"use client"

import { LayoutGrid, Pencil, Plus, Search, Table2, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CopyButton, EmptyState, PageHeader, SectionCard } from "@/components/wallet/common"
import { useAddressBook, useCreateAddressEntry } from "@/lib/hooks"
import type { AddressEntry } from "@/lib/types"
import { cn, truncateAddress } from "@/lib/utils"

type View = "cards" | "table"
const VIEW_KEY = "conceal-address-view"

export default function AddressBookPage() {
  const addressBook = useAddressBook()
  const createEntry = useCreateAddressEntry()
  const [added, setAdded] = useState<AddressEntry[]>([])
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>("cards")
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [address, setAddress] = useState("")
  const [paymentId, setPaymentId] = useState("")

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY)
    if (stored === "cards" || stored === "table") setView(stored)
  }, [])

  function chooseView(next: View) {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const entries = useMemo(() => {
    const base = [...(addressBook.data ?? []), ...added].filter((entry) => !removed.has(entry.id))
    const term = query.trim().toLowerCase()
    return term ? base.filter((entry) => `${entry.label} ${entry.address}`.toLowerCase().includes(term)) : base
  }, [addressBook.data, added, removed, query])

  const total = (addressBook.data ?? []).length + added.length - removed.size

  function submit() {
    createEntry.mutate(
      { label, address, paymentId },
      {
        onSuccess: (entry) => {
          setAdded((current) => [...current, entry])
          toast.success("Mock address saved.")
          setOpen(false)
          setLabel("")
          setAddress("")
          setPaymentId("")
        },
      }
    )
  }

  function remove(id: string) {
    setRemoved((current) => new Set(current).add(id))
    toast.success("Mock address removed.")
  }

  return (
    <>
      <PageHeader
        title="Address Book"
        subtitle="Save and manage frequently used addresses"
        action={
          <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Create New
          </Button>
        }
      />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard>
          {total === 0 ? (
            <EmptyState title="No addresses saved yet" description="Add your first CCX address to get started." />
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search addresses…" className="pl-9" aria-label="Search addresses" />
                </div>
                <div className="inline-flex rounded-xl border border-border p-1" role="group" aria-label="View">
                  <ViewToggle active={view === "cards"} onClick={() => chooseView("cards")} label="Cards"><LayoutGrid className="size-4" /></ViewToggle>
                  <ViewToggle active={view === "table"} onClick={() => chooseView("table")} label="Table"><Table2 className="size-4" /></ViewToggle>
                </div>
              </div>

              {entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No addresses match “{query}”.</p>
              ) : view === "cards" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {entries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border bg-secondary p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 font-semibold text-primary">
                            {entry.label.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">{entry.label}</p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">{truncateAddress(entry.address, 12, 8)}</p>
                            {entry.paymentId && <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">PID {truncateAddress(entry.paymentId, 6, 6)}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <CopyButton value={entry.address} label="Copy" />
                        <Button type="button" variant="outline" size="icon" aria-label={`Edit ${entry.label}`} onClick={() => toast.info("Mock edit.")}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button type="button" variant="destructive" size="icon" aria-label={`Delete ${entry.label}`} onClick={() => remove(entry.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Label</th>
                        <th className="px-4 py-3 font-medium">Address</th>
                        <th className="px-4 py-3 font-medium">Payment ID</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                                {entry.label.charAt(0)}
                              </span>
                              <span className="font-medium">{entry.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{truncateAddress(entry.address, 10, 8)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.paymentId ? truncateAddress(entry.paymentId, 6, 6) : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <CopyButton value={entry.address} label="Copy" />
                              <Button type="button" variant="outline" size="icon" aria-label={`Edit ${entry.label}`} onClick={() => toast.info("Mock edit.")}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button type="button" variant="destructive" size="icon" aria-label={`Delete ${entry.label}`} onClick={() => remove(entry.id)}>
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ab-label">Label</Label>
              <Input id="ab-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Exchange, friend, miner" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-address">Address</Label>
              <Input id="ab-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ccx7 …" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-paymentId">Payment ID</Label>
              <Input id="ab-paymentId" value={paymentId} onChange={(event) => setPaymentId(event.target.value)} placeholder="Optional" autoComplete="off" />
            </div>
            <Button type="button" className="w-full" onClick={submit} disabled={!label.trim() || !address.trim() || createEntry.isPending}>
              Save Address
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ViewToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {label}
    </button>
  )
}
