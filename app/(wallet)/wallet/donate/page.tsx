import { DonatePageClient } from "@/app/(wallet)/wallet/donate/donate-page-client";
import { getDonationConfig } from "@/lib/donation-config";

export default function DonatePage() {
  return <DonatePageClient {...getDonationConfig()} />;
}
