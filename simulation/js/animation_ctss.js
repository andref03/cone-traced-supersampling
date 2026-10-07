/**
 * animation_ctss.js
 * Stage 2: Cone-Traced Supersampling (CTSS) & the 32-Bit Visibility Bitmask
 */

import { MathSDF } from './math_sdf.js';

export class CTSSAnimation {
    constructor(canvas, bitmaskCanvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bitmaskCanvas = bitmaskCanvas;
        this.bitmaskCtx = bitmaskCanvas ? bitmaskCanvas.getContext('2d') : null;

        this.isPlaying = true;
        this.progress = 0.0; // 0.0 to 1.0 along the ray
        this.speed = 0.25;

        // Cone parameters matching render_defs.cginc
        this.params = {
            tanTheta: 0.065,         // cone expansion rate
            pixelMult: 1.0,          // multiplier for pixel diagonal
            occlusionSoft: 0.0,      // OCCLUSION_SOFT (0.0 - OCCLUSION_EPS)
            occlusionHard: 0.5,      // OCCLUSION_HARD (0.5 - OCCLUSION_EPS)
            occlusionStop: 0.99,     // OCCLUSION_STOP (1.0 - OCCLUSION_EPS)
            maxSamples: 8,
            coneRadStepMult: 0.5,
            showBitmaskDetails: true
        };

        this.rayOrigin = { x: 70, y: 220 };
        this.rayTarget = { x: 390, y: 195 };

        // Captured CTSS samples along the ray
        this.samples = [];
        this.currentOcclusion = 0;
        this.currentVisibilityMask = 0;
        this.accumulatedMask = 0;

        this.setupEvents();
    }

    setParam(key, val) {
        if (this.params[key] !== undefined) {
            this.params[key] = val;
        }
    }

    setupEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        let draggingOrigin = false;
        let draggingTarget = false;

        this.canvas.addEventListener('mousedown', (e) => {
            const p = getPos(e);
            if (Math.hypot(p.x - this.rayOrigin.x, p.y - this.rayOrigin.y) < 20) {
                draggingOrigin = true;
            } else if (Math.hypot(p.x - this.rayTarget.x, p.y - this.rayTarget.y) < 20) {
                draggingTarget = true;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!draggingOrigin && !draggingTarget) return;
            const p = getPos(e);
            if (draggingOrigin) {
                this.rayOrigin = { x: MathSDF.clamp(p.x, 20, 250), y: MathSDF.clamp(p.y, 40, 360) };
            } else if (draggingTarget) {
                this.rayTarget = { x: MathSDF.clamp(p.x, 280, 620), y: MathSDF.clamp(p.y, 40, 360) };
            }
        });

