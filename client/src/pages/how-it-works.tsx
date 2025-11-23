import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Trophy, Pickaxe, BarChart3, Users, CheckCircle2 } from "lucide-react";
import { SchemaOrg, schemas } from "@/components/schema-org";

const faqs = [
  {
    question: "How does trading player shares work on Sportfolio?",
    answer: "NBA players on Sportfolio are represented as tradable shares, similar to stocks. Each player has a market price that changes based on trading activity. You can place market orders to buy or sell immediately, or use limit orders to specify exact prices."
  },
  {
    question: "What is the mining system and how do I earn free shares?",
    answer: "Mining rewards active users with free player shares. By participating on the platform - trading, entering contests, and engaging with the community - you accumulate mining points that convert into tradable player shares. Check the mining widget on your dashboard to claim shares."
  },
  {
    question: "How do fantasy contests work?",
    answer: "Compete in daily 50/50 contests by creating lineups of NBA players. Your lineup earns fantasy points based on real player performance. The top half of contestants win prizes, doubling their entry fee. Prizes are automatically distributed when games complete."
  },
  {
    question: "How are fantasy points calculated in contests?",
    answer: "Fantasy points are based on real NBA player statistics including points scored, rebounds, assists, steals, blocks, and other performance metrics from actual NBA games."
  },
  {
    question: "What happens to my shares when I enter a contest?",
    answer: "When you enter a contest, you draft players from a specific game date. Your existing portfolio shares are separate from contest lineups - entering contests doesn't affect your trading portfolio."
  }
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      <SchemaOrg schema={schemas.faqPage(faqs)} />
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        <h1 className="text-4xl font-bold mb-4" data-testid="heading-how-it-works">How Sportfolio Works</h1>
        <p className="text-lg text-muted-foreground mb-12">
          Learn how to trade NBA player shares and compete in fantasy contests
        </p>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                1. Trading Player Shares
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                NBA players on Sportfolio are represented as tradable shares, similar to stocks. Each player has a market price that changes based on trading activity - when more users want to buy a player, the price goes up; when more want to sell, it goes down.
              </p>
              <p className="text-muted-foreground">
                You can browse the marketplace to find players to trade. Place market orders to buy or sell immediately at current prices, or use limit orders to specify the exact price you're willing to trade at. Your portfolio value changes as player prices fluctuate.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pickaxe className="w-5 h-5 text-primary" />
                2. Mining Free Shares
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Sportfolio features a mining system that rewards active users with free player shares. By participating on the platform - trading, entering contests, and engaging with the community - you accumulate mining points that convert into tradable player shares.
              </p>
              <p className="text-muted-foreground">
                Check the mining widget on your dashboard to see your current accumulation and claim shares when available. Mining is a great way to build your portfolio without spending virtual currency.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                3. Fantasy Contests
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Compete in daily 50/50 contests by creating lineups of NBA players. Contests are tied to specific game dates - you draft players from that day's NBA games. Your lineup earns fantasy points based on real player performance (points, rebounds, assists, etc.).
              </p>
              <p className="text-muted-foreground">
                The top half of contestants win prizes, doubling their entry fee. Browse available contests, pay the entry fee from your balance, draft your optimal lineup, and watch your players perform. Prizes are automatically distributed when games complete and contests settle.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                4. Building Your Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Success on Sportfolio combines market knowledge with basketball expertise. Track player performance stats, monitor market trends, and diversify your portfolio across different teams and positions. Use player stats and recent game logs to make informed trading decisions.
              </p>
              <p className="text-muted-foreground">
                For contests, research player matchups, consider game pace and playing time, and balance star players with value picks. The platform provides all the data you need including season averages, recent games, and real-time market information.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                5. Compete on Leaderboards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Track your performance against other Sportfolio users on global leaderboards. Rankings are available for portfolio net worth, total shares mined, and market orders placed. See where you stand and compete for bragging rights in the community.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Getting Started
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Ready to start trading and competing? Here's your quick start guide:
              </p>
              <ol className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">1.</span>
                  <span>Create an account - you'll start with virtual currency to begin trading</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">2.</span>
                  <span>Browse the marketplace and buy shares of your favorite NBA players</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">3.</span>
                  <span>Enter a contest to test your fantasy basketball skills</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">4.</span>
                  <span>Watch your portfolio grow and climb the leaderboards</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
