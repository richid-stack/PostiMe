import test from 'node:test';
import assert from 'node:assert/strict';

test('voiceover goes on a free audio track, targeted first, never on top of audio', async () => {
  const { pickVoiceoverTrack } = await import('./voiceoverPlacement.ts');
  const tracks = [
    { id: 'v1', type: 'video', isTargeted: true },
    { id: 'a1', type: 'audio', isTargeted: true },
    { id: 'a2', type: 'audio' },
    { id: 'a3', type: 'audio', isLocked: true },
  ];

  assert.equal(pickVoiceoverTrack(tracks, [], 2, 5)?.id, 'a1', 'targeted audio track when empty');
  assert.equal(pickVoiceoverTrack(tracks, [{ trackId: 'a1', start: 0, end: 10 }], 2, 5)?.id, 'a2', 'next free track when the targeted one is busy');
  assert.equal(pickVoiceoverTrack(tracks, [{ trackId: 'a1', start: 0, end: 2 }], 2, 5)?.id, 'a1', 'a clip that ends where the take starts is not a clash');
  assert.equal(pickVoiceoverTrack(tracks, [{ trackId: 'a1', start: 7, end: 9 }], 2, 5)?.id, 'a1', 'a clip that starts where the take ends is not a clash');
  assert.equal(pickVoiceoverTrack(tracks, [{ trackId: 'a1', start: 4, end: 5 }], 2, 5)?.id, 'a2', 'a clip inside the take is a clash');
  assert.equal(pickVoiceoverTrack(tracks, [{ trackId: 'a1', start: 0, end: 10 }, { trackId: 'a2', start: 1, end: 3 }], 2, 5), null, 'none free: caller adds a track');
  assert.equal(pickVoiceoverTrack(tracks, [{ trackId: 'v1', start: 0, end: 10 }], 2, 5)?.id, 'a1', 'video clips do not matter');
  assert.equal(pickVoiceoverTrack([{ id: 'a3', type: 'audio', isLocked: true }], [], 0, 3), null, 'locked tracks are skipped');
  assert.equal(pickVoiceoverTrack(tracks, [], -3, 5)?.id, 'a1', 'negative start is treated as zero');
});
