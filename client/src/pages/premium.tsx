import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Zap, Check, Loader2, ShoppingCart, Plus, Minus, TrendingUp, X, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PremiumStatus {
  isPremium: boolean;
  premiumExpiresAt: string | null;
  premiumShares: number;
  recentPurchases: {
    id: string;
    quantity: number;
    amountCents: number;
    createdAt: string;
    completedAt: string | null;
  }[];
}

interface CheckoutSession {
  sessionId: string;
  planId: string;
  quantity: number;
  amountCents: number;
  email?: string;
}

const PRICE_PER_SHARE = 5;

const premiumBenefits = [
  { icon: Zap, title: "Double Vesting Power", description: "Earn shares 2x faster during daily vesting sessions" },
  { icon: Crown, title: "Ad-Free Experience", description: "Browse and trade without any advertisements" },
];

export default function Premium() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [quantity, setQuantity] = useState(1);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [showPostPurchaseModal, setShowPostPurchaseModal] = useState(false);
  const [purchasedQuantity, setPurchasedQuantity] = useState(0);

  const { data: premiumStatus, isLoading } = useQuery<PremiumStatus>({
    queryKey: ["/api/premium/status"],
    enabled: isAuthenticated,
  });

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/redeem");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Premium Activated!",
        description: "You now have 30 days of premium access.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/premium/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Redemption Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const syncWhopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whop/sync");
      return res.json();
    },
    onSuccess: (data: { credited: number; revoked: number; synced: number }) => {
      if (data.credited > 0) {
        toast({
          title: "Premium Shares Credited!",
          description: `${data.credited} Premium Share${data.credited > 1 ? 's' : ''} from Whop ${data.credited > 1 ? 'have' : 'has'} been added to your account.`,
        });
      } else {
        toast({
          title: "Sync Complete",
          description: data.synced > 0 
            ? `Checked ${data.synced} payment${data.synced > 1 ? 's' : ''} from Whop. No new shares to credit.`
            : "No Whop payments found for your email.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/premium/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await apiRequest("POST", "/api/premium/checkout-session", { quantity });
      const session = await res.json();
      setCheckoutSession(session);
      setShowCheckout(true);
      
      // Open Whop checkout in a new tab using the purchaseUrl from API
      const checkoutUrl = session.purchaseUrl;
      if (checkoutUrl) {
        window.open(checkoutUrl, "_blank");
        
        toast({
          title: "Checkout Opened",
          description: "Complete your purchase in the new tab. Your shares will be credited automatically.",
        });
      } else {
        toast({
          title: "Checkout Session Created",
          description: "Please complete your purchase at whop.com",
        });
      }
    } catch (error: any) {
      toast({
        title: "Checkout Failed",
        description: error.message || "Failed to create checkout session",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl mx-auto p-4 md:p-6">
        <Card className="text-center p-8">
          <Crown className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
          <CardTitle className="mb-4">Unlock Premium Features</CardTitle>
          <CardDescription className="mb-6">
            Sign in to purchase Premium Shares and access exclusive features.
          </CardDescription>
          <Link href="/">
            <Button data-testid="button-signin-premium">Sign In to Continue</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <Crown className="h-12 w-12 mx-auto mb-3 text-yellow-500" />
        <h1 className="text-3xl font-bold mb-2" data-testid="text-premium-title">Premium Shares</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Purchase tradeable Premium Shares for $5 each. Redeem for 30 days of premium access or trade them on the marketplace.
        </p>
      </div>

      {/* Premium Status Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-lg">Your Premium Status</CardTitle>
          {premiumStatus?.isPremium && (
            <Badge variant="default" className="bg-yellow-500 text-black" data-testid="badge-premium-active">
              <Crown className="h-3 w-3 mr-1" />
              Active
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-muted-foreground">Premium Shares Owned</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => syncWhopMutation.mutate()}
                    disabled={syncWhopMutation.isPending}
                    data-testid="button-sync-whop"
                    className="h-6 px-2 text-xs"
                    title="Sync purchases from Whop"
                  >
                    {syncWhopMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    <span className="ml-1">Sync</span>
                  </Button>
                </div>
                <div className="text-3xl font-bold" data-testid="text-premium-shares">
                  {premiumStatus?.premiumShares || 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Worth ${((premiumStatus?.premiumShares || 0) * PRICE_PER_SHARE).toFixed(2)}
                </div>
              </div>
              
              <div className="bg-card border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">Premium Status</div>
                {premiumStatus?.isPremium ? (
                  <>
                    <div className="text-lg font-semibold text-green-500">Active</div>
                    {premiumStatus.premiumExpiresAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Expires {formatDistanceToNow(new Date(premiumStatus.premiumExpiresAt), { addSuffix: true })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-lg font-semibold text-muted-foreground">Inactive</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Redeem a share to activate
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {(premiumStatus?.premiumShares || 0) > 0 && (
            <div className="flex justify-center">
              <Button
                onClick={() => redeemMutation.mutate()}
                disabled={redeemMutation.isPending || premiumStatus?.isPremium}
                data-testid="button-redeem-premium"
                className="bg-yellow-500 hover:bg-yellow-600 text-black"
              >
                {redeemMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Crown className="h-4 w-4 mr-2" />
                )}
                Redeem 1 Share for 30 Days Premium
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Buy Premium Shares
          </CardTitle>
          <CardDescription>
            $5 per share - Tradeable on the marketplace or redeemable for premium access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quantity selector */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              data-testid="button-decrease-quantity"
            >
              <Minus className="h-4 w-4" />
            </Button>
            
            <div className="text-center min-w-[120px]">
              <div className="text-4xl font-bold" data-testid="text-quantity">
                {quantity}
              </div>
              <div className="text-sm text-muted-foreground">shares</div>
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(quantity + 1)}
              data-testid="button-increase-quantity"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Total */}
          <div className="text-center">
            <div className="text-2xl font-bold" data-testid="text-total-price">
              ${(quantity * PRICE_PER_SHARE).toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>

          {/* Checkout button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleCheckout}
            disabled={checkoutLoading}
            data-testid="button-checkout"
          >
            {checkoutLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            Purchase via Whop
          </Button>

          {showCheckout && (
            <div className="text-center text-sm text-muted-foreground">
              <p>Checkout opened in a new tab.</p>
              <p>Your shares will be credited automatically after payment.</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/premium/status"] })}
                data-testid="button-refresh-status"
              >
                Refresh status
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benefits */}
      <Card>
        <CardHeader>
          <CardTitle>Premium Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {premiumBenefits.map((benefit, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <benefit.icon className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <div className="font-medium">{benefit.title}</div>
                  <div className="text-sm text-muted-foreground">{benefit.description}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trade on Marketplace */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trade Premium Shares
          </CardTitle>
          <CardDescription>
            Premium Shares can be traded on the marketplace just like player shares
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/marketplace">
            <Button variant="outline" className="w-full" data-testid="button-goto-marketplace">
              View Premium Shares on Marketplace
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Purchases */}
      {premiumStatus?.recentPurchases && premiumStatus.recentPurchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {premiumStatus.recentPurchases.map((purchase) => (
                <div key={purchase.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <div className="font-medium">{purchase.quantity} Premium Share{purchase.quantity > 1 ? 's' : ''}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(purchase.completedAt || purchase.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">${(purchase.amountCents / 100).toFixed(2)}</div>
                    <Badge variant="outline" className="text-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      Completed
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Post-Purchase Modal */}
      <Dialog open={showPostPurchaseModal} onOpenChange={setShowPostPurchaseModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-center justify-center">
              <Crown className="h-6 w-6 text-yellow-500" />
              Purchase Complete!
            </DialogTitle>
            <DialogDescription className="text-center">
              You now have {purchasedQuantity} new Premium Share{purchasedQuantity > 1 ? 's' : ''}.
              What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-4">
            <Button
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
              onClick={() => {
                setShowPostPurchaseModal(false);
                redeemMutation.mutate();
              }}
              disabled={redeemMutation.isPending || premiumStatus?.isPremium}
              data-testid="button-modal-redeem"
            >
              <Crown className="h-4 w-4 mr-2" />
              Redeem for 30 Days Premium
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowPostPurchaseModal(false);
                setLocation("/marketplace?tab=premium");
              }}
              data-testid="button-modal-sell"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Sell on Marketplace
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowPostPurchaseModal(false)}
              data-testid="button-modal-hold"
            >
              <X className="h-4 w-4 mr-2" />
              Hold for Later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
