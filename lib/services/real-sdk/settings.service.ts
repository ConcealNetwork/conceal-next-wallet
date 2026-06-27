import {
  FUSION_TX_MIN_INPUT_COUNT,
  fusion,
  getBalance,
  isOptimizationNeeded,
  OPTIMIZE_THRESHOLD,
  type RawWalletV1,
  selectFusionInputs,
} from "conceal-wallet-sdk";
import { clearReceivedRecords } from "@/lib/services/real-sdk/messages-store";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import {
  buildDaemon,
  nodeUrlFromRaw,
  persist,
  requireRuntime,
  sync,
} from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  fetchDecoys,
  MIXIN,
  ownKeys,
  selectableOutputs,
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
      // `?? 0` (not 50) so a blob with no readSpeed resolves to the SAME default the runtime uses
      // (`syncSpeedFromReadSpeed(0)` → the default level) — UI + engine must agree (Codex review).
      syncSpeed: syncSpeedFromReadSpeed(Number(options.readSpeed ?? 0)),
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
        raw = clearReceivedRecords(raw);
      } else {
        rt.state = { ...rt.state, scannedHeight: targetHeight };
      }
      rescan = true;
    }

    rt.raw = raw;
    if (rebuildDaemon) {
      // Honor the FULL node precedence (custom > device-local preferred > auto-fastest > default),
      // not just the custom node. Reconnecting straight to `defaultNodeUrl()` whenever custom was off
      // dropped a "Use fastest"/preferred home pick — and, because picking a node no longer pins
      // `customNode`, that's exactly the home node multi-source should anchor on.
      rt.daemon = buildDaemon(nodeUrlFromRaw(raw));
    }
    await persist();
    if (rescan) {
      await sync();
    } else if (rebuildDaemon) {
      // A node change: kick a fresh sync (non-blocking) so the next `syncOnce` re-evaluates the
      // multi-source gate + home node against the new daemon. Fire-and-forget — the UI mutation
      // shouldn't wait out a catch-up; errors surface through the normal sync chain.
      //
      // The daemon was swapped in place above. If a `syncOnce` is ALREADY mid-catch-up, its fetch
      // closures read `rt.daemon` per call, so it can flip to the new node mid-loop — but that is
      // SAFE, not silent: every range goes through `fetchVerifiedRange`, which THROWS on a short/
      // behind answer (→ failover to home, never advancing `scannedHeight` past a gap). Worst case
      // is a thrown batch + retry, not a missed block. A clean mid-sync restart (abortable syncOnce
      // keyed on a daemon generation) is a deliberate follow-up; this same in-place swap was already
      // performed for every custom-node change before this path existed.
      void sync().catch(() => {});
    }
    return this.getSettings();
  },

  async getOptimizationStatus(): Promise<OptimizationStatus> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const blockchainHeight = await rt.daemon.getHeight();
    const balance = getBalance(rt.state);
    const status = isOptimizationNeeded({
      unspentOutputs: await selectableOutputs(rt),
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
    const outputs = await selectableOutputs(rt);

    const status = isOptimizationNeeded({
      unspentOutputs: outputs,
      balance: balance.spendable,
      blockchainHeight,
    });
    if (!status.isNeeded) {
      return { ok: true, optimized: false };
    }

    const selection = selectFusionInputs(outputs, OPTIMIZE_THRESHOLD, blockchainHeight);
    if (selection === null || selection.selected.length < FUSION_TX_MIN_INPUT_COUNT) {
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
    rt.raw = clearReceivedRecords(rt.raw);
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
