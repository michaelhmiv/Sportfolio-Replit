# MySportsFeeds NHL API Documentation (v2.1)

## Authentication
- Basic Auth using API Key as username and "MYSPORTSFEEDS" as password
- Base URL: `https://api.mysportsfeeds.com/v2.1/pull/nhl`

## Season Format
- Format: `{start_year}-{end_year}-{type}`
- Examples: `2025-2026-regular`, `2024-playoff`, `current`, `latest`, `upcoming`
- Keywords:
  - `current`: Current in-progress season (400 if offseason)
  - `latest`: Latest season whether active or not
  - `upcoming`: Future season that's been added but not started

## Date Format
- YYYYMMDD: `20251115`
- Keywords: `today`, `yesterday`, `tomorrow`
- Date ranges: `since-yesterday`, `until-tomorrow`, `from-20251001-to-20251115`

## Available Formats
- JSON: `.json`
- XML: `.xml`
- CSV: `.csv`

---

## CORE Tier Endpoints (No addon required)

### 1. Seasonal Games
**All games for a season including schedule, status and scores**

```
GET /nhl/{season}/games.{format}
```

**Parameters:**
- `team={list-of-teams}` - Filter by team (abbreviation, city-name, or ID)
- `date={date-range}` - Filter by date range
- `status={list-of-game-statuses}` - Filter by status: `unplayed`, `in-progress`, `postgame-reviewing`, `final`
- `sort={sort-specifier}` - Sort by `game.starttime` with `.A` (asc) or `.D` (desc)
- `offset={number}` - Starting offset (default: 0)
- `limit={number}` - Max results
- `force={true|false}` - Force content return (default: true)

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/games.json
```

---

### 2. Daily Games
**All games on a given date with schedule, status, and scores**

```
GET /nhl/{season}/date/{date}/games.{format}
```

**Parameters:** Same as Seasonal Games

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/date/20251115/games.json
```

---

### 3. Current Season
**Returns the current season and supported stats**

```
GET /nhl/current_season.{format}
```

**Parameters:**
- `date={date}` - Specific date (default: current date)
- `force={true|false}`

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/current_season.json
```

---

### 4. Latest Updates
**Lists all the latest update timestamps for each feed**

```
GET /nhl/{season}/latest_updates.{format}
```

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/latest_updates.json
```

---

### 5. Seasonal Venues
**Lists all venues used in a league's specific season**

```
GET /nhl/{season}/venues.{format}
```

**Parameters:**
- `team={list-of-teams}` - Filter by team

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/venues.json
```

---

## STATS Tier Endpoints (Addon Required: STATS)

### 6. Daily Player Gamelogs ⭐
**All player game logs for a date including game and stats**

```
GET /nhl/{season}/date/{date}/player_gamelogs.{format}
```

**Parameters:**
- `team={list-of-teams}` - Filter by team
- `player={list-of-players}` - Filter by player (last name, "first-last", or "first-last-id")
- `position={list-of-positions}` - Filter by position (e.g., `C`, `LW`, `RW`, `D`, `G`)
- `game={list-of-games}` - Filter by game ID (format: `YYYYMMDD-AWAY-HOME`)
- `stats={list-of-stats}` - Filter stats (or `none` for no stats)
- `sort={sort-specifier}` - Sort options: `game.starttime`, `team.city`, `team.name`, `player.lastName`
- `offset={number}`, `limit={number}`, `force={true|false}`

**Note:** At least one of `team`, `player`, or `game` MUST be specified.

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/date/20251115/player_gamelogs.json?team=TOR
```

**Game ID Format:**
- Basic: `YYYYMMDD-AWAY-HOME` (e.g., `20251115-TOR-BOS`)
- Multiple games same day: `YYYYMMDD-AWAY-HOME-{index}` (e.g., `20251115-TOR-BOS-1`)

---

### 7. Daily Team Gamelogs
**All team game logs for a date including game and stats**

```
GET /nhl/{season}/date/{date}/team_gamelogs.{format}
```

