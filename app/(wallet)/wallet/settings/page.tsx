"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/wallet/common";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { useWalletDelete } from "@/components/wallet/open-wallet-form";
import { env } from "@/lib/env";
import {
  useOptimizeWallet,
  useOptimizationStatus,
  useResetAndRescan,
  useUpdateWalletSettings,
  useWalletInfo,
  useWalletSettings,
  useWalletSyncStatus,
} from "@/lib/hooks";
import type { SyncSpeed, WalletSettings } from "@/lib/types";
import { SYNC_SPEED_LABELS, SYNC_SPEED_OPTIONS } from "@/lib/ui/sync-speed";
import { TICKER_OPTIONS, useTickerPreference } from "@/lib/ui/ticker-preference-provider";
import { getNodeUrlFormatHints } from "@/lib/validation/node-url";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4 first:pt-0 last:pb-0">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SyncSpeedSelector({
  value,
  disabled,
  onChange,
}: {
  value: SyncSpeed;
  disabled?: boolean;
  onChange: (speed: SyncSpeed) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">Wallet sync speed</legend>
      {SYNC_SPEED_OPTIONS.map((speed) => (
        <button
          key={speed}
          type="button"
          disabled={disabled}
          onClick={() => onChange(speed)}
          aria-pressed={value === speed}
          className={cn(
            "min-h-10 cursor-pointer rounded-xl border border-border px-4 text-sm font-semibold capitalize text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 hover:border-ring hover:text-foreground active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:active:scale-100 motion-reduce:transition-none",
            value === speed &&
              "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          {SYNC_SPEED_LABELS[speed]}
        </button>
      ))}
    </fieldset>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const settings = useWalletSettings();
  const updateSettings = useUpdateWalletSettings();
  const optimizeWallet = useOptimizeWallet();
  const optimizationStatus = useOptimizationStatus();
  const resetAndRescan = useResetAndRescan();
  const wallet = useWalletInfo();
  const { isSyncing } = useWalletSyncStatus();
  const deleteWallet = useWalletDelete();
  const ticker = useTickerPreference();
  const current = settings.data;
  const isMock = env.useMockWallet;

  const [creationHeight, setCreationHeight] = useState("");
  const [creationHeightDirty, setCreationHeightDirty] = useState(false);
  const [nodeUrl, setNodeUrl] = useState("");
  const [nodeUrlDirty, setNodeUrlDirty] = useState(false);
  const nodeUrlHints = getNodeUrlFormatHints(nodeUrl);

  const syncedHeight = wallet.data?.currentHeight ?? current?.scanHeight ?? 0;

  useEffect(() => {
    if (!current) return;
    if (!creationHeightDirty) {
      setCreationHeight(String(current.creationHeight ?? 0));
    }
    if (!nodeUrlDirty) {
      setNodeUrl(current.nodeUrl);
    }
  }, [current, nodeUrlDirty, creationHeightDirty]);

  function settingsSavedMessage() {
    return isMock ? "Mock settings updated." : "Settings updated.";
  }

  function update(input: Partial<WalletSettings>, message = settingsSavedMessage()) {
    updateSettings.mutate(input, {
      onSuccess: () => toast.success(message),
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Settings update failed."),
    });
  }

  function applyNodeConnection(
    input: { useCustomNode: boolean; nodeUrl: string },
    message: string,
  ) {
    updateSettings.mutate(input, {
      onSuccess: (settings) => {
        setNodeUrl(settings.nodeUrl);
        setNodeUrlDirty(false);
        toast.success(message);
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Node update failed."),
    });
  }

  function handleCustomNodeToggle(checked: boolean) {
    if (updateSettings.isPending) return;

    if (checked) {
      applyNodeConnection(
        { useCustomNode: true, nodeUrl },
        isMock ? "Mock custom node enabled." : "Custom node connected.",
      );
      return;
    }

    applyNodeConnection(
      { useCustomNode: false, nodeUrl: current?.nodeUrl ?? nodeUrl },
      isMock ? "Mock public nodes enabled." : "Using public nodes.",
    );
  }

  function commitCustomNodeUrl() {
    if (!current?.useCustomNode || updateSettings.isPending) return;
    if (nodeUrl.trim() === current.nodeUrl) return;

    applyNodeConnection(
      { useCustomNode: true, nodeUrl },
      isMock ? "Mock custom node updated." : "Custom node updated.",
    );
  }

  function applyHeights() {
    const parsedCreation = parseInt(creationHeight, 10);
    if (Number.isNaN(parsedCreation)) {
      toast.error("Enter a valid creation height.");
      return;
    }
    updateSettings.mutate(
      { creationHeight: parsedCreation },
      {
        onSuccess: (next) => {
          setCreationHeight(String(next.creationHeight ?? parsedCreation));
          setCreationHeightDirty(false);
          toast.success(
            isMock
              ? "Mock wallet updated."
              : "Creation height updated — rescanning from that block.",
          );
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : "Settings update failed."),
      },
    );
  }

  function handleResetAndRescan() {
    const runReset = () => {
      resetAndRescan.mutate(undefined, {
        onSuccess: () => {
          toast.success(
            isMock ? "Mock rescan started." : "Wallet reset — rescanning from creation height.",
          );
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : "Rescan failed."),
      });
    };

    if (!creationHeightDirty) {
      runReset();
      return;
    }

    const parsedCreation = parseInt(creationHeight, 10);
    if (Number.isNaN(parsedCreation)) {
      toast.error("Enter a valid creation height.");
      return;
    }

    updateSettings.mutate(
      { creationHeight: parsedCreation },
      {
        onSuccess: (next) => {
          setCreationHeight(String(next.creationHeight ?? parsedCreation));
          setCreationHeightDirty(false);
          runReset();
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : "Settings update failed."),
      },
    );
  }

  const optimizationNeeded = optimizationStatus.data?.isNeeded ?? false;
  const unspentOutputs = optimizationStatus.data?.unspentOutputs ?? 0;

  function handleOptimize() {
    optimizeWallet.mutate(undefined, {
      onSuccess: (result) => {
        if (result.optimized) {
          toast.success(isMock ? "Mock optimization complete." : "Wallet optimization complete.");
          return;
        }
        toast.info(isMock ? "Mock wallet does not need optimization." : "Nothing to optimize.");
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Optimization failed."),
    });
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Change your parameters here" />
      <WalletSyncingBanner hint="optimization is disabled until the chain is caught up" />
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <Card className="wallet-card">
          <CardContent className="divide-y divide-border">
            <Section title="General">
              <Row label="Ticker" description="Amount suffix shown across the wallet">
                <select
                  className="h-10 w-44 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring"
                  value={ticker.useShortTicker ? "short" : "full"}
                  onChange={(event) => {
                    const useShort = event.target.value === "short";
                    void ticker.setUseShortTicker(useShort).then(() => {
                      toast.success(isMock ? "Mock ticker updated." : "Ticker updated.");
                    });
                  }}
                >
                  {TICKER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row
                label="Wallet optimization"
                description="Compact transaction outputs to reduce wallet size"
              >
                <div className="flex w-full flex-col items-end gap-1.5 sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      optimizeWallet.isPending ||
                      optimizationStatus.isLoading ||
                      !optimizationNeeded ||
                      isSyncing
                    }
                    onClick={handleOptimize}
                  >
                    {optimizeWallet.isPending ? "Optimizing…" : "Optimize Now"}
                  </Button>
                  {isSyncing ? (
                    <p className="max-w-xs text-right text-xs text-muted-foreground sm:max-w-sm">
                      Wait for sync to finish before optimizing.
                    </p>
                  ) : optimizationNeeded ? (
                    <p className="max-w-xs text-right text-xs text-amber-400/90 sm:max-w-sm">
                      Optimization can be attempted — {unspentOutputs} unspent UTXOs
                    </p>
                  ) : null}
                </div>
              </Row>
            </Section>

            {current && (
              <Section title="Node">
                <Row
                  label="Use custom node"
                  description="Pin the URL below instead of rotating public nodes"
                >
                  <Switch
                    checked={current.useCustomNode}
                    disabled={updateSettings.isPending}
                    onCheckedChange={handleCustomNodeToggle}
                  />
                </Row>
                <Row
                  label="Node URL"
                  description={
                    current.useCustomNode
                      ? "Custom daemon — edit and press Enter to reconnect"
                      : "Currently connected daemon — edit before enabling custom node"
                  }
                >
                  <div className="flex w-full flex-col gap-1.5 sm:w-80">
                    <Input
                      value={nodeUrl}
                      disabled={updateSettings.isPending}
                      onChange={(event) => {
                        setNodeUrl(event.target.value);
                        setNodeUrlDirty(true);
                      }}
                      onBlur={() => commitCustomNodeUrl()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      aria-describedby={nodeUrlHints.length > 0 ? "node-url-hints" : undefined}
                    />
                    {nodeUrlHints.length > 0 && (
                      <div id="node-url-hints" className="space-y-0.5">
                        {nodeUrlHints.map((hint) => (
                          <p key={hint} className="text-xs text-amber-400/90">
                            {hint}
                          </p>
                        ))}
                      </div>
                    )}
                    {updateSettings.isPending && (
                      <p className="text-xs text-muted-foreground">Testing node connection…</p>
                    )}
                  </div>
                </Row>
              </Section>
            )}

            {current && (
              <Section title="Wallet">
                <Row
                  label="Sync speed"
                  description="Higher speeds use more CPU and network resources while scanning blocks"
                >
                  <SyncSpeedSelector
                    value={current.syncSpeed}
                    disabled={updateSettings.isPending}
                    onChange={(syncSpeed) => update({ syncSpeed })}
                  />
                </Row>
                <Row
                  label="Read miner transactions"
                  description="Include coinbase outputs when syncing — required for solo mining"
                >
                  <Switch
                    checked={current.readMinorTx}
                    disabled={updateSettings.isPending}
                    onCheckedChange={(checked: boolean) => update({ readMinorTx: checked })}
                  />
                </Row>
                <Row
                  label="Block heights"
                  description="Creation height (editable while syncing) / current synced height"
                >
                  <div className="flex gap-2">
                    <Input
                      value={creationHeight}
                      disabled={updateSettings.isPending}
                      onChange={(event) => {
                        setCreationHeight(event.target.value);
                        setCreationHeightDirty(true);
                      }}
                      className="w-32"
                      aria-label="Creation height"
                      inputMode="numeric"
                    />
                    <Input
                      value={String(syncedHeight)}
                      readOnly
                      disabled
                      className="w-32"
                      aria-label="Current synced height"
                      inputMode="numeric"
                    />
                  </div>
                </Row>
                <Row
                  label="Maintenance"
                  description="Update applies creation height and restarts the scan from that block"
                >
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={updateSettings.isPending}
                      onClick={applyHeights}
                    >
                      Update
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={resetAndRescan.isPending}
                      onClick={handleResetAndRescan}
                    >
                      {resetAndRescan.isPending ? "Rescanning…" : "Reset & rescan"}
                    </Button>
                  </div>
                </Row>
                <Row
                  label="Delete wallet"
                  description={
                    isMock
                      ? "Removes this mock wallet session and returns to the open-wallet screen"
                      : "Removes the encrypted wallet from this browser and returns to the open-wallet screen"
                  }
                >
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive">
                        Delete wallet
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete wallet?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {isMock
                            ? "This deletes the current mock wallet session and returns you to the open wallet screen."
                            : "This permanently deletes the encrypted wallet stored in this browser."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={deleteWallet}
                        >
                          Delete wallet
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Row>
              </Section>
            )}

            {current && (
              <Section title="Security">
                <Row label="Auto-lock" description="Lock the wallet after a period of inactivity">
                  <select
                    className="h-10 w-44 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring"
                    value={String(current.autoLockMinutes)}
                    onChange={(event) =>
                      update(
                        { autoLockMinutes: Number(event.target.value) },
                        isMock ? "Mock auto-lock updated." : "Auto-lock updated.",
                      )
                    }
                    aria-label="Auto-lock timeout"
                  >
                    <option value="0">Off</option>
                    <option value="5">After 5 minutes</option>
                    <option value="15">After 15 minutes</option>
                    <option value="30">After 30 minutes</option>
                  </select>
                </Row>
                <Row label="Password" description="Change the local wallet password">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/wallet/change-password")}
                  >
                    Change Password
                  </Button>
                </Row>
              </Section>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
