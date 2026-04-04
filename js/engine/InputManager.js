/**
 * Keyboard input manager.
 * Tracks raw key state + "just pressed" edge detection.
 * Also resumes the AudioContext on first interaction (Chrome autoplay policy).
 */
const KEY_BINDINGS_STORAGE_KEY = 'bbKeyBindingsV1';

const DEFAULT_KEY_BINDINGS = Object.freeze({
    p1Left:   'ArrowLeft',
    p1Right:  'ArrowRight',
    p1Down:   'ArrowDown',
    p1Jump:   'KeyZ',
    p1Shoot:  'KeyX',
    p2Left:   'KeyA',
    p2Right:  'KeyD',
    p2Down:   'KeyS',
    p2Jump:   'KeyQ',
    p2Shoot:  'KeyE',
    start:    'Enter',
    mute:     'KeyM',
    visual:   'KeyV',
    settings: 'F1',
    cheatLife:'F2',
});

export class InputManager {
    constructor() {
        this._held      = new Set();
        this._justDown  = new Set();
        this._justUp    = new Set();
        this._audioCtx  = null;
        this._suspended = false;
        // Hysteresis deadzone avoids rapid left/right flicker from analog stick noise.
        this._axisPressThreshold = 0.52;
        this._axisReleaseThreshold = 0.34;
        this._bindings = this._loadBindings();
        this._gpSlots = [null, null]; // gamepad.index assigned to P1 / P2
        this._assignedPadCount = 0;

        // Gamepad action states: index 0 => P1 pad, index 1 => P2 pad
        this._gpHeld = [this._newPadState(), this._newPadState()];
        this._gpJustDown = [this._newPadState(), this._newPadState()];
        this._gpJustUp = [this._newPadState(), this._newPadState()];
        this._touchHeld = this._newPadState();
        this._touchJustDown = this._newPadState();
        this._touchJustUp = this._newPadState();

        // Remote action overrides (for WebSocket multiplayer).
        this._remoteHeld = [this._newPadState(), this._newPadState()];
        this._remoteJustDown = [this._newPadState(), this._newPadState()];
        this._networkRole = 'none'; // none | host | guest

        window.addEventListener('keydown', e => this._onKeyDown(e));
        window.addEventListener('keyup',   e => this._onKeyUp(e));
        window.addEventListener('gamepadconnected', e => this._onGamepadConnected(e));
        window.addEventListener('gamepaddisconnected', e => this._onGamepadDisconnected(e));
    }

    setAudioContext(ctx) { this._audioCtx = ctx; }

    _newPadState() {
        return {
            left: false,
            right: false,
            down: false,
            jump: false,
            shoot: false,
            start: false,
        };
    }

    _onGamepadConnected(e) {
        const gp = e?.gamepad;
        if (!gp) return;
        if (this._gpSlots.includes(gp.index)) return;
        const empty = this._gpSlots.indexOf(null);
        if (empty !== -1) this._gpSlots[empty] = gp.index;
    }

    _onGamepadDisconnected(e) {
        const gp = e?.gamepad;
        if (!gp) return;
        for (let i = 0; i < this._gpSlots.length; i++) {
            if (this._gpSlots[i] === gp.index) {
                this._gpSlots[i] = null;
                this._gpHeld[i] = this._newPadState();
                this._gpJustDown[i] = this._newPadState();
                this._gpJustUp[i] = this._newPadState();
            }
        }
    }

    _refreshGamepadSlots(padsRaw) {
        // Remove disconnected slot bindings
        for (let i = 0; i < 2; i++) {
            const slotIdx = this._gpSlots[i];
            if (slotIdx === null) continue;
            const p = padsRaw[slotIdx];
            if (!p || !p.connected) this._gpSlots[i] = null;
        }
        this._compactGamepadSlots();

        // Fill empty slots with unassigned connected pads
        const assigned = new Set(this._gpSlots.filter(v => v !== null));
        for (const p of padsRaw) {
            if (!p || !p.connected) continue;
            if (assigned.has(p.index)) continue;
            const empty = this._gpSlots.indexOf(null);
            if (empty === -1) break;
            this._gpSlots[empty] = p.index;
            assigned.add(p.index);
        }
        this._compactGamepadSlots();
    }

    _compactGamepadSlots() {
        // Keep active pads packed left-to-right so a single remaining pad is always P1.
        const compact = this._gpSlots.filter(v => v !== null);
        while (compact.length < 2) compact.push(null);
        this._gpSlots[0] = compact[0];
        this._gpSlots[1] = compact[1];
    }

