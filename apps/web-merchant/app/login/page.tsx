"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = "credentials" | "otp";

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes

export default function MerchantLoginPage() {
  const router = useRouter();

  // ── Step state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("credentials");

  // ── Credentials form ──────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ── OTP form ──────────────────────────────────────────────────────────────
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState(OTP_EXPIRY_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ── Timer management ──────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setSecondsLeft(OTP_EXPIRY_SECONDS);
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Step 1: Submit credentials ────────────────────────────────────────────
  const handleCredentialsSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as {
        success: boolean;
        requiresOtp?: boolean;
        message?: string;
      };

      if (!res.ok || !data.success) {
        setError(data.message ?? "Invalid email or password. Please try again.");
        return;
      }

      // Transition to OTP step
      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      startTimer();
      // Focus first OTP box after render
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input handlers ────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    // Only accept single digit
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setError("");

    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (otpDigits[index]) {
        const next = [...otpDigits];
        next[index] = "";
        setOtpDigits(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!text) return;
    const next = Array(OTP_LENGTH).fill("");
    text.split("").forEach((ch, i) => { next[i] = ch; });
    setOtpDigits(next);
    const focusIdx = Math.min(text.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  };

  // ── Step 2: Submit OTP ────────────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const otp = otpDigits.join("");
    if (otp.length < OTP_LENGTH) {
      setError("Please enter all 6 digits of your code.");
      return;
    }
    if (secondsLeft === 0) {
      setError("Your code has expired. Please log in again.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/session/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });

      const data = (await res.json()) as { success: boolean; message?: string };

      if (!res.ok || !data.success) {
        setError(data.message ?? "Incorrect code. Please try again.");
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        setTimeout(() => otpRefs.current[0]?.focus(), 50);

        // If locked out (429), go back to credentials step
        if (res.status === 429) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeout(() => {
            setStep("credentials");
            setError("Too many incorrect attempts. Please log in again.");
          }, 2000);
        }
        return;
      }

      // Success
      if (timerRef.current) clearInterval(timerRef.current);
      setSuccessMsg("Verified! Taking you to your dashboard...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
          if (v <= 1) { clearInterval(cd); return 0; }
          return v - 1;
        });
      }, 1000);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  const otpFilled = otpDigits.every((d) => d !== "");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="auth-shell">
      {/* Background decorations */}
      <div className="auth-bg-glow auth-bg-glow--left" />
      <div className="auth-bg-glow auth-bg-glow--right" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="brand-logo-mark">C</span>
          <span className="auth-logo-name">Custva</span>
        </div>

        {/* Step indicator */}
        <div className="auth-step-row">
          <div className={`auth-step-dot ${step === "credentials" ? "auth-step-dot--active" : "auth-step-dot--done"}`} />
          <div className="auth-step-line" />
          <div className={`auth-step-dot ${step === "otp" ? "auth-step-dot--active" : ""}`} />
        </div>

        {/* ── STEP 1: Credentials ── */}
        {step === "credentials" && (
          <>
            <div className="auth-heading-block">
              <h1 className="auth-heading">Welcome back</h1>
              <p className="auth-subheading">
                Sign in to your Custva merchant account
              </p>
            </div>

            <form onSubmit={handleCredentialsSubmit} className="auth-form" noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  className="auth-input"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="password">
                  Password
                </label>
                <div className="auth-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input auth-input--with-icon"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-input-icon-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || !email || !password}
                id="login-submit-btn"
              >
                {loading ? (
                  <span className="auth-spinner" />
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            <p className="auth-footer-note">
              We&apos;ll send a one-time verification code to your email.
            </p>
          </>
        )}

        {/* ── STEP 2: OTP Verification ── */}
        {step === "otp" && (
          <>
            <div className="auth-heading-block">
              <h1 className="auth-heading">Check your email</h1>
              <p className="auth-subheading">
                We sent a 6-digit code to{" "}
                <span className="auth-email-highlight">{email}</span>
              </p>
            </div>

            <form onSubmit={handleOtpSubmit} className="auth-form" noValidate>
              {/* OTP digit boxes */}
              <div className="otp-boxes" role="group" aria-label="One-time password">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    id={`otp-digit-${i}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className={`otp-box ${digit ? "otp-box--filled" : ""}`}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    autoComplete="one-time-code"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {/* Timer */}
              <div className="otp-timer-row">
                {secondsLeft > 0 ? (
                  <span className="otp-timer">
                    Code expires in{" "}
                    <span className={`otp-timer-value ${secondsLeft <= 60 ? "otp-timer-value--urgent" : ""}`}>
                      {formatTime(secondsLeft)}
                    </span>
                  </span>
                ) : (
                  <span className="otp-timer otp-timer--expired">Code expired</span>
                )}
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="auth-success" role="status">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  {successMsg}
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || !otpFilled || secondsLeft === 0}
                id="otp-submit-btn"
              >
                {loading ? <span className="auth-spinner" /> : "Verify & Sign in"}
              </button>
            </form>

            {/* Resend + back */}
            <div className="otp-actions">
              <span className="otp-actions-label">Didn&apos;t receive a code?</span>
              <button
                type="button"
                className="otp-resend-btn"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                id="otp-resend-btn"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>

            <button
              type="button"
              className="otp-back-btn"
              onClick={() => {
                setStep("credentials");
                setError("");
                setOtpDigits(Array(OTP_LENGTH).fill(""));
                if (timerRef.current) clearInterval(timerRef.current);
              }}
            >
              ← Use a different account
            </button>
          </>
        )}
      </div>

      {/* Bottom link */}
      <p className="auth-bottom-link">
        New to Custva?{" "}
        <Link href="/" className="auth-link">
          Learn more
        </Link>
      </p>
    </div>
  );
}
