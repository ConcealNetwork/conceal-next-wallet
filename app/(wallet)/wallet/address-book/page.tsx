"use client"

import { Camera, LayoutGrid, Pencil, Plus, Search, Table2, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent } from "react"
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
  const [avatar, setAvatar] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edited, setEdited] = useState<Record<string, AddressEntry>>({})

  function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) {
      toast.error("Please choose an image under 2 MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatar(typeof reader.result === "string" ? reader.result : null)
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    function applyStoredView(next: View) {
      setView(next)
    }

    const stored = window.localStorage.getItem(VIEW_KEY)
    if (stored === "cards" || stored === "table") applyStoredView(stored)
  }, [])

  function chooseView(next: View) {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const entries = useMemo(() => {
    const base = [...(addressBook.data ?? []), ...added]
      .filter((entry) => !removed.has(entry.id))
      .map((entry) => edited[entry.id] ?? entry)
    const term = query.trim().toLowerCase()
    return term ? base.filter((entry) => `${entry.label} ${entry.address}`.toLowerCase().includes(term)) : base
  }, [addressBook.data, added, removed, edited, query])

  const total = (addressBook.data ?? []).length + added.length - removed.size

  function resetForm() {
    setLabel("")
    setAddress("")
    setPaymentId("")
    setAvatar(null)
    setEditingId(null)
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  function openEdit(entry: AddressEntry) {
    setEditingId(entry.id)
    setLabel(entry.label)
    setAddress(entry.address)
    setPaymentId(entry.paymentId ?? "")
    setAvatar(entry.avatar ?? null)
    setOpen(true)
  }

  function submit() {
    if (editingId) {
      const updated: AddressEntry = { id: editingId, label, address, paymentId: paymentId || undefined, avatar: avatar ?? undefined }
      setEdited((current) => ({ ...current, [editingId]: updated }))
      toast.success("Mock address updated.")
      setOpen(false)
      resetForm()
      return
    }
    createEntry.mutate(
      { label, address, paymentId, avatar: avatar ?? undefined },
      {
        onSuccess: (entry) => {
          setAdded((current) => [...current, entry])
          toast.success("Mock address saved.")
          setOpen(false)
          resetForm()
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
          <Button type="button" className="gap-2" onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Create New
          </Button>
        }
      />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard>
          {total === 0 ? (
            <EmptyState
              title="No addresses saved yet"
              description="Add your first CCX address to get started."
              illustration="/brand/empty/address-book.png"
            />
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors duration-200 hover:border-ring/50"
                    >
                      <div className="flex items-center gap-3">
                        <ContactAvatar entry={entry} className="size-12 shrink-0 rounded-xl text-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{entry.label}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
                            PID {entry.paymentId ? truncateAddress(entry.paymentId, 6, 6) : "—"}
                          </p>
                        </div>
                      </div>
                      <p className="truncate rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                        {truncateAddress(entry.address, 12, 10)}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <CopyButton value={entry.address} label="Copy" />
                        <div className="flex gap-1.5">
                          <Button type="button" variant="outline" size="icon" aria-label={`Edit ${entry.label}`} onClick={() => openEdit(entry)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button type="button" variant="destructive" size="icon" aria-label={`Delete ${entry.label}`} onClick={() => remove(entry.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
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
                              <ContactAvatar entry={entry} className="size-8 rounded-lg text-xs" />
                              <span className="font-medium">{entry.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{truncateAddress(entry.address, 10, 8)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.paymentId ? truncateAddress(entry.paymentId, 6, 6) : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <CopyButton value={entry.address} label="Copy" />
                              <Button type="button" variant="outline" size="icon" aria-label={`Edit ${entry.label}`} onClick={() => openEdit(entry)}>
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

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit address" : "Create new address"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Photo (optional)</Label>
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/15 text-primary">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="size-12 object-cover" />
                  ) : (
                    <Camera className="size-5" aria-hidden="true" />
                  )}
                </span>
                <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border px-3 text-sm transition-colors duration-200 hover:border-ring focus-within:ring-2 focus-within:ring-ring">
                  Upload photo
                  <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} />
                </label>
                {avatar && (
                  <button type="button" onClick={() => setAvatar(null)} className="cursor-pointer text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground">
                    Remove
                  </button>
                )}
              </div>
            </div>
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
            <Button type="button" className="w-full" onClick={submit} disabled={!label.trim() || !address.trim() || (!editingId && createEntry.isPending)}>
              {editingId ? "Save changes" : "Save Address"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ContactAvatar({ entry, className }: { entry: AddressEntry; className?: string }) {
  if (entry.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={entry.avatar} alt="" className={cn("shrink-0 object-cover", className)} />
    )
  }
  return (
    <span className={cn("grid shrink-0 place-items-center bg-primary/15 font-semibold text-primary", className)}>
      {entry.label.charAt(0)}
    </span>
  )
}

function ViewToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {label}
    </button>
  )
}
