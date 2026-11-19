import { mockSettings } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { mockIntentRuntime } from "@/lib/services/mock/transaction.service";
import { isMockViewOnly } from "@/lib/services/mock/wallet.service";
import {
  clearIntents,
  enqueueAuto,
  enqueueHung,
  fusionSaved,
  type IntentDraft,
} from "@/lib/services/real-sdk/send-intent";
import type { SettingsService } from "@/lib/services/settings.service";
import { assertCanSpend } from "@/lib/services/view-only";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { validateNodeUrlFormat } from "@/lib/validation/node-url";

let currentSettings = clone(mockSettings);

type MockFusionKind = "ok" | "decoy" | "hung";

let armedFusion: MockFusionKind | undefined;
let fusionParkSeq = 0;

/** Test-only: next optimizeWallet parks an intent instead of succeeding. */
export function _armMockFusion(kind: MockFusionKind = "ok"): void {
  armedFusion = kind === "ok" ? undefined : kind;
}

/** Test-only disarm (parked rows live on the shared mock runtime store). */
export function _disarmMockFusion(): void {
  armedFusion = undefined;
  clearIntents(mockIntentRuntime);
}

export const mockSettingsService: SettingsService = {
  async getSettings() {
    await mockDelay();
    return clone(currentSettings);
  },
  async updateSettings(input) {
    await mockDelay();

    if (input.useCustomNode === false) {
      currentSettings = { ...currentSettings, ...input, useCustomNode: false };
      return clone(currentSettings);
    }

    const enablingCustom = input.useCustomNode === true;
    const updatingCustomUrl = currentSettings.useCustomNode && typeof input.nodeUrl !== "undefined";

    if (enablingCustom || updatingCustomUrl) {
      const rawUrl = input.nodeUrl ?? currentSettings.nodeUrl;
      const format = validateNodeUrlFormat(rawUrl);
      if (!format.ok) {
        throw new Error(format.errors.join(" "));
      }

      currentSettings = {
        ...currentSettings,
        ...input,
        useCustomNode: true,
        nodeUrl: format.normalized,
      };
      return clone(currentSettings);
    }

    currentSettings = { ...currentSettings, ...input };
    return clone(currentSettings);
  },
  async getOptimizationStatus() {
    await mockDelay();
    if (fusionSaved(mockIntentRuntime)) {
      return { isNeeded: false, unspentOutputs: 0, intentSaved: true };
    }
    return { isNeeded: true, unspentOutputs: 142 };
  },
  async optimizeWallet() {
    await mockDelay();
    assertCanSpend(isMockViewOnly(), walletCopy.viewOnlyOptimizeDisabled);
    if (fusionSaved(mockIntentRuntime)) throw new Error(walletCopy.fusionAlreadySaved);
    const kind = armedFusion ?? "ok";
    armedFusion = undefined;
    if (kind !== "ok") {
      const draft: IntentDraft = { kind: "fusion" };
      if (kind === "hung") {
        const hash = `mock-hung-fusion-${fusionParkSeq + 1}`;
        fusionParkSeq += 1;
        enqueueHung(mockIntentRuntime, draft, hash);
        return { ok: true as const, optimized: false, queued: "hung" as const };
      }
      enqueueAuto(mockIntentRuntime, draft, kind);
      return { ok: true as const, optimized: false, queued: "auto" as const };
    }
    return { ok: true as const, optimized: true };
  },
  async resetAndRescan() {
    await mockDelay();
    return { ok: true };
  },
};
