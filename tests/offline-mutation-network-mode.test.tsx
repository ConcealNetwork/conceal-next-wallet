// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { onlineManager } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendTransaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services", () => ({
  services: { transactions: { sendTransaction: (input: unknown) => sendTransaction(input) } },
}));

import { useSendTransaction } from "@/lib/hooks";
import { WalletQueryProvider } from "@/lib/hooks/query-provider";

function Sender() {
  const send = useSendTransaction();
  return (
    <button type="button" onClick={() => send.mutate({ address: "ccx7abc", amount: 1 })}>
      send
    </button>
  );
}

describe("send mutation while the browser reports offline", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    sendTransaction.mockReset();
    cleanup();
  });

  // React Query's default networkMode "online" parks a mutation until the browser
  // reports online, so sendTransaction never ran and Confirm Send hung open while
  // the payment silently broadcast on reconnect.
  it("still invokes the service so it can queue a retry intent", async () => {
    onlineManager.setOnline(false);
    sendTransaction.mockResolvedValue({ hash: "queued", queued: true });

    const { getByRole } = render(
      <WalletQueryProvider>
        <Sender />
      </WalletQueryProvider>,
    );
    getByRole("button", { name: "send" }).click();

    await waitFor(() => expect(sendTransaction).toHaveBeenCalledTimes(1));
  });
});
