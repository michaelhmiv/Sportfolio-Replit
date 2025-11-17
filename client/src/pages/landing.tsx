import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Trophy, Pickaxe } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Hero Section */}
      <div className="container px-4 pt-20 pb-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6">
            Free Market Fantasy Sports
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Fantasy sports meets the stock market. Buy shares in your favorite players, mine new shares, and compete in daily 50/50 contests.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <a href="/api/login" data-testid="button-hero-login">Start Trading</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="container px-4 py-12">
        <div className="mx-auto max-w-5xl grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Market Trading</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Buy and sell player shares with real-time market pricing. Prices are determined entirely by actual trades - no algorithms, just supply and demand.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Pickaxe className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Multi-Player Mining</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Mine shares of up to 10 players simultaneously. Earn 100 shares per hour, distributed equally across your selected players.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Trophy className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Daily Contests</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Enter 50/50 contests with your player shares. Top half of entries win based on real NBA performance stats.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container px-4 py-12">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Ready to start trading?</CardTitle>
            <CardDescription className="text-center text-primary-foreground/80">
              Join Sportfolio and get $10,000 in virtual cash to start building your portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <Button variant="secondary" size="lg" asChild>
              <a href="/api/login" data-testid="button-cta-login">Sign Up Now</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
