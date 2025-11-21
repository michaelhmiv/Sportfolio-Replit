import { useEffect } from "react";

interface AdSenseAdProps {
  slot: string;
  format?: string;
  layoutKey?: string;
  fullWidthResponsive?: boolean;
  className?: string;
}

export function AdSenseAd({ 
  slot,
  format = "fluid",
  layoutKey,
  fullWidthResponsive = false,
  className = "" 
}: AdSenseAdProps) {
  useEffect(() => {
    try {
      // Push ad to AdSense queue
      if (window.adsbygoogle) {
        (window.adsbygoogle as any[]).push({});
      }
    } catch (err) {
      console.error("AdSense error:", err);
    }
  }, []);

  return (
    <div className={className} data-testid="adsense-container">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-format={format}
        {...(layoutKey && { "data-ad-layout-key": layoutKey })}
        data-ad-client="ca-pub-3663304837019777"
        data-ad-slot={slot}
        {...(fullWidthResponsive && { "data-full-width-responsive": "true" })}
      />
    </div>
  );
}

// Extend the Window interface to include adsbygoogle
declare global {
  interface Window {
    adsbygoogle?: any[];
  }
}
