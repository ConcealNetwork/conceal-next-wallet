import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import { assertRealWalletCanSpend } from "@/lib/services/real/view-only-runtime";
import type { MessageService } from "@/lib/services/message.service";
import type { Message } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

async function messageOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/wallet-operations");
}

export const realMessageService: MessageService = {
  async listMessages(): Promise<Message[]> {
    return (await messageOps()).listMessagesOperation();
  },
  async sendMessage(input) {
    await assertRealWalletCanSpend(walletCopy.viewOnlyMessageDisabled);
    return (await messageOps()).sendMessageOperation(input);
  },
  async markRead(id) {
    return (await messageOps()).markMessageReadOperation(id);
  },
};
