"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the server page on an interval while the tab is visible, so live counts and receipts keep up during a demo. */
export function AutoRefresh({ ms = 10_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, ms]);
  return (
    <span className="badge badge-accent pulse" title="This page refreshes itself while it is open">
      <span className="dot" />
      Live
    </span>
  );
}
