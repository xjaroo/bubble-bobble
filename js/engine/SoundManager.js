/**
 * Minimal Web Audio API sound manager.
 * SFX are synthesised at runtime, and optional BGM can be loaded from assets/audio.
 */
const BGM_CANDIDATES = [
    'assets/audio/custom-bgm.mp3',
    'assets/audio/custom-bgm.ogg',
    'assets/audio/custom-bgm.wav',
    'assets/audio/custom-bgm.m4a',
    'assets/audio/bgm-custom.mp3',
    'assets/audio/bgm-custom.ogg',
    'assets/audio/bgm-custom.wav',
    'assets/audio/bgm-custom.m4a',
    'assets/audio/bubble-bobble-original.mp3',
    'assets/audio/bubble-bobble-original.ogg',
    'assets/audio/bubble-bobble-original.wav',
    'assets/audio/bubble-bobble-original.m4a',
    'assets/audio/bubble-bobble-original.webm',
    'assets/audio/bubble-bobble-theme.mp3',
    'assets/audio/bubble-bobble-theme.ogg',
    'assets/audio/bubble-bobble-theme.wav',
    'assets/audio/bubble-bobble-theme.m4a',
    'assets/audio/bubble-bobble.mp3',
    'assets/audio/bubble-bobble.ogg',
    'assets/audio/bubble-bobble.wav',
    'assets/audio/bubble-bobble.m4a',
    'assets/audio/bgm.mp3',
    'assets/audio/bgm.ogg',
    'assets/audio/bgm.wav',
    'assets/audio/bgm.m4a',
];

const YOUTUBE_BGM_VIDEO_ID = 'oz-WeeXgsOU';
const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api';

const SFX_CANDIDATES = {
    shoot: [
        'assets/audio/sfx-shoot.wav',
        'assets/audio/sfx-shoot.ogg',
        'assets/audio/sfx-shoot.mp3',
        'assets/audio/shoot.wav',
        'assets/audio/shoot.ogg',
        'assets/audio/shoot.mp3',
        'assets/audio/bubble-shoot.wav',
        'assets/audio/bubble-shoot.ogg',
        'assets/audio/bubble-shoot.mp3',
    ],
    pop: [
        'assets/audio/sfx-pop.wav',
        'assets/audio/sfx-pop.ogg',
        'assets/audio/sfx-pop.mp3',
        'assets/audio/pop.wav',
        'assets/audio/pop.ogg',
        'assets/audio/pop.mp3',
        'assets/audio/bubble-pop.wav',
        'assets/audio/bubble-pop.ogg',
        'assets/audio/bubble-pop.mp3',
    ],
}

export class SoundManager {
    constructor() {
        this.ctx         = null;
        this.master      = null;
        this.masterLevel = 0.34;
        this.muted       = false;

        this._bgmEl           = null;
        this._bgmGain         = null;
        this._bgmSource       = null;
        this._bgmReady        = false;
        this._bgmRequested    = false;
        this._bgmCandidateIdx = 0;
        this._useSynthBgm     = false;
        this._synthTicker     = null;
        this._synthNextTime   = 0;
        this._synthStep       = 0;
        this._synthStepDur    = 0.118;
        this._synthPatternLen = 32;
        this._sampleBuffers   = new Map();
        this._sampleStatus    = new Map();
        this._useYoutubeBgm   = true;
        this._ytPlayer        = null;
        this._ytReady         = false;
        this._ytFailed        = false;
        this._ytHostEl        = null;
        this._ytLoadTimer     = null;

        this._init();
    }

    _init() {
        try {
            this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.masterLevel;
            this.master.connect(this.ctx.destination);
        } catch (e) {
            console.warn('Web Audio not available');
        }
        this._initYoutubeBgm();
        this._initBgm();
        this._initSfxSamples();
    }

    getContext() { return this.ctx; }

    _initYoutubeBgm() {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            this._ytFailed = true;
            return;
        }
        if (!YOUTUBE_BGM_VIDEO_ID) {
            this._ytFailed = true;
            return;
        }

        this._ytHostEl = document.createElement('div');
        this._ytHostEl.id = 'bb-youtube-bgm';
        this._ytHostEl.style.position = 'fixed';
        this._ytHostEl.style.left = '-9999px';
        this._ytHostEl.style.top = '-9999px';
        this._ytHostEl.style.width = '1px';
        this._ytHostEl.style.height = '1px';
        this._ytHostEl.style.opacity = '0';
        this._ytHostEl.style.pointerEvents = 'none';
        document.body.appendChild(this._ytHostEl);

