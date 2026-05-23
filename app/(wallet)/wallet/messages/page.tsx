"use client"

import { MailOpen, Plus, Search, Send } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton, PageHeader } from "@/components/wallet/common"
import { useMessages, useSendMessage } from "@/lib/hooks"
import type { Message } from "@/lib/types"
import { cn, timeAgo, truncateAddress } from "@/lib/utils"

type Conversation = {
  address: string
  name: string
  messages: Message[]
  last: Message
  unread: number
}

export default function MessagesPage() {
  const messages = useMessages()
  const send = useSendMessage()
  const [query, setQuery] = useState("")
  const [activeAddress, setActiveAddress] = useState<string | null>(null)
  const [readThreads, setReadThreads] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState("")
  const [compose, setCompose] = useState(false)
  const [recipient, setRecipient] = useState("")
  const [composeBody, setComposeBody] = useState("")

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, Message[]>()
    for (const message of messages.data ?? []) {
      const list = map.get(message.counterpartyAddress) ?? []
      list.push(message)
      map.set(message.counterpartyAddress, list)
    }
    return Array.from(map.entries())
      .map(([address, list]) => {
        const sorted = [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const last = sorted[sorted.length - 1]
        const unread = readThreads.has(address) ? 0 : sorted.filter((m) => m.unread && m.direction === "received").length
        return { address, name: sorted[0].counterpartyName, messages: sorted, last, unread }
      })
      .sort((a, b) => new Date(b.last.timestamp).getTime() - new Date(a.last.timestamp).getTime())
  }, [messages.data, readThreads])

  const filtered = conversations.filter((c) => `${c.name} ${c.address}`.toLowerCase().includes(query.trim().toLowerCase()))
  const active = conversations.find((c) => c.address === activeAddress) ?? filtered[0] ?? null

  function openThread(address: string) {
    setActiveAddress(address)
    setReadThreads((prev) => new Set(prev).add(address))
    setDraft("")
  }

  function sendReply() {
    if (!active || !draft.trim()) return
    send.mutate(
      { recipientAddress: active.address, body: draft },
      { onSuccess: () => { toast.success("Mock message sent."); setDraft("") } }
    )
  }

  function sendCompose() {
    if (!recipient.trim() || !composeBody.trim()) {
      toast.error("Recipient and message are required.")
      return
    }
    send.mutate(
      { recipientAddress: recipient, body: composeBody },
      {
        onSuccess: () => {
          toast.success("Mock message sent.")
          setCompose(false)
          setRecipient("")
          setComposeBody("")
        },
      }
    )
  }

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Private wallet messages and sent memos"
        action={
          <Button type="button" className="gap-2" onClick={() => setCompose(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New Message
          </Button>
        }
      />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <div className="wallet-card grid h-[600px] grid-cols-1 overflow-hidden md:grid-cols-[0.85fr_1.15fr]">
          {/* Conversation list */}
          <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search conversations…"
                  className="pl-9"
                  aria-label="Search conversations"
                />
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">No conversations found.</li>
              ) : (
                filtered.map((conversation) => {
                  const isActive = active?.address === conversation.address
                  return (
                    <li key={conversation.address}>
                      <button
                        type="button"
                        onClick={() => openThread(conversation.address)}
                        className={cn(
                          "flex w-full items-start gap-3 border-l-2 border-transparent px-4 py-3 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          isActive && "bg-secondary",
                          conversation.unread > 0 && "border-l-primary"
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                          {conversation.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={cn("truncate text-sm", conversation.unread > 0 ? "font-semibold text-foreground" : "font-medium")}>
                              {conversation.name}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.last.timestamp)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className="truncate text-xs text-muted-foreground">
                              {conversation.last.direction === "sent" ? "You: " : ""}
                              {conversation.last.body}
                            </span>
                            {conversation.unread > 0 && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>

          {/* Thread */}
          {active ? (
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {active.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{active.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{truncateAddress(active.address, 12, 8)}</p>
                </div>
                <div className="ml-auto">
                  <CopyButton value={active.address} label="Copy" />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {active.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      message.direction === "sent"
                        ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-secondary text-foreground"
                    )}
                  >
                    <p>{message.body}</p>
                    <p className={cn("mt-1 text-[10px]", message.direction === "sent" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {timeAgo(message.timestamp)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-end gap-2 border-t border-border p-3">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${active.name}…`}
                  rows={1}
                  className="max-h-28 min-h-10 resize-none"
                  aria-label={`Reply to ${active.name}`}
                />
                <Button
                  type="button"
                  onClick={sendReply}
                  disabled={!draft.trim() || send.isPending}
                  className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  <Send className="size-4" aria-hidden="true" />
                  Send
                </Button>
              </div>
            </div>
          ) : (
            <div className="hidden flex-col items-center justify-center gap-3 p-8 text-center md:flex">
              <MailOpen className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">No conversations yet</p>
              <p className="text-sm text-muted-foreground">Start one with &ldquo;New Message&rdquo;.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={compose} onOpenChange={setCompose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>Send a private mock message to a CCX address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient address</Label>
              <Input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="ccx7 …" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compose-body">Message</Label>
              <Textarea id="compose-body" value={composeBody} onChange={(event) => setComposeBody(event.target.value)} placeholder="Write your message…" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompose(false)}>Cancel</Button>
            <Button type="button" onClick={sendCompose} disabled={send.isPending}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
