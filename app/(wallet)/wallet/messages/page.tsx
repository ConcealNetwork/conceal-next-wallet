"use client"

import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, FilterTabs, PageHeader, SectionCard } from "@/components/wallet/common"
import { useMessages, useSendMessage } from "@/lib/hooks"
import type { Message } from "@/lib/types"
import { cn, timeAgo, truncateAddress } from "@/lib/utils"

const tabs = ["All", "Received", "Sent"]

export default function MessagesPage() {
  const { data = [] } = useMessages()
  const sendMessage = useSendMessage()
  const [selected, setSelected] = useState<Message | null>(null)
  const [active, setActive] = useState("All")
  const [search, setSearch] = useState("")
  const [compose, setCompose] = useState(false)
  const [recipient, setRecipient] = useState("")
  const [body, setBody] = useState("")

  const filtered = useMemo(
    () =>
      data.filter((message) => {
        const matchesTab =
          active === "All" ||
          (active === "Received" && message.direction === "received") ||
          (active === "Sent" && message.direction === "sent")
        const target = `${message.counterpartyName} ${message.counterpartyAddress} ${message.body}`.toLowerCase()
        return matchesTab && target.includes(search.toLowerCase())
      }),
    [active, data, search]
  )

  function submitMessage() {
    sendMessage.mutate(
      { recipientAddress: recipient, body },
      {
        onSuccess: () => {
          toast.success("Mock message sent.")
          setCompose(false)
          setRecipient("")
          setBody("")
        },
      }
    )
  }

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Your message history"
        action={
          <Button type="button" className="gap-2 bg-wallet-amber text-black" onClick={() => setCompose(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New Message
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages..." className="max-w-md" />
        <select className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300">
          <option>Show: 10 per page</option>
        </select>
      </div>
      <FilterTabs tabs={tabs} active={active} onChange={setActive} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard>
          <div className="space-y-2">
            {filtered.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => setSelected(message)}
                className={cn(
                  "w-full rounded-xl border border-zinc-800 p-4 text-left transition hover:border-wallet-amber",
                  message.unread && "border-l-4 border-l-wallet-amber bg-wallet-amber/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-zinc-800 font-semibold text-wallet-amber">
                    {message.counterpartyName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{message.counterpartyName}</p>
                      <span className="text-xs text-zinc-500">{timeAgo(message.timestamp)}</span>
                    </div>
                    <p className="truncate text-xs text-zinc-500">{truncateAddress(message.counterpartyAddress)}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{message.body}</p>
                  </div>
                  {message.unread && <span className="rounded-full bg-wallet-amber px-2 py-1 text-xs font-semibold text-black">New</span>}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
        <SectionCard>
          {!selected ? (
            <EmptyState title="No message selected" description="Select a message from the list to read the full conversation." />
          ) : (
            <article>
              <p className="text-sm text-zinc-500">{selected.direction === "received" ? "From" : "To"}</p>
              <h2 className="mt-2 text-2xl font-bold">{selected.counterpartyName}</h2>
              <p className="mt-1 break-all text-sm text-zinc-500">{selected.counterpartyAddress}</p>
              <p className="mt-6 rounded-xl bg-zinc-950 p-5 leading-7 text-zinc-200">{selected.body}</p>
            </article>
          )}
        </SectionCard>
      </div>
      <Dialog open={compose} onOpenChange={setCompose}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient</Label>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="ccx7 ..." />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a mock message" />
            </div>
            <Button type="button" className="w-full bg-wallet-amber text-black" onClick={submitMessage}>
              Send Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
