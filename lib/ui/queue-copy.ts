// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/** English-only send-queue consequence copy. Not i18n — do not add these to dictionaries. */
export const queueCopy = {
  hungBody:
    "The node hung. The transaction may already be in the mempool. This intent is saved. Wait a few confirmations, then click Submit if the payment is still missing.",
  submit: "Submit",
  exhaustToast: "Resubmit failed due to connectivity. Try later or another remote node.",
} as const;
