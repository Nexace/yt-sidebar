# YT Sidebar

YouTube and YouTube Music in a persistent browser side panel (Chrome, Edge, Brave).

## Install (unpacked)

1. Open `chrome://extensions`, `edge://extensions` or `brave://extensions`.
2. Turn on **Developer mode** → **Load unpacked** → pick this folder.
3. Click the toolbar icon or press **Alt+Y**.

## Features

- Same panel on every tab and site; Music / YouTube switch.
- Remembers page + playback time per app across panel close and browser restart.
- **Keeps playing when the panel is closed — with no gap either way.** Hiding the panel
  hands playback to a hidden background player; reopening loads the panel muted while
  the background keeps playing, then takes over at the exact position. Control
  background playback from the browser's media button or the global shortcuts below.
- **⚡ Instant hide** (on by default): while something plays in the panel, a paused,
  muted standby copy of the song is kept loaded, so hiding takes ~0.1 s instead of
  1–3 s. Costs about 120 MB. Turn it off to free that memory. Any background copy is
  closed after 1 minute of nothing playing.
- **Auto-hide:** the panel closes when you click anywhere else in the browser (the music
  keeps playing in the background). Click **📌** to keep it open. Switching to another
  app doesn't close it.
- **⧉ Open in tab** opens the current page in a normal tab at the same playback time and pauses the panel.
- Quality cap (Auto / 360p / 144p) for video mode.

## Shortcuts

| Keys | Action | Works when |
|---|---|---|
| **Alt+Y** | Open / close the panel | Brave is focused |
| **Ctrl+Shift+7** | Previous track | Anywhere (global) |
| **Ctrl+Shift+8** | Play / pause | Anywhere (global) |
| **Ctrl+Shift+9** | Next track | Anywhere (global) |

Change them at `brave://extensions/shortcuts`. Global shortcuts must be Ctrl+Shift+digit.
They control the panel if it's open, otherwise the background player. Your keyboard's
hardware media keys also work, through the browser's own media controls.

## Resource budget

The extension itself is event-driven: no polling while paused, one position report
every 30 s while playing, storage writes only on changes. Almost all memory/CPU is
YouTube's own page. Check with **Shift+Esc** (browser task manager): the extension
entry should be a few MB and ~0% CPU when idle.

## Files

| File | Role |
|---|---|
| `background.js` | Opens panel on icon click; strips YouTube's anti-framing headers for this extension's frames only |
| `sidepanel.*` | Panel UI, state save/restore, auto-hide, takeover from the background player |
| `frame.js` | Inside the YouTube frame: reports playback, handles play/next/prev |
| `player.*` | Offscreen player: standby copy while the panel plays, active player while it's closed |
| `shared.js` | Position helpers shared by panel and service worker |
| `page.js` | Inside the YouTube frame (page world): reads the current song/playlist and applies the quality cap via the player API |
