import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { useState } from "react";

export function HelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        data-testid="button-help"
        className="hover-elevate active-elevate-2"
      >
        <HelpCircle className="w-5 h-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Welcome to Sportfolio: The Persistent Fantasy Sports Market</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 text-sm">
            <p>
              Sportfolio is a fantasy sports game where your progress and investments last for a player's entire career, not just one season.
            </p>

            <p>
              The main goal is to create an engaging community built around a <strong>free market economy</strong>. Instead of developers setting player values, the market does. Your sports knowledge and ability to predict player performance are rewarded in a system where you—and all other users—determine the true value of every athlete.
            </p>

            <hr className="border-border" />

            <div>
              <h3 className="text-lg font-semibold mb-3">Understanding the Core Loop: What You Do</h3>
              <p className="mb-4">
                The entire game revolves around "Player Shares," the core asset representing ownership of a specific player. Here is the basic lifecycle of the game:
              </p>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">1. Vest Player Shares</h4>
                  <ul className="list-disc pl-6 space-y-1">
                    <li><strong>What it is:</strong> Vesting is the <em>only</em> way to create new shares of active players.</li>
                    <li><strong>How it works:</strong> You simply select active players to vest, and your account will generate shares of those players over time at a set rate of 100 shares per hour (distributed across your selected players).</li>
                    <li><strong>The Strategy:</strong> You must decide which players to invest your vesting time in. Do you vest a superstar, or an underrated rookie you think will break out?</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">2. Use Your Shares (Trade or Compete)</h4>
                  <p className="mb-2">Once shares are in your portfolio, you have two main options:</p>
                  
                  <div className="pl-4 space-y-3">
                    <div>
                      <p className="font-medium mb-1">Option A: Trade on the Player Exchange</p>
                      <p className="text-muted-foreground">
                        You can immediately sell your vested shares on the "Player Exchange," which functions just like a real-world stock market. You can set your price, and other users can buy your shares, allowing you to speculate and build your in-game wealth.
                      </p>
                    </div>

                    <div>
                      <p className="font-medium mb-1">Option B: Enter Contests</p>
                      <p className="text-muted-foreground">
                        You can enter your shares into various contests to compete for real prizes (virtual currency). Your player's real-life performance determines how many fantasy points you earn in the contest.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">3. The "Burn" Mechanic</h4>
                  <p className="mb-2">This is the most important part of the economy:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>When you submit shares into a contest, they are <strong>permanently removed (or "burned")</strong> from the game after the contest ends.</li>
                    <li>This ensures that shares remain scarce. Contests are the only way to create new "money" in the game, and this creation is directly tied to the destruction (burning) of shares, which keeps the economy balanced.</li>
                  </ul>
                </div>
              </div>
            </div>

            <hr className="border-border" />

            <div>
              <h3 className="text-lg font-semibold mb-3">Key Things to Know as a New User</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>It's a Virtual Economy:</strong> Sportfolio is a game based on virtual currency. There are <strong>no cash-out options</strong>.</li>
                <li><strong>Persistence is Key:</strong> Unlike seasonal fantasy, you don't have to redraft your players every year. If you vest a player and they become a star, you can benefit from that investment for their <em>entire career</em>.</li>
                <li><strong>You Control the Market:</strong> A player's vesting rate is the same for everyone (100 shares/hour total). Their value is only determined by what other users are willing to pay for them on the Exchange, based on their contest performance or hype.</li>
              </ul>
            </div>

            <p className="text-center font-medium pt-4">
              In short, your goal is to <strong>Vest</strong> shares of players you believe in, and then decide whether to <strong>Trade</strong> them for profit or <strong>Compete</strong> with them in contests to win prizes.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
