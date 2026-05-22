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
          <Button type="button" className="gap-2" onClick={() => setCompose(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New Message
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages..." className="max-w-md" />
        <select className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring md:w-auto">
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
                  "w-full cursor-pointer rounded-xl border border-border p-4 text-left transition-colors duration-200 hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  message.unread && "border-l-4 border-l-wallet-amber bg-wallet-amber/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-primary">
                    {message.counterpartyName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{message.counterpartyName}</p>
                      <span className="text-xs text-muted-foreground">{timeAgo(message.timestamp)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{truncateAddress(message.counterpartyAddress)}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{message.body}</p>
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
              <p className="text-sm text-muted-foreground">{selected.direction === "received" ? "From" : "To"}</p>
              <h2 className="mt-2 text-2xl font-bold">{selected.counterpartyName}</h2>
              <p className="mt-1 break-all text-sm text-muted-foreground">{selected.counterpartyAddress}</p>
              <p className="mt-6 rounded-xl bg-secondary p-5 leading-7 text-foreground">{selected.body}</p>
            </article>
          )}
        </SectionCard>
      </div>
      <Dialog open={compose} onOpenChange={setCompose}>
        <DialogContent>
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
            <Button type="button" className="w-full" onClick={submitMessage}>
              Send Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
