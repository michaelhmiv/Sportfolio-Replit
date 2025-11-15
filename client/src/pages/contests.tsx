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
    <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-3xl font-bold mb-2">Contests</h1>
          <p className="text-muted-foreground">Enter 50/50 contests and compete for prizes</p>
        </div>

        <Tabs defaultValue="open" className="space-y-3 sm:space-y-6">
          <TabsList>
            <TabsTrigger value="open" data-testid="tab-open-contests">Open Contests</TabsTrigger>
            <TabsTrigger value="my-entries" data-testid="tab-my-entries">My Entries</TabsTrigger>
          </TabsList>

          {/* Open Contests */}
          <TabsContent value="open">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading contests...</div>
            ) : data?.openContests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No open contests available
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Mobile: Card Layout */}
                <div className="sm:hidden p-3 space-y-3">
                  {data?.openContests.map((contest) => {
                    const isLocked = new Date() >= new Date(contest.startsAt);
                    return (
                      <Card key={contest.id} className="hover-elevate" data-testid={`card-contest-${contest.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Trophy className="w-4 h-4 text-primary" />
                                <h3 className="font-bold">{contest.name}</h3>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="text-xs">{contest.sport}</Badge>
                                <Badge variant={isLocked ? "destructive" : "outline"} className="capitalize text-xs">
                                  {isLocked ? "Locked" : contest.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 pb-3">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Prize Pool</div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3 text-positive" />
                                <span className="font-mono font-bold text-positive" data-testid={`text-prize-${contest.id}`}>
                                  ${contest.totalPrizePool}
                                </span>
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Entries</div>
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                <span className="text-sm font-semibold">{contest.entryCount}</span>
                              </div>
                            </div>
                            
                            <div className="col-span-2">
                              <div className="text-xs text-muted-foreground mb-1">Starts</div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span className="text-xs">
                                  {new Date(contest.startsAt).toLocaleString([], { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    hour: 'numeric', 
                                    minute: '2-digit' 
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {isLocked ? (
                            <Button className="w-full" disabled data-testid={`button-enter-${contest.id}`}>
                              Contest Locked
                            </Button>
                          ) : (
                            <Link href={`/contest/${contest.id}/entry`}>
                              <Button className="w-full" data-testid={`button-enter-${contest.id}`}>
                                Enter Contest
                              </Button>
                            </Link>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Desktop: Table Layout */}
                <div className="hidden sm:block overflow-x-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium uppercase tracking-wide">Available Contests</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full">
                        <thead className="border-b bg-muted/50">
                          <tr>
                            <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contest</th>
                            <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sport</th>
                            <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                            <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prize Pool</th>
                            <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entries</th>
                            <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Starts</th>
                            <th className="p-4"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data?.openContests.map((contest) => {
                            const isLocked = new Date() >= new Date(contest.startsAt);
                            return (
                              <tr 
                                key={contest.id} 
                                className="border-b last:border-0 hover-elevate"
                                data-testid={`card-contest-${contest.id}`}
                              >
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <Trophy className="w-4 h-4 text-primary" />
                                    <span className="font-bold">{contest.name}</span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <Badge>{contest.sport}</Badge>
                                </td>
                                <td className="p-4">
                                  <Badge variant={isLocked ? "destructive" : "outline"} className="capitalize">
                                    {isLocked ? "Locked" : contest.status}
                                  </Badge>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <DollarSign className="w-4 h-4 text-positive" />
                                    <span className="font-mono font-bold text-positive" data-testid={`text-prize-${contest.id}`}>
                                      ${contest.totalPrizePool}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Users className="w-4 h-4" />
                                    <span className="font-semibold">{contest.entryCount}</span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    <span className="text-sm">
                                      {new Date(contest.startsAt).toLocaleString([], { 
                                        month: 'short', 
                                        day: 'numeric', 
                                        hour: 'numeric', 
                                        minute: '2-digit' 
                                      })}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  {isLocked ? (
                                    <Button disabled data-testid={`button-enter-${contest.id}`}>
                                      Contest Locked
                                    </Button>
                                  ) : (
                                    <Link href={`/contest/${contest.id}/entry`}>
                                      <Button data-testid={`button-enter-${contest.id}`}>
                                        Enter Contest
                                      </Button>
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* My Entries */}
          <TabsContent value="my-entries">
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
              <>
                {/* Mobile: Card Layout */}
                <div className="sm:hidden p-3 space-y-3">
                  {data?.myEntries.map((entry) => (
                    <Card key={entry.id} className="hover-elevate" data-testid={`card-entry-${entry.id}`}>
                      <CardContent className="p-4">
                        <div className="mb-3">
                          <h3 className="font-bold mb-2">{entry.contest.name}</h3>
                          <Badge className="capitalize text-xs">{entry.contest.status}</Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 pb-3 border-b">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Your Shares</div>
                            <span className="text-sm font-semibold">{entry.totalSharesEntered}</span>
                          </div>
                          
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Score</div>
                            <span className="text-sm font-mono font-semibold">{entry.totalScore}</span>
                          </div>
                          
                          {entry.rank && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Rank</div>
                              <span className="text-sm font-semibold">#{entry.rank}</span>
                            </div>
                          )}
                          
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Payout</div>
                            <span className={`text-sm font-mono font-semibold ${parseFloat(entry.payout) > 0 ? 'text-positive' : ''}`}>
                              ${entry.payout}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 mt-3">
                          <Link href={`/contest/${entry.contestId}/leaderboard`}>
                            <Button className="w-full" data-testid={`button-view-lineup-${entry.id}`}>
                              View Lineup
                            </Button>
                          </Link>
                          {entry.contest.status === "open" && new Date() < new Date(entry.contest.startsAt) && (
                            <Link href={`/contest/${entry.contestId}/entry/${entry.id}`}>
                              <Button variant="outline" className="w-full" data-testid={`button-edit-entry-${entry.id}`}>
                                Edit Entry
                              </Button>
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop: Table Layout */}
                <div className="hidden sm:block overflow-x-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium uppercase tracking-wide">My Contest Entries</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full">
                        <thead className="border-b bg-muted/50">
                          <tr>
                            <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contest</th>
                            <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                            <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Shares</th>
                            <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                            <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rank</th>
                            <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payout</th>
                            <th className="p-4"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data?.myEntries.map((entry) => (
                            <tr 
                              key={entry.id} 
                              className="border-b last:border-0 hover-elevate"
                              data-testid={`card-entry-${entry.id}`}
                            >
                              <td className="p-4">
                                <span className="font-bold">{entry.contest.name}</span>
                              </td>
                              <td className="p-4">
                                <Badge className="capitalize">{entry.contest.status}</Badge>
                              </td>
                              <td className="p-4 text-right">
                                <span className="font-semibold">{entry.totalSharesEntered}</span>
                              </td>
                              <td className="p-4 text-right">
                                <span className="font-mono font-semibold">{entry.totalScore}</span>
                              </td>
                              <td className="p-4 text-right">
                                <span className="font-semibold">
                                  {entry.rank ? `#${entry.rank}` : '-'}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <span className={`font-mono font-semibold ${parseFloat(entry.payout) > 0 ? 'text-positive' : ''}`}>
                                  ${entry.payout}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex gap-2 justify-end">
                                  <Link href={`/contest/${entry.contestId}/leaderboard`}>
                                    <Button size="sm" data-testid={`button-view-lineup-${entry.id}`}>
                                      View Lineup
                                    </Button>
                                  </Link>
                                  {entry.contest.status === "open" && new Date() < new Date(entry.contest.startsAt) && (
                                    <Link href={`/contest/${entry.contestId}/entry/${entry.id}`}>
                                      <Button variant="outline" size="sm" data-testid={`button-edit-entry-${entry.id}`}>
                                        Edit Entry
                                      </Button>
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
