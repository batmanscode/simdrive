import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RoomState } from "../shared/types";
import { readRaceReplay } from "./replay";

export function ReplayDialog({
  room,
  onClose,
  render,
}: {
  room: RoomState;
  onClose: () => void;
  render: (replay: RoomState, focusId: string) => ReactNode;
}) {
  const [record] = useState(() =>
    readRaceReplay(room.roomCode, room.raceStartedAt),
  );
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const playhead = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!record || !playing) return;
    const started = performance.now() - playhead.current;
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - started;
      playhead.current = elapsed;
      const at = record.start + elapsed;
      let next = 0;
      while (
        next < record.frames.length - 1 &&
        record.frames[next + 1].at <= at
      )
        next++;
      setFrame(next);
      if (at >= record.end) setPlaying(false);
    }, 66);
    return () => window.clearInterval(interval);
  }, [playing, record]);
  if (!record) return null;
  const replay = { ...room, cars: record.frames[frame].cars, crashEvents: [] };
  const progress =
    (record.frames[frame].at - record.start) /
    Math.max(1, record.end - record.start);
  return (
    <dialog
      ref={dialog}
      className="replay-dialog"
      aria-labelledby="replay-title"
      onCancel={onClose}
    >
      <header>
        <div>
          <span>THE FIRST FINISH</span>
          <h2 id="replay-title">One more look.</h2>
        </div>
        <button type="button" onClick={onClose} autoFocus>
          Close
        </button>
      </header>
      <div className="replay-viewport">
        {render(replay, record.firstFinisherId)}
        <span className="replay-label">
          REPLAY ·{" "}
          {room.players.find((p) => p.id === record.firstFinisherId)?.name}
        </span>
      </div>
      <div className="replay-progress">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <footer>
        <button
          type="button"
          onClick={() => {
            if (frame >= record.frames.length - 1) {
              playhead.current = 0;
              setFrame(0);
              setPlaying(true);
            } else setPlaying(!playing);
          }}
        >
          {frame >= record.frames.length - 1
            ? "Replay again"
            : playing
              ? "Pause"
              : "Play"}
        </button>
        <small>A local replay of the first car across the line.</small>
      </footer>
    </dialog>
  );
}
