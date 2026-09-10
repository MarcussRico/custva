"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../../components/landing/brand";
import "../auth.css";

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
        setError(data.message ?? "That email and password do not match an account.");
        return;
      }

      // Transition to OTP step
      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      startTimer();
      // Focus first OTP box after render
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
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
      setError("Enter all six digits.");
      return;
    }
    if (secondsLeft === 0) {
      setError("That code has expired. Log in again to get a new one.");
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
        setError(data.message ?? "That code is not right.");
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        setTimeout(() => otpRefs.current[0]?.focus(), 50);

        // If locked out (429), go back to credentials step
        if (res.status === 429) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimeout(() => {
            setStep("credentials");
            setError("Too many incorrect attempts. Start again.");
          }, 2000);
        }
        return;
      }

      // Success
      if (timerRef.current) clearInterval(timerRef.current);
      setSuccessMsg("Verified — opening your dashboard.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
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
        setError(data.message ?? "Could not send a new code.");
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
      setError("Could not send a new code.");
    } finally {
      setLoading(false);
    }
  };

  const otpFilled = otpDigits.every((d) => d !== "");

  // ── Render ────────────────────────────────────────────────────────────────
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

  return (
    <div className="auth">
      <Link href="/" className="auth-brand" aria-label="Custva home">
        <Wordmark width={116} />
      </Link>

      <div className="auth-card">
        {/* ── Step 1: password ── */}
        {step === "credentials" && (
          <>
            <p className="auth-step">Step 1 of 2 · Password</p>
            <h1 className="auth-heading">Log in</h1>
            <p className="auth-sub">
              Your password first, then a six-digit code we email you.
            </p>

            <form onSubmit={handleCredentialsSubmit} className="auth-form" noValidate>
              <div>
                <label className="auth-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  className="auth-input"
                  placeholder="you@yourshop.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="auth-label" htmlFor="password">
                  Password
                </label>
                <div className="auth-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input auth-input--with-icon"
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
                id="login-submit-btn"
              >
                {loading ? <span className="auth-spinner" /> : "Continue"}
              </button>
            </form>

            <p className="auth-note">
              The code goes to your email, not your phone — the same address you
              signed up with.
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

            <form onSubmit={handleOtpSubmit} className="auth-form" noValidate>
              <div className="otp-boxes" role="group" aria-label="One-time code">
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

              <div className={`otp-meta ${secondsLeft <= 60 ? "otp-meta--urgent" : ""}`}>
                <span>
                  {secondsLeft > 0
                    ? `Expires in ${formatTime(secondsLeft)}`
                    : "Code expired"}
                </span>
              </div>

              {ErrorMsg}

              {successMsg && (
                <div className="auth-msg auth-msg--ok" role="status">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 12.5l5 5 10-11" />
                  </svg>
                  {successMsg}
                </div>
              )}

              <button
                type="submit"
                className="auth-btn"
                disabled={loading || !otpFilled || secondsLeft === 0}
                id="otp-submit-btn"
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
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                id="otp-resend-btn"
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

      <p className="auth-below">
        New to Custva? <Link href="/">See what it does</Link>
      </p>
    </div>
  );
}