    _btn(pad, idx, threshold = 0.35) {
        const b = pad && pad.buttons ? pad.buttons[idx] : null;
        if (!b) return false;
        return !!b.pressed || (typeof b.value === 'number' && b.value >= threshold);
    }

    /** Call once at start of each game tick (before reading inputs). */
    beginFrame() {
        this._pollGamepads();
    }

    _pollGamepads() {
        // Reset edge sets each frame; held will be replaced below.
        this._gpJustDown[0] = this._newPadState();
        this._gpJustDown[1] = this._newPadState();
        this._gpJustUp[0] = this._newPadState();
        this._gpJustUp[1] = this._newPadState();

        if (this._suspended) {
            this._gpHeld[0] = this._newPadState();
            this._gpHeld[1] = this._newPadState();
            return;
        }

        const padsRaw = (typeof navigator !== 'undefined' && navigator.getGamepads)
            ? navigator.getGamepads()
            : [];

        this._refreshGamepadSlots(padsRaw);

        const pads = [null, null];
        for (let i = 0; i < 2; i++) {
            const slotIdx = this._gpSlots[i];
            if (slotIdx === null) {
                pads[i] = null;
                continue;
            }
            const p = padsRaw[slotIdx];
            pads[i] = (p && p.connected) ? p : null;
        }
        this._assignedPadCount = pads.filter(Boolean).length;

        for (let i = 0; i < 2; i++) {
            const prev = this._gpHeld[i];
            const next = this._newPadState();
            const pad = pads[i];

            if (pad) {
                const ax = (pad.axes && pad.axes.length > 0) ? pad.axes[0] : 0;
                const ay = (pad.axes && pad.axes.length > 1) ? pad.axes[1] : 0;
                const press = this._axisPressThreshold;
                const release = this._axisReleaseThreshold;
                const leftAxis = prev.left ? (ax <= -release) : (ax <= -press);
                const rightAxis = prev.right ? (ax >= release) : (ax >= press);
                const downAxis = prev.down ? (ay >= release) : (ay >= press);

                // Move: left stick or D-pad
                next.left  = leftAxis || this._btn(pad, 14);
                next.right = rightAxis || this._btn(pad, 15);
                next.down  = downAxis || this._btn(pad, 13);

                // Xbox standard mapping:
                // A(0) jump, X(2)/RB(5)/RT(7)/LT(6) shoot, Start(9) start.
                next.jump = this._btn(pad, 0) || this._btn(pad, 1) || this._btn(pad, 3);
                next.shoot = this._btn(pad, 2) || this._btn(pad, 5) || this._btn(pad, 7) || this._btn(pad, 6);
                // Allow Start(9) and View(8) to start from title.
                next.start = this._btn(pad, 9) || this._btn(pad, 8);
            }

            for (const key of Object.keys(next)) {
                this._gpJustDown[i][key] = next[key] && !prev[key];
                this._gpJustUp[i][key] = !next[key] && prev[key];
            }
            this._gpHeld[i] = next;
        }

        // Resume AudioContext on first gamepad interaction
        if (this._audioCtx && this._audioCtx.state === 'suspended') {
            const interacted =
                this._gpJustDown[0].jump || this._gpJustDown[0].shoot || this._gpJustDown[0].start ||
                this._gpJustDown[1].jump || this._gpJustDown[1].shoot || this._gpJustDown[1].start;
            if (interacted) this._audioCtx.resume();
        }
    }

    _onKeyDown(e) {
        // Resume AudioContext on first user gesture
        if (this._audioCtx && this._audioCtx.state === 'suspended') {
            this._audioCtx.resume();
        }
        if (this._suspended) return;
        if (!this._held.has(e.code)) {
            this._justDown.add(e.code);
        }
        this._held.add(e.code);
        // Prevent arrow keys from scrolling the page
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        if (this._suspended) return;
        this._held.delete(e.code);
        this._justUp.add(e.code);
    }

    /** Call once per game tick, after all input has been read. */
    flush() {
        this._justDown.clear();
        this._justUp.clear();
        this._gpJustDown[0] = this._newPadState();
        this._gpJustDown[1] = this._newPadState();
        this._gpJustUp[0] = this._newPadState();
        this._gpJustUp[1] = this._newPadState();
        this._touchJustDown = this._newPadState();
        this._touchJustUp = this._newPadState();
        this._remoteJustDown[0] = this._newPadState();
        this._remoteJustDown[1] = this._newPadState();
    }

    isHeld(code)      { return this._held.has(code); }
    isJustDown(code)  { return this._justDown.has(code); }
    isJustUp(code)    { return this._justUp.has(code); }