        window.addEventListener('mouseup', () => {
            draggingOrigin = false;
            draggingTarget = false;
        });
    }

    update(dt) {
        if (this.isPlaying) {
            this.progress += (dt / 1000) * this.speed;
            if (this.progress > 1.0) {
                this.progress = 0.0;
            }
        }
        this.simulateConeTrace();
    }

    simulateConeTrace() {
        this.samples = [];
        this.accumulatedMask = 0;

        const dir = MathSDF.normalize(MathSDF.sub(this.rayTarget, this.rayOrigin));
        const maxDist = 550;
        const currentDist = this.progress * maxDist;

        // March cone along ray up to currentDist
        let t = 10;
        let hasHitP = false;
        let hardHitP = false;
        let hasFullHit = false;

        while (t < currentDist && this.samples.length < this.params.maxSamples) {
            const p = MathSDF.add(this.rayOrigin, MathSDF.scale(dir, t));
            const h = MathSDF.sceneSDF(p, 'silhouette');
            const coneRad = t * this.params.tanTheta * this.params.pixelMult;
            const coneOcclusion = MathSDF.clamp((1.0 - h / coneRad) * 0.5, 0.0, 1.0);

            const hasHit = coneOcclusion > this.params.occlusionSoft;
            const hardHit = coneOcclusion > this.params.occlusionHard;
            const fullHit = coneOcclusion > this.params.occlusionStop;

            const hitEntry = hasHit && !hasHitP;
            const hitExit = !hasHit && hasHitP;

            hasHitP = hasHit;
            hardHitP = hardHit;

            if (hasHit) {
                const normal = MathSDF.calcNormal2D(p, 'silhouette');
                // Calculate 32-bit visibility mask
                const mask = MathSDF.getVisibilityMask(coneOcclusion, normal);

                if (hitEntry) {
                    this.samples.push({
                        t_in: t,
                        t_out: t,
                        pos: { ...p },
                        coneRad,
                        occlusion: coneOcclusion,
                        mask,
                        normal,
                        isHard: hardHit
                    });
                } else if (this.samples.length > 0) {
                    const latest = this.samples[this.samples.length - 1];
                    latest.t_out = t;
                    latest.occlusion = Math.max(latest.occlusion, coneOcclusion);
                    latest.coneRad = coneRad;
                    if (hardHit) latest.isHard = true;
                }
            }

            if (fullHit) {
                hasFullHit = true;
                break;
            }

            const step = Math.max(h, this.params.coneRadStepMult * coneRad, 2.0);
            t += step;
        }

        // Calculate mask correlations for all captured samples
        let runningAccumMask = 0;
        this.samples.forEach(sample => {
            const sampleMask = MathSDF.getVisibilityMask(sample.occlusion, sample.normal);
            const crtMask = (sampleMask & ~runningAccumMask) >>> 0;
            runningAccumMask = (runningAccumMask | crtMask) >>> 0;

            sample.visibleMask = crtMask;
            sample.weight = MathSDF.bitCountOnes(crtMask) / 32.0;
        });

        this.accumulatedMask = runningAccumMask;

        // Current tip occlusion
        const tipPos = MathSDF.add(this.rayOrigin, MathSDF.scale(dir, currentDist));
        const tipH = MathSDF.sceneSDF(tipPos, 'silhouette');
        const tipRad = currentDist * this.params.tanTheta * this.params.pixelMult;
        this.currentOcclusion = MathSDF.clamp((1.0 - tipH / tipRad) * 0.5, 0.0, 1.0);
        this.currentVisibilityMask = MathSDF.getVisibilityMask(this.currentOcclusion, MathSDF.calcNormal2D(tipPos, 'silhouette'));
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Grid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

        // 2. Draw scene geometry
        this.drawSceneGeometry(ctx);

        // 3. Draw expanding Cone Frustum
        const dir = MathSDF.normalize(MathSDF.sub(this.rayTarget, this.rayOrigin));
        const perp = { x: -dir.y, y: dir.x };
        const maxDist = 550;
        const currentDist = this.progress * maxDist;

        const pTip = MathSDF.add(this.rayOrigin, MathSDF.scale(dir, currentDist));
        const radTip = currentDist * this.params.tanTheta * this.params.pixelMult;

        const leftTip = MathSDF.add(pTip, MathSDF.scale(perp, radTip));
        const rightTip = MathSDF.sub(pTip, MathSDF.scale(perp, radTip));

        // Cone gradient fill
        const coneGrad = ctx.createLinearGradient(this.rayOrigin.x, this.rayOrigin.y, pTip.x, pTip.y);
        coneGrad.addColorStop(0, 'rgba(14, 165, 233, 0.05)');
        coneGrad.addColorStop(1, 'rgba(14, 165, 233, 0.25)');

        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(this.rayOrigin.x, this.rayOrigin.y);
        ctx.lineTo(leftTip.x, leftTip.y);
        ctx.lineTo(rightTip.x, rightTip.y);
        ctx.closePath();
        ctx.fill();

        // Cone boundaries
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(this.rayOrigin.x, this.rayOrigin.y); ctx.lineTo(leftTip.x, leftTip.y);
        ctx.moveTo(this.rayOrigin.x, this.rayOrigin.y); ctx.lineTo(rightTip.x, rightTip.y);
        ctx.stroke();

        // Tip arc / sphere cap
        ctx.beginPath();
        ctx.arc(pTip.x, pTip.y, radTip, 0, Math.PI * 2);
        ctx.strokeStyle = this.currentOcclusion > 0.5 ? '#f43f5e' : (this.currentOcclusion > 0.01 ? '#fbbf24' : '#38bdf8');
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = this.currentOcclusion > 0.5 ? 'rgba(244, 63, 94, 0.25)' : 'rgba(56, 189, 248, 0.15)';
        ctx.fill();

        // Central Ray axis
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.rayOrigin.x, this.rayOrigin.y);
        ctx.lineTo(pTip.x, pTip.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 4. Draw captured sample points & intervals
        this.samples.forEach((sample, i) => {
            const isHard = sample.isHard;
            ctx.beginPath();
            ctx.arc(sample.pos.x, sample.pos.y, sample.coneRad, 0, Math.PI * 2);
            ctx.strokeStyle = isHard ? '#f43f5e' : '#fbbf24';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Label
            ctx.fillStyle = isHard ? '#f43f5e' : '#fbbf24';
            ctx.font = '10px monospace';
            const hitType = isHard ? 'HARD HIT' : 'SOFT HIT (Silhouette)';
            ctx.fillText(`Sample ${i + 1}: ${hitType}`, sample.pos.x + 8, sample.pos.y - 12);
            ctx.fillText(`Coverage: ${(sample.weight * 100).toFixed(1)}%`, sample.pos.x + 8, sample.pos.y);
        });

        // 5. Handles
        ctx.beginPath(); ctx.arc(this.rayOrigin.x, this.rayOrigin.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText('Cone Apex (ro)', this.rayOrigin.x - 30, this.rayOrigin.y - 12);

        // 6. Render the 32-bit Bitmask on companion canvas if present
        if (this.bitmaskCtx) {
            this.renderBitmaskWidget();
        }
    }

    drawSceneGeometry(ctx) {
        // Silhouette test scene: circle smoothly blended with box
        const c1 = { x: 380, y: 200, r: 75 };
        const b1 = { x: 500, y: 280, w: 60, h: 60 };

        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2.5;

        // Draw circle
        ctx.beginPath();
        ctx.arc(c1.x, c1.y, c1.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw box
        ctx.beginPath();
        ctx.roundRect(b1.x - b1.w, b1.y - b1.h, b1.w * 2, b1.h * 2, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('Smooth SDF Silhouette', c1.x - 60, c1.y - 85);
    }

    /**
     * Renders the 32-Bit Subpixel Bitmask Widget (6x6 grid with 4 corners omitted)
     */
    renderBitmaskWidget() {
        const bctx = this.bitmaskCtx;
        const bw = this.bitmaskCanvas.width;
        const bh = this.bitmaskCanvas.height;

        bctx.clearRect(0, 0, bw, bh);

        bctx.fillStyle = '#0f172a';
        bctx.fillRect(0, 0, bw, bh);

        bctx.fillStyle = '#f8fafc';
        bctx.font = 'bold 11px sans-serif';
        bctx.fillText('32-Bit Subpixel Visibility Mask (6×6)', 10, 18);

        // Bit pattern coordinates according to render.cginc:
        // Row 0: 4 bits (cols 1..4)
        // Row 1: 6 bits (cols 0..5)
        // Row 2: 6 bits (cols 0..5)
        // Row 3: 6 bits (cols 0..5)
        // Row 4: 6 bits (cols 0..5)
        // Row 5: 4 bits (cols 1..4)
        // Total = 4 + 6 + 6 + 6 + 6 + 4 = 32 bits
        const bitGrid = [
            [null, 31, 30, 29, 28, null],
            [27, 26, 25, 24, 23, 22],
            [21, 20, 19, 18, 17, 16],
            [15, 14, 13, 12, 11, 10],
            [9, 8, 7, 6, 5, 4],
            [null, 3, 2, 1, 0, null]
        ];

        const cellSize = 18;
        const startX = 22;
        const startY = 32;

        const activeMask = this.accumulatedMask || this.currentVisibilityMask;

        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 6; c++) {
                const bitIndex = bitGrid[r][c];
                const px = startX + c * (cellSize + 3);
                const py = startY + r * (cellSize + 3);

                if (bitIndex === null) {
                    // Omitted corner
                    bctx.fillStyle = 'rgba(51, 65, 85, 0.2)';
                    bctx.fillRect(px, py, cellSize, cellSize);
                } else {
                    const isSet = (activeMask & (1 << bitIndex)) !== 0;
                    bctx.fillStyle = isSet ? '#38bdf8' : '#1e293b';
                    bctx.strokeStyle = isSet ? '#0284c7' : '#475569';
                    bctx.lineWidth = 1;

                    bctx.beginPath();
                    bctx.roundRect(px, py, cellSize, cellSize, 3);
                    bctx.fill();
                    bctx.stroke();

                    // Tiny bit indicator
                    bctx.fillStyle = isSet ? '#ffffff' : '#64748b';
                    bctx.font = '8px monospace';
                    bctx.fillText(isSet ? '1' : '0', px + 5, py + 12);
                }
            }
        }

        // Stats summary
        const ones = MathSDF.bitCountOnes(activeMask);
        const ratio = (ones / 32.0 * 100).toFixed(1);

        bctx.fillStyle = '#38bdf8';
        bctx.font = 'bold 11px monospace';
        bctx.fillText(`Active Bits: ${ones} / 32`, 10, bh - 24);
        bctx.fillStyle = '#cbd5e1';
        bctx.font = '10px monospace';
        bctx.fillText(`Coverage: ${ratio}% of pixel area`, 10, bh - 10);
    }
}
