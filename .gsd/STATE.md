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
- Hiding still has a 1–3 s gap (panel is destroyed instantly). Option B (standby player, +200–400 MB) would remove it; not built.

## Last updated
2026-09-24 — user confirmed panel works in Brave; background playback fixed (hand off song, not page URL) and seamless reopen added; awaiting user retest.
