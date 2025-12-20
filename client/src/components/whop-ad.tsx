interface WhopAdProps {
  className?: string;
  isPremium?: boolean;
}

export function WhopAd({ className = "", isPremium = false }: WhopAdProps) {
  if (isPremium) {
    return null;
  }

  return (
    <div className={`flex justify-center ${className}`} data-testid="whop-ad-container">
      <iframe
        src="https://whop.com/embedded/ads/v1/user_y0gCgIDxLqIdE/Sports?size=728x90"
        width="728"
        height="90"
        style={{ border: "none", borderRadius: "4px" }}
        title="Whop Ads - Sports"
      />
    </div>
  );
}
