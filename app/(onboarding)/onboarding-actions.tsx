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
import { services } from "@/lib/services";
import type { ImportWalletInput } from "@/lib/services/wallet.service";
import { useWalletSession } from "@/lib/session/wallet-session";
import {
  MNEMONIC_IMPORT_LANGUAGES,
  type MnemonicImportLanguageKey,
} from "@/lib/ui/mnemonic-import-languages";
import { importFieldsRequired, walletCopy } from "@/lib/ui/wallet-copy";

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

function ImportSubmitButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <Button type="submit" className="w-full" disabled={loading}>
      {loading ? "Importing…" : label}
    </Button>
  );
}

export function ImportKeysForm() {
  const { openSession } = useWalletSession();
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [viewOnly, setViewOnly] = useState(false);
  const [privateViewKey, setPrivateViewKey] = useState("");
  const [privateSpendKey, setPrivateSpendKey] = useState("");
  const [importHeight, setImportHeight] = useState("0");
  const [password, setPassword] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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

  // Field visibility mirrors how importWalletOperation reads the input:
  // - view-only: the address is the only key source (Cn.decode_address) + the private view key.
  // - full:      the private spend key is required; the view key is optional (derived from it),
  //              and the address is ignored (derived from the keys), so it is hidden.
  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={viewOnly} onChange={(e) => setViewOnly(e.target.checked)} />
        View-only wallet
      </label>
      {viewOnly ? (
        <div className="space-y-2">
          <Label htmlFor="import-keys-address">Address</Label>
          <Input
            id="import-keys-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required={importFieldsRequired}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="import-keys-spend">Spend key</Label>
          <Input
            id="import-keys-spend"
            value={privateSpendKey}
            onChange={(e) => setPrivateSpendKey(e.target.value)}
            required={importFieldsRequired}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="import-keys-view">View key</Label>
        <Input
          id="import-keys-view"
          value={privateViewKey}
          onChange={(e) => setPrivateViewKey(e.target.value)}
          required={viewOnly && importFieldsRequired}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="import-keys-height">Import height</Label>
        <Input
          id="import-keys-height"
          value={importHeight}
          onChange={(e) => setImportHeight(sanitizeImportHeightInput(e.target.value))}
          onBlur={() => setImportHeight(String(normalizeImportHeight(importHeight)))}
          className="w-32"
          inputMode="numeric"
          pattern="[0-9]*"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="import-keys-password">Encryption password</Label>
        <Input
          id="import-keys-password"
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
