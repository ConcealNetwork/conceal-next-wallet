import {
  fusion,
  getBalance,
  isOptimizationNeeded,
  type RawWalletV1,
  selectFusionInputs,
} from "conceal-wallet-sdk";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import {
  buildDaemon,
  defaultNodeUrl,
  persist,
  requireRuntime,
  sync,
} from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  fetchDecoys,
  MIXIN,
  ownKeys,
  unspentOutputs,
} from "@/lib/services/real-sdk/spend";
import type { SettingsService } from "@/lib/services/settings.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { OptimizationStatus, OptimizeWalletResult, WalletSettings } from "@/lib/types";
import { readSpeedFromSyncSpeed, syncSpeedFromReadSpeed } from "@/lib/ui/sync-speed";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { validateNodeUrlFormat } from "@/lib/validation/node-url";

/** Custom blob field carrying the device-local auto-lock minutes setting. */
const AUTO_LOCK_FIELD = "autoLockMinutes";

/** Read the auto-lock minutes carried on the blob (0 = disabled). */
function readAutoLockMinutes(raw: { [key: string]: unknown }): number {
  const value = Number(raw[AUTO_LOCK_FIELD] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export const realSdkSettingsService: SettingsService = {
  async getSettings(): Promise<WalletSettings> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const options = rt.raw.options ?? {};
    const useCustomNode = Boolean(options.customNode);
    return {
      useCustomNode,
      nodeUrl: rt.daemon.nodeUrl,
      readMinorTx: Boolean(options.checkMinerTx),
      syncSpeed: syncSpeedFromReadSpeed(Number(options.readSpeed ?? 50)),
      autoLockMinutes: readAutoLockMinutes(rt.raw),
      creationHeight: Math.max(0, Number(rt.raw.creationHeight ?? 0) || 0),
      scanHeight: rt.state.scannedHeight,
    };
  },

  async updateSettings(input: Partial<WalletSettings>): Promise<WalletSettings> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const options = { ...(rt.raw.options ?? {}) };
    let rebuildDaemon = false;

    if (typeof input.readMinorTx !== "undefined") {
      options.checkMinerTx = input.readMinorTx;
    }
    if (typeof input.syncSpeed !== "undefined") {
      options.readSpeed = readSpeedFromSyncSpeed(input.syncSpeed);
    }

    if (input.useCustomNode === false) {
      options.customNode = false;
      rebuildDaemon = true;
    } else if (
      input.useCustomNode === true ||
      (options.customNode && input.nodeUrl !== undefined)
    ) {
      const rawUrl = input.nodeUrl ?? options.nodeUrl ?? "";
      const format = validateNodeUrlFormat(rawUrl);
      if (!format.ok) {
        throw new Error(format.errors.join(" "));
      }
      options.customNode = true;
      options.nodeUrl = format.normalized;
      rebuildDaemon = true;
    }

    let raw: RawWalletV1 = { ...rt.raw, options };
    if (typeof input.autoLockMinutes !== "undefined") {
      const minutes = Math.max(0, Math.floor(input.autoLockMinutes));
      raw = { ...raw, [AUTO_LOCK_FIELD]: minutes };
    }

    // Clamp + apply creation/scan height changes (a re-scan trigger).
    let rescan = false;
    if (typeof input.creationHeight !== "undefined" || typeof input.scanHeight !== "undefined") {
      const tip = await rt.daemon.getHeight();
      // The new scan floor is the lowest of the requested heights (scanHeight wins
      // when both are given — it's the explicit re-scan-from value).
      let targetHeight = rt.state.scannedHeight;
      if (typeof input.creationHeight !== "undefined") {
        const clamped = clampHeight(input.creationHeight, tip);
        raw = { ...raw, creationHeight: clamped, lastHeight: clamped };
        targetHeight = clamped;
      }
      if (typeof input.scanHeight !== "undefined") {
        targetHeight = clampHeight(input.scanHeight, tip);
      }

      // Moving the scan floor BACKWARD must wipe scanned history — otherwise the
      // re-scan re-appends already-known outputs/txs/deposits (duplicates +
      // inflated balance). Build a fresh state seeded at the new floor, exactly
      // like resetAndRescan. Moving forward just advances the floor.
      if (targetHeight < rt.state.scannedHeight) {
        rt.state = {
          ...rt.state,
          scannedHeight: targetHeight,
          outputs: [],
          spentKeyImages: [],
          transactions: [],
          deposits: [],
          spentDepositIndexes: [],
        };
      } else {
        rt.state = { ...rt.state, scannedHeight: targetHeight };
      }
      rescan = true;
    }

    rt.raw = raw;
    if (rebuildDaemon) {
      const nextUrl = options.customNode && options.nodeUrl ? options.nodeUrl : defaultNodeUrl();
      rt.daemon = buildDaemon(nextUrl);
    }
    await persist();
    if (rescan) {
      await sync();
    }
    return this.getSettings();
  },

  async getOptimizationStatus(): Promise<OptimizationStatus> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const blockchainHeight = await rt.daemon.getHeight();
    const balance = getBalance(rt.state);
    const status = isOptimizationNeeded({
      unspentOutputs: unspentOutputs(rt),
      balance: balance.spendable,
      blockchainHeight,
    });
    return { isNeeded: status.isNeeded, unspentOutputs: status.unspentOutputs };
  },

  async optimizeWallet(): Promise<OptimizeWalletResult> {
    await ensureSdkReady();
    const rt = requireRuntime();
    assertCanSpend(rt.viewOnly, walletCopy.viewOnlyOptimizeDisabled);

    const blockchainHeight = await rt.daemon.getHeight();
    const balance = getBalance(rt.state);
    const outputs = unspentOutputs(rt);

    const status = isOptimizationNeeded({
      unspentOutputs: outputs,
      balance: balance.spendable,
      blockchainHeight,
    });
    if (!status.isNeeded) {
      return { ok: true, optimized: false };
    }

    const selection = selectFusionInputs(outputs, fusion.OPTIMIZE_THRESHOLD, blockchainHeight);
    if (selection === null || selection.selected.length < fusion.FUSION_TX_MIN_INPUT_COUNT) {
      return { ok: true, optimized: false };
    }

    const decoys = await fetchDecoys(rt, selection.selected);
    const built = fusion.buildFusionTransaction({
      keys: rt.account.keys,
      selfKeys: ownKeys(rt),
      fusionInputs: selection.selected,
      decoys,
      mixin: MIXIN,
    });

    await broadcast(rt, built);
    return { ok: true, optimized: true };
  },

  async resetAndRescan(): Promise<{ ok: true }> {
    await ensureSdkReady();
    const rt = requireRuntime();
    // Wipe scanned history and re-scan from the wallet's creation height.
    const creationHeight = Math.max(0, Number(rt.raw.creationHeight ?? 0) || 0);
    rt.state = {
      ...rt.state,
      scannedHeight: creationHeight,
      outputs: [],
      spentKeyImages: [],
      transactions: [],
      deposits: [],
      spentDepositIndexes: [],
    };
    await persist();
    await sync();
    return { ok: true };
  },
};

/** Clamp a height into `[0, tip]`. */
function clampHeight(height: number, tip: number): number {
  if (!Number.isFinite(height) || height < 0) return 0;
  return Math.min(Math.floor(height), tip);
}
