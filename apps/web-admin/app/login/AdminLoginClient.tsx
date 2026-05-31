"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Step = "credentials" | "otp";
const OTP_LENGTH = 6;
const OTP_EXPIRY = 10 * 60;

const REASON_MESSAGES: Record<string, string> = {
  logged_out: "You have been logged out successfully.",
  session_expired: "Your session expired. Please sign in again.",
  auth_required: "Please sign in to access the admin panel."
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
      setError("Enter all 6 digits.");
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

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-orb admin-auth-orb--tl" aria-hidden="true" />
      <div className="admin-auth-orb admin-auth-orb--br" aria-hidden="true" />

      <Link href="/" className="admin-auth-back">
        ← Back to portal
      </Link>

      <div className="admin-auth-card">
        <div className="admin-auth-card-header">
          <div className="admin-auth-logo">
            <div className="admin-auth-logo-mark">C</div>
            <div>
              <div className="admin-auth-logo-title">Custva</div>
              <div className="admin-auth-logo-sub">Admin Panel</div>
            </div>
          </div>
          <div className="admin-auth-step-row">
            <div
              className={`admin-auth-step ${step === "credentials" ? "admin-auth-step--active" : "admin-auth-step--done"}`}
            >
              <span>1</span>
              <span>Identity</span>
            </div>
            <div className="admin-auth-step-connector" />
            <div className={`admin-auth-step ${step === "otp" ? "admin-auth-step--active" : ""}`}>
              <span>2</span>
              <span>Verify</span>
            </div>
          </div>
        </div>

        <div className="admin-auth-card-body">
          {step === "credentials" && (
            <>
              <div className="admin-auth-heading-block">
                <div className="admin-auth-lock-icon" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h1 className="admin-auth-heading">Admin Authentication</h1>
                <p className="admin-auth-subheading">
                  Enter your admin email and password to continue.
                </p>
              </div>

              {reasonMessage && (
                <div className="admin-auth-success" role="status">
                  {reasonMessage}
                </div>
              )}

              <form onSubmit={submitCredentials} className="admin-auth-form" noValidate>
                <div className="admin-auth-field">
                  <label className="admin-auth-label" htmlFor="admin-email">
                    Admin Email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    className="admin-auth-input admin-auth-input--field"
                    placeholder="admin@custva.local"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>

                <div className="admin-auth-field">
                  <label className="admin-auth-label" htmlFor="admin-password">
                    Password
                  </label>
                  <div className="admin-auth-input-wrap">
                    <input
                      id="admin-password"
                      type={showPw ? "text" : "password"}
                      className="admin-auth-input admin-auth-input--field admin-auth-input--with-icon"
                      placeholder="Enter admin password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="admin-auth-toggle-pw"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide" : "Show"}
                      tabIndex={-1}
                    >
                      {showPw ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="admin-auth-error" role="alert">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="admin-auth-btn"
                  disabled={loading || !email || !password}
                  id="admin-password-submit"
                >
                  {loading ? <span className="admin-auth-spinner" /> : "Authenticate"}
                </button>
              </form>

              <p className="admin-auth-notice">
                A one-time code will be sent to the registered admin email.
              </p>
            </>
          )}

          {step === "otp" && (
            <>
              <div className="admin-auth-heading-block">
                <div className="admin-auth-lock-icon admin-auth-lock-icon--open" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                </div>
                <h1 className="admin-auth-heading">Verify Identity</h1>
                <p className="admin-auth-subheading">
                  A 6-digit code was sent to{" "}
                  <span className="admin-auth-email-highlight">{email}</span>
                </p>
              </div>

              <form onSubmit={verifyOtp} className="admin-auth-form" noValidate>
                <div className="admin-otp-boxes" role="group" aria-label="One-time code">
                  {otpDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      id={`admin-otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      className={`admin-otp-box ${d ? "admin-otp-box--filled" : ""}`}
                      value={d}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      autoComplete="one-time-code"
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>

                <div className="admin-otp-timer-row">
                  {secondsLeft > 0 ? (
                    <span
                      className={`admin-otp-timer ${secondsLeft <= 60 ? "admin-otp-timer--urgent" : ""}`}
                    >
                      Code expires in <strong>{fmt(secondsLeft)}</strong>
                    </span>
                  ) : (
                    <span className="admin-otp-timer admin-otp-timer--expired">Code expired</span>
                  )}
                </div>

                {error && (
                  <div className="admin-auth-error" role="alert">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="admin-auth-success" role="status">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                    {successMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="admin-auth-btn"
                  disabled={loading || !otpFull || secondsLeft === 0}
                  id="admin-otp-submit"
                >
                  {loading ? <span className="admin-auth-spinner" /> : "Verify & Enter"}
                </button>
              </form>

              <div className="admin-otp-footer">
                <span>Didn&apos;t receive a code?</span>
                <button
                  type="button"
                  className="admin-otp-resend"
                  onClick={resend}
                  disabled={resendCooldown > 0 || loading}
                  id="admin-otp-resend"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>

              <button
                type="button"
                className="admin-otp-back"
                onClick={() => {
                  setStep("credentials");
                  setError("");
                  setOtpDigits(Array(OTP_LENGTH).fill(""));
                  if (timerRef.current) clearInterval(timerRef.current);
                }}
              >
                ← Back
              </button>
            </>
          )}
        </div>
      </div>

      <p className="admin-auth-legal">
        Custva Admin · Unauthorised access is strictly prohibited · All actions logged
      </p>
    </div>
  );
}
