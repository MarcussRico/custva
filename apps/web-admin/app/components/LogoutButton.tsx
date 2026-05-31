"use client";

import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      await fetch("/api/session/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin"
      });
    } catch {
      // Proceed with client-side redirect even if network fails.
    }

    // replace() removes current history entry — back button won't return to dashboard.
    window.location.replace("/login?reason=logged_out");
  };

  return (
    <button
      type="button"
      className="dash-topbar-logout"
      onClick={onLogout}
      disabled={loading}
    >
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
