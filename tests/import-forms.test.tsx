import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture what each form hands to the engine, and stub the session redirect.
const importWallet = vi.fn();
const openSession = vi.fn();
const decodeQrFromFile = vi.fn();

vi.mock("@/lib/services", () => ({
  services: {
    wallet: {
      importWallet: (input: unknown) => importWallet(input),
    },
  },
}));
vi.mock("@/lib/session/wallet-session", () => ({
  useWalletSession: () => ({ openSession }),
}));
// createImageBitmap/canvas aren't available in jsdom, so stub the decode util
// and assert the file-upload path wires its result into the payload.
vi.mock("@/lib/ui/qr-decode", () => ({
  decodeQrFromFile: (file: File) => decodeQrFromFile(file),
  decodeQrFromImageData: vi.fn(),
}));

import {
  ImportFileForm,
  ImportMnemonicForm,
  ImportQrForm,
} from "@/app/(onboarding)/onboarding-actions";
import { walletCopy } from "@/lib/ui/wallet-copy";

const PASSWORD = "ConcealTest1!";
const MNEMONIC = Array.from({ length: 25 }, (_, i) => `word${i}`).join(" ");

const submit = () => screen.getByRole("button", { name: walletCopy.importWallet });

describe("import forms", () => {
  // setup.ts doesn't register RTL auto-cleanup, so isolate renders explicitly.
  afterEach(cleanup);

  beforeEach(() => {
    importWallet.mockReset().mockResolvedValue({ address: "ccx7test", balance: { atomic: 0 } });
    openSession.mockReset();
    decodeQrFromFile.mockReset();
  });

  describe("ImportMnemonicForm", () => {
    it("keeps submit disabled until a 12+ word phrase and matching passwords", () => {
      render(<ImportMnemonicForm />);
      expect(submit()).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Recovery phrase"), {
        target: { value: "too few words" },
      });
      fireEvent.change(screen.getByLabelText("Encryption password"), {
        target: { value: PASSWORD },
      });
      fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: PASSWORD } });
      expect(submit()).toBeDisabled(); // only 3 words
      fireEvent.change(screen.getByLabelText("Recovery phrase"), { target: { value: MNEMONIC } });
      expect(submit()).toBeEnabled();
    });

    it("flags mismatched passwords and blocks submit", () => {
      render(<ImportMnemonicForm />);
      fireEvent.change(screen.getByLabelText("Recovery phrase"), { target: { value: MNEMONIC } });
      fireEvent.change(screen.getByLabelText("Encryption password"), {
        target: { value: PASSWORD },
      });
      fireEvent.change(screen.getByLabelText("Confirm password"), {
        target: { value: "different" },
      });
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
      expect(submit()).toBeDisabled();
    });

    it("submits a trimmed mnemonic with the chosen language and scan height", async () => {
      render(<ImportMnemonicForm />);
      fireEvent.change(screen.getByLabelText("Recovery phrase"), {
        target: { value: `  ${MNEMONIC}  ` },
      });
      fireEvent.change(screen.getByLabelText("Encryption password"), {
        target: { value: PASSWORD },
      });
      fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: PASSWORD } });
      fireEvent.click(submit());
      await waitFor(() => expect(importWallet).toHaveBeenCalledTimes(1));
      expect(importWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "mnemonic",
          mnemonic: MNEMONIC,
          language: "auto",
          scanHeight: 0,
        }),
      );
    });
  });

  describe("ImportQrForm", () => {
    it("keeps submit disabled until a payload is present, then imports via qr", async () => {
      render(<ImportQrForm />);
      expect(submit()).toBeDisabled();
      fireEvent.change(screen.getByLabelText("QR payload"), {
        target: { value: `conceal.ccx7${"a".repeat(94)}?spend_key=${"b".repeat(64)}` },
      });
      fireEvent.change(screen.getByLabelText("Encryption password"), {
        target: { value: PASSWORD },
      });
      expect(submit()).toBeEnabled();
      fireEvent.click(submit());
      await waitFor(() => expect(importWallet).toHaveBeenCalledTimes(1));
      expect(importWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "qr",
          payload: `conceal.ccx7${"a".repeat(94)}?spend_key=${"b".repeat(64)}`,
        }),
      );
    });

    it("decodes an uploaded QR image into the payload", async () => {
      decodeQrFromFile.mockResolvedValue(`conceal.ccx7${"c".repeat(94)}?spend_key=${"d".repeat(64)}`);
      render(<ImportQrForm />);
      const file = new File([new Uint8Array([1, 2, 3])], "wallet-qr.png", { type: "image/png" });
      fireEvent.change(screen.getByLabelText("Or upload a QR image"), {
        target: { files: [file] },
      });
      await waitFor(() =>
        expect(screen.getByLabelText("QR payload")).toHaveValue(
          `conceal.ccx7${"c".repeat(94)}?spend_key=${"d".repeat(64)}`,
        ),
      );
      expect(decodeQrFromFile).toHaveBeenCalledTimes(1);
      expect(submit()).toBeEnabled();
    });
  });

  describe("ImportFileForm", () => {
    it("keeps submit disabled until a valid JSON file is selected", async () => {
      render(<ImportFileForm />);
      expect(submit()).toBeDisabled();
      const file = new File(['{"version":1}'], "wallet.json", { type: "application/json" });
      fireEvent.change(screen.getByLabelText("JSON backup file"), { target: { files: [file] } });
      await waitFor(() => expect(screen.getByText(/Selected: wallet\.json/)).toBeInTheDocument());
      expect(submit()).toBeEnabled();
    });
  });
});
