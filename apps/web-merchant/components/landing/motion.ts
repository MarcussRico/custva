"use client";

import { useEffect, type RefObject } from "react";
import {
  animate,
  createTimeline,
  createScope,
  stagger,
  utils,
  svg,
} from "animejs";

const REDUCED = "(prefers-reduced-motion: reduce)";

/* Orchestrates the whole page.
   One deliberate opening sequence in the hero, then restrained scroll reveals
   everywhere else — the loop is the thing worth animating, so the rest stays
   quiet rather than competing with it. */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" && window.matchMedia(REDUCED).matches;

    /* Reduced motion: put everything in its final state and stop. */
    if (reduced) {
      utils.set(el.querySelectorAll("[data-reveal], [data-cell]"), {
        opacity: 1,
        translateY: 0,
        scale: 1,
      });
      utils.set(el.querySelectorAll("[data-node], [data-return], .loop-origin"), {
        opacity: 1,
      });
      return;
    }

    const cleanups: Array<() => void> = [];

    const scope = createScope({ root: el }).add(() => {
      /* ── Hero: the opening sequence ─────────────────────────────── */
      const hero = createTimeline({ defaults: { ease: "outQuart" } });

      hero
        .add("[data-hero-line]", {
          opacity: [0, 1],
          translateY: [26, 0],
          duration: 900,
          delay: stagger(90),
        })
        .add(
          "[data-hero-sub]",
          { opacity: [0, 1], translateY: [16, 0], duration: 700 },
          "-=520",
        )
        .add(
          "[data-hero-cta]",
          { opacity: [0, 1], translateY: [12, 0], duration: 600 },
          "-=420",
        );

      /* The loop draws itself, the day markers land as the line reaches them,
         then the return leg is named. */
      const track = svg.createDrawable(".loop-track");
      if (track.length) {
        hero.add(
          track,
          { draw: ["0 0", "0 1"], duration: 2100, ease: "inOutQuad" },
          "-=300",
        );
      }

      hero
        .add(
          ".loop-origin",
          { opacity: [0, 1], scale: [0.7, 1], duration: 520, ease: "outBack" },
          "-=1980",
        )
        .add(
          "[data-node]",
          {
            opacity: [0, 1],
            translateY: [8, 0],
            duration: 480,
            delay: stagger(230),
            ease: "outBack",
          },
          "-=1620",
        )
        .add("[data-return]", { opacity: [0, 1], duration: 700 }, "-=280");

      /* A slow pulse on the origin — the loop is ongoing, not a one-off. */
      animate(".loop-origin-ring", {
        scale: [1, 1.9],
        opacity: [0.5, 0],
        duration: 2600,
        loop: true,
        ease: "outSine",
        delay: 2600,
      });

      /* ── Below the fold: reveal on position, not on crossings ─────
         anime.js's onScroll observer watches for the moment an element
         crosses a threshold. Fling the page and the browser can jump
         thousands of pixels between frames, so the crossing is never seen
         and the element stays at its initial opacity: 0 for ever. Checking
         each element's current position instead is immune to that, because
         it asks "is this on screen now?" rather than "did it just arrive?". */
      const pending = new Set<HTMLElement>(
        Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]")),
      );

      const groupIndex = (node: HTMLElement) => {
        const peers = node.parentElement
          ? Array.from(node.parentElement.querySelectorAll("[data-reveal]"))
          : [];
        return Math.max(0, peers.indexOf(node));
      };

      const play = (node: HTMLElement, instant: boolean) => {
        if (instant) {
          utils.set(node, { opacity: 1, translateY: 0 });
          node.style.transform = "";
          return;
        }
        animate(node, {
          opacity: [0, 1],
          translateY: [22, 0],
          duration: 760,
          ease: "outQuart",
          delay: Math.min(groupIndex(node), 5) * 70,
          onComplete: () => {
            node.style.transform = "";
          },
        });
      };

      let gridPlayed = false;
      const grid = el.querySelector(".cadence-grid");

      /* At maximum scroll there is no further scroll event, so anything still
         sitting in the last 8% of the viewport would stay at opacity 0 for
         ever — which is what happened to the phone number and the closing
         line in the contact panel, the last two reveals on the page. Once the
         document cannot scroll any further, the whole viewport counts. */
      const atBottom = () =>
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;

      let ticking = false;
      const sweep = () => {
        ticking = false;
        const vh = window.innerHeight;
        const limit = atBottom() ? vh : vh * 0.92;
        pending.forEach((node) => {
          const r = node.getBoundingClientRect();
          if (r.top < limit) {
            pending.delete(node);
            /* already scrolled past — just show it, animating off-screen
               content is wasted work and looks broken on the way back up */
            play(node, r.bottom < 0);
          }
        });
        if (!gridPlayed && grid) {
          const r = grid.getBoundingClientRect();
          if (r.top < limit) {
            gridPlayed = true;
            const cells = grid.querySelectorAll<HTMLElement>("[data-cell]");
            if (r.bottom < 0) {
              utils.set(cells, { opacity: 1, scale: 1 });
              cells.forEach((c) => {
                c.style.transform = "";
              });
            } else {
              animate(cells, {
                opacity: [0, 1],
                scale: [0.94, 1],
                duration: 440,
                ease: "outQuad",
                delay: stagger(36),
                onComplete: () => {
                  cells.forEach((c) => {
                    c.style.transform = "";
                  });
                },
              });
            }
          }
        }
      };

      const onScrollTick = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(sweep);
      };

      window.addEventListener("scroll", onScrollTick, { passive: true });
      window.addEventListener("resize", onScrollTick, { passive: true });
      sweep();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScrollTick);
        window.removeEventListener("resize", onScrollTick);
      });

      /* ── Tilt: cards behave like floating boards under pressure ──
         The edge nearest the cursor is pushed away, which is what a finger
         on a suspended panel actually does. Values go out as custom
         properties; the CSS transition smooths them and springs back. */
      const MAX_TILT = 7;      // degrees
      const LIFT = -5;         // px

      el.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
        let frame = 0;

        const onMove = (e: PointerEvent) => {
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            const r = card.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width;
            const ny = (e.clientY - r.top) / r.height;
            /* -1..1 from centre */
            const dx = nx * 2 - 1;
            const dy = ny * 2 - 1;
            /* pressure, not attraction: the near edge recedes */
            card.style.setProperty("--ry", `${(dx * MAX_TILT).toFixed(2)}deg`);
            card.style.setProperty("--rx", `${(-dy * MAX_TILT).toFixed(2)}deg`);
            card.style.setProperty("--lift", `${LIFT}px`);
            card.style.setProperty("--mx", `${(nx * 100).toFixed(1)}%`);
            card.style.setProperty("--my", `${(ny * 100).toFixed(1)}%`);
          });
        };

        const onEnter = () => card.setAttribute("data-hot", "true");
        const onLeave = () => {
          if (frame) { cancelAnimationFrame(frame); frame = 0; }
          card.removeAttribute("data-hot");
          card.style.setProperty("--rx", "0deg");
          card.style.setProperty("--ry", "0deg");
          card.style.setProperty("--lift", "0px");
        };

        card.addEventListener("pointerenter", onEnter);
        card.addEventListener("pointermove", onMove);
        card.addEventListener("pointerleave", onLeave);
        card.addEventListener("pointercancel", onLeave);
      });

    });

    return () => {
      cleanups.forEach((fn) => fn());
      scope.revert();
    };
  }, [root]);
}
