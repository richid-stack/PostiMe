# Roadmap

Features PostiMe does not have yet, checked against the code. Ordered by how soon a working pro would hit the gap.

## Tier 1: gaps in the first hour

1. **Command palette (Ctrl/Cmd+K).** Jump to any workspace, shot, asset or node; run any action from the keyboard.
2. **Generation history with branching.** Every generation keeps prompt, seed, model and references. Fork from any take, pin a winner, compare side by side.
3. **Project-wide cost and credit budget.** Per-shot cost, a spending cap, a warning before an expensive batch.
4. **Persistent render queue and jobs tray.** Survives restarts; reorder, resume, notify on finish.
5. **Autosave with a restore-point timeline.** Crash recovery and named snapshots you can preview before restoring.
6. **Wipe/split compare.** Slide between two takes or before/after grade, frame-locked.

## Tier 2: production

7. **Shareable review links.** Frame-accurate timecoded comments and approve/reject for people without the app.
8. **Call sheet, shooting schedule and budget** generated from the script breakdown.
9. **Animatic builder.** Storyboard panels, temp audio and timing become a playable animatic that drops onto the timeline.
10. **Multicam.** Waveform sync and live angle switching.
11. **Speed ramps and time remap** with optical-flow interpolation.
12. **Lip-sync and dubbing.** Translate dialogue, clone the voice, re-sync the mouth.
13. **Cast and locations bible.** Identity locks enforced in every generator, with a drift detector that flags shots where a character stops matching.
14. **Stabilisation and tracked graphics.** Pin text, stickers or masks to moving subjects.

## Tier 3: platform

15. **Multi-user presence.** Cursors, per-shot locks, activity feed.
16. **Keyboard map editor** with Premiere, Resolve and Final Cut presets.
17. **Signed, sandboxed plugins** and a plugin registry.
18. **Accessibility pass.** Fully keyboard-operable timeline, screen-reader labels, reduced motion honoured in canvas and 3D views.

## Design debt

- Replace the in-app logo component (still upstream's) before any public release.
- Unify remaining Tailwind-styled calls to action with `.app-primary`.
- Settle a radius scale across older screens (12/16/22/28).
- Split `ProjectHubWorkspace.tsx` (about 1.3 MB) into feature modules.
- Self-host fonts in `portal.html`.
