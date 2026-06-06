"use client";

import Link from "next/link";
import { FileKey, KeyRound, QrCode, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WalletPasswordStrengthPanel } from "@/components/wallet/password-strength-bars";
import { services } from "@/lib/services";
import type { ImportWalletInput } from "@/lib/services/wallet.service";
import { useWalletSession } from "@/lib/session/wallet-session";
import {
  MNEMONIC_IMPORT_LANGUAGES,
  type MnemonicImportLanguageKey,
} from "@/lib/ui/mnemonic-import-languages";
import {
  describeScanHeight,
  estimateScanHeight,
  IMPORT_HEIGHT_PRESETS,
  type ImportHeightPreset,
} from "@/lib/ui/import-height-presets";
import { importFieldsRequired, walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";
import { addressIsValid, privateKeyIsValid } from "@/lib/validation/ccx";

const importMethods = [
  {
    href: "/import/mnemonic",
    label: "Mnemonic",
    icon: FileKey,
    description: "Restore from 25-word seed phrase.",
  },
  {
    href: "/import/keys",
    label: "Keys",
    icon: KeyRound,
    description: "Import spend and view keys.",
  },
  {
    href: "/import/file",
    label: "File",
    icon: Upload,
    description: "Open an encrypted JSON backup.",
  },
  {
    href: "/import/qr",
    label: "QR",
    icon: QrCode,
    description: "Import from a wallet QR payload.",
  },
];

export function ImportMethodCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {importMethods.map((method) => {
        const Icon = method.icon;
        return (
          <Link
            key={method.href}
            href={method.href}
            className="block cursor-pointer rounded-xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="wallet-card h-full transition-colors duration-200 hover:border-ring">
              <CardContent className="flex h-full items-start gap-4">
                <div className="rounded-xl bg-primary p-3 text-primary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">{method.label}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{method.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function ImportSubmitButton({
  label,
  loading,
  disabled = false,
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <Button type="submit" className="w-full" disabled={loading || disabled}>
      {loading ? "Importing…" : label}
    </Button>
  );
}

/** Labelled text input with help text that flips to an inline error when invalid. */
function LabeledTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  invalid = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  invalid?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(invalid && "border-wallet-outgoing")}
      />
      {invalid && error ? (
        <p className="text-sm text-wallet-outgoing">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const WIZARD_STEPS = ["Type", "Keys", "History", "Secure"] as const;

function WizardRail({ step }: { step: number }) {
  return (
    <ol className="flex items-center" aria-label={`Step ${step} of ${WIZARD_STEPS.length}`}>
      {WIZARD_STEPS.map((label, index) => {
        const n = index + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border font-mono text-[11px] font-medium",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary text-primary",
                !done && !current && "border-border text-muted-foreground",
              )}
            >
              {done ? "✓" : n}
            </span>
            <span
              className={cn(
                "ml-1.5 hidden text-xs sm:inline",
                current ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {n < WIZARD_STEPS.length && (
              <span className={cn("mx-2 h-px w-5", done ? "bg-primary" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full cursor-pointer rounded-xl border p-4 text-left transition-colors duration-200",
        selected ? "border-primary bg-primary/10" : "border-border hover:border-ring",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <span
          className={cn(
            "size-4 shrink-0 rounded-full border",
            selected ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--color-card)]" : "border-border",
          )}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function StepHeader({ step, title, children }: { step: number; title: string; children: string }) {
  return (
    <div>
      <p className="font-mono text-xs text-muted-foreground">
        Step {step} of {WIZARD_STEPS.length}
      </p>
      <h2 className="mt-0.5 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function ImportKeysForm() {
  const { openSession } = useWalletSession();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [address, setAddress] = useState("");
  const [privateSpendKey, setPrivateSpendKey] = useState("");
  const [privateViewKey, setPrivateViewKey] = useState("");
  const [heightPreset, setHeightPreset] = useState<ImportHeightPreset>("unsure");
  const [showAdvancedHeight, setShowAdvancedHeight] = useState(false);
  const [exactHeight, setExactHeight] = useState("0");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [chainTip, setChainTip] = useState<number | null>(null);
  const [tipStatus, setTipStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Fetch the live chain tip the first time the History step opens, so the
  // height estimate anchors on the real network height instead of the baked-in
  // reference. Falls back to the offline estimate if the network is unreachable.
  useEffect(() => {
    // Guard on the data (chainTip), not the transient status: under StrictMode's
    // double-mount the first run's cleanup cancels its fetch, so the second run
    // must still be allowed to fetch (a status-based guard would dead-lock it).
    if (step !== 3 || chainTip !== null) return;
    let cancelled = false;
    setTipStatus("loading");
    services.network
      .getNodeStatus()
      .then((status) => {
        if (cancelled) return;
        setChainTip(status.networkHeight);
        setTipStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setTipStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [step, chainTip]);

  const spendKeyValid = privateKeyIsValid(privateSpendKey);
  const viewKeyValid = privateKeyIsValid(privateViewKey);
  const addressValid = addressIsValid(address);
  const passwordsMatch = password !== "" && password === confirmPassword;

  // Validity mirrors how importWalletOperation reads the input:
  // view-only → address + private view key; full → spend key (view key optional,
  // derived from the spend key when blank).
  const keysValid = viewOnly
    ? addressValid && viewKeyValid
    : spendKeyValid && (privateViewKey.trim() === "" || viewKeyValid);
  const scanHeight = showAdvancedHeight
    ? normalizeImportHeight(exactHeight)
    : estimateScanHeight(heightPreset, undefined, chainTip);

  // Step 1 (type) and step 3 (history) always have a valid default selection.
  const stepCanAdvance = [true, keysValid, true, passwordsMatch && !loading][step - 1];

  function goBack() {
    setStep((value) => Math.max(1, value - 1));
  }
  function goNext() {
    if (stepCanAdvance && step < WIZARD_STEPS.length) setStep((value) => value + 1);
  }

  async function submit() {
    if (!keysValid || !passwordsMatch || loading) return;

    setLoading(true);
    try {
      const input: ImportWalletInput = {
        method: "keys",
        address,
        viewOnly,
        privateViewKey,
        privateSpendKey,
        password,
        scanHeight,
      };
      const wallet = await services.wallet.importWallet(input);
      openSession(wallet, "/wallet/account");
      toast.success("Wallet imported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  const heightInfo = describeScanHeight(heightPreset, undefined, chainTip);

  return (
    <div className="space-y-6">
      <WizardRail step={step} />

      {step === 1 && (
        <div className="space-y-3">
          <StepHeader step={1} title="What are you importing?">
            Pick the option that matches what you have.
          </StepHeader>
          <ChoiceCard
            selected={!viewOnly}
            onSelect={() => setViewOnly(false)}
            title="Full wallet"
            description="You have the secret spend key. You'll be able to send and receive."
          />
          <ChoiceCard
            selected={viewOnly}
            onSelect={() => setViewOnly(true)}
            title="View-only"
            description="Just watch the balance — you can't spend. Good for a phone or backup device."
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <StepHeader step={2} title="Enter your keys">
            A key is a long code — 64 letters and numbers. Paste it exactly, and never share your
            spend key.
          </StepHeader>
          {viewOnly ? (
            <LabeledTextField
              id="import-keys-address"
              label="Address"
              value={address}
              onChange={setAddress}
              placeholder="ccx7…"
              hint="Your public address — starts with ccx7."
              invalid={address !== "" && !addressValid}
              error="Enter a valid 98-character ccx7 address."
            />
          ) : (
            <LabeledTextField
              id="import-keys-spend"
              label="Spend key"
              value={privateSpendKey}
              onChange={setPrivateSpendKey}
              placeholder="64-character hex spend key"
              hint="The secret that controls your funds — 64 hexadecimal characters."
              invalid={privateSpendKey !== "" && !spendKeyValid}
              error="Spend key must be 64 hexadecimal characters."
            />
          )}
          <LabeledTextField
            id="import-keys-view"
            label="View key"
            value={privateViewKey}
            onChange={setPrivateViewKey}
            placeholder={viewOnly ? "64-character hex view key" : "Leave blank if unsure"}
            hint={
              viewOnly
                ? "Your private view key — 64 hexadecimal characters."
                : "Optional — we'll work it out from your spend key."
            }
            invalid={privateViewKey !== "" && !viewKeyValid}
            error="View key must be 64 hexadecimal characters."
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <StepHeader step={3} title="When did you first use this wallet?">
            This tells us how far back to look for past transactions — it doesn't change your
            balance. Not sure? Pick “Not sure”.
          </StepHeader>
          <div className="flex flex-wrap gap-2">
            {IMPORT_HEIGHT_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setHeightPreset(preset.key);
                  setShowAdvancedHeight(false);
                }}
                className={cn(
                  "min-h-9 cursor-pointer rounded-full border px-4 text-sm transition-colors duration-200",
                  !showAdvancedHeight && heightPreset === preset.key
                    ? "border-primary bg-primary font-medium text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-ring hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {showAdvancedHeight ? (
            <div className="space-y-2">
              <Label htmlFor="import-keys-height">Exact block height</Label>
              <Input
                id="import-keys-height"
                value={exactHeight}
                onChange={(event) => setExactHeight(sanitizeImportHeightInput(event.target.value))}
                onBlur={() => setExactHeight(String(normalizeImportHeight(exactHeight)))}
                className="w-40"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <p className="text-xs text-muted-foreground">
                Scanning starts a few blocks before this, to be safe.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-[hsl(var(--chrome))] p-3">
              {heightPreset !== "unsure" && tipStatus === "loading" ? (
                <p className="text-sm text-muted-foreground">Checking the latest network height…</p>
              ) : (
                <>
                  <p className="text-sm">{heightInfo.text}</p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {heightInfo.range}
                    {heightPreset !== "unsure" && tipStatus === "error"
                      ? " · estimated (offline)"
                      : ""}
                  </p>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAdvancedHeight((value) => !value)}
            className="cursor-pointer text-xs text-primary underline underline-offset-4"
          >
            {showAdvancedHeight
              ? "Use the simple options instead"
              : "Advanced: enter an exact block height"}
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <StepHeader step={4} title="Create a device password">
            This locks the wallet in this browser — you'll type it each time you open it. It's brand
            new, not your old wallet's password.
          </StepHeader>
          <div className="space-y-2">
            <Label htmlFor="import-keys-password">Password</Label>
            <Input
              id="import-keys-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <WalletPasswordStrengthPanel password={password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-keys-confirm">Confirm password</Label>
            <Input
              id="import-keys-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
            {confirmPassword !== "" && !passwordsMatch && (
              <p className="text-sm text-wallet-outgoing">Passwords do not match.</p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            className="w-2/5"
            onClick={goBack}
            disabled={loading}
          >
            Back
          </Button>
        )}
        {step < WIZARD_STEPS.length ? (
          <Button type="button" className="flex-1" onClick={goNext} disabled={!stepCanAdvance}>
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            className="flex-1"
            onClick={submit}
            disabled={!keysValid || !passwordsMatch || loading}
          >
            {loading ? "Importing…" : walletCopy.importWallet}
          </Button>
        )}
      </div>
    </div>
  );
}

function sanitizeImportHeightInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return "";
  const parsed = parseInt(digits, 10);
  return Number.isNaN(parsed) ? "" : String(parsed);
}

function normalizeImportHeight(value: string): number {
  const parsed = parseInt(value.replace(/\D/g, ""), 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

export function ImportMnemonicForm() {
  const { openSession } = useWalletSession();
  const [loading, setLoading] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [password, setPassword] = useState("");
  const [importHeight, setImportHeight] = useState("0");
  const [language, setLanguage] = useState<MnemonicImportLanguageKey>("auto");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const wallet = await services.wallet.importWallet({
        method: "mnemonic",
        mnemonic,
        password,
        language,
        scanHeight: normalizeImportHeight(importHeight),
      });
      openSession(wallet, "/wallet/account");
      toast.success("Wallet imported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>Mnemonic</Label>
        <Input
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          required={importFieldsRequired}
        />
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <Label htmlFor="import-height" className="col-start-1 row-start-1">
          Import height
        </Label>
        <Label htmlFor="mnemonic-language" className="col-start-2 row-start-1">
          Language
        </Label>
        <Input
          id="import-height"
          value={importHeight}
          onChange={(e) => setImportHeight(sanitizeImportHeightInput(e.target.value))}
          onBlur={() => setImportHeight(String(normalizeImportHeight(importHeight)))}
          className="col-start-1 row-start-2 w-32"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Import height"
        />
        <div className="col-start-2 row-start-2 min-w-0">
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as MnemonicImportLanguageKey)}
          >
            <SelectTrigger id="mnemonic-language" aria-label="Mnemonic language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MNEMONIC_IMPORT_LANGUAGES.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Encryption password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  );
}

export function ImportFileForm() {
  const { openSession } = useWalletSession();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("");

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) {
      setFile(null);
      setFileName("");
      return;
    }

    try {
      const buffer = await selected.arrayBuffer();
      const text = new TextDecoder()
        .decode(buffer)
        .replace(/^\uFEFF/, "")
        .trim();
      JSON.parse(text);
      setFile(buffer);
      setFileName(selected.name);
    } catch {
      event.target.value = "";
      setFile(null);
      setFileName("");
      toast.error("The selected file is not valid JSON.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      toast.error("Select a wallet backup file first.");
      return;
    }
    setLoading(true);
    try {
      const wallet = await services.wallet.importWallet({ method: "file", file, password });
      openSession(wallet, "/wallet/account");
      toast.success("Wallet imported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="wallet-backup-file">JSON backup file</Label>
        <Input
          id="wallet-backup-file"
          type="file"
          accept=".json,application/json"
          onChange={handleFileSelect}
          required={importFieldsRequired}
        />
        {fileName ? <p className="text-sm text-muted-foreground">Selected: {fileName}</p> : null}
      </div>
      <div className="space-y-2">
        <Label>File password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  );
}

export function ImportQrForm() {
  const { openSession } = useWalletSession();
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const wallet = await services.wallet.importWallet({ method: "qr", payload, password });
      openSession(wallet, "/wallet/account");
      toast.success("Wallet imported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>QR payload</Label>
        <Input
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          required={importFieldsRequired}
        />
      </div>
      <div className="space-y-2">
        <Label>Encryption password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  );
}
