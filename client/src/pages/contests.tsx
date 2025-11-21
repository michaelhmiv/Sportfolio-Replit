import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Trophy, Users, DollarSign, Clock, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Contest, ContestEntry } from "@shared/schema";

interface ContestsData {
  contests: Contest[];
  myEntries: (ContestEntry & { contest: Contest; rank?: number })[];
}

export default function Contests() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Format date as YYYY-MM-DD for API
  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formattedDate = formatDateForAPI(selectedDate);
  const isToday = (date: Date) => formatDateForAPI(date) === formatDateForAPI(new Date());

  // Always filter contests by selected date
  const contestsUrl = `/api/contests?date=${formattedDate}`;

  const { data, isLoading } = useQuery<ContestsData>({
    queryKey: [contestsUrl],
  });

  const goToPrevDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  };

  const goToNextDay = () => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Contests</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevDay}
                data-testid="button-prev-day"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    data-testid="button-date-picker"
                  >
                    <Calendar className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {isToday(selectedDate) ? "Today" : format(selectedDate, "MMM d, yyyy")}
                    </span>
                    <span className="sm:hidden">
                      {isToday(selectedDate) ? "Today" : format(selectedDate, "MMM d")}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setShowDatePicker(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextDay}
                data-testid="button-next-day"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
                disabled={isToday(selectedDate)}
                data-testid="button-today"
              >
                Today
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground">Enter 50/50 contests and compete for prizes</p>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground">Loading contests...</div>
        ) : data?.contests.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No contests available for this date
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile: Card Layout */}
            <div className="sm:hidden p-3 space-y-3">
              {data?.contests.map((contest) => {
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
                                <Badge variant="outline" className="capitalize text-xs">
                                  {contest.status}
                                </Badge>
                                {isLocked && (
                                  <Badge variant="destructive" className="text-xs">
                                    Locked
                                  </Badge>
                                )}
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
                          
                          <div className="flex gap-2">
                            <Link href={`/contest/${contest.id}/leaderboard`} className="flex-1">
                              <Button variant="outline" className="w-full" data-testid={`button-view-${contest.id}`}>
                                View Details
                              </Button>
                            </Link>
                            {isLocked ? (
                              <Button className="flex-1" disabled data-testid={`button-enter-${contest.id}`}>
                                Locked
                              </Button>
                            ) : (
                              <Link href={`/contest/${contest.id}/entry`} className="flex-1">
                                <Button className="w-full" data-testid={`button-enter-${contest.id}`}>
                                  Enter
                                </Button>
                              </Link>
                            )}
                          </div>
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
                          {data?.contests.map((contest) => {
                            const isLocked = new Date() >= new Date(contest.startsAt);
                            return (
                              <tr 
                                key={contest.id} 
                                className="border-b last:border-0 hover-elevate"
                                data-testid={`card-contest-${contest.id}`}
                              >
                                <td className="p-4">
                                  <Link href={`/contest/${contest.id}/leaderboard`}>
                                    <div className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md p-1 -m-1">
                                      <Trophy className="w-4 h-4 text-primary" />
                                      <span className="font-bold">{contest.name}</span>
                                    </div>
                                  </Link>
                                </td>
                                <td className="p-4">
                                  <Badge>{contest.sport}</Badge>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="capitalize">
                                      {contest.status}
                                    </Badge>
                                    {isLocked && (
                                      <Badge variant="destructive">
                                        Locked
                                      </Badge>
                                    )}
                                  </div>
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
                                  <div className="flex gap-2 justify-end">
                                    {!isLocked && (
                                      <Link href={`/contest/${contest.id}/entry`}>
                                        <Button data-testid={`button-enter-${contest.id}`}>
                                          Enter Contest
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
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
        
        {/* My Entries */}
        {data && data.myEntries.length > 0 && (
          <div className="mt-6">
            <h2 className="text-2xl font-bold mb-4">My Entries</h2>
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
          </div>
        )}
      </div>
    </div>
  );
}
