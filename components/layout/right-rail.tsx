"use client";

import { PanelRightClose } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// Issue #122, stage 2 — the contextual right rail. Each page owns its rail
// content: a page calls `usePageRightRail(<AccountRail />)` and the shell
// renders that node in a third column (≥ xl). Below xl the rail is hidden for
// now (stage 3 turns it into a drawer). The collapse pin in the panel header
// shrinks the column to a narrow expand strip.
//
// The registered node is held in provider state so the SHELL can read it. The
// page-side hook registers on mount and clears on unmount; it keeps the latest
// node in a ref so a fresh JSX element on each parent render doesn't ping-pong
// `setContent` and re-render the subtree in a loop. The rail content stays live
// via its own hooks (market/wallet queries), so a single mount-time register is
// sufficient — there's no need to re-register on every render.

type RightRailContextValue = {
  content: React.ReactNode;
  collapsed: boolean;
  setContent: (node: React.ReactNode | null) => void;
  setCollapsed: (next: boolean) => void;
};

const RightRailContext = createContext<RightRailContextValue | null>(null);

export function RightRailProvider({ children }: { children: React.ReactNode }) {
  const [content, setContentState] = useState<React.ReactNode>(null);
  const [collapsed, setCollapsed] = useState(false);

  const setContent = useCallback((node: React.ReactNode | null) => {
    setContentState((current) => (node === current ? current : node));
  }, []);

  const value = useMemo<RightRailContextValue>(
    () => ({ content, collapsed, setContent, setCollapsed }),
    [content, collapsed, setContent],
  );

  return <RightRailContext.Provider value={value}>{children}</RightRailContext.Provider>;
}

function useRightRailContext(): RightRailContextValue {
  const ctx = useContext(RightRailContext);
  if (!ctx) {
    throw new Error("RightRail hooks must be used within <RightRailProvider>");
  }
  return ctx;
}

/** Shell-only: read the registered rail content + collapse controls. */
export function useRightRailContent() {
  const { content, collapsed, setCollapsed } = useRightRailContext();
  return { content, collapsed, setCollapsed };
}

/** Rail header: toggle the column's collapse state. */
function useRightRailCollapse() {
  const { collapsed, setCollapsed } = useRightRailContext();
  return { collapsed, setCollapsed };
}

/**
 * Register a page-owned rail content node. Call once at the top level of a
 * wallet page: `usePageRightRail(<AccountRail />)`. The node is registered on
 * mount and cleared on unmount so navigating away collapses the column back to
 * the full-width main. The rail element should be a stable-structure component
 * (its children read their own hooks to stay live) — re-renders of the page do
 * NOT re-register a newer node, by design.
 */
export function usePageRightRail(node: React.ReactNode) {
  const { setContent } = useRightRailContext();
  const nodeRef = useRef<React.ReactNode>(node);
  nodeRef.current = node;
  useEffect(() => {
    setContent(nodeRef.current);
    return () => setContent(null);
  }, [setContent]);
}

/** Shared panel header: title + collapse pin (matches the mockup's Run-settings head). */
export function RightRailHeader({ title }: { title: string }) {
  const { collapsed, setCollapsed } = useRightRailCollapse();
  return (
    <div className="mb-1.5 flex items-center gap-2 border-b border-border/70 px-1 pb-3.5">
      <span className="text-[13px] font-semibold tracking-[0.01em] text-foreground">{title}</span>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        title={collapsed ? "Expand panel" : "Collapse panel"}
        className={cn(
          "ml-auto grid size-7 cursor-pointer place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <PanelRightClose className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
