"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

/**
 * Read/toggle the rail's collapse state. Used by the rail header's pin and by
 * pages that need to know whether the rail is currently showing — e.g. the
 * Transactions page falls back to the detail dialog when the rail is collapsed.
 */
export function useRightRailCollapse() {
  const { collapsed, setCollapsed } = useRightRailContext();
  return { collapsed, setCollapsed };
}

/**
 * Register a page-owned rail content node. Call once at the top level of a
 * wallet page: `usePageRightRail(<AccountRail />)`. The node is registered on
 * mount and cleared on unmount so navigating away collapses the column back to
 * the full-width main.
 *
 * By default a fresh JSX element on each page render does NOT re-register (a ref
 * holds the latest node; the rail's children read their own hooks to stay live).
 * Pass `deps` to re-register when DISCRETE state changes — e.g. row selection on
 * the Transactions page, where the rail node carries the selected item as a prop.
 * Keep `deps` to user-driven values (not per-render identities) so this stays a
 * controlled swap, never a render loop.
 */
export function usePageRightRail(node: React.ReactNode, deps: React.DependencyList = []) {
  const { setContent } = useRightRailContext();
  const nodeRef = useRef<React.ReactNode>(node);
  nodeRef.current = node;
  // Re-register only on the caller's explicit deps (e.g. selection); nodeRef
  // always holds the latest node, so per-render JSX identity never re-registers.
  useEffect(() => {
    setContent(nodeRef.current);
    return () => setContent(null);
  }, [setContent, ...deps]);
}

/**
 * Shared panel header: just the panel title. The collapse control now lives in
 * the global header (far right, mirroring the left sidebar toggle) so the rail
 * can collapse away fully instead of leaving a strip behind.
 */
export function RightRailHeader({ title }: { title: string }) {
  return (
    <div className="mb-1.5 flex items-center border-b border-border/70 px-1 pb-3.5">
      <span className="text-[13px] font-semibold tracking-[0.01em] text-foreground">{title}</span>
    </div>
  );
}
