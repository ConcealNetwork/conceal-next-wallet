import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type { MessageService } from "@/lib/services/message.service";
import type { Message } from "@/lib/types";

async function messageOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/wallet-operations");
}

export const realMessageService: MessageService = {
  async listMessages(): Promise<Message[]> {
    return (await messageOps()).listMessagesOperation();
  },
  async sendMessage(input) {
    return (await messageOps()).sendMessageOperation(input);
  },
  async markRead(id) {
    return (await messageOps()).markMessageReadOperation(id);
  },
};
