"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

const SIDEBAR_COLLAPSE_STORAGE_KEY = "conceal-sidebar-collapsed"

type SidebarCollapseContextValue = {
  collapsed: boolean
  toggle: () => void
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue>({
  collapsed: false,
  toggle: () => undefined,
})

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    function applyStoredCollapsed(next: boolean) {
      setCollapsed(next)
    }

    try {
      applyStoredCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "true")
    } catch {
      applyStoredCollapsed(false)
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current

      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(next))
      } catch {
        // Ignore storage failures; the in-memory UI state should still toggle.
      }

      return next
    })
  }, [])

  const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle])

  return <SidebarCollapseContext.Provider value={value}>{children}</SidebarCollapseContext.Provider>
}

export function useSidebarCollapse() {
  return useContext(SidebarCollapseContext)
}
