import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { Clock, TrendingUp, Trophy } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const slides = [
  {
    id: "vesting",
    icon: Clock,
    title: "VEST SHARES",
    subtitle: "Earn player shares over time",
    description: "Select up to 10 NBA players to vest. You'll automatically earn shares every hour - up to 2,400 shares per day. Claim them before they hit the cap!",
    color: "text-yellow-500",
  },
  {
    id: "marketplace",
    icon: TrendingUp,
    title: "TRADE SHARES",
    subtitle: "Buy and sell like stocks",
    description: "Place market orders for instant execution or set limit orders at your target price. Watch the order book and build your portfolio.",
    color: "text-green-500",
  },
  {
    id: "contests",
    icon: Trophy,
    title: "ENTER CONTESTS",
    subtitle: "Compete in daily 50/50 contests",
    description: "Use your player shares to enter contests. Build a 5-player lineup and score based on real player performance. Top 50% win Sportfolio cash!",
    color: "text-blue-500",
  },
  {
    id: "discord",
    icon: SiDiscord,
    title: "JOIN THE COMMUNITY",
    subtitle: "Connect with other traders",
    description: "Get trading tips, contest strategies, and platform updates. Join our Discord to chat with fellow traders!",
    color: "text-[#5865F2]",
    isDiscord: true,
  },
];

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/user/onboarding/complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onComplete();
    },
    onError: () => {
      onComplete();
    },
  });

  useEffect(() => {
    if (!api) return;

    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const handleNext = useCallback(() => {
    if (current === slides.length - 1) {
      completeOnboarding.mutate();
    } else {
      api?.scrollNext();
    }
  }, [api, current, completeOnboarding]);

  const handleSkip = useCallback(() => {
    completeOnboarding.mutate();
  }, [completeOnboarding]);

  const isLastSlide = current === slides.length - 1;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="w-[90vw] max-w-[400px] sm:max-w-[420px] p-0 gap-0 border-2 border-border overflow-hidden rounded-none"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="onboarding-modal"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <DialogTitle>Welcome to Sportfolio</DialogTitle>
        </VisuallyHidden>
        <div className="w-full overflow-hidden">
          <Carousel setApi={setApi} className="w-full" opts={{ align: "start", containScroll: "trimSnaps" }}>
            <CarouselContent className="-ml-0">
              {slides.map((slide) => {
                const Icon = slide.icon;
                return (
                  <CarouselItem key={slide.id} className="pl-0 basis-full">
                    <div className="flex flex-col items-center justify-center px-6 sm:px-8 py-8 text-center min-h-[300px]">
                      <div className={`mb-5 ${slide.color}`}>
                        <Icon className="w-14 h-14" />
                      </div>
                      <h2 className="text-xl font-mono font-bold tracking-tight mb-2 whitespace-nowrap">
                        {slide.title}
                      </h2>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">
                        {slide.subtitle}
                      </p>
                      <p className="text-sm text-foreground/80 leading-relaxed max-w-[280px] sm:max-w-[320px]">
                        {slide.description}
                      </p>
                      {slide.isDiscord && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-5 gap-2 border-[#5865F2] text-[#5865F2] hover:bg-[#5865F2] hover:text-white"
                          asChild
                        >
                          <a 
                            href="https://discord.gg/r8MsduNvXG" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            data-testid="link-discord"
                          >
                            <SiDiscord className="w-4 h-4" />
                            Join Discord
                          </a>
                        </Button>
                      )}
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
          </Carousel>
        </div>

        <div className="flex flex-col gap-3 p-4 border-t border-border bg-muted/30">
          <div className="flex justify-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => api?.scrollTo(index)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  index === current ? "bg-primary" : "bg-muted-foreground/30"
                }`}
                aria-label={`Go to slide ${index + 1}`}
                data-testid={`dot-slide-${index}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSkip}
              className="text-muted-foreground"
              data-testid="button-skip-onboarding"
            >
              Skip
            </Button>
            <Button 
              size="sm"
              onClick={handleNext}
              disabled={completeOnboarding.isPending}
              data-testid="button-next-onboarding"
            >
              {isLastSlide ? "Get Started" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
