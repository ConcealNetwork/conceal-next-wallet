"use client";

import { MailOpen, Plus, Search, Send } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton, PageHeader } from "@/components/wallet/common";
import { useMessages, useSendMessage } from "@/lib/hooks";
import type { Message } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { MAX_MESSAGE_SIZE, MAX_TTL_MINUTES } from "@/lib/config/config";
import { cn, timeAgo, truncateAddress } from "@/lib/utils";

const TTL_STEP = 5;

type Conversation = {
  address: string;
  name: string;
  messages: Message[];
  last: Message;
  unread: number;
};

export default function MessagesPage() {
  const messages = useMessages();
  const send = useSendMessage();
  const [query, setQuery] = useState("");
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [readThreads, setReadThreads] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [compose, setCompose] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState<number | null>(null);
  const [formatMode, setFormatMode] = useState<"raw" | "md">("raw");
  const [threadViewMd, setThreadViewMd] = useState(false);
  const ttlNoticeShownRef = useRef(false);

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, Message[]>();
    for (const message of messages.data ?? []) {
      const list = map.get(message.counterpartyAddress) ?? [];
      list.push(message);
      map.set(message.counterpartyAddress, list);
    }
    return Array.from(map.entries())
      .map(([address, list]) => {
        const sorted = [...list].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const last = sorted[sorted.length - 1];
        const unread = readThreads.has(address)
          ? 0
          : sorted.filter((m) => m.unread && m.direction === "received").length;
        return { address, name: sorted[0].counterpartyName, messages: sorted, last, unread };
      })
      .sort((a, b) => new Date(b.last.timestamp).getTime() - new Date(a.last.timestamp).getTime());
  }, [messages.data, readThreads]);

  const filtered = conversations.filter((c) =>
    `${c.name} ${c.address}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const active = conversations.find((c) => c.address === activeAddress) ?? filtered[0] ?? null;
  const showMdPreview = formatMode === "md" && shouldShowMessagePreview(composeBody);

  function resetComposeForm() {
    setRecipient("");
    setComposeBody("");
    setTtlMinutes(null);
    setFormatMode("raw");
    ttlNoticeShownRef.current = false;
  }

  function handleComposeOpenChange(open: boolean) {
    setCompose(open);
    if (!open) resetComposeForm();
  }

  function handleTtlChange(minutes: number) {
    if (minutes <= 0) {
      setTtlMinutes(null);
      return;
    }
    if (!ttlNoticeShownRef.current) {
      toast.info(walletCopy.messageTtlDisclaimer, { id: "message-ttl-info" });
      ttlNoticeShownRef.current = true;
    }
    setTtlMinutes(minutes);
  }

  function openThread(address: string) {
    setActiveAddress(address);
    setReadThreads((prev) => new Set(prev).add(address));
    setDraft("");
    setThreadViewMd(false);
  }

  function messageSendError(error: unknown) {
    toast.error(error instanceof Error ? error.message : "Failed to send message.");
  }

  function sendReply() {
    if (!active || !draft.trim()) return;
    send.mutate(
      { recipientAddress: active.address, body: draft },
      {
        onSuccess: () => {
          toast.success(walletCopy.messageSendSuccess);
          setDraft("");
        },
        onError: messageSendError,
      },
    );
  }

  function sendCompose() {
    if (!recipient.trim() || !composeBody.trim()) {
      toast.error("Recipient and message are required.");
      return;
    }
    if (composeBody.length > MAX_MESSAGE_SIZE) {
      toast.error(walletCopy.messageTooLong);
      return;
    }
    send.mutate(
      {
        recipientAddress: recipient,
        body: composeBody,
        ttlMinutes,
        ttlUnix: messageTtlMinutesToUnix(ttlMinutes),
      },
      {
        onSuccess: () => {
          toast.success(walletCopy.messageSendSuccess);
          setCompose(false);
          resetComposeForm();
        },
        onError: messageSendError,
      },
    );
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
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
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
                <li className="p-6 text-center text-sm text-muted-foreground">
                  No conversations found.
                </li>
              ) : (
                filtered.map((conversation) => {
                  const isActive = active?.address === conversation.address;
                  return (
                    <li key={conversation.address}>
                      <button
                        type="button"
                        onClick={() => openThread(conversation.address)}
                        className={cn(
                          "flex w-full items-start gap-3 border-l-2 border-transparent px-4 py-3 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          isActive && "bg-secondary",
                          conversation.unread > 0 && "border-l-primary",
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                          {conversation.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "flex min-w-0 flex-wrap items-baseline gap-x-1 truncate text-sm",
                                conversation.unread > 0
                                  ? "font-semibold text-foreground"
                                  : "font-medium",
                              )}
                            >
                              <span className="truncate">{conversation.name}</span>
                              {conversation.last.ttlExpiresAt ? (
                                <MessageTtlExpiryLabel expiresAt={conversation.last.ttlExpiresAt} />
                              ) : null}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {timeAgo(conversation.last.timestamp)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className="truncate text-xs text-muted-foreground">
                              {conversation.last.direction === "sent" ? "You: " : ""}
                              {conversation.last.body}
                            </span>
                            {conversation.unread > 0 && (
                              <span
                                className="size-2 shrink-0 rounded-full bg-primary"
                                aria-label="unread"
                              />
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
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
                  <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm font-semibold">
                    <span className="truncate">{active.name}</span>
                    {(() => {
                      const ttlMsg = [...active.messages].reverse().find((m) => m.ttlExpiresAt);
                      return ttlMsg?.ttlExpiresAt ? (
                        <MessageTtlExpiryLabel expiresAt={ttlMsg.ttlExpiresAt} />
                      ) : null;
                    })()}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {truncateAddress(active.address, 12, 8)}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 min-w-7 px-2 text-xs font-semibold tracking-wide",
                      threadViewMd
                        ? "border-wallet-amber bg-wallet-amber/15 text-wallet-amber hover:bg-wallet-amber/20"
                        : "border-border bg-transparent text-muted-foreground hover:bg-secondary/80",
                    )}
                    aria-pressed={threadViewMd}
                    aria-label={threadViewMd ? "Show plain text" : "Show formatted messages"}
                    onClick={() => setThreadViewMd((on) => !on)}
                  >
                    MD
                  </Button>
                  <CopyButton value={active.address} label="Copy" />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {active.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("max-w-[75%]", message.direction === "sent" && "ml-auto")}
                  >
                    {message.direction === "received" && message.ttlExpiresAt ? (
                      <p className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-xs">
                        <span className="font-medium text-foreground">
                          {message.counterpartyName}
                        </span>
                        <MessageTtlExpiryLabel expiresAt={message.ttlExpiresAt} />
                      </p>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        message.direction === "sent"
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md bg-secondary text-foreground",
                      )}
                    >
                      {threadViewMd ? (
                        <div
                          className="[&_i]:italic"
                          dangerouslySetInnerHTML={{
                            __html: formatMessageText(
                              message.body,
                              message.direction === "sent" ? "sent" : "received",
                            ),
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      )}
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          message.direction === "sent"
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {timeAgo(message.timestamp)}
                      </p>
                    </div>
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
              <p className="text-sm text-muted-foreground">
                Start one with &ldquo;New Message&rdquo;.
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={compose} onOpenChange={handleComposeOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>Send a private mock message to a CCX address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient address</Label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="ccx7 …"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="compose-body">Message</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={formatMode === "raw" ? "default" : "outline"}
                    onClick={() => setFormatMode("raw")}
                  >
                    RAW
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={formatMode === "md" ? "default" : "outline"}
                    onClick={() => setFormatMode("md")}
                  >
                    MD
                  </Button>
                </div>
              </div>
              <Textarea
                id="compose-body"
                value={composeBody}
                onChange={(event) => setComposeBody(event.target.value)}
                placeholder="Write your message…"
                maxLength={MAX_MESSAGE_SIZE}
              />
              {composeBody.length > MAX_MESSAGE_SIZE ? (
                <p className="text-sm text-destructive">{walletCopy.messageTooLong}</p>
              ) : null}
              {showMdPreview ? (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Preview</span>
                  <div
                    className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatMessageText(composeBody) }}
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="compose-ttl">
                Time To Live (TTL): {formatTtlMinutes(ttlMinutes ?? 0)}
              </Label>
              <input
                id="compose-ttl"
                type="range"
                min={0}
                max={MAX_TTL_MINUTES}
                step={TTL_STEP}
                value={ttlMinutes ?? 0}
                onChange={(event) => handleTtlChange(Number(event.target.value))}
                className="w-full accent-primary"
                aria-valuemin={0}
                aria-valuemax={MAX_TTL_MINUTES}
                aria-valuenow={ttlMinutes ?? 0}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>00:00 (no TTL)</span>
                <span>{formatTtlMinutes(MAX_TTL_MINUTES)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleComposeOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={sendCompose}
              disabled={send.isPending || composeBody.length > MAX_MESSAGE_SIZE}
            >
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function shouldShowMessagePreview(text: string): boolean {
  return text.includes("  ") || text.includes("*") || text.includes("`");
}

