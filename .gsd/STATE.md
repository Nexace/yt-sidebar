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
| 5. Polish: icons, settings page | not started |

## Unverified assumptions (check first)
- YouTube loads signed in inside the panel iframe (cookies).
- `&t=Ns` resume works on music.youtube.com.
- `movie_player.setPlaybackQualityRange` still honored by YouTube.
- Next/prev selectors: `.next-button`/`.previous-button` (Music), `.ytp-next-button`/`.ytp-prev-button` (YT).
- Brave Shields doesn't break the framed page.

## Last updated
2026-09-24 — initial implementation, not yet loaded in a browser.
