// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import type { WalletIntentKind } from "@/lib/types";

/**
 * English-only queue consequence copy. Not i18n — do not add these to dictionaries.
 * Toast/body copy is per intent kind so a parked deposit never reads as a "payment".
 */
export const queueCopy = {
  submit: "Submit",
  exhaustToast: "Resubmit failed due to connectivity. Try later or another remote node.",
  hungToast: "Submit timed out. The payment may already be on the network.",
  queuedToast: {
    send: "Payment not submitted. Saved to send after sync.",
    deposit: "Deposit not submitted. Saved to create after sync.",
    withdraw: "Withdrawal not submitted. Saved to send after sync.",
    message: "Message not submitted. Saved to send after sync.",
    fusion: "Fusion transaction not submitted. Saved to run after sync.",
  },
  hungBody: {
    send: "The node hung. The transaction may already be in the mempool. This intent is saved. Wait a few confirmations, then click Submit if the payment is still missing.",
    deposit:
      "The node hung. The deposit may already be in the mempool. This intent is saved. Wait a few confirmations, then click Submit if the deposit is still missing.",
    withdraw:
      "The node hung. The withdrawal may already be in the mempool. This intent is saved. Wait a few confirmations, then click Submit if the withdrawal is still missing.",
    message:
      "The node hung. The message may already be in the mempool. This intent is saved. Wait a few confirmations, then click Submit if the message is still missing.",
    fusion:
      "The node hung. The fusion transaction may already be in the mempool. This intent is saved. Wait a few confirmations, then click Submit if it is still missing.",
  },
} as const satisfies Record<string, string | Record<WalletIntentKind, string>>;