**Parameters:** Same as Daily Player Gamelogs (except no `player` or `position` params)

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/date/20251115/team_gamelogs.json?team=TOR
```

---

### 8. Seasonal Player Stats
**Each player along with their seasonal stats totals**

```
GET /nhl/{season}/player_stats_totals.{format}
```

**Parameters:**
- `player={list-of-players}`
- `position={list-of-positions}`
- `country={list-of-countries}` - Filter by player's country of birth (e.g., `USA`, `CAN`)
- `team={list-of-teams}`
- `date={date-range}` - Filter stats by date range
- `stats={list-of-stats}`
- `sort={sort-specifier}`
- `offset={number}`, `limit={number}`, `force={true|false}`

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/player_stats_totals.json
```

---

### 9. Seasonal Team Stats
**Each team along with their seasonal stats totals**

```
GET /nhl/{season}/team_stats_totals.{format}
```

**Parameters:**
- `team={list-of-teams}`
- `date={date-range}`
- `stats={list-of-stats}`
- `sort={sort-specifier}` - Options: `team.city`, `team.name`, `team.abbr`
- `offset={number}`, `limit={number}`, `force={true|false}`

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/team_stats_totals.json
```

---

### 10. Seasonal Standings
**All teams with stats and overall/conf/div/playoff rankings**

```
GET /nhl/{season}/standings.{format}
```

**Parameters:**
- `date={date}` - Standings as of a specific date (default: current date)
- `team={list-of-teams}`
- `stats={list-of-stats}`
- `force={true|false}`

**Example:**
```
https://api.mysportsfeeds.com/v2.1/pull/nhl/2025-2026-regular/standings.json
```

---

## Key Implementation Notes

### Team Format Options
Teams can be specified in multiple formats (case-insensitive):
- Team ID: `24`
- Team abbreviation: `tor`, `bos`, `nyr`
- City and team name: `toronto-maple-leafs`, `boston-bruins`

### Player Format Options
Players can be specified as:
- Last name only: `matthews`
- First and last: `auston-matthews`
- With ID (for disambiguation): `auston-matthews-1234`

### Position Format (NHL)
- Centers: `C`
- Left Wing: `LW`
- Right Wing: `RW`
- Defense: `D`
- Goalie: `G`

### Game Statuses
- `unplayed` - Scheduled but not started
- `in-progress` - Currently underway
- `postgame-reviewing` - Game over, reviewing against official sources
- `final` - Game is final and reviewed

### Rate Limiting & Caching
- Set `force=false` to avoid throttling restrictions and use cached data
- `force=true` (default) always returns most up-to-date content based on subscription

### Response Codes
- `200` - Success
- `304` - Not Modified (when `force=false` and no new data)
- `400` - Bad Request (e.g., invalid season keyword during offseason)
- `404` - Not Found (e.g., invalid game ID)

---

## Integration Example for Grading Contests

To fetch player gamelogs for grading contests:

```javascript
// Example: Get all player stats for a specific game
const gameDate = '20251115';
const gameId = '20251115-TOR-BOS';
const season = '2025-2026-regular';

const response = await fetch(
  `https://api.mysportsfeeds.com/v2.1/pull/nhl/${season}/date/${gameDate}/player_gamelogs.json?game=${gameId}`,
  {
    headers: {
      'Authorization': 'Basic ' + btoa(`${apiKey}:MYSPORTSFEEDS`)
    }
  }
);

const data = await response.json();
// data.gamelogs will contain all player stats for that game
```

---

## Subscription Tiers Summary

- **CORE** (included): Games, schedule, venues, current season
- **STATS** (addon): Player gamelogs, team gamelogs, seasonal stats, standings
- **DETAILED** (addon): Boxscore, play-by-play, lineup, injuries, player database
- **ODDS** (addon): Game lines, futures
- **PROJECTIONS** (addon): DFS projections, player projections
- **DFS** (addon): Daily fantasy data
- **EXTRAS** (addon): Draft information
