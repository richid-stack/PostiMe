# Roadmap

What PostiMe still needs, by who is using it, checked against the code on 2 Nov 2026.

## How to read this

- **Status** is what the code shows today.
  - **Built**: works end to end.
  - **Partial**: exists, with a named gap.
  - **Broken**: the UI offers it, but it does not do the job.
  - **Not found**: a code search found nothing. That is strong evidence, not proof.
- **Need** is how much each kind of user needs it. **M** = must have, **N** = nice to have, blank = rarely.
  - **Pro** = editor, colourist or sound mixer in a post house.
  - **Film** = indie filmmaker.
  - **Ads** = ad and social creator.
  - **Every** = everyday video maker.
- **Size** is a rough guess for one engineer: **S** days, **M** one to two weeks, **L** several weeks, **XL** months.
- Nothing here was tested with real footage. Where a claim rests on reading code, it says so.

## Who PostiMe is for

**Primary:** the ad and social creator, and the indie filmmaker. The AI generation, script-to-storyboard flow and continuity tools already fit them.

**Secondary:** the everyday video maker. Mostly the same fixes help them.

**Pro finishing is a handoff, not a goal.** Pros generate and assemble in PostiMe, then finish in Resolve or Premiere through OTIO, FCPXML and EDL. PostiMe does not try to replace Resolve, Pro Tools or a DCP mastering suite.

## Phase 0: make what exists honest

These are defects in what the app already offers. Fix them before adding anything.

| Item | Status | What the code shows | Size |
| --- | --- | --- | --- |
| Timeline chroma key | **Broken** | The effect stores a colour and tolerance on the clip, but `PreviewPlayer.tsx` never draws it and HQ export rejects it. The only working keyer is on still images in Compositing. | M |
| Export that keeps effects and audio | **Broken** | Quick Export records the preview canvas and, per a code comment, captures picture only. HQ FFmpeg export keeps audio but rejects clips with text, transitions, chroma key, blend modes, custom LUTs or opacity keyframes. No audio-only export. | L |
| Compositing palette promises | **Partial** | Tracker, stabilise, match-move, roto and others are in the node palette. The in-app render path I read handles key, grade and merge on stills. Label the rest "needs Natron or Nuke" or build them. | S |
| Logo and plugin registry | **Partial** | The in-app logo is still upstream's, and the default plugin registry points at the upstream author's repository. Release blockers. | S |

How to fix the first two:
- FFmpeg already has `chromakey`, `despill`, `xfade`, `drawtext`, `blend` and `lut3d` filters, so HQ export parity is realistic. It is the larger job.
- Preview keying is a WebGL shader on the existing canvas. Real-time at 1080p is realistic on an ordinary GPU.
- Quick Export audio means mixing the timeline audio offline and muxing it, or retiring Quick Export once HQ has parity.

## Phase 1: the creator loop

Capture, caption, brand, size, ship.

| Capability | Status | Pro | Film | Ads | Every | Size |
| --- | --- | --- | --- | --- | --- | --- |
| Record camera, microphone and screen in the app | Not found | N | M | M | M | M |
| Teleprompter | Not found | | N | M | M | S |
| Voiceover and ADR recording on the timeline | Not found | M | M | N | N | M |
| Animated word-by-word captions with styles | Partial: word timings exist on clips, no styles | N | N | M | M | M |
| SRT and VTT import and export, plus translation | Not found | M | M | M | N | S |
| Brand kit (fonts, colours, logos) applied to titles and captions | Not found | | N | M | N | M |
| One master to many sizes (9:16, 1:1, 16:9) | Partial: AI reframe via Luma Ray 2 in Compositing; no one-click batch, no subject-aware crop | | | M | M | M |
| Command palette (Ctrl or Cmd + K) | Not found | N | N | N | N | S |
| Generation history, fork, pin and compare | Partial: image generation keeps full-settings history; none found for video; no fork, pin or compare | | M | M | | M |
| Project-wide cost and credit budget | Partial: per-feature estimates only | | M | M | N | M |
| AI-disclosure labels and usage-rights ledger | Not found | N | M | M | N | S |

## Phase 2: the filmmaker

