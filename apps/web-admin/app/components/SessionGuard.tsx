"use client";

import { useEffect } from "react";

/**
 * Re-validates session when user returns via browser back/forward cache (bfcache).
 * Prevents viewing protected pages after logout using the back button.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const validate = async () => {
      const res = await fetch("/api/session/me", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin"
      });

      if (res.ok) return;

      const data = (await res.json().catch(() => null)) as {
        needsRefresh?: boolean;
      } | null;

      if (data?.needsRefresh) {
        const next = encodeURIComponent(window.location.pathname);
        window.location.replace(`/api/session/refresh-redirect?next=${next}`);
        return;
      }

      window.location.replace("/login?reason=session_expired");
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void validate();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void validate();
      }
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <>{children}</>;
}
