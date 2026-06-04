"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { env } from "@/lib/env";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { resetMessageNavBadge } from "@/lib/ui/message-nav-badge";

export function OpenWalletForm() {
  const { openSession } = useWalletSession();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [storedWallet, setStoredWallet] = useState(false);

  useEffect(() => {
    void services.wallet.hasStoredWallet().then(setStoredWallet);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const wallet = await services.wallet.openWallet({ password });
      openSession(wallet, "/wallet/account");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open wallet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mx-auto mt-6 flex max-w-sm flex-col gap-3" onSubmit={submit}>
      {storedWallet && (
        <p className="text-center text-sm text-muted-foreground">
          Encrypted wallet found on this device. Enter your password to unlock and sync with the
          blockchain.
        </p>
      )}
      {env.useMockWallet ? null : (
        <div className="space-y-2">
          <Label htmlFor="open-password">Wallet password</Label>
          <Input
            id="open-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Opening…" : "Open Wallet"}
      </Button>
    </form>
  );
}

export function useWalletDisconnect() {
  const { closeSession } = useWalletSession();

  return function disconnect() {
    void services.wallet.disconnect?.();
    resetMessageNavBadge();
    closeSession();
  };
}
