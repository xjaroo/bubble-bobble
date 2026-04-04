import { Camera }       from './engine/Camera.js';
import { InputManager } from './engine/InputManager.js';
import { SoundManager } from './engine/SoundManager.js';
import { GameLoop }     from './engine/GameLoop.js';
import { NetSession }   from './engine/NetSession.js';
import { Game }         from './game/Game.js';
import { formatScore }  from './utils/NumberFormat.js';

const START_PLAYERS_STORAGE_KEY = 'bbStartPlayersV1';
const LAST_PLAYER_NAME_STORAGE_KEY = 'bbLastPlayerNameV1';
const NET_PLAYER_NAME_STORAGE_KEY = 'bbNetPlayerNameV1';
const NET_GUEST_SEND_INTERVAL_MS = 16;
const NET_HOST_SNAPSHOT_INTERVAL_MS = 33;
const ROOM_CODE_LEN = 4;
const TOUCH_ACTIONS = new Set(['left', 'right', 'down', 'jump', 'shoot', 'start']);
const BINDABLE_ACTIONS = [
    { action: 'p1Left',   label: 'P1 Move Left' },
    { action: 'p1Right',  label: 'P1 Move Right' },
    { action: 'p1Down',   label: 'P1 Move Down' },
    { action: 'p1Jump',   label: 'P1 Jump' },
    { action: 'p1Shoot',  label: 'P1 Shoot' },
    { action: 'p2Left',   label: 'P2 Move Left' },
    { action: 'p2Right',  label: 'P2 Move Right' },
    { action: 'p2Down',   label: 'P2 Move Down' },
    { action: 'p2Jump',   label: 'P2 Jump' },
    { action: 'p2Shoot',  label: 'P2 Shoot' },
    { action: 'start',    label: 'Start Game' },
    { action: 'mute',     label: 'Mute Toggle' },
    { action: 'settings', label: 'Open Settings' },
    { action: 'cheatLife', label: 'Cheat: +1 Life' },
];

function loadStartPlayers() {
    const raw = localStorage.getItem(START_PLAYERS_STORAGE_KEY);
    return raw === '2' ? 2 : 1;
}

function saveStartPlayers(value) {
    localStorage.setItem(START_PLAYERS_STORAGE_KEY, value === 2 ? '2' : '1');
}

function sanitizePlayerName(value) {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    if (!s) return 'PLAYER';
    return s.slice(0, 16);
}

function loadNetPlayerName() {
    return sanitizePlayerName(localStorage.getItem(NET_PLAYER_NAME_STORAGE_KEY) || 'PLAYER');
}

function saveNetPlayerName(value) {
    localStorage.setItem(NET_PLAYER_NAME_STORAGE_KEY, sanitizePlayerName(value));
}

function normalizeRoomCode(value) {
    return String(value || '')
        .trim()
        .replace(/\D/g, '')
        .slice(0, ROOM_CODE_LEN);
}

function normalizeRemoteInputState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        left: !!src.left,
        right: !!src.right,
        down: !!src.down,
        jump: !!src.jump,
        shoot: !!src.shoot,
        start: !!src.start,
    };
}

async function fetchHighscores(limit = 10) {
    const res = await fetch(`/api/highscores?limit=${limit}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HIGHSCORE_GET_${res.status}`);
    return res.json();
}

async function submitHighscore(name, score) {
    const res = await fetch('/api/highscores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score }),
    });
    if (!res.ok) throw new Error(`HIGHSCORE_POST_${res.status}`);
    return res.json();
}

async function preloadFonts() {
    if (!document.fonts) return;
    const fontLoads = [
        document.fonts.load('600 16px "Orbitron"'),
        document.fonts.load('700 16px "Rajdhani"'),
        document.fonts.load('16px "Silkscreen"'),
        document.fonts.load('16px "Press Start 2P"'),
    ];
    const timeout = new Promise(resolve => setTimeout(resolve, 1500));
    await Promise.race([Promise.all(fontLoads), timeout]);
}

