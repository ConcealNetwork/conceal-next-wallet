// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import { clearIntents, enqueueAuto, noteSubmitFail } from "@/lib/services/real-sdk/send-intent";
import type { QueuedTransaction } from "@/lib/types";
import { queueCopy } from "@/lib/ui/queue-copy";

const { useQueuedTransactions, mutate, submitMutate, toastError } = vi.hoisted(() => ({
  useQueuedTransactions: vi.fn(),
  mutate: vi.fn(),
  submitMutate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/hooks", () => ({
  useQueuedTransactions: () => useQueuedTransactions(),
  useCancelQueuedTransaction: () => ({ mutate, isPending: false }),
  useSubmitHungIntent: () => ({ mutate: submitMutate, isPending: false }),
}));

vi.mock("@/lib/ui/toast", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import { OutboundQueueCard } from "@/components/wallet/outbound-queue-card";

const renderCard = () =>
  render(
    <I18nProvider>
      <OutboundQueueCard />
    </I18nProvider>,
  );

function autoIntent(): QueuedTransaction {
  return {
    id: "intent-auto-1",
    kind: "auto",
    state: "pending",
    attempts: 1,
    enqueuedAt: 1,
    label: "Send to Alice",
  };
}

function hungIntent(extra: Partial<QueuedTransaction> = {}): QueuedTransaction {
  return {
    id: "intent-hung-1",
    kind: "hung",
    state: "hung",
    sent: false,
    hash: "watched-from-fixture",
    attempts: 0,
    enqueuedAt: 2,
    label: "Send to Bob",
    ...extra,
  };
}

describe("OutboundQueueCard auto intents", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mutate.mockReset();
    submitMutate.mockReset();
    toastError.mockReset();
    useQueuedTransactions.mockReset();
  });

  it("shows a retrying auto row and cancels by intent id", () => {
    useQueuedTransactions.mockReturnValue({ data: [autoIntent()] });
    renderCard();

    const title = DICTIONARIES.en["queue.title"];
    const description = DICTIONARIES.en["queue.description"];
    expect(title).toBe("Saved intents");
    expect(description).not.toMatch(/until they go through/);
    expect(description).toMatch(/drops it/);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByText(DICTIONARIES.en["queue.stateRetrying"])).toBeInTheDocument();
    expect(screen.getByText("Send to Alice")).toBeInTheDocument();

    const cancel = screen.getByRole("button", { name: DICTIONARIES.en["queue.cancel"] });
    fireEvent.click(cancel);
    expect(mutate).toHaveBeenCalledWith("intent-auto-1", expect.any(Object));
  });

  it("shows each row's label and does not fall back to the intent id", () => {
    const first = autoIntent();
    const second: QueuedTransaction = {
      id: "intent-auto-2",
      kind: "auto",
      state: "pending",
      attempts: 1,
      enqueuedAt: 2,
      label: "2.000000 CCX · ccx7other...address",
    };
    useQueuedTransactions.mockReturnValue({ data: [first, second] });
    renderCard();

    expect(screen.getByText("Send to Alice")).toBeInTheDocument();
    expect(screen.getByText(second.label ?? "")).toBeInTheDocument();
    expect(screen.queryByText(/intent-auto-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/intent-auto-2/)).not.toBeInTheDocument();
  });

  it("renders nothing when the queue is empty", () => {
    useQueuedTransactions.mockReturnValue({ data: [] });
    const { container } = renderCard();
    expect(screen.queryByText(DICTIONARIES.en["queue.title"])).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows every intent kind with cancel, using per-kind labels and hung copy", () => {
    useQueuedTransactions.mockReturnValue({
      data: [
        autoIntent(),
        {
          ...autoIntent(),
          id: "intent-dep-1",
          intentKind: "deposit",
          label: "Deposit 100.000000 CCX · 12 mo",
        },
        {
          ...autoIntent(),
          id: "intent-withdraw-1",
          intentKind: "withdraw",
          label: "Withdraw deposit abcdef123456…",
        },
        {
          ...autoIntent(),
          id: "intent-msg-1",
          intentKind: "message",
          label: "Message to ccx7mess...",
        },
        {
          ...autoIntent(),
          id: "intent-fusion-1",
          intentKind: "fusion",
          label: "Fusion transaction",
        },
        {
          ...hungIntent(),
          id: "intent-hung-dep",
          intentKind: "deposit",
          label: "Deposit 5.000000 CCX · 6 mo",
        },
      ],
    });
    renderCard();

    expect(screen.getByText("Deposit 100.000000 CCX · 12 mo")).toBeInTheDocument();
    expect(screen.getByText("Withdraw deposit abcdef123456…")).toBeInTheDocument();
    expect(screen.getByText("Message to ccx7mess...")).toBeInTheDocument();
    expect(screen.getByText("Fusion transaction")).toBeInTheDocument();
    // Per-kind hung body for the parked deposit, not the send copy.
    expect(screen.getByText(queueCopy.hungBody.deposit)).toBeInTheDocument();
    expect(screen.queryByText(queueCopy.hungBody.send)).not.toBeInTheDocument();

    const cancels = screen.getAllByRole("button", { name: DICTIONARIES.en["queue.cancel"] });
    expect(cancels).toHaveLength(6);
    const withdrawCancel = cancels[2];
    if (!withdrawCancel) throw new Error("expected a cancel button");
    fireEvent.click(withdrawCancel);
    expect(mutate).toHaveBeenCalledWith("intent-withdraw-1", expect.any(Object));
  });
});

describe("OutboundQueueCard hung submit", () => {
  afterEach(() => {
    cleanup();
    clearIntents({} as SdkRuntime);
  });

  beforeEach(() => {
    mutate.mockReset();
    submitMutate.mockReset();
    toastError.mockReset();
    useQueuedTransactions.mockReset();
  });

  it("shows English hung copy and submits that intent id", () => {
    const hung = hungIntent();
    useQueuedTransactions.mockReturnValue({ data: [hung] });
    renderCard();

    expect(screen.getByText(queueCopy.hungBody.send)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: queueCopy.submit });
    fireEvent.click(submit);
    expect(submitMutate).toHaveBeenCalledWith(hung.id);
  });

  it("hides Submit when the hung row is already sent", () => {
    const hung = hungIntent({ sent: true, state: "sent" });
    useQueuedTransactions.mockReturnValue({ data: [hung] });
    renderCard();

    expect(screen.queryByRole("button", { name: queueCopy.submit })).not.toBeInTheDocument();
    expect(submitMutate).not.toHaveBeenCalled();
  });

  it("keeps Submit and hung copy off auto pending rows", () => {
    useQueuedTransactions.mockReturnValue({ data: [autoIntent()] });
    renderCard();

    expect(screen.queryByText(queueCopy.hungBody.send)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: queueCopy.submit })).not.toBeInTheDocument();
  });

  it("toasts the English exhaust copy after a cap drop", async () => {
    const rt = {} as SdkRuntime;
    const queued = enqueueAuto(rt, { kind: "send", address: "ccx7cardToast", amount: 1 }, "submit");
    let note: "kept" | "dropped" = "kept";
    while (note === "kept") {
      note = noteSubmitFail(rt, queued.id);
    }
    expect(note).toBe("dropped");

    useQueuedTransactions.mockReturnValue({ data: [] });
    renderCard();
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(queueCopy.exhaustToast);
    });
    clearIntents(rt);
  });
});
