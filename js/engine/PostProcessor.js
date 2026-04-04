/**
 * WebGL Post-Processor
 * ────────────────────
 * Reads the game's offscreen Canvas 2D as a texture and applies:
 *  1. Bloom / neon glow      — bright pixels spread a coloured halo
 *  2. Adaptive sharpening    — keeps gameplay silhouettes crisp
 *  3. Filmic grading         — subtle saturation, tonemap, vignette
 *  4. Grain + chromatic trim — modern display character
 *  5. devicePixelRatio       — renders at native screen resolution
 *
 * The game canvas stays at the logical 256 × 232 px resolution.
 * The scene itself may be supersampled by Camera before this pass.
 */

// ── Vertex shader (fullscreen quad) ──────────────────────────────────────────
const VS = `
attribute vec2 a_pos;
varying   vec2 v_uv;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    // Convert clip-space (-1…1) to UV (0…1), flip Y so canvas is right-side-up
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
}
`;

// ── Fragment shader ───────────────────────────────────────────────────────────
// Multi-tap bloom:  sample 3 rings of neighbours around each pixel.
// Only bright samples contribute to the glow so dark areas stay dark.
const FS = `
precision mediump float;
uniform sampler2D u_scene;
uniform vec2      u_px;       // 1.0 / vec2(srcWidth, srcHeight)
uniform vec2      u_outPx;    // output pixel size
uniform float     u_time;
uniform float     u_bloomStrength;
uniform float     u_sharpness;
uniform float     u_saturation;
uniform float     u_vignette;
uniform float     u_scanline;
uniform float     u_filmGrain;
uniform float     u_chromatic;
uniform float     u_pixelMix; // 0 = smooth UV, 1 = snapped pixel UV
varying vec2      v_uv;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec3 sampleScene(vec2 uv, float chroma) {
    vec2 dir = (uv * 2.0 - 1.0) * u_px * chroma;
    float r = texture2D(u_scene, uv + dir).r;
    float g = texture2D(u_scene, uv).g;
    float b = texture2D(u_scene, uv - dir).b;
    return vec3(r, g, b);
}

// Weighted sample: contributes glow only if luminance exceeds threshold.
vec3 glowSample(vec2 uv, float weight, float chroma) {
    vec3 c = sampleScene(uv, chroma);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return c * weight * clamp((lum - 0.35) * 2.8, 0.0, 1.0);
}

void main() {
    // Blend between smooth and snapped UVs per profile.
    vec2 texSize = vec2(1.0) / u_px;
    vec2 uvSnap = (floor(v_uv * texSize) + 0.5) / texSize;
    vec2 uv = mix(v_uv, uvSnap, u_pixelMix);

    // ── Base scene pixel with optional chromatic trim ─────────────────────
    vec3 base = sampleScene(uv, u_chromatic);

    // ── Bloom accumulation (3 rings × 8 directions) ───────────────────────
    vec3 bloom = vec3(0.0);
    vec2 d;

    // Ring 1 — radius 1.5 px
    d = u_px * 1.5;
    bloom += glowSample(uv + vec2( d.x, 0.0), 1.00, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2(-d.x, 0.0), 1.00, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2(0.0,  d.y), 1.00, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2(0.0, -d.y), 1.00, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2( d.x,  d.y), 0.71, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2(-d.x,  d.y), 0.71, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2( d.x, -d.y), 0.71, u_chromatic * 0.35);
    bloom += glowSample(uv + vec2(-d.x, -d.y), 0.71, u_chromatic * 0.35);

    // Ring 2 — radius 3 px
    d = u_px * 3.0;
    bloom += glowSample(uv + vec2( d.x, 0.0), 0.60, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2(-d.x, 0.0), 0.60, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2(0.0,  d.y), 0.60, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2(0.0, -d.y), 0.60, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2( d.x,  d.y), 0.42, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2(-d.x,  d.y), 0.42, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2( d.x, -d.y), 0.42, u_chromatic * 0.25);
    bloom += glowSample(uv + vec2(-d.x, -d.y), 0.42, u_chromatic * 0.25);

    // Ring 3 — radius 5 px
    d = u_px * 5.0;
    bloom += glowSample(uv + vec2( d.x, 0.0), 0.35, 0.0);
    bloom += glowSample(uv + vec2(-d.x, 0.0), 0.35, 0.0);
    bloom += glowSample(uv + vec2(0.0,  d.y), 0.35, 0.0);
    bloom += glowSample(uv + vec2(0.0, -d.y), 0.35, 0.0);
    bloom += glowSample(uv + vec2( d.x,  d.y), 0.25, 0.0);
    bloom += glowSample(uv + vec2(-d.x,  d.y), 0.25, 0.0);
    bloom += glowSample(uv + vec2( d.x, -d.y), 0.25, 0.0);
    bloom += glowSample(uv + vec2(-d.x, -d.y), 0.25, 0.0);

    // Normalise bloom (sum of weights ≈ 13.56)
    bloom /= 13.56;

    // ── Local contrast-preserving sharpen ──────────────────────────────────
    vec3 north = sampleScene(uv + vec2(0.0,  u_px.y), u_chromatic);
    vec3 south = sampleScene(uv + vec2(0.0, -u_px.y), u_chromatic);
    vec3 east  = sampleScene(uv + vec2( u_px.x, 0.0), u_chromatic);
    vec3 west  = sampleScene(uv + vec2(-u_px.x, 0.0), u_chromatic);
    vec3 localBlur = (north + south + east + west + base) * 0.2;
    vec3 sharpened = base + (base - localBlur) * u_sharpness;

    // ── Composite ──────────────────────────────────────────────────────────
    vec3 result = sharpened + bloom * u_bloomStrength;

    // ── Saturation boost ───────────────────────────────────────────────────
    float gray = dot(result, vec3(0.2126, 0.7152, 0.0722));
    result = mix(vec3(gray), result, u_saturation);

    // ── Light tonemap (preserve contrast for crisp gameplay readability) ───
    result = clamp(result, 0.0, 1.4);
    result = result / (result * 0.55 + vec3(1.0));
    result = pow(result, vec3(0.99));

    // ── Edge vignette ──────────────────────────────────────────────────────
    vec2 vp  = v_uv * 2.0 - 1.0;           // -1 … 1
    float vig = 1.0 - dot(vp, vp) * u_vignette;
    result *= vig;

    // ── Optional subtle scanline shaping ───────────────────────────────────
    float scanWave = 0.5 + 0.5 * sin(v_uv.y * u_outPx.y * 3.14159265);
    result *= 1.0 - (u_scanline * scanWave);

    // ── Film grain ─────────────────────────────────────────────────────────
    float grain = (hash(v_uv * u_outPx + vec2(u_time * 43.0, u_time * 71.0)) - 0.5) * u_filmGrain;
    result += grain;

    gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`;

