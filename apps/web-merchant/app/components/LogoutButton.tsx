"use client";

import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/session/logout", { method: "POST", cache: "no-store" });
    } catch {
      // proceed
    }
    window.location.replace("/login?reason=logged_out");
  };

  return (
    <button type="button" className="merchant-topbar-logout" onClick={onLogout} disabled={loading}>
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
