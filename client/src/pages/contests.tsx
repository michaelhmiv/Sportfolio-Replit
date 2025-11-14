import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users, DollarSign, Clock } from "lucide-react";
import { Link } from "wouter";
import type { Contest, ContestEntry } from "@shared/schema";

interface ContestsData {
  openContests: Contest[];
  myEntries: (ContestEntry & { contest: Contest; rank?: number })[];
}

export default function Contests() {
  const { data, isLoading } = useQuery<ContestsData>({
    queryKey: ["/api/contests"],
  });

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Contests</h1>
          <p className="text-muted-foreground">Enter 50/50 contests and compete for prizes</p>
        </div>

        <Tabs defaultValue="open" className="space-y-6">
          <TabsList>
            <TabsTrigger value="open" data-testid="tab-open-contests">Open Contests</TabsTrigger>
            <TabsTrigger value="my-entries" data-testid="tab-my-entries">My Entries</TabsTrigger>
          </TabsList>

          {/* Open Contests */}
          <TabsContent value="open" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading contests...</div>
            ) : data?.openContests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No open contests available
                </CardContent>
              </Card>
            ) : (
              data?.openContests.map((contest) => (
                <Card key={contest.id} className="hover-elevate" data-testid={`card-contest-${contest.id}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <Trophy className="w-5 h-5 text-primary" />
                          <h3 className="text-xl font-bold">{contest.name}</h3>
                          <Badge>{contest.sport}</Badge>
                          <Badge variant="outline" className="capitalize">{contest.status}</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Prize Pool</div>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4 text-positive" />
                              <span className="text-2xl font-mono font-bold text-positive" data-testid={`text-prize-${contest.id}`}>
                                ${contest.totalPrizePool}
                              </span>
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Entries</div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span className="text-lg font-semibold">{contest.entryCount}</span>
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Shares Entered</div>
                            <span className="text-lg font-semibold">{contest.totalSharesEntered}</span>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Starts</div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span className="text-sm">
                                {new Date(contest.startsAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <Link href={`/contest/${contest.id}/entry`}>
                        <Button size="lg" data-testid={`button-enter-${contest.id}`}>
                          Enter Contest
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* My Entries */}
          <TabsContent value="my-entries" className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading your entries...</div>
            ) : data?.myEntries.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">You haven't entered any contests yet</p>
                  <Button onClick={() => document.querySelector<HTMLButtonElement>('[data-testid="tab-open-contests"]')?.click()}>
                    Browse Open Contests
                  </Button>
                </CardContent>
              </Card>
            ) : (
              data?.myEntries.map((entry) => (
                <Card key={entry.id} className="hover-elevate" data-testid={`card-entry-${entry.id}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-bold">{entry.contest.name}</h3>
                          <Badge className="capitalize">{entry.contest.status}</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Your Shares</div>
                            <span className="text-lg font-semibold">{entry.totalSharesEntered}</span>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Score</div>
                            <span className="text-lg font-mono font-semibold">{entry.totalScore}</span>
                          </div>
                          
                          {entry.rank && (
                            <div>
                              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Rank</div>
                              <span className="text-lg font-semibold">#{entry.rank}</span>
                            </div>
                          )}
                          
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Payout</div>
                            <span className={`text-lg font-mono font-semibold ${parseFloat(entry.payout) > 0 ? 'text-positive' : ''}`}>
                              ${entry.payout}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {entry.contest.status === "live" && (
                        <Link href={`/contest/${entry.contestId}/leaderboard`}>
                          <Button variant="outline" data-testid={`button-leaderboard-${entry.id}`}>
                            View Leaderboard
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
