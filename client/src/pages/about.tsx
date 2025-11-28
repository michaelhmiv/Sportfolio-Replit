import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Trophy, Users, Zap } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        <h1 className="text-4xl font-bold mb-4" data-testid="heading-about">About Sportfolio</h1>
        <p className="text-lg text-muted-foreground mb-12">
          Where fantasy sports meets stock market trading
        </p>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Our Mission
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Sportfolio revolutionizes fantasy sports by combining the excitement of NBA player performance with the dynamics of stock market trading. We've created a platform where sports knowledge meets strategic investing, giving fans a new way to engage with basketball beyond traditional fantasy leagues.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                On Sportfolio, NBA players are represented as tradable shares with prices that fluctuate based on market activity. You can buy and sell player shares, build a diversified portfolio, and watch your portfolio value change as the market moves. Real NBA performance data drives engagement and adds a layer of skill to the trading experience.
              </p>
              <p className="text-muted-foreground">
                Beyond trading, Sportfolio offers daily fantasy contests where you compete against other users by drafting optimal lineups. Prizes are awarded based on actual NBA player performance, creating a skill-based competitive environment.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                Key Features
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Player Share Trading:</strong> Buy and sell NBA player shares with real-time market pricing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Share Vesting:</strong> Earn free player shares over time by selecting players to vest</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Daily Contests:</strong> Compete in skill-based fantasy contests with lineup building and strategy</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Live Leaderboards:</strong> Track your performance against other users across multiple categories</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span><strong>Real NBA Data:</strong> All player statistics powered by MySportsFeeds API</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Join Our Community
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Sportfolio is built by sports fans, for sports fans. Join our growing community on Discord to connect with other users, share trading strategies, discuss NBA matchups, and stay updated on platform developments. Whether you're a seasoned fantasy player or new to the game, there's a place for you in the Sportfolio community.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
