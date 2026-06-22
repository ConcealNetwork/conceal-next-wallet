"use client";

import { ChevronDown, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_DAEMON_NODES } from "@/lib/config/config";
import { getPreferredNode, readAutoNode, setPreferredNode } from "@/lib/network/node-preference";
import { fetchSmartNodes, nodeUrlToPoolHost } from "@/lib/network/smart-nodes";
import type { SmartNode } from "@/lib/types";

/** Human label for a node URL (host without scheme/path). */
function nodeLabel(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/\/daemon\/?$/i, "")
    .replace(/\/$/, "");
}

type Choice = { url: string | null; label: string; group: "Official" | "Community" };

/**
 * Device-local node picker for the wallet-open screen. Lets a user choose which daemon to sync from
 * — an official node or a community "smart" node — BEFORE unlocking. The choice persists
 * ({@link setPreferredNode}, localStorage) so it's remembered next time, and the runtime honors it
 * on open (see `nodeUrlFromRaw`). Collapsed by default so it never gets in the way of just unlocking.
 */
export function UnlockNodePicker() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => getPreferredNode());
  const [autoNode, setAutoNodeHint] = useState<string | null>(() => readAutoNode());
  const [smartNodes, setSmartNodes] = useState<SmartNode[]>([]);
  const [smartLoading, setSmartLoading] = useState(false);

  // The fastest-node probe runs on the open screen mount and may still be in flight when the picker
  // is expanded. Poll its cached result while open so the "Automatic · <host>" label goes live the
  // moment the probe lands (a cheap sessionStorage read), then stops when collapsed.
  useEffect(() => {
    if (!open) return;
    setAutoNodeHint(readAutoNode());
    const id = setInterval(() => setAutoNodeHint(readAutoNode()), 1500);
    return () => clearInterval(id);
  }, [open]);

  // Fetch the community pool LAZILY — only when the picker is expanded — so just opening a wallet
  // never makes a network call. Pool unavailable → silently show official nodes only.
  useEffect(() => {
    if (!open || smartNodes.length > 0) return;
    let cancelled = false;
    setSmartLoading(true);
    fetchSmartNodes(selected ?? DEFAULT_DAEMON_NODES[0])
      .then((nodes) => {
        if (!cancelled) setSmartNodes(nodes);
      })
      .catch(() => {
        /* pool unreachable — official nodes still available */
      })
      .finally(() => {
        if (!cancelled) setSmartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selected, smartNodes.length]);

  // `null` = "Automatic" → the wallet probes and uses the FASTEST healthy node (see auto-node.ts);
  // the explicit official/community rows below PIN one node, remembered across sessions.
  const officialChoices: Choice[] = [
    { url: null, label: "Automatic (fastest node)", group: "Official" },
    ...DEFAULT_DAEMON_NODES.map(
      (url): Choice => ({ url, label: nodeLabel(url), group: "Official" }),
    ),
  ];
  const officialHosts = new Set(DEFAULT_DAEMON_NODES.map((u) => nodeUrlToPoolHost(u)));
  const smartChoices: Choice[] = smartNodes
    .filter((node) => !officialHosts.has(nodeUrlToPoolHost(node.url)))
    .map(
      (node): Choice => ({
        url: node.url,
        label: node.name || nodeLabel(node.url),
        group: "Community",
      }),
    );

  const allChoices = [...officialChoices, ...smartChoices];
  // Collapsed header: a pinned node shows its label; "Automatic" shows the resolved fastest host
  // once probed (transparency), else just "Automatic (fastest node)".
  const currentLabel = selected
    ? (allChoices.find((c) => c.url === selected)?.label ?? nodeLabel(selected))
    : autoNode
      ? `Automatic · ${nodeLabel(autoNode)}`
      : "Automatic (fastest node)";

  const pick = (url: string | null) => {
    setSelected(url);
    setPreferredNode(url);
    setOpen(false);
  };

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <Server className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Connect via node</span>
          <span className="block truncate text-foreground">{currentLabel}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="max-h-48 overflow-auto border-t border-border p-1">
          {(["Official", "Community"] as const).map((group) => {
            const groupChoices = allChoices.filter((c) => c.group === group);
            if (groupChoices.length === 0) return null;
            return (
              <div key={group} className="py-1">
                <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                  {group === "Community" && smartLoading ? " (loading…)" : ""}
                </div>
                {groupChoices.map((choice) => (
                  <button
                    key={choice.url ?? "default"}
                    type="button"
                    onClick={() => pick(choice.url)}
                    className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      choice.url === selected
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            );
          })}
          <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-muted-foreground">
            Automatic briefly contacts community nodes to find the fastest. Pick one above to pin
            it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
