import { CANVAS_W, CANVAS_H } from '../constants.js';
import { PostProcessor } from './PostProcessor.js';

const INTERNAL_RENDER_SCALE = 4;

/**
 * Owns the render pipeline:
 * 1) Draw game scene into a fixed-size offscreen 2D canvas (logical pixels)
 * 2) Present to the visible canvas through a WebGL post-process pass
 * 3) Resize output at devicePixelRatio for crisp Retina scaling
 */
export class Camera {
    constructor(canvas) {
        this.canvas = canvas;

        // Supersampled scene canvas; game still draws using logical coordinates.
        this.sceneCanvas = document.createElement('canvas');
        this.sceneCanvas.width  = CANVAS_W * INTERNAL_RENDER_SCALE;
        this.sceneCanvas.height = CANVAS_H * INTERNAL_RENDER_SCALE;
        this.sceneCtx = this.sceneCanvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
        });
        if (!this.sceneCtx) throw new Error('2D canvas context unavailable.');
        this.sceneCtx.imageSmoothingEnabled = false;
        this.sceneCtx.setTransform(INTERNAL_RENDER_SCALE, 0, 0, INTERNAL_RENDER_SCALE, 0, 0);

        // Presentation layer (WebGL effects + scaling).
        this.post = new PostProcessor(this.canvas, this.sceneCanvas);

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _controlsHeight() {
        const controls = document.getElementById('controls');
        if (!controls) return 60;
        return Math.ceil(controls.getBoundingClientRect().height);
    }

    _resize() {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const availCssW = Math.max(1, window.innerWidth);
        const availCssH = Math.max(1, window.innerHeight - this._controlsHeight());
        const availPhysW = Math.max(1, Math.floor(availCssW * dpr));
        const availPhysH = Math.max(1, Math.floor(availCssH * dpr));

        // Fill as much of the viewport as possible while preserving aspect ratio.
        const fitScale = Math.max(0.1, Math.min(availPhysW / CANVAS_W, availPhysH / CANVAS_H));
        const outW = Math.max(1, Math.floor(CANVAS_W * fitScale));
        const outH = Math.max(1, Math.floor(CANVAS_H * fitScale));

        this.canvas.style.width  = `${outW / dpr}px`;
        this.canvas.style.height = `${outH / dpr}px`;
        this.post.resize(outW, outH);
    }

    getCtx() {
        return this.sceneCtx;
    }

    present() {
        this.post.render();
    }

    cycleVisualProfile() {
        if (!this.post.cycleProfile) return { key: 'fallback', label: 'FALLBACK' };
        return this.post.cycleProfile();
    }

    getVisualProfile() {
        if (!this.post.getProfile) return { key: 'fallback', label: 'FALLBACK' };
        return this.post.getProfile();
    }
}
