import type { Championship, RaceResult, TrackId } from "./types.js";

export const CHAMPIONSHIP_POINTS = [12, 9, 7, 5, 4, 3, 2, 1];
export function scoreRound(series: Championship, results: RaceResult[]) {
  if (series.scoredRounds >= series.round) return;
  for (const [place, result] of results.entries()) {
    let standing = series.standings.find((s) => s.playerId === result.playerId);
    if (!standing) {
      standing = {
        playerId: result.playerId,
        name: result.name,
        color: result.color,
        points: 0,
        wins: 0,
      };
      series.standings.push(standing);
    }
    standing.name = result.name;
    standing.color = result.color;
    if (result.status === "finished") {
      standing.points += CHAMPIONSHIP_POINTS[place] ?? 0;
      if (place === 0) standing.wins++;
    }
  }
  series.standings.sort(
    (a, b) =>
      b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name),
  );
  series.scoredRounds = series.round;
}

export function nextSeriesTrack(
  series: Championship,
  current: TrackId,
  available: TrackId[],
  activePlayers: string[],
) {
  const counts = new Map<TrackId, number>();
  for (const [playerId, track] of Object.entries(series.votes)) {
    if (activePlayers.includes(playerId) && available.includes(track))
      counts.set(track, (counts.get(track) ?? 0) + 1);
  }
  // Equal votes use the next course in the existing picker order: predictable, never random.
  const start = Math.max(0, available.indexOf(current));
  const ordered = [
    ...available.slice(start + 1),
    ...available.slice(0, start + 1),
  ];
  return ordered.reduce(
    (best, track) =>
      (counts.get(track) ?? 0) > (counts.get(best) ?? 0) ? track : best,
    ordered[0],
  );
}
