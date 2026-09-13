"use client";

import { useEffect, useState } from "react";

/**
 * Did this campaign actually cause anything? — Phase E, surfaced.
 *
 * Last-touch attribution can say "they got a message and came back". A merchant
 * can answer "they'd have come back anyway", and last-touch cannot refute that,
 * because it is correlation. The holdout can: a slice of the audience was
 * deliberately left unmessaged, and the difference between the two groups is
 * the only number here that survives the objection.
 *
 * Presented so it can be disbelieved. Both arms are shown with their raw
 * counts, and where the sample is too small the component says so instead of
 * printing a percentage that looks precise and is not.
 */

interface Lift {
  campaignName: string;
  windowDays: number;
  holdoutPercentUsed: number;
  treatment: { size: number; returned: number; rate: number };
  holdout: { size: number; returned: number; rate: number };
  liftPoints: number | null;
  incrementalReturns: number | null;
  confident: boolean;
  verdict: string;
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function CampaignResults({ campaignId }: { campaignId: string }) {
  const [lift, setLift] = useState<Lift | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/campaigns/${campaignId}/lift`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: Lift }) => setLift(j.success && j.data ? j.data : null))
      .catch(() => setLift(null))
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return <p className="merchant-muted">Working it out…</p>;
  if (!lift) return <p className="merchant-muted">No results for this campaign yet.</p>;

  const noHoldout = lift.holdout.size === 0;

  return (
    <div className="merchant-lift">
      <div className="merchant-lift-arms">
        <div className="merchant-lift-arm">
          <span>Messaged</span>
          <strong>{lift.treatment.size ? pct(lift.treatment.rate) : "—"}</strong>
          <small>
            {lift.treatment.returned} of {lift.treatment.size} came back
          </small>
        </div>
        <div className="merchant-lift-arm merchant-lift-arm--held">
          <span>Deliberately not messaged</span>
          <strong>{lift.holdout.size ? pct(lift.holdout.rate) : "—"}</strong>
          <small>
            {noHoldout
              ? "No holdout on this campaign"
              : `${lift.holdout.returned} of ${lift.holdout.size} came back anyway`}
          </small>
        </div>
      </div>

      {/* The verdict is written by the shared holdout module, which refuses to
          state a lift on a sample too small to support one. Rendered verbatim
          rather than reworded here, so the caution cannot be lost in the UI. */}
      <p
        className={`merchant-lift-verdict ${
          lift.confident ? "merchant-lift-verdict--confident" : ""
        }`}
      >
        {lift.verdict}
      </p>

      <p className="merchant-lift-foot">
        Measured over {lift.windowDays} days after sending
        {lift.holdoutPercentUsed
          ? ` · ${lift.holdoutPercentUsed}% of the audience was held back so this comparison exists`
          : ""}
      </p>
    </div>
  );
}
