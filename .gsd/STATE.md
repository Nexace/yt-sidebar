# State

## Spec
Persistent side panel with YouTube / YouTube Music for Chrome, Edge, Brave (MV3 `chrome.sidePanel`).
Same content on every tab; remembers position across close/restart; minimize keeps audio playing;
minimal CPU/memory (event-driven, auto-unload, quality cap).

## Roadmap
| Phase | Status |
|---|---|
| 0. Framing + sign-in spike (all 3 browsers) | code done, **needs manual test** |
| 1. MVP panel, app switch, Alt+Y | code done, needs manual test |
| 2. Save/restore position | code done, needs manual test |
| 3. Minimize bar + controls | code done, needs manual test |
| 4. Perf: event-driven reports, auto-unload, quality cap | code done, needs Shift+Esc measurement |
| 5. Polish: icons, open-in-tab | done (user confirmed panel works) |
| 6. Background playback when panel closed (offscreen handoff) | verified in headless Brave 152 with the real side panel (close → bg plays, reopen → handoff); user reported silence on first build, **needs retest** |
| 6b. Seamless reopen (bg plays until panel is ready, then seek + release) | verified headless Brave: 0 silent / 0 double samples at 200 ms |
| 6c. Standby player (option B): instant hide | verified headless Brave: hide→audible 70–101 ms (3 runs), idle close after 60 s paused. Ad-in-standby path not yet observed in a test |
| 7. Auto-hide on click-away + 📌 pin | code done; **can't be tested headless** (no real focus changes), needs manual test |

## Testing notes
- Headless Brave/Edge: YouTube Music refuses the `HeadlessChrome` UA; pass a normal `--user-agent`.
- Real side panel can be opened in tests via `chrome.sidePanel.open` evaluated with `userGesture: true` in an extension page (not the SW).
- Service worker logs `[yt-sidebar] …` lines for close/start/handoff — first place to look if background playback fails.

## Unverified assumptions (check first)
- YouTube loads signed in inside the panel iframe (cookies).
- `&t=Ns` resume works on music.youtube.com.
- `movie_player.setPlaybackQualityRange` still honored by YouTube.
- Next/prev selectors: `.next-button`/`.previous-button` (Music), `.ytp-next-button`/`.ytp-prev-button` (YT).
- Brave Shields doesn't break the framed page.
- Offscreen document (AUDIO_PLAYBACK) is allowed to autoplay the YouTube iframe.
- Hand-built YT Music queues are lost on handoff (only song + playlist + time carry over).
- Standby costs ~200–400 MB while the panel plays (user chose this over the 1–3 s hide gap).
- If the standby copy is still in a pre-roll ad when the panel hides, the ad plays first (seek applied after it).
- Offscreen doc uses reasons AUDIO_PLAYBACK + IFRAME_SCRIPTING: AUDIO_PLAYBACK alone is auto-closed after ~30 s of silence (verified).

## Last updated
2026-09-24 — user confirmed panel works in Brave; background playback fixed (hand off song, not page URL) and seamless reopen added; standby player (instant hide) added; awaiting user retest.