| Capability | Status | Pro | Film | Ads | Every | Size |
| --- | --- | --- | --- | --- | --- | --- |
| Call sheet, schedule and budget from the script breakdown | Not found | | M | | | M |
| Animatic builder (storyboard, temp audio, timing to a playable cut) | Not found | N | M | N | | M |
| Cast and locations bible with a drift detector | Partial: identity locks and continuity exist | | M | N | | M |
| Speed ramps and time remap with frame interpolation | Partial: constant speed only | M | N | M | N | M |
| Adjustment layers | Not found | M | N | N | | M |
| Per-clip EQ, compressor and loudness meter | Not found; mastering exists on the Sound page | M | M | N | N | L |
| Lip-sync and dubbing | Not found | N | M | M | | L (needs a provider) |
| Review links with timecoded comments for people without the app | Partial: Review page has annotations, change requests and director feedback; no external sharing found | M | M | M | | L |
| Restore-point timeline | Partial: autosave works; no restore-point UI found | M | M | M | M | M |
| Persistent render queue and jobs tray | Partial: a queue exists | N | M | M | N | M |

## Phase 3: reach (post it, learn from it)

This is PostiMe's own tagline, and none of it is built. The Marketing step generates posters, thumbnails and promo images only.

| Capability | Status | Pro | Film | Ads | Every | Size |
| --- | --- | --- | --- | --- | --- | --- |
| Publish and schedule to YouTube, TikTok and Instagram | Not found | | N | M | N | L |
| Performance analytics loop back into the project | Not found; an Analysis page exists, I did not check what it reads | | N | M | N | L |
| Batch variants (hook, call to action, voice, language) | Not found | | | M | | L |
| A/B variant tracking | Not found | | | M | | M |

Platform rules decide the schedule here. YouTube, TikTok and Instagram each need an app registration and a review before posting works for real users, and the rules change. Start those applications during Phase 1 and verify the current terms before building.

## Phase 4: pro depth

| Capability | Status | Pro | Film | Ads | Every | Size |
| --- | --- | --- | --- | --- | --- | --- |
| Multicam with waveform sync | Not found | M | N | | | L |
| Nested sequences and compound clips | Not found | M | N | | | L |
| In-app tracking and stabilisation | Not found; nodes exist in the palette | M | N | N | | L |
| Colour curves, qualifiers and power windows | Not found; Color page has primaries, Film and LUT, AI colorist | M | N | | | L |
| Vectorscope and parade | Not found; waveform and histogram only | M | N | | | S |
| Multi-user presence (cursors, activity feed) | Partial: a collaborative lock type exists; cursors not found | M | N | | | XL |
| Keyboard map editor with Premiere, Resolve and Final Cut presets | Not found | M | N | | N | S |
| Conform and relink from EDL or XML | Partial: OTIO import exists on the Import page | M | N | | | M |
| Signed, sandboxed plugins | Partial: plugin system exists | N | | | | M |
| Accessibility pass (keyboard timeline, screen-reader labels, reduced motion in canvas and 3D) | Partial | N | N | N | N | M |

## Possible and limits

| Feature | Realistic approach | Limit |
| --- | --- | --- |
| Green screen | Stills in-app today, video through CorridorKey on desktop, preview shader to build | The built-in key is a colour-distance key. It struggles with hair and uneven lighting. CorridorKey needs a local GPU setup and runs only in the desktop app. |
| Roto, tracking, VFX comp | AI mask and roto nodes, Natron or Nuke export | Not real-time in the app. Natron or Nuke must be installed. |
| Recording | `getUserMedia` and `MediaRecorder`; desktop capture for screen | Recordings arrive as WebM, so convert with FFmpeg. Permissions differ by browser and OS. |
| Multicam | Audio cross-correlation for sync | Many 4K streams in a browser need proxies. |
| Frame interpolation | FFmpeg `minterpolate`, or an AI interpolation model | `minterpolate` is slow and shows artefacts on fast motion. |
| Dubbing and lip-sync | Provider APIs | Quality, language coverage, cost and consent for a person's voice and likeness. |
| Posting and analytics | Official platform APIs | App review, quotas and account types. Check current terms before promising anything. |
| Pro colour and HDR | 10-bit HEVC and ProRes export exist through FFmpeg | Browser playback is not HDR-accurate. Finish in Resolve. |
| Non-goals | | Replacing Resolve or Pro Tools, DCP mastering, control surfaces, a render farm. |

## Decisions that need you

1. **Primary user.** This roadmap assumes ad and social creator plus indie filmmaker. Say so if it should be someone else.
2. **Licence.** PostiMe is GPL-3.0-or-later, so distributing it means releasing the source. A closed-source product needs a different base or permission from the upstream author.
3. **Logo.** Replace the upstream logo before any public release.
4. **AI providers.** Dubbing, lip-sync and interpolation each depend on a vendor choice.

## Design debt

- Unify remaining Tailwind-styled calls to action with `.app-primary`.
- Settle a radius scale across older screens (12, 16, 22, 28).
- Split `ProjectHubWorkspace.tsx` (about 1.3 MB) into feature modules.
- Self-host fonts in `portal.html`.
