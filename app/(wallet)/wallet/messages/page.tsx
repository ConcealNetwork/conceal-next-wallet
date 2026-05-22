"use client"

import { MailOpen, Plus, Search, Send } from "lucide-react"
import type { KeyboardEvent } from "react"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton, EmptyState, FilterTabs, PageHeader, SectionCard } from "@/components/wallet/common"
import { useMessages, useSendMessage } from "@/lib/hooks"
import type { Message } from "@/lib/types"
import { cn, timeAgo, truncateAddress } from "@/lib/utils"

const tabs = ["All", "Received", "Sent"] as const
type MessageTab = (typeof tabs)[number]

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
})

type ComposeErrors = {
  recipient?: string
  body?: string
}

export default function MessagesPage() {
  const { data = [] } = useMessages()
  const sendMessage = useSendMessage()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [active, setActive] = useState<MessageTab>("All")
  const [search, setSearch] = useState("")
  const [compose, setCompose] = useState(false)
  const [recipient, setRecipient] = useState("")
  const [body, setBody] = useState("")
  const [replyBody, setReplyBody] = useState("")
  const [composeErrors, setComposeErrors] = useState<ComposeErrors>({})
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(() => new Set())
  const [sentMessages, setSentMessages] = useState<Message[]>([])
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])

  const messages = useMemo(
    () => [
      ...sentMessages,
      ...data.map((message) => (readMessageIds.has(message.id) ? { ...message, unread: false } : message)),
    ],
    [data, readMessageIds, sentMessages]
  )

  const unreadReceivedCount = useMemo(
    () => messages.filter((message) => message.direction === "received" && message.unread).length,
    [messages]
  )

  const filtered = useMemo(
    () =>
      messages.filter((message) => {
        const matchesTab =
          active === "All" ||
          (active === "Received" && message.direction === "received") ||
          (active === "Sent" && message.direction === "sent")
        const target = `${message.counterpartyName} ${message.counterpartyAddress} ${message.body}`.toLowerCase()
        return matchesTab && target.includes(search.toLowerCase())
      }),
    [active, messages, search]
  )

  const selected = useMemo(
    () => messages.find((message) => message.id === selectedId) ?? null,
    [messages, selectedId]
  )

  function selectMessage(message: Message) {
    setSelectedId(message.id)
    setReplyBody("")
    if (message.unread) {
      setReadMessageIds((current) => {
        const next = new Set(current)
        next.add(message.id)
        return next
      })
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const direction = event.key === "ArrowDown" ? 1 : -1
    const nextIndex = (index + direction + filtered.length) % filtered.length
    rowRefs.current[nextIndex]?.focus()
  }

  function validateCompose() {
    const errors: ComposeErrors = {}

    if (!recipient.trim().toLowerCase().startsWith("ccx") || recipient.trim().length < 16) {
      errors.recipient = "Enter a valid CCX address."
    }

    if (!body.trim()) {
      errors.body = "Write a message before sending."
    }

    setComposeErrors(errors)
    return Object.keys(errors).length === 0
  }

  function submitMessage() {
    if (!validateCompose()) return

    sendMessage.mutate(
      { recipientAddress: recipient.trim(), body: body.trim() },
      {
        onSuccess: (message) => {
          setSentMessages((current) => [message, ...current])
          setSelectedId(message.id)
          toast.success("Mock message sent.")
          setCompose(false)
          setRecipient("")
          setBody("")
          setComposeErrors({})
        },
      }
    )
  }

  function submitReply() {
    if (!selected || !replyBody.trim()) {
      toast.error("Write a reply before sending.")
      return
    }

    sendMessage.mutate(
      { recipientAddress: selected.counterpartyAddress, body: replyBody.trim() },
      {
        onSuccess: () => {
          toast.success("Mock reply sent.")
          setReplyBody("")
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search messages..."
              className="pl-9"
              aria-label="Search messages"
            />
          </div>
          <FilterTabs
            tabs={[...tabs]}
            active={active}
            onChange={(tab) => setActive(tab as MessageTab)}
            badges={unreadReceivedCount > 0 ? { Received: unreadReceivedCount } : undefined}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:80ms]">
          <SectionCard
            title="Inbox"
            description={`${filtered.length} ${filtered.length === 1 ? "message" : "messages"} in view`}
            className="overflow-hidden"
          >
            {filtered.length > 0 ? (
              <div className="-mx-2 space-y-1" aria-label="Messages">
                {filtered.map((message, index) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    selected={message.id === selectedId}
                    index={index}
                    refCallback={(element) => {
                      rowRefs.current[index] = element
                    }}
                    onSelect={() => selectMessage(message)}
                    onKeyDown={(event) => handleRowKeyDown(event, index)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No messages match"
                description="Adjust the active filter or search query to find another wallet message."
              />
            )}
          </SectionCard>
        </div>

        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:150ms]">
          <SectionCard className="min-h-[560px]">
            {selected ? (
              <ReadingPane
                message={selected}
                replyBody={replyBody}
                sending={sendMessage.isPending}
                onReplyBodyChange={setReplyBody}
                onReply={submitReply}
              />
            ) : (
              <MessageEmptyState />
            )}
          </SectionCard>
        </div>
      </div>

      <Dialog
        open={compose}
        onOpenChange={(open) => {
          setCompose(open)
          if (!open) setComposeErrors({})
        }}
      >
        <DialogContent aria-describedby="new-message-description">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription id="new-message-description">
              Send a mock wallet message to a CCX address.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              submitMessage()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient CCX address</Label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value)
                  setComposeErrors((current) => ({ ...current, recipient: undefined }))
                }}
                placeholder="ccx7..."
                aria-invalid={Boolean(composeErrors.recipient)}
                aria-describedby={composeErrors.recipient ? "recipient-error" : undefined}
              />
              {composeErrors.recipient ? (
                <p id="recipient-error" className="text-sm text-destructive">
                  {composeErrors.recipient}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="compose-message">Message</Label>
              <Textarea
                id="compose-message"
                value={body}
                onChange={(event) => {
                  setBody(event.target.value)
                  setComposeErrors((current) => ({ ...current, body: undefined }))
                }}
                placeholder="Write your message"
                className="min-h-[136px]"
                aria-invalid={Boolean(composeErrors.body)}
                aria-describedby={composeErrors.body ? "compose-message-error" : undefined}
              />
              {composeErrors.body ? (
                <p id="compose-message-error" className="text-sm text-destructive">
                  {composeErrors.body}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="submit" className="gap-2" disabled={sendMessage.isPending}>
                <Send className="size-4" aria-hidden="true" />
                {sendMessage.isPending ? "Sending..." : "Send Message"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MessageRow({
  message,
  selected,
  index,
  refCallback,
  onSelect,
  onKeyDown,
}: {
  message: Message
  selected: boolean
  index: number
  refCallback: (element: HTMLButtonElement | null) => void
  onSelect: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      ref={refCallback}
      type="button"
      aria-current={selected ? "true" : undefined}
      aria-label={`${message.unread ? "Unread " : ""}${message.direction === "received" ? "Message from" : "Message to"} ${
        message.counterpartyName
      }, ${timeAgo(message.timestamp)}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "animate-rise-in group grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-xl border border-transparent border-l-4 border-l-transparent px-3 py-3 text-left transition-colors duration-200 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100",
        message.unread && "border-l-primary bg-primary/5",
        selected && "border-primary/60 bg-secondary"
      )}
      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
    >
      <MessageAvatar message={message} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-sm text-white", message.unread ? "font-bold" : "font-semibold")}>
            {message.counterpartyName}
          </span>
          {message.unread ? <span className="size-2 rounded-full bg-primary" aria-hidden="true" /> : null}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {truncateAddress(message.counterpartyAddress)}
        </span>
        <span className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{message.body}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-xs text-muted-foreground">{timeAgo(message.timestamp)}</span>
        <Badge variant={message.direction === "received" ? "default" : "secondary"} className="capitalize">
          {message.direction}
        </Badge>
      </span>
    </button>
  )
}

function ReadingPane({
  message,
  replyBody,
  sending,
  onReplyBodyChange,
  onReply,
}: {
  message: Message
  replyBody: string
  sending: boolean
  onReplyBodyChange: (value: string) => void
  onReply: () => void
}) {
  return (
    <article className="flex min-h-[512px] flex-1 flex-col">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <MessageAvatar message={message} size="lg" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{message.direction === "received" ? "From" : "To"}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{message.counterpartyName}</h2>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="break-all font-mono text-sm text-muted-foreground">{message.counterpartyAddress}</p>
              <CopyButton value={message.counterpartyAddress} label="Copy address" />
            </div>
          </div>
        </div>
        <time dateTime={message.timestamp} className="shrink-0 text-sm text-muted-foreground">
          {formatTimestamp(message.timestamp)}
        </time>
      </header>

      <div className="my-6 rounded-xl border border-border bg-secondary/60 p-5 text-base leading-7 text-foreground">
        {message.body}
      </div>

      <div className="mt-auto space-y-3 border-t border-border pt-5">
        <Label htmlFor="reply-message">Reply</Label>
        <Textarea
          id="reply-message"
          value={replyBody}
          onChange={(event) => onReplyBodyChange(event.target.value)}
          placeholder={`Reply to ${message.counterpartyName}`}
          className="min-h-[124px]"
        />
        <div className="flex justify-end">
          <Button type="button" className="gap-2" onClick={onReply} disabled={sending}>
            <Send className="size-4" aria-hidden="true" />
            {sending ? "Sending..." : "Send Reply"}
          </Button>
        </div>
      </div>
    </article>
  )
}

function MessageAvatar({ message, size = "md" }: { message: Message; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border font-semibold",
        size === "lg" ? "size-12 text-base" : "size-10 text-sm",
        message.direction === "received"
          ? "border-primary/30 bg-primary/15 text-primary"
          : "border-border bg-secondary text-foreground"
      )}
      aria-hidden="true"
    >
      {message.counterpartyName.slice(0, 1).toUpperCase()}
    </span>
  )
}

function MessageEmptyState() {
  return (
    <div className="flex min-h-[512px] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/60 p-8 text-center">
      <div className="grid size-14 place-items-center rounded-xl border border-border bg-card text-primary">
        <MailOpen className="size-6" aria-hidden="true" />
      </div>
      <p className="mt-4 text-lg font-semibold text-white">No message selected</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        Choose a message from the inbox to read the full body, copy the address, or send a reply.
      </p>
    </div>
  )
}

function formatTimestamp(timestamp: string) {
  return timestampFormatter.format(new Date(timestamp))
}