        const onApiReady = () => this._createYoutubePlayer();
        if (window.YT && window.YT.Player) {
            onApiReady();
        } else {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prev === 'function') prev();
                onApiReady();
            };
            if (!document.querySelector(`script[src="${YOUTUBE_API_SRC}"]`)) {
                const script = document.createElement('script');
                script.src = YOUTUBE_API_SRC;
                script.async = true;
                script.onerror = () => {
                    this._ytFailed = true;
                    if (this._bgmRequested && !this.muted) this.startBgm();
                };
                document.head.appendChild(script);
            }
        }

        this._ytLoadTimer = setTimeout(() => {
            if (!this._ytReady && !this._ytPlayer) {
                this._ytFailed = true;
                if (this._bgmRequested && !this.muted) this.startBgm();
            }
        }, 9000);
    }

    _createYoutubePlayer() {
        if (this._ytPlayer || this._ytFailed) return;
        if (!window.YT || !window.YT.Player || !this._ytHostEl) {
            this._ytFailed = true;
            return;
        }

        this._ytPlayer = new window.YT.Player(this._ytHostEl, {
            width: '1',
            height: '1',
            videoId: YOUTUBE_BGM_VIDEO_ID,
            playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                iv_load_policy: 3,
                loop: 1,
                modestbranding: 1,
                playsinline: 1,
                rel: 0,
                playlist: YOUTUBE_BGM_VIDEO_ID,
            },
            events: {
                onReady: () => {
                    this._ytReady = true;
                    if (this._ytLoadTimer) {
                        clearTimeout(this._ytLoadTimer);
                        this._ytLoadTimer = null;
                    }
                    try {
                        this._ytPlayer.setVolume(42);
                        if (this.muted) this._ytPlayer.mute();
                    } catch {
                        // no-op
                    }
                    if (this._bgmRequested && !this.muted) this._playYoutubeBgm();
                },
                onError: () => {
                    this._ytFailed = true;
                    this._ytReady = false;
                    if (this._bgmRequested && !this.muted) this.startBgm();
                },
            },
        });
    }

    _playYoutubeBgm() {
        if (!this._ytReady || !this._ytPlayer || this.muted) return false;
        try {
            this._ytPlayer.unMute();
            this._ytPlayer.playVideo();
            if (this._bgmEl) this._bgmEl.pause();
            this._stopSynthBgm();
            return true;
        } catch {
            return false;
        }
    }

    _stopYoutubeBgm() {
        if (!this._ytPlayer) return;
        try {
            this._ytPlayer.pauseVideo();
            this._ytPlayer.mute();
        } catch {
            // no-op
        }
    }

    _initBgm() {
        if (typeof Audio === 'undefined') return;

        const el = new Audio();
        el.loop = true;
        el.preload = 'auto';
        el.playsInline = true;
        el.crossOrigin = 'anonymous';
        el.volume = this.ctx ? 1 : 0.45;
        this._bgmEl = el;

        if (this.ctx && this.master) {
            try {
                this._bgmSource = this.ctx.createMediaElementSource(el);
                this._bgmGain = this.ctx.createGain();
                this._bgmGain.gain.value = 0.38;
                this._bgmSource.connect(this._bgmGain);
                this._bgmGain.connect(this.master);
            } catch (e) {
                console.warn('BGM routing fallback:', e);
            }
        }

        el.addEventListener('canplaythrough', () => {
            this._bgmReady = true;
            if (this._bgmRequested && !this.muted) {
                this.startBgm();
            }
        });

        el.addEventListener('error', () => {
            if (this._bgmReady) return;
            this._loadNextBgmCandidate();
        });

        this._loadNextBgmCandidate();
    }

    _initSfxSamples() {
        this._prepareSfxSample('shoot', SFX_CANDIDATES.shoot);
        this._prepareSfxSample('pop', SFX_CANDIDATES.pop);
    }

    async _loadFirstAudioBuffer(candidates) {
        if (!this.ctx || typeof fetch !== 'function') return null;
        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) continue;
                const arr = await res.arrayBuffer();
                // Safari can mutate/deplete the passed buffer; pass a copy.
                const decoded = await this.ctx.decodeAudioData(arr.slice(0));
                if (decoded) return decoded;
            } catch {
                // Try next candidate
            }
        }
        return null;
    }

    _prepareSfxSample(name, candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) return;
        this._sampleStatus.set(name, 'loading');
        this._loadFirstAudioBuffer(candidates).then(buf => {
            if (buf) {
                this._sampleBuffers.set(name, buf);
                this._sampleStatus.set(name, 'ready');
            } else {
                this._sampleStatus.set(name, 'missing');
            }
        }).catch(() => {
            this._sampleStatus.set(name, 'missing');
        });
    }

    _playSample(name, volume = 1, playbackRate = 1) {
        if (!this.ctx || this.muted) return false;
        const buf = this._sampleBuffers.get(name);
        if (!buf) return false;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = buf;
        src.playbackRate.setValueAtTime(playbackRate, now);
        gain.gain.setValueAtTime(volume, now);
        src.connect(gain);
        gain.connect(this.master);
        src.start(now);
        return true;
    }

    _loadNextBgmCandidate() {
        if (!this._bgmEl) return;
        if (this._bgmCandidateIdx >= BGM_CANDIDATES.length) {
            console.warn('No BGM file found. Using built-in upbeat synth BGM.');
            this._useSynthBgm = true;
            this._bgmReady = true;
            if (this._bgmRequested && !this.muted) this.startBgm();
            return;
        }
        this._bgmReady = false;
        this._bgmEl.src = BGM_CANDIDATES[this._bgmCandidateIdx++];
        this._bgmEl.load();
    }

    startBgm() {
        this._bgmRequested = true;
        if (this._useYoutubeBgm && !this._ytFailed) {
            if (this._playYoutubeBgm()) return;
            // Wait for YouTube player to become ready on user gesture.
            return;
        }
        if (this._useSynthBgm) {
            this._startSynthBgm();
            return;
        }
        if (!this._bgmEl || !this._bgmReady || this.muted) return;
        const p = this._bgmEl.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {
                // Browser autoplay policy: will retry on next user gesture.
            });
        }
    }

    onUserGesture() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this._useYoutubeBgm && this._ytReady && !this.muted) {
            this._playYoutubeBgm();
            return;
        }
        if (this._bgmRequested && !this.muted) {
            this.startBgm();
        }
    }

    _midiToFreq(n) {
        return 440 * Math.pow(2, (n - 69) / 12);
    }

    _startSynthBgm() {
        if (!this.ctx || this.muted) return;
        if (this._synthTicker) return;
        this._synthStep = 0;
        this._synthNextTime = this.ctx.currentTime + 0.05;
        this._synthTicker = setInterval(() => this._tickSynthBgm(), 60);
    }

    _stopSynthBgm() {
        if (!this._synthTicker) return;
        clearInterval(this._synthTicker);
        this._synthTicker = null;
    }

    _tickSynthBgm() {
        if (!this.ctx || this.muted) return;
        const lookAhead = 0.22;
        while (this._synthNextTime < this.ctx.currentTime + lookAhead) {
            this._scheduleSynthStep(this._synthStep, this._synthNextTime);
            this._synthNextTime += this._synthStepDur;
            this._synthStep = (this._synthStep + 1) % this._synthPatternLen;
        }
    }

    _scheduleSynthStep(step, when) {
        // 32-step energetic synth-pop loop
        const step32 = step & 31;
        const bar = Math.floor(step32 / 8) & 3;
        const s = step32 & 7;

        // C -> Am -> F -> G style progression
        const chordRoots = [60, 57, 53, 55];
        const leadPhrases = [
            [79, 83, 86, 88, 86, 83, 79, 76],
            [76, 81, 84, 86, 84, 81, 76, 74],
            [74, 79, 83, 84, 83, 79, 74, 72],
            [79, 83, 86, 91, 88, 86, 83, 79],
        ];
        const bassOffsets = [0, 7, 12, 7, 0, 7, 10, 7];
        const root = chordRoots[bar];

        // Lead melody
        const lead = leadPhrases[bar][s];
        this._toneAt(this._midiToFreq(lead), 'square', 0.003, 0.065, 0.045, 0.17, when);

        // Counter sparkle on off-beats
        if (s === 1 || s === 5) {
            this._toneAt(this._midiToFreq(lead + 12), 'triangle', 0.002, 0.03, 0.035, 0.07, when + 0.01);
        }

        // Bass groove
        const bassNote = root - 24 + bassOffsets[s];
        this._toneAt(this._midiToFreq(bassNote), 'square', 0.002, 0.075, 0.04, 0.12, when);

        // Kick (4-on-floor + fill accent)
        if (s === 0 || s === 4) {
            this._toneAt(110, 'sine', 0.001, 0.014, 0.07, 0.24, when);
            this._toneAt(64, 'triangle', 0.001, 0.01, 0.05, 0.13, when);
        }
        if ((bar === 1 || bar === 3) && s === 6) {
            this._toneAt(92, 'sine', 0.001, 0.012, 0.05, 0.16, when);
        }

        // Snare / clap backbeat
        if (s === 4) {
            this._noiseAt(0.05, 0.045, when + 0.003);
            this._toneAt(205, 'triangle', 0.001, 0.01, 0.028, 0.08, when + 0.003);
        }

        // Hi-hat pattern
        if (s % 2 === 1) {
            this._noiseAt(0.012, 0.02, when + 0.004);
        } else if (s === 2 || s === 6) {
            this._noiseAt(0.016, 0.016, when + 0.005);
        }

        // Bright chord stabs
        if (s === 0 || s === 3) {
            this._toneAt(this._midiToFreq(root + 12), 'triangle', 0.002, 0.03, 0.05, 0.065, when);
            this._toneAt(this._midiToFreq(root + 16), 'triangle', 0.002, 0.03, 0.05, 0.06, when);
            this._toneAt(this._midiToFreq(root + 19), 'triangle', 0.002, 0.03, 0.05, 0.055, when);
        }
    }

    _toneAt(freq, type, attack, sustain, release, vol = 1, startAt = null) {
        if (!this.ctx || this.muted) return;
        const now = startAt ?? this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(vol, now + attack);
        env.gain.setValueAtTime(vol, now + attack + sustain);
        env.gain.linearRampToValueAtTime(0, now + attack + sustain + release);
        osc.connect(env);
        env.connect(this.master);
        osc.start(now);
        osc.stop(now + attack + sustain + release + 0.01);
    }

    _tone(freq, type, attack, sustain, release, vol = 1) {
        this._toneAt(freq, type, attack, sustain, release, vol, null);
    }

    _sweep(freqStart, freqEnd, type, duration, vol = 1) {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.linearRampToValueAtTime(freqEnd, now + duration);
        env.gain.setValueAtTime(vol, now);
        env.gain.linearRampToValueAtTime(0, now + duration);
        osc.connect(env);
        env.connect(this.master);
        osc.start(now);
        osc.stop(now + duration + 0.01);
    }

    _noiseAt(duration, vol = 0.15, startAt = null) {
        if (!this.ctx || this.muted) return;
        const sampleRate = this.ctx.sampleRate;
        const bufLen = Math.ceil(sampleRate * duration);
        const buf = this.ctx.createBuffer(1, bufLen, sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
        const src = this.ctx.createBufferSource();
        const env = this.ctx.createGain();
        src.buffer = buf;
        const now = startAt ?? this.ctx.currentTime;
        env.gain.setValueAtTime(vol, now);
        env.gain.linearRampToValueAtTime(0, now + duration);
        src.connect(env);
        env.connect(this.master);
        src.start(now);
    }

    _noise(duration, vol = 0.15) {
        this._noiseAt(duration, vol, null);
    }

    play(name) {
        switch (name) {
            case 'jump':
                this._sweep(300, 600, 'square', 0.12, 0.4);
                break;
            case 'shoot':
                if (this._playSample('shoot', 0.68, 1)) break;
                this._sweep(500, 200, 'sine', 0.15, 0.3);
                break;
            case 'trap':
                this._tone(523, 'sine', 0.01, 0.05, 0.1, 0.5);
                this._tone(659, 'sine', 0.06, 0.05, 0.1, 0.5);
                this._tone(784, 'sine', 0.11, 0.05, 0.15, 0.5);
                break;
            case 'pop':
                if (this._playSample('pop', 0.74, 0.96 + Math.random() * 0.1)) break;
                this._noise(0.08, 0.2);
                this._tone(880, 'sine', 0.01, 0.03, 0.06, 0.4);
                break;
            case 'death':
                this._sweep(440, 110, 'sawtooth', 0.5, 0.4);
                break;
            case 'item':
                this._tone(1047, 'sine', 0.01, 0.04, 0.08, 0.35);
                break;
            case 'extend':
                [523, 587, 659, 698, 784, 880].forEach((f, i) =>
                    setTimeout(() => this._tone(f, 'square', 0.01, 0.06, 0.08, 0.4), i * 80)
                );
                break;
            case 'extralife':
                [784, 988, 1175, 1319, 1568].forEach((f, i) =>
                    setTimeout(() => this._tone(f, 'sine', 0.01, 0.08, 0.1, 0.5), i * 100)
                );
                break;
            case 'levelclear':
                [523, 659, 784, 1047].forEach((f, i) =>
                    setTimeout(() => this._tone(f, 'triangle', 0.01, 0.1, 0.15, 0.5), i * 120)
                );
                break;
            case 'hurryup':
                this._tone(880, 'square', 0.01, 0.08, 0.05, 0.5);
                setTimeout(() => this._tone(1175, 'square', 0.01, 0.08, 0.05, 0.5), 200);
                break;
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.value = this.muted ? 0 : this.masterLevel;
        if (this._bgmEl && !this.master) this._bgmEl.muted = this.muted;
        if (this.muted) this._stopYoutubeBgm();
        else if (this._useYoutubeBgm && this._ytReady && this._bgmRequested) this._playYoutubeBgm();
        if (this.muted) this._stopSynthBgm();
        if (!this.muted && this._bgmRequested) this.startBgm();
    }
}
