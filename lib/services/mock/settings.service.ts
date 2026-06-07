import { mockSettings } from "@/lib/mock-data/wallet";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import type { SettingsService } from "@/lib/services/settings.service";
import { validateNodeUrlFormat } from "@/lib/validation/node-url";

let currentSettings = clone(mockSettings);

export const mockSettingsService: SettingsService = {
  async getSettings() {
    await mockDelay();
    return clone(currentSettings);
  },
  async updateSettings(input) {
    await mockDelay();

    if (input.useCustomNode === false) {
      currentSettings = { ...currentSettings, ...input, useCustomNode: false };
      return clone(currentSettings);
    }

    const enablingCustom = input.useCustomNode === true;
    const updatingCustomUrl =
      currentSettings.useCustomNode && typeof input.nodeUrl !== "undefined";

    if (enablingCustom || updatingCustomUrl) {
      const rawUrl = input.nodeUrl ?? currentSettings.nodeUrl;
      const format = validateNodeUrlFormat(rawUrl);
      if (!format.ok) {
        throw new Error(format.errors.join(" "));
      }

      currentSettings = {
        ...currentSettings,
        ...input,
        useCustomNode: true,
        nodeUrl: format.normalized,
      };
      return clone(currentSettings);
    }

    currentSettings = { ...currentSettings, ...input };
    return clone(currentSettings);
  },
  async optimizeWallet() {
    await mockDelay();
    return { ok: true };
  },
  async resetAndRescan() {
    await mockDelay();
    return { ok: true };
  },
};