window.addEventListener('DOMContentLoaded', async () => {
    await preloadFonts();

    const canvas = document.getElementById('game-canvas');
    const visualModeEl = document.getElementById('visual-mode');
    const controlsP1El = document.getElementById('controls-p1');
    const controlsP2El = document.getElementById('controls-p2');
    const controlsSystemEl = document.getElementById('controls-system');
    const controlsNetEl = document.getElementById('controls-net');
    const openSettingsBtn = document.getElementById('open-settings');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsModal = document.getElementById('settings-modal');
    const keybindList = document.getElementById('keybind-list');
    const closeSettingsBtn = document.getElementById('close-settings');
    const resetBindingsBtn = document.getElementById('reset-bindings');
    const startModeInputs = Array.from(document.querySelectorAll('input[name="start-players"]'));
    const scoreOverlay = document.getElementById('score-overlay');
    const scoreModal = document.getElementById('score-modal');
    const scoreNameInput = document.getElementById('score-name');
    const scoreMessage = document.getElementById('score-message');
    const scoreStatus = document.getElementById('score-status');
    const scoreTopList = document.getElementById('score-top-list');
    const scoreSaveBtn = document.getElementById('score-save');
    const netHostBtn = document.getElementById('net-host');
    const netJoinBtn = document.getElementById('net-join');
    const netLeaveBtn = document.getElementById('net-leave');
    const netReadyBtn = document.getElementById('net-ready');
    const netRoomCodeInput = document.getElementById('net-room-code');
    const netPlayerNameInput = document.getElementById('net-player-name');
    const netRoomLabel = document.getElementById('net-room-label');
    const netLobbyLabel = document.getElementById('net-lobby-label');
    const netStatusEl = document.getElementById('net-status');
    const startOverlay = document.getElementById('start-overlay');
    const startModeView = document.getElementById('start-mode-view');
    const startNetworkView = document.getElementById('start-network-view');
    const startSingleBtn = document.getElementById('start-single-btn');
    const startNetworkBtn = document.getElementById('start-network-btn');
    const startNetNameInput = document.getElementById('start-net-name');
    const startNetHostBtn = document.getElementById('start-net-host');
    const startNetRefreshBtn = document.getElementById('start-net-refresh');
    const startNetCancelBtn = document.getElementById('start-net-cancel');
    const startNetBackBtn = document.getElementById('start-net-back');
    const startNetStatusEl = document.getElementById('start-net-status');
    const startNetRoomListEl = document.getElementById('start-net-room-list');
    const touchControls = document.getElementById('touch-controls');
    const touchButtons = touchControls
        ? Array.from(touchControls.querySelectorAll('[data-touch-action]'))
        : [];

    const camera = new Camera(canvas);
    const ctx    = camera.getCtx();

    const input  = new InputManager();
    const sound  = new SoundManager();
    sound.startBgm();

    // Let InputManager resume AudioContext on first keydown
    if (sound.getContext()) {
        input.setAudioContext(sound.getContext());
    }

    const settingsState = {
        startPlayers: loadStartPlayers(),
    };

    const game = new Game(
        ctx,
        input,
        sound,
        () => camera.present(),
        () => ({ startPlayers: settingsState.startPlayers })
    );
    const loop = new GameLoop(game);

    const keyButtons = new Map();
    let settingsOpen = false;
    let waitingAction = null;
    let visualProfile = camera.getVisualProfile();
    let scoreEntryOpen = false;
    let scoreEntryBusy = false;
    let pendingGameOverScore = null;
    let startOverlayOpen = true;
    let startNetworkViewOpen = false;
    let startRoomList = [];
    let startRoomListBusy = false;
    let startRoomListLastAt = 0;
    let netStatusText = 'Mode: Local';
    let netPeerConnected = false;
    let netPrevRole = 'none';
    let netLobbyState = null;
    let netReadyState = false;
    let netLastHostStateAt = 0;
    let netLastHostSnapshotAt = 0;
    let netLastGuestInputSentAt = 0;
    let netLastGuestInputPayload = '';
    const touchUiPreferred = (
        (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
        (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) ||
        ('ontouchstart' in window)
    );
    const touchPointerAction = new Map();
    const touchActionCounts = new Map();
    let netLocalName = loadNetPlayerName();
    if (netPlayerNameInput) netPlayerNameInput.value = netLocalName;
    if (startNetNameInput) startNetNameInput.value = netLocalName;

    const netSession = new NetSession({
        onStateChange: info => {
            const currentRole = info && typeof info.role === 'string' ? info.role : 'none';
            netReadyState = !!(info && info.ready);
            if (info && info.lobby) netLobbyState = info.lobby;
            if (info && typeof info.status === 'string') {
                netStatusText = info.status;
            } else if (info && info.role === 'host') {
                netStatusText = info.peerConnected ? 'Host: guest connected' : 'Host: waiting for guest';
            } else if (info && info.role === 'guest') {
                netStatusText = 'Guest: connected to host';
            } else {
                netStatusText = 'Mode: Local';
            }

            netPeerConnected = !!(info && info.peerConnected);
            if (info && typeof info.roomCode === 'string' && netRoomCodeInput && !netRoomCodeInput.value) {
                netRoomCodeInput.value = info.roomCode;
            }
            if (info && currentRole === 'none') {
                netLobbyState = null;
                netReadyState = false;
                if (startNetworkViewOpen) {
                    setStartNetStatus('Not connected.');
                    void refreshStartRoomList();
                }
            }

            if (info && info.role === 'guest') {
                game.setRemoteMirror(true);
            } else {
                game.setRemoteMirror(false);
            }
            if (!info || info.role === 'none') {
                if (input.clearAllRemotePlayerStates) input.clearAllRemotePlayerStates();
                if (netPrevRole === 'guest' && typeof game._reset === 'function') {
                    game._reset();
                }
            }

            if (input.setNetworkRole) input.setNetworkRole(currentRole);
            if (game.setNetworkStartLock) {
                const inOnlineRoom = currentRole === 'host' || currentRole === 'guest';
                const matchActive = !!(info && info.lobby && info.lobby.matchActive);
                game.setNetworkStartLock(inOnlineRoom && !matchActive);
            }

            if (info && (info.role === 'host' || info.role === 'guest')) {
                settingsState.startPlayers = 2;
                saveStartPlayers(2);
                syncStartModeInputs();
                if (startNetworkViewOpen && info.role === 'host' && !info.peerConnected) {
                    setStartNetStatus('Waiting for another player...');
                }
            }

            netPrevRole = currentRole;

            updateControls();
            updateNetUi();
        },
        onGuestInput: raw => {
            if (!netSession.isHost()) return;
            const state = normalizeRemoteInputState(raw);
            if (input.setRemotePlayerState) input.setRemotePlayerState(1, state);
        },
        onHostState: state => {
            netLastHostStateAt = performance.now();
            if (/connection unstable/i.test(netStatusText)) {
                netStatusText = 'Connected to host';
                updateNetUi();
            }
            if (!state) return;
            game.applyNetState(state);
        },
        onLobbyState: lobby => {
            netLobbyState = lobby;
            if (game.setNetworkStartLock) {
                const inOnlineRoom = netSession.isHost() || netSession.isGuest();
                game.setNetworkStartLock(inOnlineRoom && !lobby?.matchActive);
            }
            if (!lobby || !lobby.players) {
                if (startNetworkViewOpen) setStartNetStatus('Not connected.');
                updateNetUi();
                return;
            }
            const host = lobby.players.host || {};
            const guest = lobby.players.guest || {};
            if (netSession.isHost() && host.connected && !host.ready && !lobby.matchActive) {
                netSession.setReady(true);
                netReadyState = true;
            }
            if (netSession.isHost()) {
                netStatusText = guest.connected
                    ? (guest.ready && host.ready ? 'Both ready. Starting...' : 'Guest joined. Press Ready to start.')
                    : 'Waiting for guest to join.';
            } else if (netSession.isGuest()) {
                netStatusText = host.connected
                    ? (guest.ready && host.ready ? 'Both ready. Starting...' : 'Connected. Press Ready to start.')
                    : 'Host disconnected.';
            }
            if (startNetworkViewOpen) {
                if (netSession.isHost()) {
                    setStartNetStatus(
                        guest.connected
                            ? (guest.ready && host.ready ? 'Both ready. Starting...' : 'Guest connected. Starting soon...')
                            : 'Waiting for another player...'
                    );
                } else if (netSession.isGuest()) {
                    setStartNetStatus(
                        host.connected
                            ? (guest.ready && host.ready ? 'Both ready. Starting...' : `Connected to ${host.name || 'HOST'}...`)
                            : 'Host disconnected.',
                        !host.connected
                    );
                }
            }
            updateNetUi();
            updateControls();
        },
        onMatchStart: (msg) => {
            const hostName = sanitizePlayerName(msg && msg.players && msg.players.host ? msg.players.host : 'HOST');
            const guestName = sanitizePlayerName(msg && msg.players && msg.players.guest ? msg.players.guest : 'GUEST');
            netLobbyState = {
                ...(netLobbyState || {}),
                roomCode: (msg && msg.roomCode) ? String(msg.roomCode) : (netSession.roomCode() || ''),
                matchActive: true,
                players: {
                    host: { connected: true, name: hostName, ready: true },
                    guest: { connected: true, name: guestName, ready: true },
                },
            };
            netReadyState = true;
            if (netSession.isHost() && typeof game.startOnlineMatch === 'function') {
                game.startOnlineMatch();
            }
            if (game.setNetworkStartLock) game.setNetworkStartLock(false);
            closeStartOverlay();
            if (settingsOpen) closeSettings();
            netLastHostStateAt = performance.now();
            netStatusText = 'Match started';
            updateNetUi();
            updateControls();
        },
        onRoomList: rooms => {
            startRoomList = Array.isArray(rooms) ? rooms : [];
            if (startNetworkViewOpen && !netSession.isHost() && !netSession.isGuest()) {
                renderStartRoomList(startRoomList);
            }
        },
    });

    const setWaitingAction = action => {
        waitingAction = action;
        for (const [actionKey, btn] of keyButtons.entries()) {
            if (actionKey === action) {
                btn.classList.add('waiting');
                btn.textContent = 'PRESS KEY...';
            } else {
                btn.classList.remove('waiting');
                btn.textContent = input.getBindingLabel(actionKey);
            }
        }
    };

    const clearWaitingAction = () => {
        waitingAction = null;
        for (const [actionKey, btn] of keyButtons.entries()) {
            btn.classList.remove('waiting');
            btn.textContent = input.getBindingLabel(actionKey);
        }
    };

    const updateControls = () => {
        const kb = input.describeBindings();
        const assignedPads = input.assignedGamepadsCount ? input.assignedGamepadsCount() : 0;
        const connectedPads = input.connectedGamepadsCount ? input.connectedGamepadsCount() : assignedPads;
        const padStatus = `PAD ${assignedPads}/2 (CONN ${connectedPads})`;
        const netMode = netSession.isHost()
            ? (netPeerConnected ? 'ONLINE HOST (LEFT)' : 'ONLINE HOST (WAITING)')
            : (netSession.isGuest() ? 'ONLINE GUEST (RIGHT)' : 'LOCAL');
        if (controlsP1El) {
            controlsP1El.textContent = `P1: ${kb.p1.left}/${kb.p1.right} Move | ${kb.p1.down} Down | ${kb.p1.jump} Jump | ${kb.p1.shoot} Shoot`;
        }
        if (controlsP2El) {
            controlsP2El.textContent = `P2: ${kb.p2.left}/${kb.p2.right} Move | ${kb.p2.down} Down | ${kb.p2.jump} Jump | ${kb.p2.shoot} Shoot`;
        }
        if (controlsSystemEl) {
            controlsSystemEl.textContent = `${kb.start} Start | ${kb.mute} Mute | ${kb.settings} Settings | ${kb.cheatLife} +1 Life | Mode ${settingsState.startPlayers}P | ${padStatus}`;
        }
        if (controlsNetEl) {
            const room = netSession.roomCode();
            controlsNetEl.textContent = room ? `NET: ${netMode} | ROOM ${room}` : `NET: ${netMode}`;
        }
        if (visualModeEl) {
            visualModeEl.textContent = `VISUAL: ${visualProfile.label} (LOCKED)`;
        }
    };

    const touchCount = action => touchActionCounts.get(action) || 0;

    const updateTouchButtonClasses = () => {
        for (const btn of touchButtons) {
            const action = btn.dataset.touchAction;
            if (!TOUCH_ACTIONS.has(action)) continue;
            btn.classList.toggle('active', touchCount(action) > 0);
        }
    };

    const setTouchHeld = (action, held) => {
        if (!TOUCH_ACTIONS.has(action)) return;
        if (input.setTouchAction) input.setTouchAction(action, held);
    };

    const pressTouchAction = (pointerId, action) => {
        if (!TOUCH_ACTIONS.has(action)) return;
        const prev = touchCount(action);
        touchActionCounts.set(action, prev + 1);
        touchPointerAction.set(pointerId, action);
        if (prev === 0) setTouchHeld(action, true);
        updateTouchButtonClasses();
    };

    const releaseTouchPointer = pointerId => {
        const action = touchPointerAction.get(pointerId);
        if (!action) return;
        touchPointerAction.delete(pointerId);
        const next = Math.max(0, touchCount(action) - 1);
        if (next <= 0) {
            touchActionCounts.delete(action);
            setTouchHeld(action, false);
        } else {
            touchActionCounts.set(action, next);
        }
        updateTouchButtonClasses();
    };

    const clearAllTouchPointers = () => {
        for (const pointerId of Array.from(touchPointerAction.keys())) {
            releaseTouchPointer(pointerId);
        }
        touchActionCounts.clear();
        if (input.clearTouchActions) input.clearTouchActions();
        updateTouchButtonClasses();
    };

    const updateTouchControlsVisibility = () => {
        if (!touchControls) return;
        const visible = touchUiPreferred && !settingsOpen && !scoreEntryOpen && !startOverlayOpen;
        touchControls.classList.toggle('hidden', !visible);
        touchControls.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (!visible) clearAllTouchPointers();
    };

    const updateNetUi = () => {
        const room = netSession.roomCode();
        if (netRoomLabel) {
            netRoomLabel.textContent = room ? `Room: ${room}` : 'Room: -';
        }
        if (netLobbyLabel) {
            if (!netLobbyState || !netLobbyState.players) {
                netLobbyLabel.textContent = 'Host: - | Guest: -';
            } else {
                const host = netLobbyState.players.host || {};
                const guest = netLobbyState.players.guest || {};
                const hostState = host.connected ? (host.ready ? 'READY' : 'WAIT') : 'OFF';
                const guestState = guest.connected ? (guest.ready ? 'READY' : 'WAIT') : 'OFF';
                netLobbyLabel.textContent =
                    `Host: ${String(host.name || 'HOST')} [${hostState}] | ` +
                    `Guest: ${String(guest.name || 'GUEST')} [${guestState}]`;
            }
        }
        if (netStatusEl) {
            netStatusEl.textContent = netStatusText || 'Mode: Local';
            netStatusEl.style.color = /error|failed|disconnected|not found|full/i.test(netStatusText || '')
                ? '#ffb0b0'
                : '#95b8e5';
        }
        const inRoom = netSession.isHost() || netSession.isGuest();
        if (netHostBtn) netHostBtn.disabled = inRoom;
        if (netJoinBtn) netJoinBtn.disabled = inRoom;
        if (netLeaveBtn) netLeaveBtn.disabled = !inRoom;
        if (netRoomCodeInput) netRoomCodeInput.disabled = inRoom;
        if (netPlayerNameInput) netPlayerNameInput.disabled = false;
        if (netReadyBtn) {
            netReadyBtn.disabled = !inRoom;
            netReadyBtn.textContent = netReadyState ? 'Cancel Ready' : 'Ready';
        }
    };

    const setStartNetStatus = (text, isError = false) => {
        if (!startNetStatusEl) return;
        startNetStatusEl.textContent = String(text || '');
        startNetStatusEl.style.color = isError ? '#ffb0b0' : '#95b8e5';
    };

    const renderStartRoomList = rooms => {
        if (!startNetRoomListEl) return;
        startNetRoomListEl.innerHTML = '';
        const list = Array.isArray(rooms) ? rooms : [];
        if (list.length === 0) {
            const li = document.createElement('li');
            li.className = 'start-room-empty';
            li.textContent = 'No waiting host yet.';
            startNetRoomListEl.appendChild(li);
            return;
        }

        for (const room of list) {
            const li = document.createElement('li');
            li.className = 'start-room-item';

            const meta = document.createElement('div');
            meta.className = 'start-room-meta';
            const hostName = sanitizePlayerName(room && room.hostName ? room.hostName : 'HOST');
            meta.textContent = `${hostName} is waiting`;
            li.appendChild(meta);

            const joinBtn = document.createElement('button');
            joinBtn.type = 'button';
            joinBtn.textContent = 'Join';
            joinBtn.addEventListener('click', async () => {
                const code = normalizeRoomCode(room && room.roomCode ? room.roomCode : '');
                if (code.length !== ROOM_CODE_LEN) {
                    setStartNetStatus('Selected room is invalid.', true);
                    return;
                }
                try {
                    setStartNetStatus(`Joining ${hostName}...`);
                    syncNetNameToSession();
                    await netSession.joinRoom(code);
                    netReadyState = false;
                    netSession.setName(netLocalName);
                    setLocalReady(true);
                    setStartNetStatus(`Joined ${hostName}. Starting soon...`);
                } catch (err) {
                    setStartNetStatus(`Join failed: ${(err && err.message) || 'unknown'}`, true);
                    void refreshStartRoomList();
                }
            });
            li.appendChild(joinBtn);
            startNetRoomListEl.appendChild(li);
        }
    };

    const refreshStartRoomList = async () => {
        if (!startNetworkViewOpen || startRoomListBusy) return;
        if (netSession.isHost() || netSession.isGuest()) {
            renderStartRoomList([]);
            return;
        }
        startRoomListBusy = true;
        try {
            const rooms = await netSession.listRooms();
            startRoomList = Array.isArray(rooms) ? rooms : [];
            startRoomListLastAt = performance.now();
            renderStartRoomList(startRoomList);
            if (!startRoomList.length) {
                setStartNetStatus('No waiting host yet.');
            } else {
                setStartNetStatus('Select a host from the list.');
            }
        } catch (err) {
            setStartNetStatus(`List failed: ${(err && err.message) || 'unknown'}`, true);
        } finally {
            startRoomListBusy = false;
        }
    };

    const showStartModeView = () => {
        startNetworkViewOpen = false;
        if (startModeView) startModeView.classList.remove('hidden');
        if (startNetworkView) startNetworkView.classList.add('hidden');
    };

    const showStartNetworkView = () => {
        startNetworkViewOpen = true;
        if (startModeView) startModeView.classList.add('hidden');
        if (startNetworkView) startNetworkView.classList.remove('hidden');
        if (startNetNameInput) {
            startNetNameInput.value = netLocalName;
            setTimeout(() => startNetNameInput.focus(), 0);
        }
        void refreshStartRoomList();
    };

    const openStartOverlay = () => {
        startOverlayOpen = true;
        if (startOverlay) {
            startOverlay.classList.remove('hidden');
            startOverlay.setAttribute('aria-hidden', 'false');
        }
        input.setSuspended(true);
        showStartModeView();
        updateTouchControlsVisibility();
    };

    const closeStartOverlay = () => {
        startOverlayOpen = false;
        if (startOverlay) {
            startOverlay.classList.add('hidden');
            startOverlay.setAttribute('aria-hidden', 'true');
        }
        input.setSuspended(false);
        updateTouchControlsVisibility();
    };

    const buildGuestInputPacket = () => ({
        left: input.p1Left(),
        right: input.p1Right(),
        down: input.p1DownHeld(),
        jump: input.p1JumpHeld(),
        shoot: input.p1ShootHeld ? input.p1ShootHeld() : input.p1Shoot(),
        start: input.anyStart(),
    });

    const syncStartModeInputs = () => {
        for (const el of startModeInputs) {
            el.checked = Number(el.value) === settingsState.startPlayers;
        }
    };

    const applyTopScoreToGame = payload => {
        const top = payload && payload.top ? payload.top : null;
        if (!top) return;
        if (typeof top.score === 'number' && Number.isFinite(top.score)) {
            game.highScore = Math.max(game.highScore, Math.floor(top.score));
            localStorage.setItem('bbHighScore', String(game.highScore));
        }
        if (typeof top.name === 'string' && top.name.trim()) {
            game.highScoreName = top.name.trim();
            localStorage.setItem('bbHighScoreName', game.highScoreName);
        }
    };

    const renderTopScoreList = scores => {
        if (!scoreTopList) return;
        scoreTopList.innerHTML = '';
        const list = Array.isArray(scores) ? scores : [];

        const header = document.createElement('li');
        header.className = 'score-top-row score-top-head';
        header.innerHTML = [
            '<span class="score-top-rank">#</span>',
            '<span class="score-top-name">NAME</span>',
            '<span class="score-top-score">SCORE</span>',
        ].join('');
        scoreTopList.appendChild(header);

        if (list.length === 0) {
            const li = document.createElement('li');
            li.className = 'score-top-row score-top-empty';
            li.innerHTML = '<span class="score-top-empty-text">No scores yet</span>';
            scoreTopList.appendChild(li);
            return;
        }

        for (const [idx, s] of list.slice(0, 10).entries()) {
            const li = document.createElement('li');
            li.className = 'score-top-row';
            const name = String(s.name || 'PLAYER').toUpperCase().slice(0, 16);
            const score = formatScore(s.score || 0);
            li.innerHTML = [
                `<span class="score-top-rank">${idx + 1}</span>`,
                `<span class="score-top-name">${name}</span>`,
                `<span class="score-top-score">${score}</span>`,
            ].join('');
            scoreTopList.appendChild(li);
        }
    };

    const closeScoreEntry = () => {
        if (!scoreOverlay) return;
        scoreEntryOpen = false;
        scoreEntryBusy = false;
        pendingGameOverScore = null;
        scoreOverlay.classList.add('hidden');
        scoreOverlay.setAttribute('aria-hidden', 'true');
        if (scoreStatus) scoreStatus.textContent = '';
        updateTouchControlsVisibility();
    };

    const openScoreEntry = async score => {
        if (!scoreOverlay || !scoreNameInput) return;
        scoreEntryOpen = true;
        scoreEntryBusy = false;
        pendingGameOverScore = score;
        scoreOverlay.classList.remove('hidden');
        scoreOverlay.setAttribute('aria-hidden', 'false');
        updateTouchControlsVisibility();
        const defaultName = localStorage.getItem(LAST_PLAYER_NAME_STORAGE_KEY) || 'PLAYER';
        scoreNameInput.value = sanitizePlayerName(defaultName);
        if (scoreMessage) {
            scoreMessage.textContent = `Game Over! Score ${formatScore(score)} - Enter your name.`;
        }
        if (scoreStatus) scoreStatus.textContent = '';
        renderTopScoreList([]);
        try {
            const payload = await fetchHighscores(10);
            applyTopScoreToGame(payload);
            renderTopScoreList(payload.scores);
        } catch {
            if (scoreStatus) scoreStatus.textContent = 'Could not load scores.';
        }
        setTimeout(() => {
            scoreNameInput.focus();
            scoreNameInput.select();
        }, 0);
    };

    const saveScoreEntry = async () => {
        if (scoreEntryBusy || pendingGameOverScore === null) return;
        scoreEntryBusy = true;
        if (scoreStatus) scoreStatus.textContent = 'Saving...';
        const name = sanitizePlayerName(scoreNameInput ? scoreNameInput.value : 'PLAYER');
        localStorage.setItem(LAST_PLAYER_NAME_STORAGE_KEY, name);
        try {
            const payload = await submitHighscore(name, pendingGameOverScore);
            applyTopScoreToGame(payload);
            renderTopScoreList(payload.scores);
            if (scoreStatus) {
                scoreStatus.textContent = payload.rank
                    ? `Saved! Rank #${payload.rank}`
                    : 'Saved!';
            }
            game.completeGameOverEntry(
                payload.top && typeof payload.top.score === 'number' ? payload.top.score : null,
                payload.top && typeof payload.top.name === 'string' ? payload.top.name : null
            );
            closeScoreEntry();
            updateControls();
        } catch {
            if (scoreStatus) scoreStatus.textContent = 'Save failed. Try again.';
            scoreEntryBusy = false;
        }
    };

    const openSettings = () => {
        if (!settingsOverlay) return;
        if (settingsOpen) return;
        settingsOpen = true;
        settingsOverlay.classList.remove('hidden');
        settingsOverlay.setAttribute('aria-hidden', 'false');
        input.setSuspended(true);
        if (input.clearTouchActions) input.clearTouchActions();
        syncStartModeInputs();
        clearWaitingAction();
        updateTouchControlsVisibility();
    };

    const closeSettings = () => {
        if (!settingsOverlay) return;
        if (!settingsOpen) return;
        settingsOpen = false;
        settingsOverlay.classList.add('hidden');
        settingsOverlay.setAttribute('aria-hidden', 'true');
        input.setSuspended(false);
        clearWaitingAction();
        updateTouchControlsVisibility();
    };

    if (keybindList) {
        for (const config of BINDABLE_ACTIONS) {
            const row = document.createElement('div');
            row.className = 'keybind-row';

            const label = document.createElement('span');
            label.textContent = config.label;
            row.appendChild(label);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'keybind-btn';
            btn.textContent = input.getBindingLabel(config.action);
            btn.addEventListener('click', () => {
                setWaitingAction(config.action);
            });
            row.appendChild(btn);

            keyButtons.set(config.action, btn);
            keybindList.appendChild(row);
        }
    }

    if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettings);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
    if (settingsOverlay && settingsModal) {
        settingsOverlay.addEventListener('click', e => {
            if (e.target === settingsOverlay) closeSettings();
        });
        settingsModal.addEventListener('click', e => e.stopPropagation());
    }

    if (touchControls && touchButtons.length > 0) {
        touchControls.addEventListener('contextmenu', e => e.preventDefault());
        for (const btn of touchButtons) {
            const action = btn.dataset.touchAction;
            if (!TOUCH_ACTIONS.has(action)) continue;

            const onDown = e => {
                if (!touchUiPreferred) return;
                e.preventDefault();
                e.stopPropagation();
                sound.onUserGesture();
                if (touchPointerAction.has(e.pointerId)) {
                    releaseTouchPointer(e.pointerId);
                }
                pressTouchAction(e.pointerId, action);
                try { btn.setPointerCapture(e.pointerId); } catch {}
            };
            const onUp = e => {
                e.preventDefault();
                e.stopPropagation();
                releaseTouchPointer(e.pointerId);
            };

            btn.addEventListener('pointerdown', onDown);
            btn.addEventListener('pointerup', onUp);
            btn.addEventListener('pointercancel', onUp);
            btn.addEventListener('lostpointercapture', onUp);
            btn.addEventListener('dragstart', e => e.preventDefault());
        }
    }

    if (resetBindingsBtn) {
        resetBindingsBtn.addEventListener('click', () => {
            input.resetBindings();
            clearWaitingAction();
            updateControls();
        });
    }

    for (const el of startModeInputs) {
        el.addEventListener('change', () => {
            const next = Number(el.value) === 2 ? 2 : 1;
            settingsState.startPlayers = next;
            saveStartPlayers(next);
            updateControls();
        });
    }

    const setNetStatus = text => {
        netStatusText = String(text || 'Mode: Local');
        updateNetUi();
        updateControls();
    };

    const syncNetNameToSession = () => {
        const sourceValue = startNetNameInput
            ? startNetNameInput.value
            : (netPlayerNameInput ? netPlayerNameInput.value : netLocalName);
        const current = sanitizePlayerName(sourceValue);
        netLocalName = current;
        saveNetPlayerName(current);
        if (netPlayerNameInput && netPlayerNameInput.value !== current) {
            netPlayerNameInput.value = current;
        }
        if (startNetNameInput && startNetNameInput.value !== current) {
            startNetNameInput.value = current;
        }
        if (netSession.isHost() || netSession.isGuest()) {
            netSession.setName(current);
        }
    };

    const setLocalReady = ready => {
        netReadyState = !!ready;
        if (netSession.isHost() || netSession.isGuest()) {
            netSession.setReady(netReadyState);
        }
        updateNetUi();
    };

    const leaveNetworkRoom = async () => {
        await netSession.close();
        game.setRemoteMirror(false);
        if (game.setNetworkStartLock) game.setNetworkStartLock(false);
        if (input.clearAllRemotePlayerStates) input.clearAllRemotePlayerStates();
        if (input.setNetworkRole) input.setNetworkRole('none');
        netPeerConnected = false;
        netLobbyState = null;
        netReadyState = false;
        netLastHostStateAt = 0;
        netLastHostSnapshotAt = 0;
        netLastGuestInputSentAt = 0;
        netLastGuestInputPayload = '';
        setNetStatus('Mode: Local');
        if (netRoomCodeInput) netRoomCodeInput.value = '';
        if (netPlayerNameInput) netPlayerNameInput.value = netLocalName;
    };

    if (netRoomCodeInput) {
        netRoomCodeInput.addEventListener('input', () => {
            const normalized = normalizeRoomCode(netRoomCodeInput.value);
            if (netRoomCodeInput.value !== normalized) {
                netRoomCodeInput.value = normalized;
            }
        });
    }

    if (netPlayerNameInput) {
        netPlayerNameInput.addEventListener('input', () => {
            const cleaned = sanitizePlayerName(netPlayerNameInput.value);
            netLocalName = cleaned;
            saveNetPlayerName(cleaned);
            if (startNetNameInput) startNetNameInput.value = cleaned;
            if (netSession.isHost() || netSession.isGuest()) {
                netSession.setName(cleaned);
            }
        });
        netPlayerNameInput.addEventListener('blur', () => {
            syncNetNameToSession();
        });
        netPlayerNameInput.addEventListener('keydown', e => {
            if (e.code === 'Enter') {
                e.preventDefault();
                syncNetNameToSession();
            }
        });
    }

    if (netHostBtn) {
        netHostBtn.addEventListener('click', async () => {
            try {
                setNetStatus('Creating room...');
                syncNetNameToSession();
                const room = await netSession.hostRoom();
                settingsState.startPlayers = 2;
                saveStartPlayers(2);
                syncStartModeInputs();
                if (netRoomCodeInput) netRoomCodeInput.value = room;
                netReadyState = false;
                netSession.setName(netLocalName);
                netSession.setReady(false);
                setNetStatus(`Room ${room} created. Waiting for guest.`);
            } catch (err) {
                setNetStatus(`Create failed: ${(err && err.message) || 'unknown'}`);
            }
        });
    }

    if (netJoinBtn) {
        netJoinBtn.addEventListener('click', async () => {
            const roomCode = normalizeRoomCode(netRoomCodeInput ? netRoomCodeInput.value : '');
            if (roomCode.length !== ROOM_CODE_LEN) {
                setNetStatus(`Join failed: enter ${ROOM_CODE_LEN} digits`);
                return;
            }
            try {
                setNetStatus(`Joining room ${roomCode}...`);
                syncNetNameToSession();
                await netSession.joinRoom(roomCode);
                settingsState.startPlayers = 2;
                saveStartPlayers(2);
                syncStartModeInputs();
                if (netRoomCodeInput) netRoomCodeInput.value = roomCode;
                netReadyState = false;
                netSession.setName(netLocalName);
                netSession.setReady(false);
                setNetStatus(`Joined room ${roomCode}`);
            } catch (err) {
                setNetStatus(`Join failed: ${(err && err.message) || 'unknown'}`);
            }
        });
    }

    if (netLeaveBtn) {
        netLeaveBtn.addEventListener('click', () => {
            void leaveNetworkRoom();
        });
    }

    if (netReadyBtn) {
        netReadyBtn.addEventListener('click', () => {
            if (!netSession.isHost() && !netSession.isGuest()) return;
            syncNetNameToSession();
            setLocalReady(!netReadyState);
        });
    }

    if (startSingleBtn) {
        startSingleBtn.addEventListener('click', async () => {
            if (netSession.isHost() || netSession.isGuest()) {
                await leaveNetworkRoom();
            }
            if (typeof game.startLocalMatch === 'function') game.startLocalMatch(1);
            closeStartOverlay();
        });
    }

    if (startNetworkBtn) {
        startNetworkBtn.addEventListener('click', () => {
            showStartNetworkView();
        });
    }

    if (startNetNameInput) {
        startNetNameInput.addEventListener('input', () => {
            const cleaned = sanitizePlayerName(startNetNameInput.value);
            netLocalName = cleaned;
            saveNetPlayerName(cleaned);
            if (netPlayerNameInput) netPlayerNameInput.value = cleaned;
            if (netSession.isHost() || netSession.isGuest()) {
                netSession.setName(cleaned);
            }
        });
        startNetNameInput.addEventListener('keydown', e => {
            if (e.code === 'Enter') {
                e.preventDefault();
                syncNetNameToSession();
            }
        });
    }

    if (startNetHostBtn) {
        startNetHostBtn.addEventListener('click', async () => {
            try {
                syncNetNameToSession();
                if (!netSession.isHost()) {
                    if (netSession.isGuest()) await leaveNetworkRoom();
                    setStartNetStatus('Creating waiting room...');
                    await netSession.hostRoom();
                }
                netSession.setName(netLocalName);
                setLocalReady(true);
                setStartNetStatus('Waiting for another player...');
                renderStartRoomList([]);
            } catch (err) {
                setStartNetStatus(`Host failed: ${(err && err.message) || 'unknown'}`, true);
            }
        });
    }

    if (startNetRefreshBtn) {
        startNetRefreshBtn.addEventListener('click', () => {
            void refreshStartRoomList();
        });
    }

    if (startNetCancelBtn) {
        startNetCancelBtn.addEventListener('click', async () => {
            await leaveNetworkRoom();
            setStartNetStatus('Waiting cancelled.');
            void refreshStartRoomList();
        });
    }

    if (startNetBackBtn) {
        startNetBackBtn.addEventListener('click', async () => {
            await leaveNetworkRoom();
            showStartModeView();
        });
    }

    window.addEventListener('keydown', e => {
        if (!settingsOpen) return;
        if (waitingAction) {
            e.preventDefault();
            e.stopPropagation();
            if (e.code === 'Escape') {
                clearWaitingAction();
                return;
            }
            if (e.code !== 'MetaLeft' && e.code !== 'MetaRight') {
                input.setBinding(waitingAction, e.code);
                clearWaitingAction();
                updateControls();
            }
            return;
        }
        if (e.code === 'Escape') {
            e.preventDefault();
            closeSettings();
        }
    }, true);

    const syncVisualModeLabel = profile => {
        visualProfile = profile;
        updateControls();
    };
    syncVisualModeLabel(visualProfile);
    updateControls();
    updateNetUi();
    syncStartModeInputs();
    updateTouchControlsVisibility();
    openStartOverlay();

    // Mute toggle
    window.addEventListener('keydown', e => {
        sound.onUserGesture();
        if (scoreEntryOpen) return;
        if (settingsOpen) return;
        if (e.code === input.getBinding('settings') && !e.repeat) {
            e.preventDefault();
            openSettings();
            return;
        }
        if (e.code === input.getBinding('mute') && !e.repeat) {
            e.preventDefault();
            sound.toggleMute();
            return;
        }
        if (e.code === input.getBinding('cheatLife') && !e.repeat) {
            e.preventDefault();
        }
    });

    window.addEventListener('pointerdown', () => {
        sound.onUserGesture();
    }, { passive: true });

    if (scoreSaveBtn) {
        scoreSaveBtn.addEventListener('click', () => {
            void saveScoreEntry();
        });
    }
    if (scoreNameInput) {
        scoreNameInput.addEventListener('keydown', e => {
            if (e.code === 'Enter') {
                e.preventDefault();
                void saveScoreEntry();
            }
        });
    }
    if (scoreOverlay && scoreModal) {
        scoreOverlay.addEventListener('click', e => {
            if (e.target === scoreOverlay) {
                // Keep flow simple: clicking outside also saves with current/default name.
                void saveScoreEntry();
            }
        });
        scoreModal.addEventListener('click', e => e.stopPropagation());
    }

    window.addEventListener('gamepadconnected', () => updateControls());
    window.addEventListener('gamepaddisconnected', () => updateControls());
    // Fallback refresh for browsers/controllers with delayed gamepad events.
    setInterval(updateControls, 500);

    setInterval(() => {
        if (!startOverlayOpen || !startNetworkViewOpen) return;
        if (netSession.isHost() || netSession.isGuest()) return;
        const now = performance.now();
        if (now - startRoomListLastAt < 1200) return;
        void refreshStartRoomList();
    }, 1400);

    setInterval(() => {
        const now = performance.now();

        if (netSession.isHost()) {
            if (!netSession.hasPeer()) {
                if (input.clearRemotePlayerState) input.clearRemotePlayerState(1);
            } else if (now - netLastHostSnapshotAt >= NET_HOST_SNAPSHOT_INTERVAL_MS) {
                netSession.sendHostState(game.exportNetState());
                netLastHostSnapshotAt = now;
            }
        }

        if (netSession.isGuest()) {
            if (input.beginFrame) input.beginFrame();
            const canSendInput = !!(
                netSession.isGuest() &&
                (game.scene === 'PLAYING' || (netLobbyState && netLobbyState.matchActive))
            );
            if (canSendInput) {
                const packet = buildGuestInputPacket();
                const encoded = JSON.stringify(packet);
                const shouldSend =
                    encoded !== netLastGuestInputPayload ||
                    now - netLastGuestInputSentAt >= NET_GUEST_SEND_INTERVAL_MS * 2;
                if (shouldSend) {
                    netSession.sendGuestInput(packet);
                    netLastGuestInputPayload = encoded;
                    netLastGuestInputSentAt = now;
                }
            } else {
                netLastGuestInputPayload = '';
            }
            if (input.flush) input.flush();

            if (netPeerConnected && netLastHostStateAt > 0 && now - netLastHostStateAt > 1800) {
                if (!/connection unstable/i.test(netStatusText)) {
                    setNetStatus('Connection unstable. Waiting for host update...');
                }
            }
        }
    }, NET_GUEST_SEND_INTERVAL_MS);

    // Sync top score from file DB at startup.
    void fetchHighscores(10).then(payload => {
        applyTopScoreToGame(payload);
        updateControls();
    }).catch(() => {});

    // Game-over name entry trigger
    setInterval(() => {
        if (settingsOpen || scoreEntryOpen) return;
        const req = game.consumeGameOverEntryRequest ? game.consumeGameOverEntryRequest() : null;
        if (!req || typeof req.score !== 'number') return;
        void openScoreEntry(req.score);
    }, 120);

    window.addEventListener('beforeunload', () => {
        void netSession.close();
    });

    loop.start();
});
