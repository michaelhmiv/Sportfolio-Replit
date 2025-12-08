import { useEffect, useRef } from "react";

declare global {
  interface Window {
    ezstandalone: {
      cmd: Array<() => void>;
      showAds: (...placementIds: number[]) => void;
      destroyPlaceholders: (...placementIds: number[]) => void;
      destroyAll: () => void;
    };
  }
}

interface EzoicAdProps {
  placementId: number;
  className?: string;
}

export function EzoicAd({ placementId, className = "" }: EzoicAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    
    if (typeof window !== "undefined" && window.ezstandalone) {
      window.ezstandalone.cmd.push(() => {
        window.ezstandalone.showAds(placementId);
      });
      hasInitialized.current = true;
    }

    return () => {
      if (typeof window !== "undefined" && window.ezstandalone && hasInitialized.current) {
        window.ezstandalone.cmd.push(() => {
          window.ezstandalone.destroyPlaceholders(placementId);
        });
      }
    };
  }, [placementId]);

  return (
    <div
      ref={containerRef}
      id={`ezoic-pub-ad-placeholder-${placementId}`}
      className={className}
      data-testid={`ad-placeholder-${placementId}`}
    />
  );
}

export function useEzoicPageChange() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.ezstandalone) {
      window.ezstandalone.cmd.push(() => {
        window.ezstandalone.showAds();
      });
    }
  }, []);
}

export function refreshEzoicAds() {
  if (typeof window !== "undefined" && window.ezstandalone) {
    window.ezstandalone.cmd.push(() => {
      window.ezstandalone.showAds();
    });
  }
}
