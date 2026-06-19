"use client";

import { Cog, Heart, MailOpen, Plus, RefreshCw, Search, Send } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddressQrScanButton } from "@/components/qr/address-qr-scan-button";
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
import {
  AddressBookContactPicker,
  findAddressBookContactByAddress,
} from "@/components/wallet/address-book-contact-picker";
import { CopyButton, PageHeader, ViewOnlyBadge } from "@/components/wallet/common";
import { ContactAvatar } from "@/components/wallet/contact-avatar";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ViewOnlyBanner } from "@/components/wallet/view-only-banner";
import { MAX_MESSAGE_SIZE, MAX_TTL_MINUTES } from "@/lib/config/config";
import {
  useAddressBook,
  useMarkMessageRead,
  useMessages,
  useSendMessage,
  useWalletInfo,
  useWalletSyncStatus,
  useWalletViewOnly,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  buildConversationFromMessage,
  buildMessageListContactEntry,
  canReplyToConversation,
  type MessageConversation,
  sortMessagesNewestFirst,
} from "@/lib/messages/conversations";
import { isKnownSmartMessage } from "@/lib/messages/smart-message";
import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import type { AddressEntry, Message } from "@/lib/types";
import { parseCheckIn } from "@/lib/ui/check-in-message";
import type { ScannedSendDraft } from "@/lib/ui/parse-scanned-send-payload";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn, truncateAddress } from "@/lib/utils";
import {
  addressIsValid,
  generatePaymentId,
  isSendToSelf,
  paymentIdIsValid,
} from "@/lib/validation/ccx";

const TTL_STEP = 5;

type PendingOutgoing = {
  threadKey: string;
  txHash?: string;
};

