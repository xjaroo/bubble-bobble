const CONNECT_TIMEOUT_MS = 6000;
const WAIT_TIMEOUT_MS = 6000;

function nowMs() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

export class NetSession {
    constructor({
        onStateChange = null,
        onGuestInput = null,
        onHostState = null,
        onLobbyState = null,
        onMatchStart = null,
        onRoomList = null,
    } = {}) {
        this._ws = null;
        this._roomCode = '';
        this._role = 'none'; // none | host | guest
        this._peerConnected = false;
        this._ready = false;
        this._lobby = null;
        this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
        this._onGuestInput = typeof onGuestInput === 'function' ? onGuestInput : null;
        this._onHostState = typeof onHostState === 'function' ? onHostState : null;
        this._onLobbyState = typeof onLobbyState === 'function' ? onLobbyState : null;
        this._onMatchStart = typeof onMatchStart === 'function' ? onMatchStart : null;
        this._onRoomList = typeof onRoomList === 'function' ? onRoomList : null;
        this._waiters = [];
        this._lastGuestInputAt = 0;
        this._lastHostStateAt = 0;
    }

    _wsUrl() {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${loc.host}/ws`;
    }

    _emitState(extra = null) {
        if (!this._onStateChange) return;
        this._onStateChange({
            role: this._role,
            roomCode: this._roomCode,
            connected: !!(this._ws && this._ws.readyState === WebSocket.OPEN),
            peerConnected: !!this._peerConnected,
            ready: !!this._ready,
            lobby: this._lobby,
            ...extra,
        });
    }

    _send(payload) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
        try {
            this._ws.send(JSON.stringify(payload));
            return true;
        } catch {
            return false;
        }
    }

    _rejectAllWaiters(reason) {
        const waiters = this._waiters.splice(0, this._waiters.length);
        for (const w of waiters) {
            clearTimeout(w.timer);
            w.reject(reason instanceof Error ? reason : new Error(String(reason || 'WAIT_CANCELLED')));
        }
    }

    _resolveWaiters(message) {
        for (let i = this._waiters.length - 1; i >= 0; i--) {
            const w = this._waiters[i];
            if (!w.types.has(message.type)) continue;
            this._waiters.splice(i, 1);
            clearTimeout(w.timer);
            w.resolve(message);
        }
    }

    _waitFor(types, timeoutMs = WAIT_TIMEOUT_MS) {
        const set = new Set(Array.isArray(types) ? types : [types]);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = this._waiters.findIndex(w => w.timer === timer);
                if (idx >= 0) this._waiters.splice(idx, 1);
                reject(new Error('NETWORK_TIMEOUT'));
            }, timeoutMs);
            this._waiters.push({ types: set, resolve, reject, timer });
        });
    }

    async _openSocket() {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) return;
        await this.close();

        const url = this._wsUrl();
        await new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            let settled = false;
            const t = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { ws.close(); } catch {
                    // no-op
                }
                reject(new Error('CONNECT_TIMEOUT'));
            }, CONNECT_TIMEOUT_MS);

            ws.addEventListener('open', () => {
                if (settled) return;
                settled = true;
                clearTimeout(t);
                this._ws = ws;
                this._bindSocket(ws);
                this._emitState();
                resolve();
            }, { once: true });

            ws.addEventListener('error', () => {
                if (settled) return;
                settled = true;
                clearTimeout(t);
                reject(new Error('CONNECT_FAILED'));
            }, { once: true });
        });
    }

    _bindSocket(ws) {
        ws.addEventListener('message', evt => {
            let msg = null;
            try {
                msg = JSON.parse(String(evt.data || '{}'));
            } catch {
                return;
            }
            if (!msg || typeof msg !== 'object') return;

            this._resolveWaiters(msg);

            if (msg.type === 'error') {
                this._emitState({ status: msg.message || 'Network error', isError: true });
                return;
            }

            if (msg.type === 'room-created') {
                this._role = 'host';
                this._roomCode = String(msg.roomCode || '').toUpperCase();
                this._peerConnected = false;
                this._ready = false;
                this._lobby = null;
                this._emitState({ status: `Room ${this._roomCode} ready.` });
                return;
            }

            if (msg.type === 'room-joined') {
                this._role = 'guest';
                this._roomCode = String(msg.roomCode || '').toUpperCase();
                this._peerConnected = true;
                this._ready = false;
                this._lobby = null;
                this._emitState({ status: `Joined room ${this._roomCode}.` });
                return;
            }

            if (msg.type === 'peer-joined') {
                this._peerConnected = true;
                this._emitState({ status: 'Guest connected.' });
                return;
            }

            if (msg.type === 'peer-left') {
                this._peerConnected = false;
                this._ready = false;
                this._emitState({ status: 'Peer disconnected.' });
                return;
            }

            if (msg.type === 'left-room') {
                this._peerConnected = false;
                this._ready = false;
                this._lobby = null;
                this._roomCode = '';
                this._role = 'none';
                this._emitState({ status: 'Left room.' });
                return;
            }

            if (msg.type === 'lobby-state') {
                const players = msg.players && typeof msg.players === 'object' ? msg.players : {};
                const hostInfo = players.host && typeof players.host === 'object' ? players.host : {};
                const guestInfo = players.guest && typeof players.guest === 'object' ? players.guest : {};
                this._lobby = {
                    roomCode: String(msg.roomCode || this._roomCode || ''),
                    matchActive: !!msg.matchActive,
                    players: {
                        host: {
                            connected: !!hostInfo.connected,
                            name: String(hostInfo.name || 'HOST'),
                            ready: !!hostInfo.ready,
                        },
                        guest: {
                            connected: !!guestInfo.connected,
                            name: String(guestInfo.name || 'GUEST'),
                            ready: !!guestInfo.ready,
                        },
                    },
                };

                if (this._role === 'host') {
                    this._peerConnected = !!this._lobby.players.guest.connected;
                    this._ready = !!this._lobby.players.host.ready;
                } else if (this._role === 'guest') {
                    this._peerConnected = !!this._lobby.players.host.connected;
                    this._ready = !!this._lobby.players.guest.ready;
                }

                if (this._onLobbyState) this._onLobbyState(this._lobby);
                this._emitState();
                return;
            }

            if (msg.type === 'match-start') {
                if (this._onMatchStart) this._onMatchStart(msg);
                this._emitState({ status: 'Match starting...' });
                return;
            }

            if (msg.type === 'room-list') {
                const rooms = Array.isArray(msg.rooms) ? msg.rooms : [];
                if (this._onRoomList) this._onRoomList(rooms);
                this._emitState();
                return;
            }

            if (msg.type === 'guest-input') {
                this._lastGuestInputAt = nowMs();
                if (this._onGuestInput) this._onGuestInput(msg.input || {});
                return;
            }

            if (msg.type === 'host-state') {
                this._lastHostStateAt = nowMs();
                if (this._onHostState) this._onHostState(msg.state || null);
                return;
            }
        });

        ws.addEventListener('close', () => {
            const wasOpen = this._role !== 'none' || this._roomCode;
            this._ws = null;
            this._peerConnected = false;
            this._roomCode = '';
            this._role = 'none';
            this._ready = false;
            this._lobby = null;
            this._rejectAllWaiters(new Error('SOCKET_CLOSED'));
            if (wasOpen) this._emitState({ status: 'Disconnected from room.' });
            else this._emitState();
        });
    }

    async hostRoom() {
        await this._openSocket();
        if (!this._send({ type: 'host-create' })) throw new Error('SEND_FAILED');
        const msg = await this._waitFor(['room-created', 'error']);
        if (msg.type === 'error') throw new Error(msg.message || 'HOST_CREATE_FAILED');
        return this._roomCode;
    }

    async joinRoom(roomCode) {
        const code = String(roomCode || '').trim().toUpperCase();
        if (!code) throw new Error('ROOM_CODE_REQUIRED');
        await this._openSocket();
        if (!this._send({ type: 'join-room', roomCode: code })) throw new Error('SEND_FAILED');
        const msg = await this._waitFor(['room-joined', 'error']);
        if (msg.type === 'error') throw new Error(msg.message || 'JOIN_FAILED');
        return this._roomCode;
    }

    async close() {
        if (!this._ws) {
            this._peerConnected = false;
            this._roomCode = '';
            this._role = 'none';
            this._ready = false;
            this._lobby = null;
            return;
        }
        const ws = this._ws;
        this._ws = null;
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'leave-room' }));
            }
        } catch {
            // no-op
        }
        try {
            ws.close();
        } catch {
            // no-op
        }
        this._peerConnected = false;
        this._roomCode = '';
        this._role = 'none';
        this._ready = false;
        this._lobby = null;
        this._rejectAllWaiters(new Error('SESSION_CLOSED'));
        this._emitState({ status: 'Local mode.' });
    }

    isHost() { return this._role === 'host'; }
    isGuest() { return this._role === 'guest'; }
    hasPeer() { return this._peerConnected; }
    roomCode() { return this._roomCode; }
    isReady() { return this._ready; }
    lobby() { return this._lobby; }

    sendGuestInput(inputState) {
        if (!this.isGuest()) return false;
        return this._send({ type: 'guest-input', input: inputState || {} });
    }

    sendHostState(state) {
        if (!this.isHost()) return false;
        if (!this._peerConnected) return false;
        return this._send({ type: 'host-state', state });
    }

    setName(name) {
        if (this._role === 'none') return false;
        const normalized = String(name || '').trim().slice(0, 16);
        return this._send({ type: 'set-name', name: normalized });
    }

    setReady(ready) {
        if (this._role === 'none') return false;
        const next = !!ready;
        const ok = this._send({ type: 'set-ready', ready: next });
        if (ok) this._ready = next;
        this._emitState();
        return ok;
    }

    async listRooms() {
        await this._openSocket();
        if (!this._send({ type: 'list-rooms' })) throw new Error('SEND_FAILED');
        const msg = await this._waitFor(['room-list', 'error']);
        if (msg.type === 'error') throw new Error(msg.message || 'ROOM_LIST_FAILED');
        return Array.isArray(msg.rooms) ? msg.rooms : [];
    }
}
