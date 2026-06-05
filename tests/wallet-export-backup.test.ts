import { describe, expect, it } from "vitest";
import { formatWalletBackupMarkdown } from "@/lib/ui/wallet-export-backup";

describe("formatWalletBackupMarkdown", () => {
  it("formats mnemonic and keys as markdown sections", () => {
    const markdown = formatWalletBackupMarkdown({
      mnemonic: "word one word two",
      viewKey: "view-secret",
      spendKey: "spend-secret",
    });

    expect(markdown).toContain("# CONCEAL WALLET");
    expect(markdown).toContain("## mnemonic phrase");
    expect(markdown).toContain("word one word two");
    expect(markdown).toContain("## View Key");
    expect(markdown).toContain("view-secret");
    expect(markdown).toContain("## SpendKey");
    expect(markdown).toContain("spend-secret");
  });
});
