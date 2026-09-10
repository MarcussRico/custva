import { Suspense } from "react";
import AdminLoginPage from "./AdminLoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth">Loading...</div>}>
      <AdminLoginPage />
    </Suspense>
  );
}