const VISUAL_PROFILES = [
    {
        key: 'ultra',
        label: 'ULTRA',
        bloomStrength: 0.00,
        sharpness: 0.00,
        saturation: 1.00,
        vignette: 0.00,
        scanline: 0.00,
        filmGrain: 0.000,
        chromatic: 0.00,
        pixelMix: 1.00,
    },
    {
        key: 'crisp',
        label: 'CRISP',
        bloomStrength: 0.04,
        sharpness: 0.82,
        saturation: 1.02,
        vignette: 0.00,
        scanline: 0.00,
        filmGrain: 0.000,
        chromatic: 0.00,
        pixelMix: 0.74,
    },
    {
        key: 'cinematic',
        label: 'CINEMA',
        bloomStrength: 0.40,
        sharpness: 0.32,
        saturation: 1.22,
        vignette: 0.10,
        scanline: 0.02,
        filmGrain: 0.040,
        chromatic: 0.80,
        pixelMix: 0.10,
    },
    {
        key: 'classic',
        label: 'CLASSIC',
        bloomStrength: 0.14,
        sharpness: 0.38,
        saturation: 1.06,
        vignette: 0.06,
        scanline: 0.06,
        filmGrain: 0.010,
        chromatic: 0.10,
        pixelMix: 0.92,
    },
];

// ── PostProcessor class ───────────────────────────────────────────────────────

export class PostProcessor {
    /**
     * @param {HTMLCanvasElement} glCanvas  — the visible canvas (will use WebGL)
     * @param {HTMLCanvasElement} srcCanvas — the offscreen game canvas (Canvas 2D)
     */
    constructor(glCanvas, srcCanvas) {
        this._src = srcCanvas;
        this._profileIndex = VISUAL_PROFILES.findIndex(p => p.key === 'ultra');
        if (this._profileIndex < 0) this._profileIndex = 0;
        this._profile = { ...VISUAL_PROFILES[this._profileIndex] };
        this._outputW = srcCanvas.width;
        this._outputH = srcCanvas.height;
        this._timeStart = performance.now();

        const opts = {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
        };
        const gl = glCanvas.getContext('webgl2', opts) || glCanvas.getContext('webgl', opts);

        if (!gl) {
            console.warn('WebGL unavailable — falling back to blit mode.');
            this._fallback = glCanvas.getContext('2d');
            if (!this._fallback) throw new Error('No 2D context available for fallback rendering.');
            this._fallback.imageSmoothingEnabled = true;
            return;
        }

        this._gl = gl;
        this._buildProgram();
        this._buildGeometry();
        this._buildTexture();
    }

    // ── Setup ───────────────────────────────────────────────────────────────

