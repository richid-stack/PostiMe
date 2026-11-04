/**
 * Where a recorded voiceover goes on the timeline.
 *
 * It takes the first unlocked audio track that is free for the whole take (the targeted one first), so it never lands
 * on top of existing audio. When none is free the caller adds a new audio track.
 */

export interface PlacementTrack {
  id: string;
  type: string;
  isLocked?: boolean;
  isTargeted?: boolean;
}

export interface PlacementClip {
  trackId: string;
  start: number;
  end: number;
}

const EPSILON = 0.001;

export const pickVoiceoverTrack = <T extends PlacementTrack>(
  tracks: T[],
  clips: PlacementClip[],
  start: number,
  length: number,
): T | null => {
  const from = Math.max(0, start);
  const to = from + Math.max(0, length);
  const isFree = (trackId: string) => !clips.some((clip) => clip.trackId === trackId && clip.end > from + EPSILON && clip.start < to - EPSILON);
  const candidates = tracks.filter((track) => track.type === 'audio' && !track.isLocked);
  return candidates.find((track) => track.isTargeted && isFree(track.id))
    ?? candidates.find((track) => isFree(track.id))
    ?? null;
};
