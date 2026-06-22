"use client";

import {
  Bell,
  Check,
  Database,
  Eye,
  Gauge,
  KeyRound,
  Lock,
  type LucideIcon,
  Palette,
  Server,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { RailSectionHeading, RailStatRow } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
import { hasPasskeyEnrollment } from "@/lib/auth/biometric-store";
import { useWalletSettings, useWalletSyncStatus } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { getPermission, isOptedIn } from "@/lib/notifications/notify";
import { isWatchOtherWalletsEnabled } from "@/lib/notifications/watch-wallets";
import { SYNC_SPEED_LABELS } from "@/lib/ui/sync-speed";
import { cn } from "@/lib/utils";

// The Settings-page contextual rail (#122 pattern). Summarizes STATE — sync, node, the active DOOM
// sync-speed level, and a security-posture checklist — plus a jump-to-section nav; the body holds the
// CONTROLS. `embedded` drops the panel header for the <1200px body fallback. Curated from the Opus
// design variant (see docs/design/settings-redesign/DESIGN-DECISIONS.md).

/** Host of a node URL (no scheme/path), for a compact rail label. */
function nodeHost(url: string | undefined): string {
  if (!url) return "—";
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/\/daemon\/?$/i, "")
    .replace(/\/$/, "");
}

type PostureTone = "ok" | "warn";

function PostureRow({
  icon: Icon,
  label,
  value,
  tone,
  first = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: PostureTone;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2.5",
        !first && "border-t border-border/70",
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[12px]">
        <span className="text-muted-foreground">{value}</span>
        {tone === "ok" ? (
          <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
        ) : (
          <TriangleAlert className="size-3.5 text-amber-500" aria-hidden="true" />
        )}
      </span>
    </div>
  );
}

const JUMP_SECTIONS = [
  { id: "settings-appearance", key: "settings.cardAppearance", icon: Palette },
  { id: "settings-security", key: "settings.cardSecurity", icon: ShieldCheck },
  { id: "settings-node", key: "settings.cardNode", icon: Server },
  { id: "settings-sync", key: "settings.cardSync", icon: Gauge },
  { id: "settings-wallets", key: "settings.cardWallets", icon: Wallet },
  { id: "settings-backup", key: "settings.cardBackup", icon: Database },
  { id: "settings-danger", key: "settings.cardDanger", icon: TriangleAlert },
] as const;

export function SettingsRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { info, isSyncing, syncPct } = useWalletSyncStatus();
  const { data: settings } = useWalletSettings();

  // Client-only posture reads (localStorage / async active id) — hydrate on mount to stay SSR-safe.
  const [passkey, setPasskey] = useState(false);
  const [notify, setNotify] = useState(false);
  const [watch, setWatch] = useState(false);
  useEffect(() => {
    let active = true;
    getActiveWalletId()
      .then((id) => active && setPasskey(hasPasskeyEnrollment(id)))
      .catch(() => {});
    setNotify(isOptedIn() && getPermission() === "granted");
    setWatch(isWatchOtherWalletsEnabled());
    return () => {
      active = false;
    };
  }, []);

  const autoLock = settings?.autoLockMinutes ?? 0;
  const level = settings ? SYNC_SPEED_LABELS[settings.syncSpeed] : "—";

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.settings")} />}

      <RailSectionHeading icon={Wallet} first>
        {t("settings.railStatus")}
      </RailSectionHeading>
      <RailStatRow
        label={t("settings.railSync")}
        value={isSyncing ? `${syncPct}%` : t("settings.railSynced")}
        sub={
          info
            ? `${info.currentHeight.toLocaleString()} / ${info.networkHeight.toLocaleString()}`
            : undefined
        }
        first
      />
      <RailStatRow label={t("settings.railNode")} value={nodeHost(settings?.nodeUrl)} />
      <RailStatRow label={t("settings.railSyncSpeed")} value={level} />

      <RailSectionHeading icon={Lock}>{t("settings.railPosture")}</RailSectionHeading>
      <div className="px-1">
        <PostureRow
          icon={KeyRound}
          label={t("settings.passkeyUnlock")}
          value={passkey ? t("settings.postureOn") : t("settings.postureOff")}
          tone={passkey ? "ok" : "warn"}
          first
        />
        <PostureRow
          icon={Lock}
          label={t("settings.autoLock")}
          value={
            autoLock > 0 ? t("settings.postureMinutes", { n: autoLock }) : t("settings.postureOff")
          }
          tone={autoLock > 0 ? "ok" : "warn"}
        />
        <PostureRow
          icon={Bell}
          label={t("settings.notifications")}
          value={notify ? t("settings.postureOn") : t("settings.postureOff")}
          tone={notify ? "ok" : "warn"}
        />
        <PostureRow
          icon={Eye}
          label={t("settings.watchWallets")}
          value={watch ? t("settings.postureOn") : t("settings.postureOff")}
          tone={watch ? "ok" : "warn"}
        />
      </div>

      <RailSectionHeading icon={Gauge}>{t("settings.railJump")}</RailSectionHeading>
      <nav className="flex flex-col">
        {JUMP_SECTIONS.map(({ id, key, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Icon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            {t(key)}
          </a>
        ))}
      </nav>
    </div>
  );
}
