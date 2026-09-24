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
| 6. Background playback when panel closed (offscreen handoff) | code done, logic simulated; **needs manual test** |

## Unverified assumptions (check first)
- YouTube loads signed in inside the panel iframe (cookies).
- `&t=Ns` resume works on music.youtube.com.
- `movie_player.setPlaybackQualityRange` still honored by YouTube.
- Next/prev selectors: `.next-button`/`.previous-button` (Music), `.ytp-next-button`/`.ytp-prev-button` (YT).
- Brave Shields doesn't break the framed page.
- Offscreen document (AUDIO_PLAYBACK) is allowed to autoplay the YouTube iframe.
- Hand-built YT Music queues are lost on handoff (only URL + time carry over).

## Last updated
2026-09-24 — initial implementation, not yet loaded in a browser.
