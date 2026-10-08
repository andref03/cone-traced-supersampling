/**
 * animation_sphere.js
 * Stage 1: Classical Sphere Tracing (Hart 1996) and the Root Cause of Aliasing
 */

import { MathSDF } from './math_sdf.js';

export class SphereTracingAnimation {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.stepIndex = 0;
        this.maxSteps = 16;
        this.isPlaying = true;
        this.lastFrameTime = 0;
        this.stepTimer = 0;
        this.stepInterval = 800; // ms per step in auto-play

        // Virtual camera & ray setup
        this.rayOrigin = { x: 80, y: 220 };
        this.rayTarget = { x: 380, y: 195 };
        this.isDraggingOrigin = false;
        this.isDraggingTarget = false;

        // Settings / Parameters
        this.params = {
            stepSizeMult: 1.0,
            showSDFField: true,
            showPixelSensor: true,
            enableSSAA: false, // 4x SSAA comparison toggle
            numSSAARays: 4
        };

        this.steps = [];
        this.ssaaRays = [];
        this.calculateSteps();
        this.setupEvents();
    }

    setParam(key, val) {
        if (this.params[key] !== undefined) {
            this.params[key] = val;
            this.calculateSteps();
        }
    }

    calculateSteps() {
        this.steps = [];
        const dir = MathSDF.normalize(MathSDF.sub(this.rayTarget, this.rayOrigin));
        let p = { ...this.rayOrigin };
        let totalDist = 0;
        const maxDist = 650;
        const eps = 1.0;

        for (let i = 0; i < this.maxSteps; i++) {
            const dist = MathSDF.sceneSDF(p, 'default') * this.params.stepSizeMult;
            this.steps.push({
                index: i,
                pos: { ...p },
                radius: Math.max(0, dist),
                hit: dist < eps,
                totalDist
            });

            if (dist < eps || totalDist > maxDist) break;

            const step = Math.max(dist, 1.0);
            p = MathSDF.add(p, MathSDF.scale(dir, step));
            totalDist += step;
        }

        // Also calculate 4x SSAA rays if enabled
        if (this.params.enableSSAA) {
            this.ssaaRays = [];
            const perp = { x: -dir.y, y: dir.x };
            const offsets = [-12, -4, 4, 12]; // subpixel offsets

            offsets.forEach((offset, idx) => {
                const subOrigin = MathSDF.add(this.rayOrigin, MathSDF.scale(perp, offset));
                const subTarget = MathSDF.add(this.rayTarget, MathSDF.scale(perp, offset));
                const subDir = MathSDF.normalize(MathSDF.sub(subTarget, subOrigin));

                let subP = { ...subOrigin };
                let subDistTotal = 0;
                let subHit = false;

                for (let s = 0; s < this.maxSteps; s++) {
                    const d = MathSDF.sceneSDF(subP, 'default');
                    if (d < eps) { subHit = true; break; }
                    if (subDistTotal > maxDist) break;
                    subP = MathSDF.add(subP, MathSDF.scale(subDir, Math.max(d, 1.0)));
                    subDistTotal += d;
                }

                this.ssaaRays.push({
                    origin: subOrigin,
                    end: subP,
                    hit: subHit,
                    color: subHit ? '#f43f5e' : '#38bdf8'
                });
            });
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

        this.canvas.addEventListener('mousedown', (e) => {
            const p = getPos(e);
            if (Math.hypot(p.x - this.rayOrigin.x, p.y - this.rayOrigin.y) < 20) {
                this.isDraggingOrigin = true;
            } else if (Math.hypot(p.x - this.rayTarget.x, p.y - this.rayTarget.y) < 20) {
                this.isDraggingTarget = true;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDraggingOrigin && !this.isDraggingTarget) return;
            const p = getPos(e);
            if (this.isDraggingOrigin) {
                this.rayOrigin = { x: MathSDF.clamp(p.x, 20, 250), y: MathSDF.clamp(p.y, 40, 360) };
            } else if (this.isDraggingTarget) {
                this.rayTarget = { x: MathSDF.clamp(p.x, 280, 620), y: MathSDF.clamp(p.y, 40, 360) };
            }
            this.calculateSteps();
        });

        window.addEventListener('mouseup', () => {
            this.isDraggingOrigin = false;
            this.isDraggingTarget = false;
        });
    }

    stepForward() {
        if (this.stepIndex < this.steps.length) {
            this.stepIndex++;
        } else {
            this.stepIndex = 0;
        }
    }

    stepBackward() {
        this.stepIndex = Math.max(0, this.stepIndex - 1);
    }

    togglePlay(play) {
        this.isPlaying = play !== undefined ? play : !this.isPlaying;
    }

    update(dt) {
        if (this.isPlaying) {
            this.stepTimer += dt;
            if (this.stepTimer >= this.stepInterval) {
                this.stepTimer = 0;
                this.stepForward();
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw subtle background coordinate grid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // 2. Draw scene geometry (SDF zero isoline & interior fill)
        this.drawSDFGeometry(ctx, w, h);

        // 3. Draw SSAA rays if enabled
        if (this.params.enableSSAA && this.ssaaRays.length > 0) {
            this.ssaaRays.forEach(ray => {
                ctx.strokeStyle = ray.color;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(ray.origin.x, ray.origin.y);
                ctx.lineTo(ray.end.x, ray.end.y);
                ctx.stroke();
                ctx.setLineDash([]);
            });
        }

        // 4. Draw primary ray steps & distance bounding circles
        const visibleStepCount = Math.min(this.stepIndex, this.steps.length);
        const dir = MathSDF.normalize(MathSDF.sub(this.rayTarget, this.rayOrigin));

        // Draw main ray path
        if (this.steps.length > 0) {
            const currentStep = this.steps[Math.max(0, visibleStepCount - 1)] || this.steps[0];
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(this.rayOrigin.x, this.rayOrigin.y);
            ctx.lineTo(currentStep.pos.x, currentStep.pos.y);
            ctx.stroke();

            // Draw future dashed path
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(currentStep.pos.x, currentStep.pos.y);
            ctx.lineTo(this.rayOrigin.x + dir.x * 600, this.rayOrigin.y + dir.y * 600);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw bounding spheres (Hart's maximum safe stepping radius)
        for (let i = 0; i < visibleStepCount; i++) {
            const step = this.steps[i];
            const isLatest = (i === visibleStepCount - 1);

            // Distance sphere
            ctx.beginPath();
            ctx.arc(step.pos.x, step.pos.y, step.radius, 0, Math.PI * 2);
            ctx.strokeStyle = isLatest ? '#fbbf24' : 'rgba(251, 191, 36, 0.35)';
            ctx.lineWidth = isLatest ? 2 : 1;
            ctx.stroke();

            ctx.fillStyle = isLatest ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.03)';
            ctx.fill();

            // Step center point
            ctx.beginPath();
            ctx.arc(step.pos.x, step.pos.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = isLatest ? '#f59e0b' : '#94a3b8';
            ctx.fill();

            // Step label
            ctx.fillStyle = isLatest ? '#fbbf24' : '#64748b';
            ctx.font = '11px monospace';
            ctx.fillText(`p${i} (d=${step.radius.toFixed(1)})`, step.pos.x + 8, step.pos.y - 8);
        }

        // 5. Draw Interactive handles
        // Origin Handle
        ctx.beginPath();
        ctx.arc(this.rayOrigin.x, this.rayOrigin.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('Ray Origin (ro)', this.rayOrigin.x - 30, this.rayOrigin.y - 14);

        // Target Handle
        ctx.beginPath();
        ctx.arc(this.rayTarget.x, this.rayTarget.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px sans-serif';
        ctx.fillText('Direction Target', this.rayTarget.x + 10, this.rayTarget.y + 4);

        // 6. Draw Virtual Pixel Grid / Sensor Inset (The Aliasing Explanation)
        if (this.params.showPixelSensor) {
            this.drawPixelSensorInset(ctx, w, h);
        }
    }

    drawSDFGeometry(ctx, w, h) {
        // Sample a coarse grid to draw the zero isoline of the scene
        const c1 = { x: 300, y: 190, r: 65 };
        const b1 = { x: 450, y: 230, w: 55, h: 55 };

        // Circle geometry
        ctx.beginPath();
        ctx.arc(c1.x, c1.y, c1.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Box geometry
        ctx.beginPath();
        ctx.roundRect(b1.x - b1.w, b1.y - b1.h, b1.w * 2, b1.h * 2, 8);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('SDF Sphere (Solid)', c1.x - 45, c1.y);
        ctx.fillText('SDF Box (Solid)', b1.x - 35, b1.y);
    }

    drawPixelSensorInset(ctx, w, h) {
        // Draw miniature sensor showing the 1-bit aliasing dilemma
        const insetX = w - 190;
        const insetY = 20;
        const insetW = 170;
        const insetH = 150;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(insetX, insetY, insetW, insetH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('Pixel Grid (Screen View)', insetX + 12, insetY + 20);

        // 3x3 pixel grid representation
        const lastStep = this.steps[this.steps.length - 1];
        const isHit = lastStep && lastStep.hit;

        const cellSize = 36;
        const startX = insetX + 25;
        const startY = insetY + 32;

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const px = startX + col * cellSize;
                const py = startY + row * cellSize;
                const isCenterPixel = (row === 1 && col === 1);

                ctx.strokeStyle = isCenterPixel ? '#38bdf8' : '#334155';
                ctx.lineWidth = isCenterPixel ? 2 : 1;

                if (isCenterPixel) {
                    ctx.fillStyle = isHit ? '#f43f5e' : '#0f172a';
                } else {
                    ctx.fillStyle = (row === 1 && col === 2) ? '#f43f5e' : '#0f172a';
                }
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeRect(px, py, cellSize, cellSize);
            }
        }

        ctx.fillStyle = isHit ? '#f43f5e' : '#38bdf8';
        ctx.font = '10px monospace';
        const statusText = isHit ? 'CENTER PIXEL: HIT' : 'CENTER PIXEL: MISS';
        ctx.fillText(statusText, insetX + 18, insetY + 135);
    }
}
