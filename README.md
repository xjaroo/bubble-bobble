# Bubble Bobble (browser)

A **Bubble Bobble–style** arcade game built with HTML5 Canvas and ES modules: bubble enemies, items, timers, local two-player, optional **online co-op** over WebSockets, and a **high score** API backed by a small JSON file.

This project is an independent fan implementation and is not affiliated with or endorsed by the owners of the original *Bubble Bobble* property.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (for the dev server and WebSocket dependency)
- [pnpm](https://pnpm.io/) (recommended; `npm` / `yarn` work if you prefer)

## Quick start

```bash
pnpm install
pnpm start
```

The server binds to **all interfaces** by default (`0.0.0.0`) on port **3000** (or the next free port in range). Open the URL printed in the terminal, e.g. `http://127.0.0.1:3000` or `http://localhost:3000`.

### Server CLI

```bash
node serve.mjs --host 127.0.0.1 --port 3000 --max-port-tries 20
```

- **`--host`** — bind address (default `0.0.0.0`; use `127.0.0.1` for local-only)
- **`--port`** — first port to try (default `3000`)
- **`--max-port-tries`** — how many consecutive ports to try if the port is in use

### What `serve.mjs` provides

| Path | Purpose |
|------|--------|
| `/` | Static game (HTML, JS, CSS, assets) with **no-cache** headers for fast iteration |
| `/ws` | WebSocket endpoint for lobby, rooms, and networked play |
| `/api/highscores` | GET/POST JSON API for the leaderboard |

High scores are stored in **`data/highscores.json`** (created/updated automatically).

**Online play:** both browsers must load the game from the **same origin** as the WebSocket server (e.g. two machines on your LAN using the `LAN URL` lines printed at startup). Opening the game from `file://` will not reach `/ws` or `/api/highscores`.

## How to play

1. From the start overlay, choose **Single Game** or **Network Game**, or use **SETTINGS** for more options.
2. **Single Game** — one or two local players depending on **Settings → Start Mode** (1 / 2 Player Start).
3. **Network Game** — host waits for a guest or join from the list; in **SETTINGS** you can also create/join a **4-digit room** and press **Ready** when both players are in the lobby.
4. **Gamepad:** up to two controllers are assigned to P1 and P2 in connection order.
5. **Touch:** on supported devices, on-screen controls appear when appropriate.

### Default keyboard (customizable in Settings)

| | Move | Jump | Shoot |
|---|------|------|-------|
| **P1 (Bub)** | Arrow keys | Z | X |
| **P2 (Bob)** | WASD | Q | E |

| Action | Default key |
|--------|-------------|
| Start / confirm | Enter |
| Mute | M |
| Visual mode | V |
| Settings | F1 |
| Cheat +1 life (debug) | F2 |

Bindings are saved in the browser (`localStorage`).

## Optional audio

Place **legally owned** music/SFX files under `assets/audio/`. The game will pick them up automatically when filenames match the patterns listed in [`assets/audio/README.md`](assets/audio/README.md). If nothing is found, the game uses synthesized sound where possible.

## Project layout

```
bubble-bobble/
├── index.html          # Shell + UI overlays
├── css/style.css       # Layout and chrome (no inline styles in markup)
├── js/                 # Game code (modules)
│   ├── main.js         # Bootstrap, UI wiring, net loop
│   ├── game/           # Game state, levels, HUD
│   ├── engine/         # Loop, input, sound, camera, net session
│   ├── entities/       # Players, enemies, bubbles, items
│   └── rendering/      # Canvas drawing
├── assets/             # Sprites, audio, etc.
├── data/highscores.json # Leaderboard (server-managed)
├── serve.mjs           # Static + WebSocket + highscores server
└── sw.js               # Dev-oriented service worker for fresh assets
```

## Development notes

- Use **`pnpm start`** so `/ws` and `/api/highscores` match the page origin (required for online scores and co-op).
- The service worker (`sw.js`) helps reload updated JS/CSS during development.

## License

This repository’s **code** is provided as-is for learning and local play. **Assets and audio** you add yourself must comply with your own rights and licenses. The original *Bubble Bobble* game and trademark belong to their respective owners.
