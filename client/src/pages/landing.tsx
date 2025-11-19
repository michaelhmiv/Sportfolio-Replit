import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Trophy, Pickaxe, ArrowRight, Zap, DollarSign } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Hero Section */}
      <div className="container px-4 pt-8 sm:pt-16 pb-6 sm:pb-10">
        <div className="mx-auto max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-4 sm:mb-6">
            <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
            Live NBA Fantasy Trading
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-3 sm:mb-5">
            Free Market<br className="sm:hidden" /> Fantasy Sports
          </h1>
          <p className="text-sm sm:text-lg md:text-xl text-muted-foreground mb-5 sm:mb-4 max-w-2xl">
            Your portfolio lasts a player's entire career. Trade shares, mine value, compete for prizes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href="/api/login" data-testid="button-hero-login" className="flex items-center justify-center gap-2">
                Start Trading
                <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="container px-4 py-4 sm:py-6">
        <div className="mx-auto max-w-4xl grid grid-cols-3 gap-3 sm:gap-6">
          <div className="text-center p-3 sm:p-4 rounded-lg bg-card border border-border">
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-primary">100+</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">NBA Players</div>
          </div>
          <div className="text-center p-3 sm:p-4 rounded-lg bg-card border border-border">
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-primary">24/7</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">Live Trading</div>
          </div>
          <div className="text-center p-3 sm:p-4 rounded-lg bg-card border border-border">
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-primary">$10K</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">Starting Cash</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="container px-4 py-6 sm:py-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-lg sm:text-2xl font-bold mb-4 sm:mb-6">How It Works</h2>
          <div className="grid gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-primary/20">
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base sm:text-lg">Trade Shares</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-muted-foreground">
                Buy low, sell high. Market prices based on real trades—no algorithms. Pure supply and demand.
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Pickaxe className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base sm:text-lg">Mine Players</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-muted-foreground">
                Generate shares over time. Mine up to 10 players at once. 100 shares per hour total.
              </CardContent>
            </Card>

            <Card className="border-primary/20 md:col-span-2 lg:col-span-1">
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base sm:text-lg">Win Contests</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-muted-foreground">
                Enter 50/50 contests. Top half wins. Shares burn after contests end—keeping scarcity.
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container px-4 py-6 sm:py-6 pb-12 sm:pb-20">
        <div className="mx-auto max-w-3xl">
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-foreground/5 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary-foreground/5 rounded-full translate-y-12 -translate-x-12"></div>
            <CardHeader className="relative pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-2xl text-center">Start Building Your Portfolio</CardTitle>
              <CardDescription className="text-center text-primary-foreground/90 text-xs sm:text-base pt-1 sm:pt-2">
                Get $10,000 in virtual cash. No credit card required.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-4 sm:pb-6 relative">
              <Button variant="secondary" size="lg" asChild className="shadow-lg">
                <a href="/api/login" data-testid="button-cta-login" className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Sign Up Free
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
