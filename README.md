# YT Sidebar

YouTube and YouTube Music in a persistent browser side panel (Chrome, Edge, Brave).

## Install (unpacked)

1. Open `chrome://extensions`, `edge://extensions` or `brave://extensions`.
2. Turn on **Developer mode** → **Load unpacked** → pick this folder.
3. Click the toolbar icon or press **Alt+Y**.

## Features

- Same panel on every tab and site; Music / YouTube switch.
- Remembers page + playback time per app across panel close and browser restart.
- **▁ Minimize** collapses to a control bar; audio keeps playing, video drops to 144p.
- **Keeps playing when the panel is closed.** If something is playing when you close the
  panel, it continues in a hidden background player (control it from the browser's
  media button). Reopening the panel is seamless: the background keeps playing while
  the panel loads the same song muted, then the panel takes over at the exact position.
  Closing while paused doesn't start anything.
- **Auto-hide:** the panel closes when you click anywhere else in the browser (the music
  keeps playing in the background). Click **📌** to keep it open. Switching to another
  app doesn't close it.
- **⧉ Open in tab** opens the current page in a normal tab at the same playback time and pauses the panel.
- Quality cap (Auto / 360p / 144p) for video mode.
- Auto-unloads YouTube after 10 min minimized and not playing; ⏯ resumes at the same spot.

## Resource budget

The extension itself is event-driven: no polling while paused, one position report
every 30 s while playing, storage writes only on changes. Almost all memory/CPU is
YouTube's own page. Check with **Shift+Esc** (browser task manager): the extension
entry should be a few MB and ~0% CPU when idle.

## Files

| File | Role |
|---|---|
| `background.js` | Opens panel on icon click; strips YouTube's anti-framing headers for this extension's frames only |
| `sidepanel.*` | Panel UI, state save/restore, minimize, auto-unload |
| `frame.js` | Inside the YouTube frame: reports playback, handles play/next/prev |
| `player.*` | Offscreen background player used while the panel is closed |
| `shared.js` | Position helpers shared by panel and service worker |
| `page.js` | Inside the YouTube frame (page world): reads the current song/playlist and applies the quality cap via the player API |
