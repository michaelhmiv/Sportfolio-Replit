import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Trophy, Activity, ArrowRight, Zap, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

function HeroCard() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["17.5deg", "-17.5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-17.5deg", "17.5deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateY,
        rotateX,
        transformStyle: "preserve-3d",
      }}
      className="relative h-96 w-72 rounded-lg bg-card border shadow-xl p-1"
    >
      <div
        style={{
          transform: "translateZ(75px)",
          transformStyle: "preserve-3d",
        }}
        className="absolute inset-4 grid place-content-center rounded-md bg-muted/20 border shadow-inner group overflow-hidden"
      >
        <div className="absolute top-4 left-4">
          <Badge className="bg-primary text-black font-bold">LEGENDARY</Badge>
        </div>

        {/* Mock Player Image/Graphic */}
        <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center mb-4" />
        <Trophy
          style={{ transform: "translateZ(50px)" }}
          className="w-24 h-24 text-primary absolute"
        />

        <div className="absolute bottom-4 left-4 right-4 text-center">
          <h3 style={{ transform: "translateZ(50px)" }} className="text-xl font-black italic text-white uppercase tracking-tighter">Market Leader</h3>
          <p style={{ transform: "translateZ(25px)" }} className="text-primary font-mono font-bold">$1,245.50</p>
        </div>
      </div>

      {/* Decorative border highlight */}
      <div className="absolute inset-px rounded-md border border-primary/20 pointer-events-none" />
    </motion.div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Solid Technical Background */}
      <div className="absolute inset-0 -z-10 bg-background" />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none -z-5"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                            linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Hero Section */}
      <div className="container px-4 pt-8 sm:pt-16 pb-6 sm:pb-10">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-4 sm:mb-6"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
            </motion.div>
            Live NBA Fantasy Trading
          </motion.div>
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black italic tracking-tighter mb-4 leading-[0.9] text-foreground uppercase">
            Free Market<br />
            <span className="text-primary">Fantasy</span>
          </h1>
          <div className="flex flex-col lg:flex-row gap-8 items-center mt-12">
            <div className="flex-1 space-y-6">
              <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl font-medium">
                Your portfolio lasts a player's entire career. Trade shares, vest value, and own the game.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="w-full sm:w-auto text-lg h-14 px-10 rounded-md">
                  <Link href="/login" data-testid="button-hero-login" className="flex items-center justify-center gap-2">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* 3D Trading Card Hero */}
            <HeroCard />
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
                Trade like a pro. Market prices determined by real trades. Pure supply and demand in the open market.
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base sm:text-lg">Vest Players</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-muted-foreground">
                Generate shares for free over time. Vest up to 10 players simultaneously. 100 shares per hour.
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
          <Card className="bg-primary text-primary-foreground border-0 overflow-hidden relative rounded-lg">
            <CardHeader className="relative pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-2xl text-center">Start Building Your Portfolio</CardTitle>
              <CardDescription className="text-center text-primary-foreground/90 text-xs sm:text-base pt-1 sm:pt-2">
                Get $10,000 in virtual cash. No credit card required.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-4 sm:pb-6 relative">
              <Button variant="secondary" size="lg" asChild className="shadow-lg rounded-md">
                <Link href="/login" data-testid="button-cta-login" className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Get Started Free
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