    _loadBindings() {
        const fallback = { ...DEFAULT_KEY_BINDINGS };
        try {
            const raw = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return fallback;
            for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
                const code = parsed[action];
                if (typeof code === 'string' && code.length > 0) {
                    fallback[action] = code;
                }
            }
            return fallback;
        } catch {
            return fallback;
        }
    }

    _saveBindings() {
        try {
            localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(this._bindings));
        } catch {
            // Ignore storage quota / privacy mode failures.
        }
    }

    getBindings() {
        return { ...this._bindings };
    }

    getDefaultBindings() {
        return { ...DEFAULT_KEY_BINDINGS };
    }

    getBinding(action) {
        return this._bindings[action] || DEFAULT_KEY_BINDINGS[action] || '';
    }

    setBinding(action, code) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_KEY_BINDINGS, action)) return false;
        if (typeof code !== 'string' || code.length === 0) return false;
        this._bindings[action] = code;
        this._saveBindings();
        return true;
    }

    resetBindings() {
        this._bindings = { ...DEFAULT_KEY_BINDINGS };
        this._saveBindings();
    }

    setSuspended(flag) {
        this._suspended = !!flag;
        if (this._suspended) {
            this._held.clear();
            this._justDown.clear();
            this._justUp.clear();
            this._gpHeld[0] = this._newPadState();
            this._gpHeld[1] = this._newPadState();
            this._gpJustDown[0] = this._newPadState();
            this._gpJustDown[1] = this._newPadState();
            this._gpJustUp[0] = this._newPadState();
            this._gpJustUp[1] = this._newPadState();
            this._remoteHeld[0] = this._newPadState();
            this._remoteHeld[1] = this._newPadState();
            this._remoteJustDown[0] = this._newPadState();
            this._remoteJustDown[1] = this._newPadState();
            this._touchHeld = this._newPadState();
            this._touchJustDown = this._newPadState();
            this._touchJustUp = this._newPadState();
        }
    }

    isSuspended() {
        return this._suspended;
    }

    static formatCode(code) {
        if (!code) return '?';
        if (code.startsWith('Key')) return code.slice(3).toUpperCase();
        if (code.startsWith('Digit')) return code.slice(5);
        if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
        if (code.startsWith('Numpad')) {
            const tail = code.slice(6);
            return tail === 'Enter' ? 'NUM ENTER' : `NUM ${tail.toUpperCase()}`;
        }
        if (code === 'Space') return 'SPACE';
        if (code === 'Escape') return 'ESC';
        if (code === 'Backquote') return '`';
        if (code === 'Minus') return '-';
        if (code === 'Equal') return '=';
        if (code === 'BracketLeft') return '[';
        if (code === 'BracketRight') return ']';
        if (code === 'Semicolon') return ';';
        if (code === 'Quote') return '\'';
        if (code === 'Comma') return ',';
        if (code === 'Period') return '.';
        if (code === 'Slash') return '/';
        if (code === 'Backslash') return '\\';
        return code.toUpperCase();
    }

    getBindingLabel(action) {
        return InputManager.formatCode(this.getBinding(action));
    }

    describeBindings() {
        return {
            p1: {
                left: this.getBindingLabel('p1Left'),
                right: this.getBindingLabel('p1Right'),
                down: this.getBindingLabel('p1Down'),
                jump: this.getBindingLabel('p1Jump'),
                shoot: this.getBindingLabel('p1Shoot'),
            },
            p2: {
                left: this.getBindingLabel('p2Left'),
                right: this.getBindingLabel('p2Right'),
                down: this.getBindingLabel('p2Down'),
                jump: this.getBindingLabel('p2Jump'),
                shoot: this.getBindingLabel('p2Shoot'),
            },
            start: this.getBindingLabel('start'),
            mute: this.getBindingLabel('mute'),
            visual: this.getBindingLabel('visual'),
            settings: this.getBindingLabel('settings'),
            cheatLife: this.getBindingLabel('cheatLife'),
        };
    }

    actionJustDown(action) {
        const code = this.getBinding(action);
        return !!code && this.isJustDown(code);
    }

    actionHeld(action) {
        const code = this.getBinding(action);
        return !!code && this.isHeld(code);
    }

    connectedGamepadsCount() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) {
            return this._assignedPadCount || 0;
        }
        const padsRaw = navigator.getGamepads();
        let count = 0;
        for (const p of padsRaw) {
            if (p && p.connected) count++;
        }
        return Math.min(4, count);
    }

    setRemotePlayerState(playerIndex, state) {
        const idx = playerIndex | 0;
        if (idx < 0 || idx > 1) return;

        const prev = this._remoteHeld[idx] || this._newPadState();
        const next = this._newPadState();
        const src = state && typeof state === 'object' ? state : {};
        next.left = !!src.left;
        next.right = !!src.right;
        next.down = !!src.down;
        next.jump = !!src.jump;
        next.shoot = !!src.shoot;
        next.start = !!src.start;

        for (const key of Object.keys(next)) {
            const edge = next[key] && !prev[key];
            this._remoteJustDown[idx][key] = this._remoteJustDown[idx][key] || edge;
        }
        this._remoteHeld[idx] = next;
    }

    clearRemotePlayerState(playerIndex) {
        const idx = playerIndex | 0;
        if (idx < 0 || idx > 1) return;
        this._remoteHeld[idx] = this._newPadState();
        this._remoteJustDown[idx] = this._newPadState();
    }

    clearAllRemotePlayerStates() {
        this.clearRemotePlayerState(0);
        this.clearRemotePlayerState(1);
    }

    setTouchAction(action, held) {
        if (this._suspended) return false;
        if (!Object.prototype.hasOwnProperty.call(this._touchHeld, action)) return false;
        const next = !!held;
        const prev = !!this._touchHeld[action];
        if (next === prev) return false;
        this._touchHeld[action] = next;
        if (next) this._touchJustDown[action] = true;
        else this._touchJustUp[action] = true;
        return true;
    }

    setNetworkRole(role) {
        this._networkRole = role === 'host' || role === 'guest' ? role : 'none';
    }

    clearTouchActions() {
        this._touchHeld = this._newPadState();
        this._touchJustDown = this._newPadState();
        this._touchJustUp = this._newPadState();
    }

    assignedGamepadsCount() {
        return this._assignedPadCount;
    }

    secondPadJoinPressed() {
        return this._gpJustDown[1].start || this._gpJustDown[1].jump;
    }

    // ── Convenience action helpers ──────────────────────────────────────────

    p1Left()     { return this.actionHeld('p1Left') || this._gpHeld[0].left || this._remoteHeld[0].left || this._touchHeld.left; }
    p1Right()    { return this.actionHeld('p1Right') || this._gpHeld[0].right || this._remoteHeld[0].right || this._touchHeld.right; }
    p1DownHeld() { return this.actionHeld('p1Down') || this._gpHeld[0].down || this._remoteHeld[0].down || this._touchHeld.down; }
    p1Jump()     { return this.actionJustDown('p1Jump') || this._gpJustDown[0].jump || this._remoteJustDown[0].jump || this._touchJustDown.jump; }
    p1JumpHeld() { return this.actionHeld('p1Jump') || this._gpHeld[0].jump || this._remoteHeld[0].jump || this._touchHeld.jump; }
    p1Shoot()    { return this.actionJustDown('p1Shoot') || this._gpJustDown[0].shoot || this._remoteJustDown[0].shoot || this._touchJustDown.shoot; }
    p1ShootHeld(){ return this.actionHeld('p1Shoot') || this._gpHeld[0].shoot || this._remoteHeld[0].shoot || this._touchHeld.shoot; }

    p2Left() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionHeld('p2Left') || this._gpHeld[1].left);
        return local || this._remoteHeld[1].left;
    }
    p2Right() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionHeld('p2Right') || this._gpHeld[1].right);
        return local || this._remoteHeld[1].right;
    }
    p2DownHeld() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionHeld('p2Down') || this._gpHeld[1].down);
        return local || this._remoteHeld[1].down;
    }
    p2Jump() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionJustDown('p2Jump') || this._gpJustDown[1].jump);
        return local || this._remoteJustDown[1].jump;
    }
    p2JumpHeld() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionHeld('p2Jump') || this._gpHeld[1].jump);
        return local || this._remoteHeld[1].jump;
    }
    p2Shoot() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionJustDown('p2Shoot') || this._gpJustDown[1].shoot);
        return local || this._remoteJustDown[1].shoot;
    }
    p2ShootHeld() {
        const local = this._networkRole === 'host'
            ? false
            : (this.actionHeld('p2Shoot') || this._gpHeld[1].shoot);
        return local || this._remoteHeld[1].shoot;
    }
    cheatLife()  { return this.actionJustDown('cheatLife'); }

    anyStart() {
        return (
            this.actionJustDown('start') ||
            this.actionHeld('start') ||
            this._gpJustDown[0].start ||
            this._gpJustDown[1].start ||
            this._remoteJustDown[0].start ||
            this._remoteJustDown[1].start ||
            this._remoteHeld[0].start ||
            this._remoteHeld[1].start ||
            this._touchJustDown.start ||
            this._touchHeld.start ||
            this._touchJustDown.jump ||
            this._gpJustDown[0].jump ||
            this._gpJustDown[1].jump
        );
    }
}
