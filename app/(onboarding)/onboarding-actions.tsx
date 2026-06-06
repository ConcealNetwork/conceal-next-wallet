"use client";

import Link from "next/link";
import { FileKey, KeyRound, QrCode, Upload } from "lucide-react";
import { useState } from "react";
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
import { FilterTabs } from "@/components/wallet/common";
import { WalletPasswordStrengthPanel } from "@/components/wallet/password-strength-bars";
import { services } from "@/lib/services";
import type { ImportWalletInput } from "@/lib/services/wallet.service";
import { useWalletSession } from "@/lib/session/wallet-session";
import {
  MNEMONIC_IMPORT_LANGUAGES,
  type MnemonicImportLanguageKey,
} from "@/lib/ui/mnemonic-import-languages";
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

export function ImportKeysForm() {
  const { openSession } = useWalletSession();
  const [loading, setLoading] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [address, setAddress] = useState("");
  const [privateSpendKey, setPrivateSpendKey] = useState("");
  const [privateViewKey, setPrivateViewKey] = useState("");
  const [importHeight, setImportHeight] = useState("0");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
  const canSubmit = keysValid && passwordsMatch && !loading;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      const input: ImportWalletInput = {
        method: "keys",
        address,
        viewOnly,
        privateViewKey,
        privateSpendKey,
        password,
        scanHeight: normalizeImportHeight(importHeight),
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

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <Label>Wallet type</Label>
        <FilterTabs
          tabs={["Full wallet", "View-only"]}
          active={viewOnly ? "View-only" : "Full wallet"}
          onChange={(tab) => setViewOnly(tab === "View-only")}
        />
        <p className="text-xs text-muted-foreground">
          {viewOnly
            ? "Watch-only: import your address and private view key — see balances, but cannot spend."
            : "Full access: import your private spend key. The view key is optional — derived from the spend key when left blank."}
        </p>
      </div>

      {viewOnly ? (
        <LabeledTextField
          id="import-keys-address"
          label="Address"
          value={address}
          onChange={setAddress}
          placeholder="ccx7…"
          hint="Your 98-character Conceal address (starts with ccx7)."
          invalid={address !== "" && !addressValid}
          error="Enter a valid 98-character ccx7 address."
        />
      ) : (
        <LabeledTextField
          id="import-keys-spend"
          label="Spend key"
          value={privateSpendKey}
          onChange={setPrivateSpendKey}
          placeholder="64-character hex private spend key"
          hint="Your private spend key — 64 hexadecimal characters."
          invalid={privateSpendKey !== "" && !spendKeyValid}
          error="Spend key must be 64 hexadecimal characters."
        />
      )}

      <LabeledTextField
        id="import-keys-view"
        label="View key"
        value={privateViewKey}
        onChange={setPrivateViewKey}
        placeholder="64-character hex private view key"
        hint={
          viewOnly
            ? "Your private view key — 64 hexadecimal characters."
            : "Optional — leave blank to derive it from your spend key."
        }
        invalid={privateViewKey !== "" && !viewKeyValid}
        error="View key must be 64 hexadecimal characters."
      />

      <div className="space-y-2">
        <Label htmlFor="import-keys-height">Import height</Label>
        <Input
          id="import-keys-height"
          value={importHeight}
          onChange={(event) => setImportHeight(sanitizeImportHeightInput(event.target.value))}
          onBlur={() => setImportHeight(String(normalizeImportHeight(importHeight)))}
          className="w-40"
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <p className="text-xs text-muted-foreground">
          Block height to start scanning from. Use one near your wallet's creation for a faster
          sync; 0 scans from the genesis block.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="import-keys-password">Encryption password</Label>
        <Input
          id="import-keys-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Sets a new password that encrypts this wallet on this device — you'll need it to unlock
          after a refresh.
        </p>
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

      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} disabled={!canSubmit} />
    </form>
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
