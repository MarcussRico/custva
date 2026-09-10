"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import "../auth.css";

type Step = "credentials" | "otp";
const OTP_LENGTH = 6;
const OTP_EXPIRY = 10 * 60;

const REASON_MESSAGES: Record<string, string> = {
  logged_out: "You are logged out.",
  session_expired: "Your session expired. Log in again.",
  auth_required: "Log in to reach the admin console."
};

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const reasonMessage = reason ? REASON_MESSAGES[reason] : null;

  const [step, setStep] = useState<Step>("credentials");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(OTP_EXPIRY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const startTimer = useCallback(() => {
    setSecondsLeft(OTP_EXPIRY);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const submitCredentials = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Access denied. Verify your credentials.");
        return;
      }
      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      startTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[i] = d;
    setOtpDigits(next);
    setError("");
    if (d && i < OTP_LENGTH - 1) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (otpDigits[i]) {
        const n = [...otpDigits];
        n[i] = "";
        setOtpDigits(n);
      } else if (i > 0) {
        otpRefs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      otpRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
      otpRefs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!text) return;
    const next = Array(OTP_LENGTH).fill("");
    text.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setOtpDigits(next);
    otpRefs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const verifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const otp = otpDigits.join("");
    if (otp.length < OTP_LENGTH) {
      setError("Enter all six digits.");
      return;
    }
    if (secondsLeft === 0) {
      setError("Code expired. Please log in again.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/session/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp })
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Incorrect code. Please try again.");
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        setTimeout(() => otpRefs.current[0]?.focus(), 60);
        if (res.status === 429) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeout(() => {
            setStep("credentials");
            setError("Too many attempts. Log in again.");
          }, 2000);
        }
        return;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setSuccessMsg("Identity verified. Loading admin panel...");
      window.location.replace("/dashboard");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to resend code.");
        return;
      }
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      startTimer();
      setResendCooldown(30);
      const cd = setInterval(() => {
        setResendCooldown((v) => {
          if (v <= 1) {
            clearInterval(cd);
            return 0;
          }
          return v - 1;
        });
      }, 1000);
      setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch {
      setError("Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  const otpFull = otpDigits.every((d) => d !== "");

  const ErrorMsg = error ? (
    <div className="auth-msg auth-msg--error" role="alert">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5M12 16.2v.2" />
      </svg>
      {error}
    </div>
  ) : null;

  const Note = ({ children }: { children: React.ReactNode }) => (
    <div className="auth-msg auth-msg--note" role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5M12 7.6v.2" />
      </svg>
      {children}
    </div>
  );

  const Ok = ({ children }: { children: React.ReactNode }) => (
    <div className="auth-msg auth-msg--ok" role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12.5l5 5 10-11" />
      </svg>
      {children}
    </div>
  );

  return (
    <div className="auth">
      <div className="auth-brand" style={{ flexDirection: "column", alignItems: "center" }}>
        <Image src="/custva-wordmark.png" alt="Custva" width={116} height={24} priority />
        <span className="auth-badge">Admin console</span>
      </div>

      <div className="auth-card">
        {/* ── Step 1: password ── */}
        {step === "credentials" && (
          <>
            <p className="auth-step">Step 1 of 2 · Password</p>
            <h1 className="auth-heading">Log in</h1>
            <p className="auth-sub">
              Platform administration — merchants, the global template
              catalogue and network figures.
            </p>

            {reasonMessage && (
              <div style={{ marginTop: "1.25rem" }}>
                <Note>{reasonMessage}</Note>
              </div>
            )}

            <form onSubmit={submitCredentials} className="auth-form" noValidate>
              <div>
                <label className="auth-label" htmlFor="admin-email">
                  Admin email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  className="auth-input"
                  placeholder="you@custva.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="auth-label" htmlFor="admin-password">
                  Password
                </label>
                <div className="auth-input-wrap">
                  <input
                    id="admin-password"
                    type={showPw ? "text" : "password"}
                    className="auth-input auth-input--with-icon"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-input-icon-btn"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPw ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.4 18.4 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2m-6.7-1.1a3 3 0 1 1-4.2-4.2" />
                        <path d="M2 2l20 20" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
                        <circle cx="12" cy="12" r="3.2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {ErrorMsg}

              <button
                type="submit"
                className="auth-btn"
                disabled={loading || !email || !password}
                id="admin-login-submit"
              >
                {loading ? <span className="auth-spinner" /> : "Continue"}
              </button>
            </form>

            <p className="auth-note">
              A six-digit code goes to your admin email next.
            </p>
          </>
        )}

        {/* ── Step 2: emailed code ── */}
        {step === "otp" && (
          <>
            <p className="auth-step">Step 2 of 2 · Emailed code</p>
            <h1 className="auth-heading">Enter the code</h1>
            <p className="auth-sub">
              Six digits, sent to <strong>{email}</strong>.
            </p>

            <form onSubmit={verifyOtp} className="auth-form" noValidate>
              <div className="otp-boxes" role="group" aria-label="One-time code">
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    id={`admin-otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className={`otp-box ${d ? "otp-box--filled" : ""}`}
                    value={d}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    autoComplete="one-time-code"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <div className={`otp-meta ${secondsLeft <= 60 ? "otp-meta--urgent" : ""}`}>
                <span>{secondsLeft > 0 ? `Expires in ${fmt(secondsLeft)}` : "Code expired"}</span>
              </div>

              {ErrorMsg}
              {successMsg && <Ok>{successMsg}</Ok>}

              <button
                type="submit"
                className="auth-btn"
                disabled={loading || !otpFull || secondsLeft === 0}
                id="admin-otp-submit"
              >
                {loading ? <span className="auth-spinner" /> : "Verify and log in"}
              </button>
            </form>

            <div className="auth-note">
              You can paste the whole code into the first box.
              <br />
              Nothing arrived?{" "}
              <button
                type="button"
                className="auth-textbtn"
                onClick={resend}
                disabled={resendCooldown > 0 || loading}
                id="admin-otp-resend"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send another"}
              </button>
              <br />
              <button
                type="button"
                className="auth-textbtn"
                onClick={() => {
                  setStep("credentials");
                  setError("");
                  setOtpDigits(Array(OTP_LENGTH).fill(""));
                  if (timerRef.current) clearInterval(timerRef.current);
                }}
              >
                Use a different account
              </button>
            </div>
          </>
        )}
      </div>

      <p className="auth-legal">
        Admin actions are recorded in the audit log
      </p>

      <p className="auth-below">
        <Link href="/">Back to the portal</Link>
      </p>
    </div>
  );
}
