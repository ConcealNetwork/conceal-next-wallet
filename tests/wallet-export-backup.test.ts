import { describe, expect, it } from "vitest";
import { formatWalletBackupMarkdown } from "@/lib/ui/wallet-export-backup";

describe("formatWalletBackupMarkdown", () => {
  it("formats mnemonic and keys as markdown sections", () => {
    const markdown = formatWalletBackupMarkdown({
      address: "ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m".padEnd(
        98,
        "0",
      ),
      mnemonic: "word one word two",
      viewKey: "view-secret",
      spendKey: "spend-secret",
      creationHeight: 100,
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
