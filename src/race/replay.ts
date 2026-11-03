import type { CarState, RaceSnapshot } from "../shared/types";

type ReplayFrame = { at: number; cars: CarState[] };
type ReplayTape = {
  roomCode: string;
  raceId: number;
  frames: ReplayFrame[];
  firstFinisherId?: string;
  finishAt?: number;
};
let tape: ReplayTape | undefined;

/** Display-only, bounded and ephemeral: never feeds replay state back into the simulation. */
export function recordRaceReplay(snapshot: RaceSnapshot, at: number) {
  if (
    !snapshot.raceStartedAt ||
    (snapshot.phase !== "racing" && snapshot.phase !== "results")
  )
    return;
  if (
    tape?.roomCode !== snapshot.roomCode ||
    tape.raceId !== snapshot.raceStartedAt
  )
    tape = {
      roomCode: snapshot.roomCode,
      raceId: snapshot.raceStartedAt,
      frames: [],
    };
  if (tape.finishAt && at > tape.finishAt + 1500) return;
  if (
    tape.frames.length &&
    at - tape.frames[tape.frames.length - 1].at < 60 &&
    !snapshot.cars.some((c) => c.finished)
  )
    return;
  if (!tape.firstFinisherId) {
    const winner = snapshot.cars
      .filter((c) => c.finished)
      .sort(
        (a, b) =>
          (a.finishTime ?? Infinity) +
          a.timedRaceStartedAt -
          ((b.finishTime ?? Infinity) + b.timedRaceStartedAt),
      )[0];
    if (winner) {
      tape.firstFinisherId = winner.playerId;
      tape.finishAt = at;
    }
  }
  tape.frames.push({ at, cars: snapshot.cars.map((c) => ({ ...c })) });
  while (tape.frames.length > 150 || tape.frames[0].at < at - 9000)
    tape.frames.shift();
}

export function readRaceReplay(roomCode: string, raceId?: number) {
  if (
    !tape ||
    tape.roomCode !== roomCode ||
    tape.raceId !== raceId ||
    !tape.firstFinisherId ||
    tape.frames.length < 3
  )
    return undefined;
  const end = tape.frames[tape.frames.length - 1].at;
  const frames = tape.frames.filter(
    (f) => f.at >= (tape!.finishAt ?? end) - 6000,
  );
  return {
    frames,
    firstFinisherId: tape.firstFinisherId,
    start: frames[0].at,
    end,
  };
}
