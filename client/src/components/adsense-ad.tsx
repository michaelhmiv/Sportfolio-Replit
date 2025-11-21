import { useEffect } from "react";

interface AdSenseAdProps {
  className?: string;
}

export function AdSenseAd({ className = "" }: AdSenseAdProps) {
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
        data-ad-format="fluid"
        data-ad-layout-key="-i2-7+2w-11-86"
        data-ad-client="ca-pub-3663304837019777"
        data-ad-slot="8848272002"
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
