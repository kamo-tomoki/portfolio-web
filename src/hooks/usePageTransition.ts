import { useState, useRef, useCallback, useEffect } from "react";

export type PageName = "home" | "works";
export type TransitionPhase = "idle" | "fadeOut" | "switching" | "fadeIn";

// fadeOut: ink wash covers the screen (700ms ink spread + 100ms buffer)
const FADE_OUT_DURATION = 800;
// switching: content swap behind the ink curtain
const SWITCH_DELAY = 200;
// fadeIn: ink overlay clears, revealing new page (overlay handles its own 900ms fade)
const FADE_IN_DURATION = 900;

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function pathToPage(pathname: string): PageName {
  if (pathname === "/works" || pathname === "/works/") return "works";
  return "home";
}

function pageToPath(page: PageName): string {
  return page === "works" ? "/works" : "/";
}

export function usePageTransition() {
  const [currentPage, setCurrentPage] = useState<PageName>(() =>
    typeof window !== "undefined" ? pathToPage(window.location.pathname) : "home"
  );
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const [contentOpacity, setContentOpacity] = useState(1);

  const targetPageRef = useRef<PageName>("home");
  const rafRef = useRef<number | null>(null);

  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const runFadeOut = useCallback(() => {
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / FADE_OUT_DURATION, 1);
      // Content fades behind the ink curtain
      setContentOpacity(1 - easeInCubic(progress));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPhase("switching");
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const runFadeIn = useCallback(() => {
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / FADE_IN_DURATION, 1);
      setContentOpacity(easeOutCubic(progress));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPhase("idle");
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  // Handle phase transitions
  useEffect(() => {
    if (phase === "fadeOut") {
      runFadeOut();
    } else if (phase === "switching") {
      const target = targetPageRef.current;
      setCurrentPage(target);
      history.pushState({ page: target }, "", pageToPath(target));

      const timer = setTimeout(() => {
        setPhase("fadeIn");
      }, SWITCH_DELAY);

      return () => clearTimeout(timer);
    } else if (phase === "fadeIn") {
      runFadeIn();
    }

    return () => cancelAnimation();
  }, [phase, runFadeOut, runFadeIn, cancelAnimation]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const page = e.state?.page ?? pathToPage(window.location.pathname);
      if (page !== currentPage && phase === "idle") {
        targetPageRef.current = page;
        setPhase("fadeOut");
      } else if (page !== currentPage) {
        setCurrentPage(page);
        setContentOpacity(1);
        setPhase("idle");
        cancelAnimation();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentPage, phase, cancelAnimation]);

  // Set initial history state
  useEffect(() => {
    history.replaceState({ page: currentPage }, "", pageToPath(currentPage));
  }, []);

  const startTransition = useCallback(
    (targetPage: PageName) => {
      if (phase !== "idle" || targetPage === currentPage) return;
      targetPageRef.current = targetPage;
      setPhase("fadeOut");
    },
    [phase, currentPage]
  );

  return {
    phase,
    currentPage,
    startTransition,
    contentOpacity,
  };
}