/** v1 messages.ts formatTTL — slider stores minutes, label shows HH:MM. */
function formatTtlMinutes(minutes: number): string {
  if (minutes === 0) return "00:00 (no TTL)";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/** v1 Cn.js: minutes → unix seconds for on-chain TTL (Cn encodes ttl as-is). */
function messageTtlMinutesToUnix(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 0;
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

/** Pending mempool TTL expiry as local date + time (v1 ttl is unix seconds). */
function formatTtlExpiresAt(unixSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

function MessageTtlExpiryLabel({ expiresAt }: { expiresAt: number }) {
  return (
    <span className="shrink-0 font-medium text-wallet-amber">
      expires at {formatTtlExpiresAt(expiresAt)}
    </span>
  );
}

type MessageFormatTheme = "compose" | "received" | "sent";

/** Ported from conceal-web-wallet messages.ts (send / history / inbox themes). */
function formatMessageText(text: string, theme: MessageFormatTheme = "compose"): string {
  if (!text) return "";

  const codeColors =
    theme === "sent"
      ? {
          bg: "rgba(0,0,0,0.28)",
          textCode: "#fafafa",
          textBold: "#fafafa",
          border: "rgba(255,255,255,0.35)",
        }
      : theme === "received"
        ? {
            bg: "#2d3748",
            textCode: "#fafafa",
            textBold: "#fafafa",
            border: "#D9DCE7",
          }
        : {
            bg: "#424242",
            textCode: "#fafafa",
            textBold: "#2d3748",
            border: "#000",
          };

  let formatted = text.replace(
    /\*\*([^*\s][^*]*[^*\s])\*\*/g,
    `<span style="font-weight: bold; color: ${codeColors.textBold}; text-shadow: 0px 0px 1px ${codeColors.textBold}">$1</span>`,
  );
  formatted = formatted.replace(/\*([^*\s][^*]*[^*\s])\*/g, "<i>$1</i>");
  formatted = formatted.replace(
    /`([^`]+)`/g,
    `<span style="background-color: ${codeColors.bg}; color: ${codeColors.textCode}; padding: 1px 3px; border-radius: 3px; border: 1px solid ${codeColors.border}; font-family: monospace; font-size: 0.9em;">$1</span>`,
  );
  formatted = formatted.replace(/\*\s/g, "&nbsp;&nbsp•&nbsp");
  formatted = formatted.replace(/ {2}/g, "<br>");

  return formatted;
}