    _buildProgram() {
        const gl  = this._gl;
        const vs  = this._shader(gl.VERTEX_SHADER,   VS);
        const fs  = this._shader(gl.FRAGMENT_SHADER, FS);
        const pgm = gl.createProgram();
        gl.attachShader(pgm, vs); gl.attachShader(pgm, fs);
        gl.linkProgram(pgm);
        if (!gl.getProgramParameter(pgm, gl.LINK_STATUS))
            console.error('GL link error:', gl.getProgramInfoLog(pgm));
        gl.useProgram(pgm);
        this._pgm   = pgm;
        this._aPos  = gl.getAttribLocation (pgm, 'a_pos');
        this._uScene= gl.getUniformLocation(pgm, 'u_scene');
        this._uPx   = gl.getUniformLocation(pgm, 'u_px');
        this._uOutPx = gl.getUniformLocation(pgm, 'u_outPx');
        this._uTime = gl.getUniformLocation(pgm, 'u_time');
        this._uBloomStrength = gl.getUniformLocation(pgm, 'u_bloomStrength');
        this._uSharpness = gl.getUniformLocation(pgm, 'u_sharpness');
        this._uSaturation = gl.getUniformLocation(pgm, 'u_saturation');
        this._uVignette = gl.getUniformLocation(pgm, 'u_vignette');
        this._uScanline = gl.getUniformLocation(pgm, 'u_scanline');
        this._uFilmGrain = gl.getUniformLocation(pgm, 'u_filmGrain');
        this._uChromatic = gl.getUniformLocation(pgm, 'u_chromatic');
        this._uPixelMix = gl.getUniformLocation(pgm, 'u_pixelMix');
    }

    _shader(type, src) {
        const gl = this._gl;
        const s  = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            console.error('Shader compile error:', gl.getShaderInfoLog(s));
        return s;
    }

    _buildGeometry() {
        const gl  = this._gl;
        // Two triangles covering clip space (-1,-1) → (1,1)
        const verts = new Float32Array([
            -1,-1,   1,-1,   -1,1,
             1,-1,   1, 1,   -1,1,
        ]);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this._aPos);
        gl.vertexAttribPointer(this._aPos, 2, gl.FLOAT, false, 0, 0);
    }

    _buildTexture() {
        const gl   = this._gl;
        const tex  = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // NEAREST keeps edges crisp now that the scene is supersampled by Camera.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._tex = tex;
    }

    // ── Runtime ─────────────────────────────────────────────────────────────

    /** Called when the window is resized. w/h are physical pixels. */
    resize(w, h) {
        this._outputW = w;
        this._outputH = h;
        if (this._gl) {
            this._gl.canvas.width  = w;
            this._gl.canvas.height = h;
            this._gl.viewport(0, 0, w, h);
        } else if (this._fallback) {
            this._fallback.canvas.width  = w;
            this._fallback.canvas.height = h;
            this._fallback.imageSmoothingEnabled = false;
        }
    }

    /** Upload game canvas → GL texture → draw bloom quad. */
    render() {
        if (this._fallback) {
            // Fallback: plain blit (no bloom)
            this._fallback.clearRect(0, 0, this._fallback.canvas.width, this._fallback.canvas.height);
            this._fallback.drawImage(this._src, 0, 0,
                this._fallback.canvas.width, this._fallback.canvas.height);
            return;
        }

        const gl  = this._gl;
        const src = this._src;
        const p = this._profile;

        // Upload the current game canvas as a texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                      gl.UNSIGNED_BYTE, src);

        // Pass uniforms
        gl.uniform1i(this._uScene, 0);
        gl.uniform2f(this._uPx, 1.0 / src.width, 1.0 / src.height);
        gl.uniform2f(this._uOutPx, this._outputW, this._outputH);
        gl.uniform1f(this._uTime, (performance.now() - this._timeStart) * 0.001);
        gl.uniform1f(this._uBloomStrength, p.bloomStrength);
        gl.uniform1f(this._uSharpness, p.sharpness);
        gl.uniform1f(this._uSaturation, p.saturation);
        gl.uniform1f(this._uVignette, p.vignette);
        gl.uniform1f(this._uScanline, p.scanline);
        gl.uniform1f(this._uFilmGrain, p.filmGrain);
        gl.uniform1f(this._uChromatic, p.chromatic);
        gl.uniform1f(this._uPixelMix, p.pixelMix);

        // Draw fullscreen quad
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    getProfile() {
        return { key: this._profile.key, label: this._profile.label };
    }

    cycleProfile() {
        // Visual mode is locked to ULTRA for consistent clarity.
        this._profileIndex = VISUAL_PROFILES.findIndex(p => p.key === 'ultra');
        if (this._profileIndex < 0) this._profileIndex = 0;
        this._profile = { ...VISUAL_PROFILES[this._profileIndex] };
        return this.getProfile();
    }
}
