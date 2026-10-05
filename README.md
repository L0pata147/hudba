# Sonora

**Sonora** is a modern, artwork-first music player for your self-hosted [Navidrome](https://www.navidrome.org/) server — on desktop (Windows, macOS, Linux via Tauri), in the browser, and on iOS / Android (Expo / React Native).

It talks to Navidrome through its Subsonic / OpenSubsonic API. There is no fake data: everything you see comes from your server.

<p align="center"><img src="apps/desktop/public/sonora.svg" width="96" alt="Sonora logo"></p>

## Download (no developer tools needed)

Every push builds installers on GitHub and publishes them as the **“Latest build”** pre-release
(repository → *Releases*):

- **Android:** open the release on your phone, download `Sonora-Android.apk`, open it and allow installing from this source.
- **Windows:** download `Sonora-Setup-Windows.exe` and run it (SmartScreen: *More info → Run anyway*, the installer is not code-signed).

Then log in with your Navidrome address, e.g. `192.168.0.103:4533` on your home network.

---

## What it does

| Area | Features |
| --- | --- |
| **Connection** | Configurable server URL (validated & normalized, `http://` warning for public hosts), token authentication, "remember server", persistent session, server capability detection (OpenSubsonic extensions) |
| **Home** | Quick-access tiles, Recently played, Jump back in (on-device history), Recently added, Favorite albums, Your playlists, Most played, Artists you listen to, Rediscover (random) |
| **Library** | Playlists, Artists, Albums (sortable: name, artist, recently added/played, most played, favorites, random), Songs (paged, virtualized), Genres. Grid / List / Compact views. Works with libraries of tens of thousands of items (virtualized grids & lists, paged API calls) |
| **Artist** | Hero image, album count, biography (if the server has it), Play / Shuffle, popular tracks (server `getTopSongs`, falls back to your own play counts), discography, similar artists |
| **Album** | Large cover with dominant-colour gradient, artist, year, track count, total length, genres, Play / Shuffle / Favorite / Add to playlist, tracklist — click a track to play |
| **Search** | Debounced, cancellable search with Top result, Artists, Albums, Songs, Playlists; genre browser when idle |
| **Player** | Play/pause, next/previous (restart after 3 s), seek, volume, mute, shuffle, repeat (off / all / one), progress, duration, loading & buffering states, stream-interruption recovery, crossfade (desktop/web), next-track preloading, lyrics (synced when available), OS media keys / Media Session, lock-screen controls & background audio (mobile) |
| **Queue** | Now playing / up next, drag & drop reordering, remove, jump to, clear, add album/playlist/artist to queue, Play next, Add to end, persistent across navigation & restarts, synced to the server (`savePlayQueue`) to resume on other devices |
| **Playlists** | Create, rename (with description), delete, add songs, remove songs, reorder (drag & drop), play, shuffle — all synced with Navidrome |
| **Favorites** | Songs, albums, artists; optimistic UI everywhere (rows, cards, player, favorites page) with rollback on error |
| **Equalizer** | 10-band graphic EQ (60 Hz – 16 kHz, ±12 dB) with preamp, 19 presets, response curve, keyboard control; desktop & web (Web Audio). See [Equalizer](#equalizer) |
| **Visualizer** | Circular neon spectrum ring around the cover (press `V` in the full-screen player), colour taken from the artwork, pulses with the bass; desktop & web |
| **Radio** | Endless “song radio” from a song, album, artist, playlist or genre (⋯ menu → *Start radio*, or the Radio page). Weighted, non-repeating recommendations from your own library; Familiar / Balanced / Adventurous direction, *Steer from this song*, learns from skips and completed songs, survives restarts — see [Radio](#radio) |
| **History** | Per-track history on the device (Navidrome only exposes album-level "recently played"); plays are scrobbled to the server |
| **Offline** | Library metadata cache (IndexedDB / AsyncStorage) for instant start-up and offline browsing; song downloads for offline playback (Cache Storage on desktop/web, app sandbox files on mobile) |
| **Settings** | Account (user, server, version, log out), Playback (quality, crossfade, gapless preloading, default volume, scrobbling, queue sync), Appearance (dark / light / system, 6 accent colours, compact mode), Storage (cache size, clear cache, downloads, history), keyboard shortcuts, About (version, Navidrome compatibility, licenses) |
| **UX** | Desktop: collapsible sidebar, persistent player bar, queue side panel, immersive now-playing view, context menus, keyboard shortcuts. Mobile: bottom navigation, mini player (tap / swipe up to expand, swipe sideways to skip), full-screen player (swipe down to close), bottom sheets, touch-sized targets |
| **Quality** | Skeleton loading everywhere, empty & error states with Retry, toasts, visible focus, ARIA labels / roles, focus traps & `inert` background for modals, `prefers-reduced-motion` support |

### Keyboard shortcuts (desktop / web)

| Key | Action |
| --- | --- |
| `Space` | Play / pause (when focus is not on a button or field) |
| `←` / `→` | Seek −/+ 10 s |
| `Shift` + `←` / `→` | Previous / next track |
| `Ctrl/⌘` + `K` | Search |
| `Ctrl/⌘` + `L` | Focus search |
| `M` | Mute |
| `Q` | Toggle queue |
| `Esc` | Close menus, dialogs, full-screen player |

---

## Architecture

```text
apps/
  desktop/          React + Vite + Tailwind CSS 4 web app, wrapped by Tauri 2 (src-tauri/)
  mobile/           Expo (SDK 57) + expo-router React Native app
packages/
  types/            Domain types: User, Artist, Album, Song, Playlist, QueueItem, PlaybackState, ServerConfig, SearchResult, …
  utils/            md5, URL validation, formatting, shuffle/move/debounce helpers
  api/              Navidrome (Subsonic/OpenSubsonic) client
    src/navidrome/  client, auth, albums, artists, songs, playlists, search, favorites, scrobbling,
                    playqueue, genres, lyrics, media, mappers, errors, wire types
  core/             Platform-independent business logic shared by desktop & mobile:
                    queue (pure functions), player state machine, session, preferences, history,
                    favorites (optimistic), downloads, toasts, TanStack Query hooks, bootstrap
  ui/               Design tokens (colours, accents, spacing, radii, type, motion) + colour helpers
```

**Layering**

```text
UI components (desktop: React DOM / mobile: React Native)
        │  use hooks only — never fetch() directly
        ▼
@sonora/core   — TanStack Query hooks (server state) + Zustand stores (client state)
        │        player/queue logic drives an abstract AudioEngine
        ▼
@sonora/api    — typed Navidrome client:  navidrome.albums.list({ type: 'newest' })
        ▼
Navidrome /rest/* (Subsonic 1.16.1 + OpenSubsonic)
```

Platform-specific code is isolated behind small adapters configured once at start-up (`configurePlatform` / `bootstrapSonora`):

| Adapter | Desktop / web | Mobile |
| --- | --- | --- |
| `AudioEngine` | `HtmlAudioEngine` — two `<audio>` elements (preload + equal-power crossfade), retry on interrupted streams, Media Session | `ExpoAudioEngine` — expo-audio (AVPlayer / Media3), background audio, lock-screen controls |
| `storage` | `localStorage` (never throws) | AsyncStorage |
| `secureStorage` | app-private WebView storage (see Security) | expo-secure-store (Keychain / Keystore) |
| `offline` | Cache Storage + object URLs | expo-file-system (`Paths.document/sonora-offline`) |
| query cache persistence | IndexedDB | AsyncStorage |

Everything else — API client, types, auth, player state, queue logic, playlist/favorite logic, caching policy — is shared.

---

## Requirements

- **Node.js ≥ 20** (22 recommended) and **pnpm 10** (`corepack enable`)
- A **Navidrome** server (≥ 0.49; tested against **0.64.2**) reachable from the device
- Desktop builds: **Rust** (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
  (Linux: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`; Windows: WebView2; macOS: Xcode CLT)
- Mobile builds: Android Studio and/or Xcode, or an [EAS](https://expo.dev/eas) account

## Installation

```bash
git clone <this repo> sonora && cd sonora
corepack enable
pnpm install
```

## Development

```bash
pnpm dev                 # web app on http://localhost:5173 (also the Tauri frontend)
pnpm tauri dev           # native desktop window with hot reload
pnpm mobile              # Expo dev server (use a development build, see below)

pnpm typecheck           # strict TypeScript in every package
pnpm test                # unit tests (Vitest)
pnpm test:e2e            # Playwright E2E (desktop + mobile viewport)
```

### Desktop build (Tauri)

```bash
pnpm tauri:build                          # installers for the current OS
pnpm tauri build --bundles deb            # e.g. only a .deb on Linux
```

Output: `apps/desktop/src-tauri/target/release/bundle/` (`.msi`/`.exe` on Windows, `.dmg`/`.app` on macOS, `.deb`/`.rpm`/`.AppImage` on Linux). The CI workflow builds all three platforms. The plain web build (`pnpm build` → `apps/desktop/dist`) can be hosted on any static server.

### Mobile build (Expo)

The app uses native modules (expo-audio, secure store, file system), so it needs a **development build** — Expo Go is not sufficient for background audio.

```bash
cd apps/mobile
npx expo prebuild                 # generates ios/ and android/
npx expo run:android              # or: npx expo run:ios
# release builds
npx eas build --platform android  # or ios
```

---

## Navidrome setup

1. Install Navidrome ([docs](https://www.navidrome.org/docs/installation/)). Quick test server:
   ```bash
   docker run -d -p 4533:4533 -v /path/to/music:/music:ro -v navidrome-data:/data deluan/navidrome:latest
   ```
2. Open `http://<host>:4533`, create the admin user, let the scan finish.
3. In Sonora enter the server URL (`https://music.example.com`, or `192.168.1.10:4533` on your LAN — Sonora assumes `http://` for LAN/localhost and `https://` otherwise), your username and password.

Useful Navidrome options:

| Option | Why |
| --- | --- |
| HTTPS via a reverse proxy | Strongly recommended for anything reachable from the internet |
| `ND_LASTFM_*` / `ND_SPOTIFY_*` agents | Artist images, biographies, "Popular" tracks, similar artists |
| `ND_ENABLETRANSCODINGCONFIG`, ffmpeg installed | Lower streaming qualities in Settings (server-side transcoding) |
| `ND_ENABLEDOWNLOADS=true` (default) | Needed for offline downloads |
| Lyrics embedded in files or `.lrc` sidecars | Shown in the lyrics view (synced when timestamps exist) |

**CORS:** the web/desktop client calls `/rest/*` directly. Navidrome sends `Access-Control-Allow-Origin: *` for these endpoints. Sonora deliberately uses only CORS "simple requests" (GET, and form-encoded POST for long lists), so no preflight configuration is needed. If you put Navidrome behind a proxy, make sure it does not strip these headers.

## Configuration

Runtime configuration is done in the app (login screen + Settings). Optional build-time variables (see `.env.example`):

| Variable | App | Purpose |
| --- | --- | --- |
| `VITE_DEFAULT_SERVER_URL` | desktop / web — put it in `apps/desktop/.env.local` | Pre-fills the server field on the login screen |
| `EXPO_PUBLIC_DEFAULT_SERVER_URL` | mobile — put it in `apps/mobile/.env` | Same for mobile |
| `TAURI_DEV_HOST` | desktop | Dev server host for Tauri on a physical device / network |
| `SONORA_E2E_SERVER`, `SONORA_E2E_USER`, `SONORA_E2E_PASSWORD`, `SONORA_E2E_QUERY` | tests | Run the E2E suite against a real Navidrome instead of the built-in mock |
| `PLAYWRIGHT_CHROMIUM_PATH` | tests | Use an existing Chromium binary |

No credentials or server addresses are compiled into the source.

---

## Security

- **Password never stored.** Login derives the Subsonic token `t = md5(password + salt)` with a random salt; only `{ username, salt, token }` is persisted. The password never leaves the login form and is never logged. Note that for the Subsonic API this token is still a *credential* (it authenticates API calls), so it is treated as a secret.
- **Where the token lives:** mobile → iOS Keychain / Android Keystore (`expo-secure-store`, `AFTER_FIRST_UNLOCK`). Desktop → the Tauri WebView's app-private storage (per-user app data dir). Browser → `localStorage` of the Sonora origin. *TODO:* move the desktop token to the OS keychain via a Tauri keyring plugin.
- **Media URLs carry auth parameters** (`u`, `t`, `s`) because `<audio>`, `<img>` and native players cannot send custom headers — this is inherent to the Subsonic API. They are never logged by Sonora; use HTTPS so they are not visible on the network.
- **Server URL validation:** only `http(s)`, no embedded credentials, `/app` & `/rest` suffixes stripped. Plain `http://` to a non-LAN host shows a warning on the login screen and a banner in the app.
- **Session isolation:** cache keys are scoped by server + user, the query cache and history are cleared on logout, and switching accounts never shows stale data.
- **Tauri:** strict CSP (scripts only from the bundle), minimal capabilities (`core:default`, window state), single-instance.

## Offline & cache design

| Layer | What | Where | Policy |
| --- | --- | --- | --- |
| Metadata | albums, artists, playlists, favorites, genres, top songs | TanStack Query + IndexedDB (desktop) / AsyncStorage (mobile) | `offlineFirst`; stale after 5 min, kept 24 h in memory, persisted 7 days; clearable in Settings |
| Artwork | cover art at fixed sizes (96/300/600/1000 px, ×2 on HiDPI) so the server resize cache is reused | HTTP cache (desktop/web), expo-image memory + disk cache (mobile) | stable URLs per session; lazy loading, placeholders |
| Audio | downloaded songs | Cache Storage (desktop/web), app document directory (mobile) | explicit user action ("Download" in any ⋯ menu); played instead of streaming when present; interrupted downloads resume as queued on next launch |
| Player | queue, position, volume, repeat/shuffle | app storage | restored paused at the same position after restart |
| Server sync | play queue + position | Navidrome `savePlayQueue` | debounced; restored on a device with an empty queue |

**Sync:** playlists, favorites and play counts live on the server; every mutation goes to the server (with optimistic UI and rollback). Downloads are addressed by song id, so they survive metadata refreshes.

## Equalizer

Open it from the player bar (sliders icon), the full-screen player or *Settings → Playback*.

- **Chain:** `<audio>` → per-element gain (volume, mute, crossfade) → preamp → 10 peaking filters (60, 170, 310, 600 Hz, 1, 3, 6, 12, 14, 16 kHz, Q ≈ 1.4) → soft clipper (linear below −1 dBFS) → speakers. Off = every stage at unity, so the signal is untouched.
- **Lazy:** Web Audio is only set up the first time the EQ is switched on; until then playback uses the plain media element.
- **CORS:** Web Audio can only process audio the server allows cross-origin. Navidrome sends `Access-Control-Allow-Origin: *` for `/rest/*` (verified on 0.64). If a proxy strips it, Sonora detects it (CORS probe), keeps playing without the EQ and shows "Equalizer unavailable".
- **Presets** lower the preamp by half of their largest boost to avoid clipping.
- **Mobile app:** not available — expo-audio exposes no EQ / DSP API. The responsive web app on a phone has the EQ.

Tested: an offline-rendered DSP test measures the real filter chain (Bass boost: +7.6 dB at 60 Hz vs 12 kHz; flat/off within ±0.5 dB), an E2E test checks audio actually flows through the EQ while playing, and a test with a real cross-origin server without CORS checks the fallback.

## Visualizer

Full-screen player → waveform icon or `V`. Eleven styles (ten on mobile), switched with the pill in the top-left corner (`‹ name ›`, tap the name for a list on desktop), with `←`/`→` in fullscreen on desktop or by swiping left/right in fullscreen on the phone. The choice is remembered.

| Style | What it does |
| --- | --- |
| Neon ring | Mirrored multi-layer ring around the cover (lows at the top/bottom, highs on the sides), rotating two-colour gradient, trails, particles, beat punch/shake/flash |
| Spectrum bars | Glowing capsule bars fading into white, falling peak caps, sparks flying off jumping bars, a lit floor line and a fading reflection |
| Mirror horizon | Bars to the left/right of the cover with a glowing spectrum outline, a light horizon and motes rising from it (bursts on beats) |
| Oscilloscope | The waveform as a phosphor beam with afterglow, a colour fringe that widens on beats, a lit CRT screen with grid and scanlines |
| Pulsar terrain | Synthwave: a striped sun and stars over *Unknown Pleasures*-style spectrum ridges scrolling away in perspective |
| Warp tunnel | A twisting wireframe tube of hexagons deformed by the spectrum, star streaks, a glowing core and shockwaves on beats |
| Galaxy | A tilted, slowly wobbling spiral of thousands of stars (hundreds on mobile) with a glowing core, nebula dust, a starfield and a ring of light on beats |
| Milkdrop *(desktop)* | WebGL2 feedback with five warps (zoom/spin, ripple, 4- and 6-way kaleidoscope, tunnel) cross-fading every 16 s, slow hue drift, orbiting light ribbons, beat bursts and bloom |
| Liquid cover | The cover as a liquid surface (WebGL2 shader on desktop): flowing distortion, ripples from the centre on beats, pixel snaps, colour split, a sheen and a halo. Mobile: rippling strips, sheen, beat ring and pixel mosaic |
| Lyric pulse | Karaoke: the current synced line in big words that light up as they are sung (timed between lines by word length), each lifted by its part of the spectrum, over the flowing cover |
| Ambient | The cover four times, huge, blurred and slowly turning (like Apple Music's background), breathing with the bass |

Desktop path styles are drawn into an offscreen layer that keeps motion trails, with static parts under it and a quarter-resolution blurred copy added on top as **bloom**; if frames take too long (weak or no GPU) the bloom switches itself off.

- **Colours** — two dominant hues from the cover (grey covers give white/ice blue).
- **Beats** — spectral flux on the bass bins against a rolling mean + σ (min. 240 ms apart).
- **Fullscreen** — `F`, double-click/tap or the corner button; the window goes fullscreen (Tauri window / browser Fullscreen API), controls and cursor hide after 2.5 s; `Esc`/`F` (Back on Android) leaves it.
- **Shared code** — bars, mirror, scope, terrain, tunnel and galaxy are one implementation in `@sonora/core` (`visualizer-scenes.ts`): each scene produces SVG path strings plus "paint slots". Desktop draws them with `Path2D` on a canvas; mobile runs the same functions as Reanimated worklets on the UI thread and feeds them to `react-native-svg`.
- **Desktop audio** — a Web Audio `AnalyserNode` tapping the music **before** volume/EQ, so it looks the same at any volume. Like the EQ it needs CORS on the stream (Navidrome sends it) and shows a note if the server blocks it. All styles run at ~60 fps in headless Chromium; the canvas is capped at ~2.3 MP. `prefers-reduced-motion` turns off shake, flash, particles and most motion.
- **Mobile audio** — expo-audio's sample stream (Android `Visualizer` API: 1024 8-bit samples ~10×/s), turned into a spectrum by an FFT in JS (`byteSpectrum`). Because only ~10 short snapshots per second arrive, beats are caught less reliably than on desktop; levels, bass and waveform ease between snapshots. Android requires the **microphone permission** for this API (nothing is recorded); the visualizer asks for it with an explanation, and without it the styles just idle. Cover colours: the cover is fetched at 32 px (Navidrome serves it as JPEG) and decoded with `jpeg-js`.

## Skins

Settings → Appearance → **Skin** restyles the whole app (desktop and mobile): colours, accent, fonts, corner radius, background and a pattern. Skins are defined once in `packages/ui/src/skins.ts`; the desktop app applies them as CSS variables (`src/lib/theme.ts`), the mobile app through `useTheme()`.

| Skin | Look |
| --- | --- |
| Sonora | the default — your theme and accent colour |
| Classic Amp | charcoal bevels, green LCD, pixel headings |
| Space Cowboy | midnight blue, cream and mustard, serif headings, a starry background |
| Unit-01 | purple, acid green and warning orange, condensed upper-case headings, a grid |
| Luna | light, bright blue bar and green "start" accent, rounded plastic |
| Vaporwave | hot pink and cyan over a purple grid |
| Terminal | green phosphor, monospace everywhere, scanlines |

Fonts: Silkscreen and VT323 (both OFL) are bundled on desktop; on mobile each skin maps to fonts the phone has.

## Classic mode (desktop)

The ⚡ button in the player bar (or Settings → Appearance → Classic mode) opens the queue in a faithful **Winamp 2.x** — [Webamp](https://github.com/captbaritone/webamp) (MIT) — with its main window, 10-band equalizer and playlist. The current queue, track and position are handed over (Sonora pauses) and handed back when you leave (`Esc` or *Back to Sonora*).

- Load real Winamp skins (`.wsz`) with *Load .wsz…* or by dropping them on the window; *Get skins* opens the [Winamp Skin Museum](https://skins.webamp.org/). Loaded skins are kept in IndexedDB and the last one is used next time.
- *Picture…* puts your own picture (PNG with transparency works best) behind the Winamp windows and animates it to the music Webamp plays: *Groove* (sways and bounces on the beat), *Pulse*, *Float* or *Still*, with a glow and a shine on beats. Pictures are kept in IndexedDB too.
- Webamp is loaded only when classic mode opens (a separate ~300 kB gzip chunk). It plays the Navidrome stream URLs itself, so like the EQ it needs CORS on the stream.

## Updates (desktop)

The Windows app updates itself from the **Latest build** release (Tauri updater). Every release build gets the version `0.2.<build number>`; when the repository secret `TAURI_SIGNING_PRIVATE_KEY` is set, the build signs the installer and publishes `latest.json` next to it. The app checks a few seconds after start-up (Settings → About → *Check for updates at start-up*) and shows an *Update & restart* bar; *Check now* checks on demand.

- The public key is in `apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); the private key must never be committed. Without the secret the build still works, just without update files.
- Updates start working from the first build that contains the updater (install that one by hand once).

## Radio

Navidrome has no "radio" or "instant mix" endpoint. What it does offer, and what Sonora uses:

| Source | Endpoint | Notes |
| --- | --- | --- |
| Similar songs to a song | `getSimilarSongs` | Last.fm-backed when configured, otherwise Navidrome falls back to its own library metadata (verified on 0.64: a Metallica seed returns Metallica + Iron Maiden) |
| Similar songs to an artist | `getSimilarSongs2` | same as above |
| Songs of a genre | `getRandomSongs?genre=` | random sample, used to broaden the pool |
| Whole library sample | `getRandomSongs` | last-resort widening and "surprise" picks |
| Favorites | `getStarred2` | cached for 10 minutes |
| Seed songs | `getSong` / `getAlbum` / `getPlaylist` / `getArtist` | once per radio start |

`getArtistInfo2.similarArtist` is used nowhere in Radio because it is empty without external agents.

**Algorithm** (`packages/core/src/radio/`):

1. **Profile** — the seed songs become a taste profile: artists, genres, moods, median BPM and year (`buildProfile`).
2. **Candidates** — a pool is filled from the sources above: server-similar songs for the newest *anchor* (the last completed song), then same-genre songs and favorites, then a library sample if the pool is still thin. The pool is reused across refills, so a refill usually costs 0–2 requests.
3. **Scoring** (`scoreSong`):
   `0.30·artist + 0.25·genre + 0.15·metadata(mood, BPM, year) + 0.15·server-similar + 0.15·preference(favorite, rating, play count) + feedback`.
   Artist = seed artist 1.0, related artists (learnt from server similarity results) up to 0.7. Missing metadata is neutral, not a penalty.
4. **Picking** (`pickCandidates`) — softmax-weighted random sampling without replacement. A quality window keeps picks close to the best candidates, the same artist may not repeat within 2/3/4 picks (Familiar/Balanced/Adventurous) and never the same album twice in a row. With 3/12/25 % probability a pick is a *surprise* from a wider window.
5. **No repeats** — excluded, from strict to relaxed: everything already queued in this session, songs played in the last 3 h; then the last ~60 picks / 30 min; finally only what is queued. Relaxing only happens when a small library runs out.
6. **Refill** — when fewer than 3 radio songs are left, 8 more are appended in the background (never blocking playback). Radio songs are marked in the queue; songs you add with *Play next* / *Add to queue* are never removed or reordered.
7. **Learning** — a quick skip (< 30 s) lowers that artist's weight; finishing a song raises it and gently drifts the profile towards it (15/30/50 % by direction), so long sessions evolve without losing the seed.
8. **Robustness** — offline/timeouts: playback continues, one toast, retries with backoff (5 s → 2 min). Session state (seed, profile, picked songs, feedback) is persisted and resumes after a restart. Playing anything else ends the radio; *Stop radio* keeps the current song and your manual queue items.

## Known limitations (honest TODOs)

- **Crossfade on mobile** is not available: expo-audio exposes a single player without per-player volume ramps across tracks. Desktop/web crossfade works.
- **Gapless:** the web engine preloads the next track (near-gapless). Sample-accurate gapless would require a Web Audio / native decoder pipeline.
- **Mobile lock screen next/previous:** expo-audio's lock-screen controls expose play/pause and seek only. Next/previous on the lock screen would need `react-native-track-player`; the `AudioEngine` interface allows swapping the engine.
- **Seeking in transcoded streams** (non-"Original" quality) depends on the server; Navidrome's `transcodeOffset` is not used yet.
- **Playlist search** is client-side (the Subsonic API has no playlist search).
- **Per-track listening history** is local to each device; the server only exposes album-level "recently played".
- **Artwork colour extraction** is implemented on desktop/web (canvas); mobile uses the accent colour for gradients.
- **Artist images** depend on the server's external agents (Last.fm/Spotify/Deezer); without them Navidrome serves a placeholder.
- The mobile app was verified with strict type-checking and a production Metro/Hermes bundle; it has not been exercised on a physical device in this repository's CI.

## Testing

- **Unit (Vitest, `pnpm test`)** — queue operations & shuffle/unshuffle, player state machine (repeat, previous, scrobble thresholds, crossfade trigger, persistence/resume, error handling), md5 & URL validation, Navidrome client (mapping, parameters, media URLs, errors), authentication (token only, wrong password, network/timeout, non-Subsonic servers), session store (secure storage, restart), playlists (create/update/reorder/delete), search (library + playlists, diacritics).
- **E2E (Playwright, `pnpm test:e2e`)** — *Login → Home → Search → Open album → Play song → Add to playlist → Open queue* on desktop and a mobile viewport, wrong-credential error, optimistic favorites, state after reload. Runs against an in-process mock Subsonic server by default, or a real server with `SONORA_E2E_SERVER=…`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Unable to reach …" on login | Check the URL and port (`:4533`), that the server runs, and that the device is on the same network/VPN. For LAN servers type `192.168.x.x:4533` (http is assumed). |
| "This address does not look like a Navidrome server" | You are pointing at a different service or a proxy path; use the same URL you open Navidrome's web UI with (Sonora strips `/app`). |
| Works in the browser but not in the desktop app on Windows/macOS | Some reverse proxies drop CORS headers — make sure `/rest/*` responses include `Access-Control-Allow-Origin`. |
| Mixed content errors in the browser | An `https://` web deployment cannot call an `http://` server. Use HTTPS for the server or the desktop app. |
| Android can't connect over http | Cleartext is enabled in `app.json` (`usesCleartextTraffic`); rebuild the dev client after changing native config. |
| Lower quality settings have no effect | Transcoding requires ffmpeg on the server and a transcoding config in Navidrome. |
| No "Popular" tracks / artist bios | Configure Last.fm (or Spotify) agents in Navidrome. Sonora falls back to your own play counts. |
| Playback stops in the background on Android | Rebuild the development build after installing — background playback needs the expo-audio config plugin (`enableBackgroundPlayback`). |
| Downloads fail | The Navidrome user needs the download permission (`ND_ENABLEDOWNLOADS`). |
| Stale data after server changes | Pull to refresh (mobile) or Settings → Storage → Clear cache. |

## License

MIT for Sonora's own code. Third-party packages keep their licenses (see Settings → About).
