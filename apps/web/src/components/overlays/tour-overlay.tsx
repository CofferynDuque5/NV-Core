import * as React from "react";
import { X } from "lucide-react";

import { useTourStore } from "@/stores/tour-store";
import { getTour, positionTooltip, type Box, type Positioned } from "@/lib/tours";
import { Button } from "@/components/ui/button";

const TIP_WIDTH = 320;
const PAD = 6; // spotlight padding around the target

/**
 * Spotlight tour overlay. Dims the app, highlights the current step's target
 * element, and shows a tooltip with navigation. Steps without a target (or
 * whose target isn't on screen) render as a centered card. Recomputes on
 * scroll/resize; Esc exits, arrow keys navigate.
 */
export function TourOverlay() {
  const activeTourId = useTourStore((s) => s.activeTourId);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const next = useTourStore((s) => s.next);
  const prev = useTourStore((s) => s.prev);
  const stop = useTourStore((s) => s.stop);

  const tour = activeTourId ? getTour(activeTourId) : undefined;
  const step = tour?.steps[stepIndex];

  const [rect, setRect] = React.useState<Box | null>(null);
  const [pos, setPos] = React.useState<Positioned | null>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);

  // Locate + measure the current target; recompute on scroll/resize.
  React.useLayoutEffect(() => {
    if (!step) return;
    function recompute() {
      const el = step!.target
        ? (document.querySelector(step!.target) as HTMLElement | null)
        : null;
      if (!el) {
        setRect(null);
        setPos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const box: Box = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect(box);
      const tip = { width: TIP_WIDTH, height: tipRef.current?.offsetHeight ?? 170 };
      setPos(
        positionTooltip(box, step!.placement ?? "bottom", tip, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    }
    // Bring the target into view first, then measure on the next frame.
    if (step.target) {
      const el = document.querySelector(step.target) as HTMLElement | null;
      el?.scrollIntoView({ block: "center", inline: "nearest" });
    }
    const raf = requestAnimationFrame(recompute);
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [step, stepIndex]);

  // Keyboard controls.
  React.useEffect(() => {
    if (!tour) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") stop();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, next, prev, stop]);

  if (!tour || !step) return null;

  const total = tour.steps.length;
  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;
  const centered = !rect;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={tour.name}>
      {/* Dim + spotlight */}
      {centered ? (
        <div className="absolute inset-0 bg-black/60" />
      ) : (
        <div
          className="absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip / card */}
      <div
        ref={tipRef}
        className="absolute rounded-xl border border-line bg-panel p-4 shadow-2xl"
        style={
          centered
            ? {
                width: TIP_WIDTH,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
            : { width: TIP_WIDTH, top: pos?.top ?? 0, left: pos?.left ?? 0 }
        }
      >
        <button
          onClick={() => stop()}
          className="absolute right-3 top-3 text-ink-faint transition-colors hover:text-ink"
          aria-label="Cerrar recorrido"
        >
          <X className="size-4" />
        </button>

        <div className="pr-6">
          <h3 className="text-sm font-semibold text-ink-bright">{step.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{step.body}</p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" aria-hidden>
            {tour.steps.map((_, i) => (
              <span
                key={i}
                className="size-1.5 rounded-full transition-colors"
                style={{ background: i === stepIndex ? "var(--brand, #5B8DEF)" : "#8b949e55" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst ? (
              <Button variant="ghost" size="sm" onClick={prev}>
                Atrás
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => stop()}>
                Saltar
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? "Finalizar" : "Siguiente"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
