import { ExternalLink, LifeBuoy, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard } from "@/components/wallet/common";

const supportChannels = [
  {
    icon: LifeBuoy,
    title: "Official Support Center",
    description: "Visit our official Support Center to submit a ticket for wallet issues.",
    href: "https://conceal.network/support/",
    cta: "Open a ticket",
  },
  {
    icon: MessageCircle,
    title: "Conceal Discord Community",
    description: "Ask questions and get help from other community members.",
    href: "https://discord.conceal.network",
    cta: "Join Discord",
  },
] as const;

export function SupportContent() {
  return (
    <>
      <PageHeader title="Support" subtitle="We are here to help!" />

      <div className="animate-rise-in space-y-6 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <SectionCard
          title="Let's Get In Touch!"
          description="If you have any problems with your wallet, contact us!"
        >
          <div className="space-y-4">
            {supportChannels.map((channel) => (
              <div
                key={channel.href}
                className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/40 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <channel.icon className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">{channel.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{channel.description}</p>
                  </div>
                </div>
                <Button asChild className="w-full shrink-0 gap-2 sm:w-auto">
                  <a href={channel.href} target="_blank" rel="noopener noreferrer">
                    {channel.cta}
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
