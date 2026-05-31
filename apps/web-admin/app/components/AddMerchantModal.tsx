"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MerchantOnboardingForm } from "./MerchantOnboardingForm";

export function AddMerchantModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSuccess = () => {
    router.refresh();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-merchant-title"
      >
        <header className="modal-header">
          <div>
            <p className="dash-eyebrow">Merchant Onboarding</p>
            <h2 id="add-merchant-title" className="modal-title">
              Add New Merchant
            </h2>
            <p className="modal-subtitle">
              Register a shop with owner credentials and business profile.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <MerchantOnboardingForm onSuccess={handleSuccess} compact />
        </div>
      </div>
    </div>
  );
}
