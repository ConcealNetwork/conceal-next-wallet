"use client"

import { Edit, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CopyButton, EmptyState, PageHeader, SectionCard } from "@/components/wallet/common"
import { useAddressBook, useCreateAddressEntry } from "@/lib/hooks"
import type { AddressEntry } from "@/lib/types"
import { truncateAddress } from "@/lib/utils"

export default function AddressBookPage() {
  const addressBook = useAddressBook()
  const createEntry = useCreateAddressEntry()
  const [entries, setEntries] = useState<AddressEntry[]>([])
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [address, setAddress] = useState("")
  const [paymentId, setPaymentId] = useState("")
  const visibleEntries = entries.length ? entries : addressBook.data ?? []

  function submit() {
    createEntry.mutate(
      { label, address, paymentId },
      {
        onSuccess: (entry) => {
          setEntries((current) => [...current, entry])
          toast.success("Mock address saved.")
          setOpen(false)
          setLabel("")
          setAddress("")
          setPaymentId("")
        },
      }
    )
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
        {visibleEntries.length === 0 ? (
          <EmptyState title="No addresses saved yet" description="Add your first CCX address to get started." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleEntries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-secondary p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-white">{entry.label}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{truncateAddress(entry.address, 14, 10)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <CopyButton value={entry.address} label="Copy" />
                    <Button type="button" variant="outline" size="icon" aria-label="Edit address"><Edit className="size-4" /></Button>
                    <Button type="button" variant="destructive" size="icon" aria-label="Delete address" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Exchange, friend, miner" />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ccx7 ..." />
            </div>
            <div className="space-y-2">
              <Label>Payment ID</Label>
              <Input value={paymentId} onChange={(event) => setPaymentId(event.target.value)} placeholder="Optional" />
            </div>
            <Button type="button" className="w-full" onClick={submit}>
              Save Address
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
