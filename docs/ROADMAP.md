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
| Record camera, microphone and screen in the app | **Built** (4 Nov 2026), screen capture untested on a real desktop | Media bin, Record button. Camera (with microphone), Screen (optionally with the microphone) and Voice only. Camera and microphone pickers, live preview, a level meter, a 3-2-1 countdown, a timer, then Stop adds the take to the media bin like an upload. Checked in a real browser with a fake camera and microphone: the preview played, the meter moved, and both takes came out as playable WebM that FFmpeg exports. WebM from the browser has no length in its header, so the media bin now reads it by seeking to the end. The desktop app lists screens and windows for the Screen picker and has camera and microphone permission entries for macOS. **Not tested:** the Screen mode and the macOS permission prompts, which need a real desktop. **Not built:** pause/resume, recording straight onto the timeline (see voiceover), system audio | N | M | M | M | M |
| Teleprompter | **Built** (4 Nov 2026), in the Record window | Camera and Voice modes in the Record window: tick Teleprompter, paste a script (or take the project's script), pick speed (60 to 260 words a minute), text size and mirroring. The script scrolls over the preview from the moment recording starts, with a reading line, and is not part of the recording. During the take: Slower, Faster, Pause scroll. Checked in a real browser: the text moved at 30.3 px/s against 29.7 expected for the chosen pace, held still when paused, and the speed change applied live. **Not built:** voiceover panel version, a second-screen or remote prompter, voice-following scroll, script formatting (cues, colours), starting scroll from a pre-roll | | N | M | M | S |
| Voiceover and ADR recording on the timeline | **Built** (4 Nov 2026), one-take recording | Edit page, Voiceover button in the program monitor's transport bar. A small panel in the corner (the editor stays visible) records the microphone after a 3-2-1 countdown, optionally playing the timeline from the playhead while recording (headphones advised), and drops the take on the first free audio track at the playhead, or a new audio track if none is free, so it never lands on existing audio. Checked in the real app in a browser with a fake microphone: the take landed on A1 at the start point, playback started with the take and stopped with it, and the timecode matched the take length. **Not built:** punch-in over an existing take, multiple takes with a pick, latency compensation (a take can sit a few tens of milliseconds late against the picture), pre-roll | M | M | N | N | M |
| Animated word-by-word captions with styles | **Partial** (4 Nov 2026): one style built | Titles panel, Subtitles tab, Animated captions card: lights up the word being spoken, in a choice of five colours, for a whole set of subtitles. Works in the preview, Quick Export and HQ export (each lit-word stretch is drawn once and switched at the word boundary). Checked in a real browser against a real render: the lit word moves one, two, three and sits within a pixel of the preview. Words come from the transcript's timing, or are spread evenly after an import or an edit that changes the word count. **Not built:** other styles (pop, karaoke fill, one word at a time), per-word timing editing | N | N | M | M | M |
| SRT and VTT import and export | **Built** (4 Nov 2026): import and export. **Not built:** translation | Titles panel, Subtitles tab. Import reads .srt and .vtt (byte order marks, Windows line endings, WebVTT headers and notes, tags, positioning settings) and lays editable subtitle clips on the timeline at the times in the file. Export writes the timeline's subtitle clips as .srt or .vtt. Checked in a real browser, and round trips keep timing to the millisecond. Imported words are spread evenly across each cue, since a subtitle file has no word timing. | M | M | M | N | S |
| Brand kit (fonts, colours, logos) applied to titles and captions | **Built** (4 Nov 2026), per project | Titles panel, Brand tab. Four colours (text, plate, primary, highlight), heading and body fonts (type a name, or add a .ttf, .otf, .woff or .woff2 file, which is saved inside the project and works in the preview and both exports), and a logo. "To selected title" and "To all titles" swap in the brand's fonts and colours and keep size, position, motion and timing. New titles from Presets start branded. "Add logo to timeline" puts the logo on its own top track, top right, for the whole timeline. The tab lists titles that are off brand and jumps to them. Checked in the real app: an uploaded font and plate colour were applied to a title and showed in the preview, the off-brand list went from 1 to none, and the logo landed on a new track. **Not built:** a shared kit across projects (it lives in one project), logo position and size controls (set in the Inspector after adding), lower-third and caption presets designed around the kit, brand-safe colour pairs and contrast check, and the kit is not yet reachable from the AI assistant | | N | M | N | M |
| One master to many sizes (9:16, 1:1, 4:5, 16:9) | **Built** (4 Nov 2026), HQ export in the desktop app, one focus point | Download page, "One master, many sizes". Tick 16:9, 9:16, 1:1 and 4:5; each is rendered with the HQ export at its own frame size, named like `my-video-9x16.mp4`, with the bitrate scaled to the pixel count. Titles and captions are redrawn for each frame so they land in the right place. "Fill the frame" crops full-frame pictures around a chosen left-to-right focus point; "Fit the whole picture" leaves bars. Logos, picture-in-picture and other scaled-down clips are never cropped. Checked with real FFmpeg renders (bars for fit; left, centre and right focus show the expected colours; a small overlay stays whole) and in the full app with a stubbed exporter: one render per ticked size with the right size, file name, bitrate and focus, a Stop button, and per-size status. **Not built:** a different focus per clip, subject-aware or tracked cropping, cancelling a render that is already running (Stop waits for the current size), a different logo position per size, a browser-only version (needs the desktop app and a saved project folder). The Luma Ray 2 AI reframe in Compositing is separate | | | M | M | M |
| Command palette (Ctrl or Cmd + K) | **Built** (4 Nov 2026), pages and app actions only | Ctrl or Cmd + K opens a search box from anywhere, even while typing. It finds every page the current mode shows (by name, description or synonym, with letters-in-order matching), plus Open settings, Show or hide the sidebar, Show or hide activity, and switching between Simple, Standard and Pro. Arrow keys, Enter, Esc; recently used commands come first. Checked in the real app: opened, filtered "edit vid" to Edit Video, Enter went to the Edit page, recents ordered, "no match" message, Esc closed, Settings opened. **Not built:** editing actions (split, add marker, export, record), search across clips, media or projects | N | N | N | N | S |
| Generation history, fork, pin and compare | **Built** (5 Nov 2026), images and video | Create Images keeps its history (now 20 unpinned results plus any you pin; a pinned result is never dropped). Each result has Pin, Compare and Fork settings. Tick two results (a third replaces the first) and a side-by-side view shows both, the prompt with words only in A in red and only in B in green, and a settings table that lists just what changed (with Show all). Fork A or Fork B loads that result's prompt and settings into the generator. Create Videos has the same Compare on its results, with Play both and Pause for the two clips together; new video results record their prompt, model, length, aspect ratio, look and whether start and end frames were used. Checked with unit tests for the diff, pinning and trimming, and in the full app: seeded image history (24 entries trimmed to 20, pin saved, compare showed the red and green words and the one changed setting, Fork B filled the prompt) and two videos compared with both playing at once. **Not built:** history for videos made before this change (they have a model name and no settings), a video history that survives closing the generator beyond what is in the project, forking a video's full settings (only its prompt is loaded), a three-way compare, a seed or version tree, and a real generation run to confirm the video settings are recorded (no API keys here; typechecked only). Image history still lives in this computer's browser storage, not in the project file | | | M | | M |
| Project-wide cost and credit budget | **Built** (4 Nov 2026), AI generation spend only | Pricing & Usage screen (profile menu, or Ctrl or Cmd + K, "Open costs and budget"): set a limit in your display currency and choose Warn me or Stop it. A meter shows spend against the limit and turns amber at 80%. The Create Videos and Create Images pages show where the budget would stand with the generation you are about to start; in Stop it mode the button reads Over budget and does nothing. The older pop-up generation dialogs show the same line and block the same way. The limit is saved with the project. Checked in the real app with test usage: spend and meter matched the rates (66%, 93% amber, over red), a $1.50 limit blocked a $0.75 video after $1.12 spent while a $100 limit did not, and the image page blocked at a $1.20 limit. This also fixed the costs screen, whose text was white on light cards. **Not built:** a credit budget for hosted plans (the limit is in money), alerts as spend crosses 80% while you are elsewhere, per-feature or per-scene limits, counting the software fee or extra lines, blocking other paid actions that skip these pages (the AI assistant, auto-cut, avatar and audio tools). Spend uses the cost screen's rates, so with your own keys it can read about 2% above the provider's bill | | M | M | N | M |
| AI-disclosure labels and usage-rights ledger | **Built** (5 Nov 2026), a disclosure record, not an on-screen label or a licence check | Download page, "AI disclosure". Lists every file on the timeline with where it came from: generated in the app (counted as AI, except sound mastering), stock, or imported. Imported files cannot be checked, so each has a menu to mark it Made with AI or Not AI, and any file's call can be overridden; the mark is saved with the project. Shows how many files are AI-made and for what share of the running time (overlaps counted once), gives a line to paste into the caption (short, or with the tool names), and downloads a CSV of every file with its tool or model, prompt and the times it plays. Titles and captions are not counted as media. Checked with unit tests for classification, overlap maths, wording and CSV quoting and formula guarding, and in the full app with an imported clip: marking it as AI produced the line, the CSV and the copy, and clearing the mark reverted it. **Not built:** an on-screen "made with AI" label burned into the video, writing the label into the file's metadata (C2PA or similar), the licence or usage terms of each AI provider or stock source (the CSV has no rights column), checking uploads for AI automatically, and per-platform upload steps (the panel only says rules differ and change; I could not read the platforms' own pages from here, so it makes no claim about their wording) | | | S | M | S |

## Phase 2: the filmmaker

| Capability | Status | Pro | Film | Ads | Every | Size |
| --- | --- | --- | --- | --- | --- | --- |
| Call sheet, schedule and budget from the script breakdown | Not found | | M | | | M |
| Animatic builder (storyboard, temp audio, timing to a playable cut) | **Built** (5 Nov 2026), voiceover-timed rough cut | Edit page, Animatic (also Ctrl or Cmd + K, "Build animatic from storyboard"). Lists the storyboard shots in order. Each shot's picture is held for as long as its voiceover recording takes (plus a short pause), or for its voiceover words at a set reading speed, or a default length; a shot with a generated video can use the video at its own length. Each length can be changed per shot, shots can be left out, and the voiceover goes on the audio track under its picture. Shots with no picture are listed as left out. The cut is added after what is already on the video track. Checked with unit tests (ordering, skipping, the three ways of timing, limits, video preference, voiceover off) and in the full app with a loaded project of four shots: a 3 second recording gave 3.4 seconds, 8 words gave 3.5, the default gave 3, the picture-less shot was skipped, an edited length and an unticked shot changed the total, and Build put two pictures and a voiceover on the timeline in the right places. **Not built:** temp music or sound effects, transitions between shots, camera moves or Ken Burns on the stills, keeping the cut in step when the storyboard changes later (it is built once; rebuild adds another), timing from dialogue in the script rather than the voiceover text, and a run with real generated videos (the video length code is only unit-tested) |  N | M | N | | M |
| Cast and locations bible with a drift detector | Partial: identity locks and continuity exist | | M | N | | M |
| Speed ramps and time remap with frame interpolation | **Partly built** (5 Nov 2026): preset speed ramps; no frame interpolation | Clip inspector, Speed ramp: Slow-mo hit (normal, a quarter speed in the middle, normal), Ease into slow, Speed up, Slow then snap, Whoosh. A ramp cuts the clip into about 12 consecutive pieces, each at its own constant speed, and moves later clips on that track along to fit, so the preview and the HQ export play it the same with no new render code. Undo puts the clip back. Checked with unit tests (pieces cover the source with no gaps, speeds stay between 0.25× and 4×, no step between neighbours bigger than about 1.4×, shorter clips get fewer pieces) and a real FFmpeg render: output length matched the pieces to within a quarter of a second and five sample moments showed the right part of the source. In the app a ramp turned a clip into 12 pieces, pushed the later clips out by the extra time, and undo restored it. **Not built:** a draggable speed curve, editing a ramp after it is applied (apply a different one to a piece, or undo), smooth slow motion that invents in-between frames (slow pieces repeat frames, so a quarter speed on 30 fps footage looks steppy), keeping motion keyframes and Ken Burns across the pieces (only the first keeps them), audio pitch stays natural but steps slightly between pieces, and ramps on audio-only clips | M | N | M | N | M |
| Adjustment layers | Not found | M | N | N | | M |
| Per-clip EQ, compressor and loudness meter | Not found; mastering exists on the Sound page | M | M | N | N | L |
| Lip-sync and dubbing | Not found | N | M | M | | L (needs a provider) |
| Review links with timecoded comments for people without the app | Partial: Review page has annotations, change requests and director feedback; no external sharing found | M | M | M | | L |
| Restore-point timeline | **Built** (5 Nov 2026), timeline only | Edit page, Restore points (also Ctrl or Cmd + K, "Restore points"). The app saves a point about a minute after you first add clips and then at most every five minutes, and only when the edit has changed; you can also save one with a name. Each point lists its clip and track count, length, when it was made and what restoring would do (clips brought back, removed or changed), and warns about clips whose media has left the project. Restoring asks first and saves the current edit as a "before a restore" point, so a restore can itself be reversed. Automatic points are capped at 20; points you save and the before-restore ones are never dropped. Saved in the project folder as `restore-points.json` in the desktop app, or in this computer's browser storage when there is no folder. Checked with unit tests (fingerprints, capture rules, pruning, change counts, bad data) and in the full app: an automatic point appeared after about a minute, a named point was saved, restoring went 4 clips to 2, and restoring the before-restore point went back to 4. Testing also caught and fixed a crash from placing the hooks after the sign-in return. **Not built:** media, titles' fonts, brand kit, captions styling outside the timeline and project settings are not in a point (it is the clips and tracks only); a visual preview or diff of a point; points taken on export or before AI actions; restoring only part of a timeline; a restore that is one undo step (tracks are not in undo); testing the folder-based save in the desktop app (only the browser-storage path was run) | | | M | M | M |
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