export default function MessagesPage() {
  const { t } = useI18n();
  const messages = useMessages();
  const addressBook = useAddressBook();
  const send = useSendMessage();
  const markRead = useMarkMessageRead();
  const wallet = useWalletInfo();
  const { isSyncing } = useWalletSyncStatus();
  const viewOnly = useWalletViewOnly();
  const [query, setQuery] = useState("");
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [readThreads, setReadThreads] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [compose, setCompose] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [composePaymentId, setComposePaymentId] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState<number | null>(null);
  const [composeViewMd, setComposeViewMd] = useState(false);
  const [threadViewMd, setThreadViewMd] = useState(false);
  const [pendingOutgoing, setPendingOutgoing] = useState<PendingOutgoing | null>(null);
  const ttlNoticeShownRef = useRef(false);

  const composeToSelf = isSendToSelf(recipient, wallet.data?.address ?? "");

  const allMessages = useMemo(() => sortMessagesNewestFirst(messages.data ?? []), [messages.data]);

  const filteredMessages = allMessages.filter((message) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    const preview = message.hasBody ? message.body : "sent message";
    return `${message.counterpartyName} ${message.counterpartyAddress} ${message.paymentIdFrom ?? ""} ${message.paymentIdTo ?? ""} ${preview}`
      .toLowerCase()
      .includes(term);
  });

  const selectedMessage =
    allMessages.find((message) => message.id === activeMessageId) ?? filteredMessages[0] ?? null;

  const active = useMemo(
    () =>
      selectedMessage
        ? buildConversationFromMessage(
            selectedMessage,
            allMessages,
            addressBook.data ?? [],
            readThreads,
          )
        : null,
    [selectedMessage, allMessages, addressBook.data, readThreads],
  );

  const showMdPreview = composeViewMd && shouldShowMessagePreview(composeBody);
  // The engine caps messages by UTF-8 BYTES (MAX_MESSAGE_SIZE), not characters,
  // so count bytes here too — otherwise a multi-byte (emoji/accent) message could
  // pass the UI but be rejected on send.
  const composeByteLength = new TextEncoder().encode(composeBody).length;
  const replyEnabled = active ? canReplyToConversation(active) : false;

  useEffect(() => {
    if (!pendingOutgoing?.txHash) return;
    const arrived = (messages.data ?? []).some((message) => message.id === pendingOutgoing.txHash);
    if (arrived) setPendingOutgoing(null);
  }, [messages.data, pendingOutgoing?.txHash]);

  const showPendingBubble =
    pendingOutgoing !== null &&
    active?.threadKey === pendingOutgoing.threadKey &&
    !(pendingOutgoing.txHash && (messages.data ?? []).some((m) => m.id === pendingOutgoing.txHash));

  function resetComposeForm() {
    setRecipient("");
    setSelectedContactId(null);
    setComposePaymentId("");
    setComposeBody("");
    setTtlMinutes(null);
    setComposeViewMd(false);
    ttlNoticeShownRef.current = false;
  }

  function pickComposeContact(entry: AddressEntry | null) {
    setSelectedContactId(entry?.id ?? null);
    setRecipient(entry?.address ?? "");
  }

  function handleRecipientChange(value: string) {
    setRecipient(value);
    const match = findAddressBookContactByAddress(addressBook.data ?? [], value);
    setSelectedContactId(match?.id ?? null);
  }

  function applyScannedDraft(draft: ScannedSendDraft) {
    handleRecipientChange(draft.address);
    if (draft.paymentId) {
      setComposePaymentId(draft.paymentId);
    }
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

  function openMessage(message: Message) {
    setActiveMessageId(message.id);
    setReadThreads((prev) => new Set(prev).add(message.threadKey));
    setDraft("");
    setThreadViewMd(false);
    if (message.direction === "received" && message.unread) {
      markRead.mutate(message.id);
    }
  }

  function messageSendError(error: unknown) {
    toast.error(error instanceof Error ? error.message : t("messages.errSendFailed"));
  }

  function sendReply() {
    if (!active || !draft.trim()) return;
    if (viewOnly) {
      toast.error(walletCopy.viewOnlyMessageDisabled);
      return;
    }
    if (!canReplyToConversation(active)) {
      toast.error(t("messages.errReplyNeedsContact"));
      return;
    }
    const body = draft.trim();
    setPendingOutgoing({ threadKey: active.threadKey });
    send.mutate(
      {
        recipientAddress: active.address,
        body,
        paymentId: active.paymentId ?? undefined,
      },
      {
        onSuccess: (sent) => {
          toast.success(walletCopy.messageSendSuccess);
          setDraft("");
          setPendingOutgoing({ threadKey: sent.threadKey, txHash: sent.id });
        },
        onError: (error) => {
          setPendingOutgoing(null);
          messageSendError(error);
        },
      },
    );
  }

  function sendCompose() {
    if (viewOnly) {
      toast.error(walletCopy.viewOnlyMessageDisabled);
      return;
    }
    if (!recipient.trim() || !composeBody.trim()) {
      toast.error(t("messages.errRecipientAndMessageRequired"));
      return;
    }
    if (!addressIsValid(recipient.trim())) {
      toast.error(t("messages.errInvalidRecipient"));
      return;
    }
    if (!paymentIdIsValid(composePaymentId)) {
      toast.error(t("messages.errPaymentIdInvalid"));
      return;
    }
    if (composeByteLength > MAX_MESSAGE_SIZE) {
      toast.error(walletCopy.messageTooLong);
      return;
    }
    const paymentId = composePaymentId.trim() || undefined;
    const threadKey = buildMessageThreadKey(recipient.trim(), paymentId);
    setPendingOutgoing({ threadKey });
    send.mutate(
      {
        recipientAddress: recipient.trim(),
        body: composeBody,
        paymentId,
        ttlMinutes,
        ttlUnix: messageTtlMinutesToUnix(ttlMinutes),
      },
      {
        onSuccess: (sent) => {
          toast.success(walletCopy.messageSendSuccess);
          setCompose(false);
          resetComposeForm();
          setPendingOutgoing({ threadKey: sent.threadKey, txHash: sent.id });
          openMessage(sent);
        },
        onError: (error) => {
          setPendingOutgoing(null);
          messageSendError(error);
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title={t("nav.messages")}
        subtitle={t("messages.subtitle")}
        badge={viewOnly ? <ViewOnlyBadge /> : null}
        action={
          <Button
            type="button"
            className="gap-2"
            onClick={() => setCompose(true)}
            disabled={isSyncing || viewOnly}
            title={viewOnly ? walletCopy.viewOnlyMessageDisabled : undefined}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("messages.newMessage")}
          </Button>
        }
      />

      <WalletSyncingBanner />
      <ViewOnlyBanner />

      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <div className="wallet-card messages-inbox-height grid grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {/* Message list (all sent + received) */}
          <div className="flex min-h-0 min-w-0 flex-col border-b border-border md:border-b-0 md:border-r">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("messages.searchPlaceholder")}
                  className="pl-9"
                  aria-label={t("messages.searchAria")}
                />
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {filteredMessages.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {t("messages.empty")}
                </li>
              ) : (
                filteredMessages.map((message) => (
                  <MessageListItem
                    key={message.id}
                    message={message}
                    addressBook={addressBook.data ?? []}
                    isActive={selectedMessage?.id === message.id}
                    onSelect={() => openMessage(message)}
                  />
                ))
              )}
            </ul>
          </div>

          {/* Thread */}
          {active ? (
            <div className="flex min-h-0 min-w-0 flex-col">
              <ThreadHeader
                conversation={active}
                threadViewMd={threadViewMd}
                onToggleMd={() => setThreadViewMd((on) => !on)}
              />

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {active.messages.map((message) => (
                  <ThreadBubble key={message.id} message={message} threadViewMd={threadViewMd} />
                ))}
                {showPendingBubble ? <PendingSendBubble /> : null}
              </div>

              <div className="flex items-end gap-2 border-t border-border p-3">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    viewOnly
                      ? t("messages.viewOnlyReplyHint")
                      : replyEnabled
                        ? t("messages.replyTo", { name: active.name })
                        : t("messages.addContactToReply")
                  }
                  rows={1}
                  disabled={!replyEnabled || viewOnly}
                  className="max-h-28 min-h-10 resize-none"
                  aria-label={t("messages.replyAria", { name: active.name })}
                />
                <Button
                  type="button"
                  onClick={sendReply}
                  disabled={!replyEnabled || !draft.trim() || send.isPending || viewOnly}
                  title={viewOnly ? walletCopy.viewOnlyMessageDisabled : undefined}
                  className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  <Send className="size-4" aria-hidden="true" />
                  {t("nav.send")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="hidden min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center md:flex">
              <MailOpen className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">{t("messages.noConversationsTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("messages.noConversationsHint")}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={compose} onOpenChange={handleComposeOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("messages.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("messages.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">{t("messages.recipientLabel")}</Label>
              <AddressBookContactPicker
                contacts={addressBook.data ?? []}
                selectedId={selectedContactId}
                onSelect={pickComposeContact}
              />
              <div className="relative">
                <Input
                  id="recipient"
                  value={recipient}
                  onChange={(event) => handleRecipientChange(event.target.value)}
                  placeholder="ccx7 …"
                  autoComplete="off"
                  className="max-lg:pr-10"
                />
                <AddressQrScanButton
                  className="absolute right-1 top-1/2 -translate-y-1/2 lg:hidden"
                  disabled={send.isPending}
                  onScan={applyScannedDraft}
                />
              </div>
              {composeToSelf ? (
                <p className="text-sm text-wallet-amber">{t("messages.ownAddress")}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="compose-pid">{t("messages.paymentIdLabel")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={() => setComposePaymentId(generatePaymentId())}
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {t("messages.generate")}
                </Button>
              </div>
              <Input
                id="compose-pid"
                value={composePaymentId}
                onChange={(event) => setComposePaymentId(event.target.value)}
                placeholder={t("messages.paymentIdPlaceholder")}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="compose-body">{t("messages.messageLabel")}</Label>
                <MessageMdToggleButton
                  active={composeViewMd}
                  onToggle={() => setComposeViewMd((on) => !on)}
                />
              </div>
              <Textarea
                id="compose-body"
                value={composeBody}
                onChange={(event) => setComposeBody(event.target.value)}
                placeholder={t("messages.bodyPlaceholder")}
                maxLength={MAX_MESSAGE_SIZE}
              />
              {composeByteLength > MAX_MESSAGE_SIZE ? (
                <p className="text-sm text-destructive">{walletCopy.messageTooLong}</p>
              ) : null}
              {showMdPreview ? (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("messages.preview")}
                  </span>
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm leading-relaxed [&_i]:italic [&_s]:line-through">
                    <FormattedMessageText text={composeBody} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="compose-ttl">
                {t("messages.ttlLabel", {
                  value: formatTtlMinutes(ttlMinutes ?? 0, t("messages.ttlNone")),
                })}
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
                <span>{t("messages.ttlNone")}</span>
                <span>{formatTtlMinutes(MAX_TTL_MINUTES, t("messages.ttlNone"))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleComposeOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              onClick={sendCompose}
              disabled={send.isPending || composeByteLength > MAX_MESSAGE_SIZE || viewOnly}
              title={viewOnly ? walletCopy.viewOnlyMessageDisabled : undefined}
            >
              {send.isPending ? t("messages.sending") : t("nav.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageListItem({
  message,
  addressBook,
  isActive,
  onSelect,
}: {
  message: Message;
  addressBook: AddressEntry[];
  isActive: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const { timeAgo } = useFormatters();
  const entry = buildMessageListContactEntry(message, addressBook);

  const preview = message.hasBody
    ? parseCheckIn(message.body)
      ? t("messages.listCheckIn")
      : isKnownSmartMessage(message.body)
        ? t("messages.listSmartMessage")
        : message.body
    : message.direction === "sent"
      ? t("messages.listSentNoBody")
      : "";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-3 border-l-2 border-transparent px-4 py-3 text-left transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isActive && "bg-secondary",
          message.unread && message.direction === "received" && "border-l-primary",
        )}
      >
        <ContactAvatar entry={entry} className="size-9 shrink-0 rounded-full text-sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "flex min-w-0 flex-wrap items-baseline gap-x-1 truncate text-sm",
                message.unread && message.direction === "received"
                  ? "font-semibold text-foreground"
                  : "font-medium",
              )}
            >
              <span className="truncate">{entry.label}</span>
              {message.ttlExpiresAt ? (
                <MessageTtlExpiryLabel expiresAt={message.ttlExpiresAt} />
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(message.timestamp)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "truncate text-xs",
                message.hasBody ? "text-muted-foreground" : "italic text-muted-foreground/80",
              )}
            >
              {message.direction === "sent" ? t("messages.youPrefix") : ""}
              {preview}
            </span>
            {message.unread && message.direction === "received" && (
              <span className="size-2 shrink-0 rounded-full bg-primary" role="status">
                <span className="sr-only">{t("messages.unread")}</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function ThreadHeader({
  conversation,
  threadViewMd,
  onToggleMd,
}: {
  conversation: MessageConversation;
  threadViewMd: boolean;
  onToggleMd: () => void;
}) {
  const { t } = useI18n();
  const entry: AddressEntry = {
    id: conversation.threadKey,
    label: conversation.name,
    address: conversation.address,
    paymentId: conversation.paymentId,
    avatar: conversation.avatar,
  };

  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3">
      <ContactAvatar entry={entry} className="size-9 shrink-0 rounded-full text-sm" />
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm font-semibold">
          <span className="truncate">{conversation.name}</span>
          {(() => {
            const ttlMsg = [...conversation.messages].reverse().find((m) => m.ttlExpiresAt);
            return ttlMsg?.ttlExpiresAt ? (
              <MessageTtlExpiryLabel expiresAt={ttlMsg.ttlExpiresAt} />
            ) : null;
          })()}
        </p>
        {addressIsValid(conversation.address) ? (
          <p className="truncate font-mono text-xs text-muted-foreground">
            {truncateAddress(conversation.address, 12, 8)}
          </p>
        ) : null}
        {conversation.paymentId ? (
          <p className="truncate font-mono text-[11px] text-muted-foreground/80">
            PID {truncateAddress(conversation.paymentId, 8, 8)}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <MessageMdToggleButton active={threadViewMd} onToggle={onToggleMd} />
        {addressIsValid(conversation.address) ? (
          <CopyButton value={conversation.address} label={t("action.copy")} />
        ) : null}
      </div>
    </div>
  );
}

function PendingSendBubble() {
  const { t } = useI18n();
  return (
    <div className="ml-auto w-fit">
      <div
        className="rounded-2xl rounded-br-md bg-primary/90 px-2.5 py-2 text-primary-foreground"
        aria-label={t("messages.sendingAria")}
        role="status"
      >
        <span className="inline-flex items-end gap-0.5 text-base leading-none tracking-tight">
          <span className="animate-pulse motion-reduce:animate-none">.</span>
          <span className="animate-pulse motion-reduce:animate-none [animation-delay:200ms]">
            .
          </span>
          <span className="animate-pulse motion-reduce:animate-none [animation-delay:400ms]">
            .
          </span>
        </span>
      </div>
    </div>
  );
}

function ThreadBubble({ message, threadViewMd }: { message: Message; threadViewMd: boolean }) {
  const { t } = useI18n();
  const { timeAgo } = useFormatters();
  return (
    <div className={cn("max-w-[75%]", message.direction === "sent" && "ml-auto")}>
      {message.direction === "received" && message.ttlExpiresAt ? (
        <p className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-xs">
          <span className="font-medium text-foreground">{message.counterpartyName}</span>
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
        {message.hasBody ? (
          parseCheckIn(message.body) ? (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Heart className="size-3.5 fill-current" aria-hidden="true" />
              {t("messages.checkIn")}
            </span>
          ) : isKnownSmartMessage(message.body) ? (
            // Other structured commands (2FA, vault, …) — show a chip, not the raw token.
            <span className="inline-flex items-center gap-1.5 font-medium italic opacity-90">
              <Cog className="size-3.5" aria-hidden="true" />
              {t("messages.smartMessage")}
            </span>
          ) : threadViewMd ? (
            <div className="[&_i]:italic [&_s]:line-through">
              <FormattedMessageText
                text={message.body}
                theme={message.direction === "sent" ? "sent" : "received"}
              />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )
        ) : (
          <p className="whitespace-pre-wrap break-words italic opacity-80">
            {t("messages.bodyUnavailable")}
          </p>
        )}
        <p
          className={cn(
            "mt-1 text-[10px]",
            message.direction === "sent" ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {message.blockHeight > 0
            ? t("messages.blockPrefix", { height: message.blockHeight })
            : t("messages.pendingPrefix")}
          {timeAgo(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

function MessageMdToggleButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-7 min-w-7 px-2 text-xs font-semibold tracking-wide",
        active
          ? "border-wallet-amber bg-wallet-amber/15 text-wallet-amber hover:bg-wallet-amber/20"
          : "border-border bg-transparent text-muted-foreground hover:bg-secondary/80",
      )}
      aria-pressed={active}
      aria-label={active ? t("messages.mdShowPlain") : t("messages.mdShowFormatted")}
      onClick={onToggle}
    >
      MD
    </Button>
  );
}

function shouldShowMessagePreview(text: string): boolean {
  return text.includes("  ") || text.includes("*") || text.includes("`") || text.includes("~~");
}

/** v1 messages.ts formatTTL — slider stores minutes, label shows HH:MM. */
function formatTtlMinutes(minutes: number, noneLabel: string): string {
  if (minutes === 0) return noneLabel;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/** v1 Cn.js: minutes → unix seconds for on-chain TTL (Cn encodes ttl as-is). */
function messageTtlMinutesToUnix(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 0;
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

/** `Intl.DateTimeFormat` options for the pending-mempool TTL expiry label. */
const TTL_EXPIRES_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function MessageTtlExpiryLabel({ expiresAt }: { expiresAt: number }) {
  const { t } = useI18n();
  const { formatDate } = useFormatters();
  // v1 ttl is unix seconds → local date + time in the active locale.
  return (
    <span className="shrink-0 font-medium text-wallet-amber">
      {t("messages.ttlExpiresAt", {
        date: formatDate(new Date(expiresAt * 1000), TTL_EXPIRES_FORMAT),
      })}
    </span>
  );
}

type MessageFormatTheme = "compose" | "received" | "sent";

type MessageCodeColors = {
  bg: string;
  textCode: string;
  textBold: string;
  border: string;
};

function getMessageCodeColors(theme: MessageFormatTheme): MessageCodeColors {
  if (theme === "sent") {
    return {
      bg: "rgba(0,0,0,0.28)",
      textCode: "#fafafa",
      textBold: "#fafafa",
      border: "rgba(255,255,255,0.35)",
    };
  }
  if (theme === "received") {
    return {
      bg: "#2d3748",
      textCode: "#fafafa",
      textBold: "#fafafa",
      border: "#D9DCE7",
    };
  }
  return {
    bg: "#424242",
    textCode: "#fafafa",
    textBold: "#2d3748",
    border: "#000",
  };
}

function FormattedMessageText({
  text,
  theme = "compose",
}: {
  text: string;
  theme?: MessageFormatTheme;
}) {
  if (!text) return null;
  return <>{renderFormattedMessage(text, getMessageCodeColors(theme))}</>;
}

const INLINE_MESSAGE_PATTERN =
  /\*\*([^*\s][^*]*[^*\s])\*\*|\*([^*\s][^*]*[^*\s])\*|~~([^~]+)~~|`([^`]+)`|\*\s/g;

function renderFormattedMessage(text: string, codeColors: MessageCodeColors): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;
  const segments = text.split(/ {2}/);

  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex > 0) {
      nodes.push(<br key={`br-${key++}`} />);
    }
    nodes.push(...renderInlineMessageSegment(segment, codeColors, () => key++));
  });

  return nodes;
}

function renderInlineMessageSegment(
  text: string,
  codeColors: MessageCodeColors,
  nextKey: () => number,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MESSAGE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const key = nextKey();
    if (match[1]) {
      nodes.push(
        <span
          key={key}
          style={{
            fontWeight: "bold",
            color: codeColors.textBold,
            textShadow: `0px 0px 1px ${codeColors.textBold}`,
          }}
        >
          {match[1]}
        </span>,
      );
    } else if (match[2]) {
      nodes.push(<i key={key}>{match[2]}</i>);
    } else if (match[3]) {
      nodes.push(<s key={key}>{match[3]}</s>);
    } else if (match[4]) {
      nodes.push(
        <span
          key={key}
          style={{
            backgroundColor: codeColors.bg,
            color: codeColors.textCode,
            padding: "1px 3px",
            borderRadius: "3px",
            border: `1px solid ${codeColors.border}`,
            fontFamily: "monospace",
            fontSize: "0.9em",
          }}
        >
          {match[4]}
        </span>,
      );
    } else {
      nodes.push(<Fragment key={key}>{"\u00A0\u00A0•\u00A0"}</Fragment>);
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
