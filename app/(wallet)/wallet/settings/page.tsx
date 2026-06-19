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
import { PasskeySetting } from "@/components/wallet/biometric-setting";
import { PageHeader } from "@/components/wallet/common";
import { LanguageSetting } from "@/components/wallet/language-setting";
import { usePanicWipe, useWalletDelete } from "@/components/wallet/open-wallet-form";
import { PanicWipeDialog } from "@/components/wallet/panic-wipe-dialog";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ThemeToggle } from "@/components/wallet/theme-toggle";
import { VaultBackup } from "@/components/wallet/vault-backup";
import { WalletsSetting } from "@/components/wallet/wallets-setting";
import { env } from "@/lib/env";
import {
  useOptimizationStatus,
  useOptimizeWallet,
  useResetAndRescan,
  useUpdateWalletSettings,
  useWalletInfo,
  useWalletSettings,
  useWalletSyncStatus,
  useWalletViewOnly,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { checkCustomNodeLag } from "@/lib/network/node-lag";
import {
  getPermission,
  isNotificationSupported,
  isOptedIn,
  type NotificationPermissionState,
  requestNotificationPermission,
  setOptedIn,
} from "@/lib/notifications/notify";
import type { SyncSpeed, WalletSettings } from "@/lib/types";
import { SYNC_SPEED_LABELS, SYNC_SPEED_OPTIONS } from "@/lib/ui/sync-speed";
import { TICKER_OPTIONS, useTickerPreference } from "@/lib/ui/ticker-preference-provider";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";
import { getNodeUrlFormatHints } from "@/lib/validation/node-url";

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
  const { t } = useI18n();
  return (
    <fieldset className="flex flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">{t("settings.syncSpeedLegend")}</legend>
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

/**
 * Opt-in OS notifications for due reminders / overdue check-ins. Strictly
 * additive: toasts remain the default. The toggle persists the user's intent
 * and, on enable, requests browser permission from this click (a user gesture,
 * required by the API). Shows the current permission state.
 */
function NotificationsSetting() {
  const { t } = useI18n();
  // Start "false" to match SSR (the API is client-only); hydrate on mount.
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [optedIn, setOptedInState] = useState(false);

  useEffect(() => {
    setSupported(isNotificationSupported());
    setPermission(getPermission());
    setOptedInState(isOptedIn());
  }, []);

  async function handleToggle(checked: boolean) {
    if (!checked) {
      setOptedIn(false);
      setOptedInState(false);
      toast.success("Notifications disabled.");
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      setOptedIn(true);
      setOptedInState(true);
      toast.success("Notifications enabled.");
    } else {
      // Keep opt-in off when permission isn't granted — never alert silently.
      setOptedIn(false);
      setOptedInState(false);
      toast.error(
        result === "denied"
          ? "Notifications are blocked in your browser settings."
          : "Notification permission was not granted.",
      );
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">{t("settings.notificationsUnsupported")}</p>
    );
  }

  const stateLabel =
    permission === "granted"
      ? t("settings.notificationsAllowed")
      : permission === "denied"
        ? t("settings.notificationsBlocked")
        : t("settings.notificationsNotYet");

  return (
    <div className="flex w-full flex-col items-end gap-1.5 sm:w-auto">
      <Switch
        checked={optedIn && permission === "granted"}
        onCheckedChange={(checked: boolean) => void handleToggle(checked)}
        aria-label={t("settings.notificationsAriaLabel")}
      />
      <p className="text-right text-xs text-muted-foreground">{stateLabel}</p>
    </div>
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
  const viewOnly = useWalletViewOnly();
  const deleteWallet = useWalletDelete();
  const panicWipe = usePanicWipe();
  const ticker = useTickerPreference();
  const { t } = useI18n();
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
        // Non-fatal heads-up: a real custom node that lags well behind the public
        // reference nodes will show stale height/balances. (Mock has no real node.)
        if (input.useCustomNode && !isMock) {
          void checkCustomNodeLag(settings.nodeUrl)
            .then((lag) => {
              if (lag?.isLagging) {
                toast.warning(
                  `This node is ${lag.lagBlocks.toLocaleString()} blocks behind the network — it may show outdated balances. Consider switching nodes.`,
                );
              }
            })
            .catch(() => {
              // Best-effort heads-up only — never let a probe failure surface an error.
            });
        }
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
    if (viewOnly) {
      toast.error(walletCopy.viewOnlyOptimizeDisabled);
      return;
    }
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
      <PageHeader title={t("nav.settings")} subtitle={t("settings.subtitle")} />
      <WalletSyncingBanner hint={t("settings.syncingHint")} />
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <Card className="wallet-card">
          <CardContent className="divide-y divide-border">
            <Section title={t("settings.general")}>
              <Row label={t("theme.label")} description={t("settings.themeDescription")}>
                <ThemeToggle />
              </Row>
              <Row label={t("settings.language")} description={t("settings.languageDescription")}>
                <LanguageSetting />
              </Row>
              {!isMock ? (
                <div className="flex flex-col gap-3 border-t border-border py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("settings.passkeyUnlock")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("settings.passkeyUnlockDescription")}
                    </p>
                  </div>
                  <PasskeySetting />
                </div>
              ) : null}
              <Row
                label={t("settings.notifications")}
                description={t("settings.notificationsDescription")}
              >
                <NotificationsSetting />
              </Row>
              <Row label={t("settings.ticker")} description={t("settings.tickerDescription")}>
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
                label={t("settings.optimization")}
                description={t("settings.optimizationDescription")}
              >
                <div className="flex w-full flex-col items-end gap-1.5 sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      optimizeWallet.isPending ||
                      optimizationStatus.isLoading ||
                      !optimizationNeeded ||
                      isSyncing ||
                      viewOnly
                    }
                    onClick={handleOptimize}
                    title={viewOnly ? walletCopy.viewOnlyOptimizeDisabled : undefined}
                  >
                    {optimizeWallet.isPending
                      ? t("settings.optimizing")
                      : t("settings.optimizeNow")}
                  </Button>
                  {isSyncing ? (
                    <p className="max-w-xs text-right text-xs text-muted-foreground sm:max-w-sm">
                      {t("settings.optimizeWaitForSync")}
                    </p>
                  ) : viewOnly ? (
                    <p className="max-w-xs text-right text-xs text-muted-foreground sm:max-w-sm">
                      {walletCopy.viewOnlyOptimizeDisabled}
                    </p>
                  ) : optimizationNeeded ? (
                    <p className="max-w-xs text-right text-xs text-amber-400/90 sm:max-w-sm">
                      {t("settings.optimizeAvailable", { count: unspentOutputs })}
                    </p>
                  ) : null}
                </div>
              </Row>
            </Section>

            <Section title={t("wallets.title")}>
              <div className="flex flex-col gap-3 py-4 first:pt-0">
                <p className="text-xs text-muted-foreground">{t("wallets.description")}</p>
                <WalletsSetting />
              </div>
            </Section>

            {current && (
              <Section title={t("settings.node")}>
                <Row
                  label={t("settings.useCustomNode")}
                  description={t("settings.useCustomNodeDescription")}
                >
                  <Switch
                    checked={current.useCustomNode}
                    disabled={updateSettings.isPending}
                    onCheckedChange={handleCustomNodeToggle}
                  />
                </Row>
                <Row
                  label={t("settings.nodeUrl")}
                  description={
                    current.useCustomNode
                      ? t("settings.nodeUrlDescriptionCustom")
                      : t("settings.nodeUrlDescriptionPublic")
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
                      <p className="text-xs text-muted-foreground">
                        {t("settings.testingNodeConnection")}
                      </p>
                    )}
                  </div>
                </Row>
              </Section>
            )}

            {current && (
              <Section title={t("settings.wallet")}>
                <Row
                  label={t("settings.syncSpeed")}
                  description={t("settings.syncSpeedDescription")}
                >
                  <SyncSpeedSelector
                    value={current.syncSpeed}
                    disabled={updateSettings.isPending}
                    onChange={(syncSpeed) => update({ syncSpeed })}
                  />
                </Row>
                <Row
                  label={t("settings.readMinerTx")}
                  description={t("settings.readMinerTxDescription")}
                >
                  <Switch
                    checked={current.readMinorTx}
                    disabled={updateSettings.isPending}
                    onCheckedChange={(checked: boolean) => update({ readMinorTx: checked })}
                  />
                </Row>
                <Row
                  label={t("settings.blockHeights")}
                  description={t("settings.blockHeightsDescription")}
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
                      aria-label={t("settings.creationHeightAriaLabel")}
                      inputMode="numeric"
                    />
                    <Input
                      value={String(syncedHeight)}
                      readOnly
                      disabled
                      className="w-32"
                      aria-label={t("settings.currentSyncedHeightAriaLabel")}
                      inputMode="numeric"
                    />
                  </div>
                </Row>
                <Row
                  label={t("settings.maintenance")}
                  description={t("settings.maintenanceDescription")}
                >
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={updateSettings.isPending}
                      onClick={applyHeights}
                    >
                      {t("settings.update")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={resetAndRescan.isPending}
                      onClick={handleResetAndRescan}
                    >
                      {resetAndRescan.isPending
                        ? t("settings.rescanning")
                        : t("settings.resetAndRescan")}
                    </Button>
                  </div>
                </Row>
                <Row
                  label={t("settings.deviceDataBackup")}
                  description={t("settings.deviceDataBackupDescription")}
                >
                  <VaultBackup />
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
                <Row
                  label="Panic wipe"
                  description="Erases everything local — wallet, settings, custom node, transaction notes — and returns to the open-wallet screen"
                >
                  <PanicWipeDialog isMock={isMock} onConfirm={panicWipe} />
                </Row>
              </Section>
            )}

            {current && (
              <Section title={t("settings.security")}>
                <Row label={t("settings.autoLock")} description={t("settings.autoLockDescription")}>
                  <select
                    className="h-10 w-44 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring"
                    value={String(current.autoLockMinutes)}
                    onChange={(event) =>
                      update(
                        { autoLockMinutes: Number(event.target.value) },
                        isMock ? "Mock auto-lock updated." : "Auto-lock updated.",
                      )
                    }
                    aria-label={t("settings.autoLockTimeoutAriaLabel")}
                  >
                    <option value="0">{t("settings.autoLockOff")}</option>
                    <option value="5">{t("settings.autoLockAfter", { minutes: 5 })}</option>
                    <option value="15">{t("settings.autoLockAfter", { minutes: 15 })}</option>
                    <option value="30">{t("settings.autoLockAfter", { minutes: 30 })}</option>
                  </select>
                </Row>
                <Row label={t("settings.password")} description={t("settings.passwordDescription")}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/wallet/change-password")}
                  >
                    {t("settings.changePassword")}
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
