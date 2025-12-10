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
        src="https://whop.com/embedded/ads/v1/user_y0gCgIDxLqIdE/Sports?size=300x250"
        width="300"
        height="250"
        style={{ border: "none", borderRadius: "8px" }}
        title="Whop Ads - Sports"
      />
    </div>
  );
}
