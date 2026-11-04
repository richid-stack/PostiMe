# Roadmap

What PostiMe still needs, by who is using it, checked against the code on 2 Nov 2026 (Phase 0 updated the same day after the export and green-screen work).

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

These are defects in what the app already offered. Done items stay here so the history is visible.

| Item | Status | What the code shows | Size |
| --- | --- | --- | --- |
| Timeline chroma key in the preview | **Built** (2 Nov 2026) | The effect used to store a colour and tolerance that nothing drew. It now keys on the GPU (WebGL, with a CPU fallback) using chroma only, so unevenly lit green still keys as one colour. Inspector has key colour, tolerance, edge softness and spill removal. Checked in a real browser. | done |
| Chroma key in HQ export | **Built** | FFmpeg `chromakey` and `despill`, using the same parameter mapping as the preview. Checked on a real render: light and dark green are replaced, the subject stays. | done |
| Audio in HQ FFmpeg export | **Built** | Earlier this document said HQ kept audio. That was wrong: it ignored every audio track, including the sound inside video clips. It now mixes audio-track clips and video-clip sound with trim, speed, volume and volume keyframes, placed on the timeline, limited and padded to the picture length. AAC, or uncompressed PCM for ProRes. Checked on a real render. | done |
| Audio in Quick Export | **Built** | Quick Export recorded the picture only. The player now routes every clip's sound into the recording. Playback is silent while exporting. Checked in a real browser: placement and levels were right. | done |
| Blend modes, custom LUTs and opacity keyframes in HQ export | **Built** | All nine blend modes the Inspector offers, imported `.cube` LUTs (with the intensity slider) and keyframed opacity now render in HQ export. Blend modes are done in RGB and masked by the clip's own alpha, so a keyed clip still blends correctly. Checked on real renders against hand-calculated colours, including a keyed clip with a grade and a LUT. | done |
| Titles and text overlays in HQ export | **Built** | Each title is drawn in the app with the same code as the preview (fonts, plates, lower-third bars, outline) into a transparent image at the export size, then placed like any clip, so position, scale, opacity and keyframes work. Checked in a real browser against a real render: the title, a lower-third bar and a sliding, fading title match the preview to within a pixel. Not carried over: "auto contrast" (it samples the picture behind the title in the preview) and the text blur keyframe. | done |
| Transitions in HQ export | **Built** | All ten transitions (Cross Fade, Fade to Black, Fade to White, Dip to White, Zoom In, Swipe Left, Glitch Cut, Whip Pan, Lightning Flash, Film Burn) render in HQ export using the preview's own formulas, written as FFmpeg expressions, so the glitch shake and the flash curves match. Checked on real renders against hand-calculated pixels at the half-way point, and before and after. Like the preview, the next clip shows as a held first frame during the transition, sound is not crossfaded, and the held frame ignores the next clip's keyframes, key and custom LUT. | done |
| Audio-only export | **Partial** | Still unsupported in HQ export. | S |
| Quick Export burned guides into titled videos | **Fixed** | The preview draws dashed "Title Safe" guides whenever a title is on screen, and Quick Export records that canvas, so the guides were in the exported file. Upstream behaviour. The export player now hides them. | done |
| Compositing palette promises | **Partial** | Tracker, stabilise, match-move, roto and others are in the node palette. The in-app render path I read handles key, grade and merge on stills. Label the rest "needs Natron or Nuke" or build them. | S |
| Logo and plugin registry | **Partial** | The in-app logo is still upstream's, and the default plugin registry points at the upstream author's repository. Release blockers. | S |

Limits worth knowing:
- Quick Export records in real time, so a 10 minute timeline takes 10 minutes. HQ export does not.
- Quick Export audio needs media that the browser may read. Remote media served without CORS headers records as silence.
- The preview key and the FFmpeg key use the same mapping but are not bit-identical, because FFmpeg works in limited-range YUV. Expect a close match, not identical edges.
- A red key colour is keyed but not despilled in HQ export, because FFmpeg's `despill` only supports green and blue.
- HQ export places clips on even pixels (FFmpeg's overlay snaps positions on 4:2:0 video), so a clip can sit up to 1 px from where the preview draws it.
- Title size is in pixels of the export canvas, the same as Quick Export, so a title looks relatively smaller in a 4K export than in a 1080p one.

Everything the preview can show now also exports through HQ export, except audio-only output and the two title items noted above.

## Phase 1: the creator loop

Capture, caption, brand, size, ship.

| Capability | Status | Pro | Film | Ads | Every | Size |
| --- | --- | --- | --- | --- | --- | --- |
| Record camera, microphone and screen in the app | Not found | N | M | M | M | M |
| Teleprompter | Not found | | N | M | M | S |
| Voiceover and ADR recording on the timeline | Not found | M | M | N | N | M |
| Animated word-by-word captions with styles | **Partial** (4 Nov 2026): one style built | Titles panel, Subtitles tab, Animated captions card: lights up the word being spoken, in a choice of five colours, for a whole set of subtitles. Works in the preview, Quick Export and HQ export (each lit-word stretch is drawn once and switched at the word boundary). Checked in a real browser against a real render: the lit word moves one, two, three and sits within a pixel of the preview. Words come from the transcript's timing, or are spread evenly after an import or an edit that changes the word count. **Not built:** other styles (pop, karaoke fill, one word at a time), per-word timing editing | N | N | M | M | M |
| SRT and VTT import and export | **Built** (4 Nov 2026): import and export. **Not built:** translation | Titles panel, Subtitles tab. Import reads .srt and .vtt (byte order marks, Windows line endings, WebVTT headers and notes, tags, positioning settings) and lays editable subtitle clips on the timeline at the times in the file. Export writes the timeline's subtitle clips as .srt or .vtt. Checked in a real browser, and round trips keep timing to the millisecond. Imported words are spread evenly across each cue, since a subtitle file has no word timing. | M | M | M | N | S |
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
| Green screen | Timeline preview (GPU shader) and HQ export (FFmpeg) key on chroma; stills in Compositing; hard shots through CorridorKey on desktop | The built-in key is a chroma-distance key, much better than RGB on uneven lighting but not a hair-quality keyer. CorridorKey needs a local GPU setup and runs only in the desktop app. |
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
