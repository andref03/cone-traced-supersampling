(() => {

// --- FILE: simulation/js/math_sdf.js ---
/**
 * math_sdf.js
 * Mathematical primitives and Signed Distance Field (SDF) functions
 * ported and adapted from Assets/shaders/utils/{math.cginc, sdf.cginc, render_defs.cginc}
 */

const MathSDF = {
    // 2D Vector operations
    dot2(v) { return v.x * v.x + v.y * v.y; },
    length(v) { return Math.hypot(v.x, v.y); },
    normalize(v) {
        const len = Math.hypot(v.x, v.y);
        return len > 1e-6 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
    },
    sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
    scale(v, s) { return { x: v.x * s, y: v.y * s }; },
    dot(a, b) { return a.x * b.x + a.y * b.y; },
    cross2d(a, b) { return a.x * b.y - a.y * b.x; },

    // Clamp and interpolation
    clamp(x, minVal, maxVal) { return Math.max(minVal, Math.min(maxVal, x)); },
    saturate(x) { return Math.max(0, Math.min(1, x)); },
    lerp(a, b, t) { return a + t * (b - a); },
    invLerp(from, to, value) { return (value - from) / (to - from); },
    remap(origFrom, origTo, targetFrom, targetTo, value) {
        const rel = this.clamp(this.invLerp(origFrom, origTo, value), 0, 1);
        return this.lerp(targetFrom, targetTo, rel);
    },

    // Polynomial smooth min (from math.cginc)
    opSmoothMin2(a, b, k = 15) {
        const h = Math.max(k - Math.abs(a - b), 0.0) / k;
        return Math.min(a, b) - h * h * k * 0.25;
    },

    // 2D SDF Primitives
    sdCircle(p, center, r) {
        const d = this.sub(p, center);
        return this.length(d) - r;
    },

    sdBox(p, center, size, radius = 0) {
        const q = {
            x: Math.abs(p.x - center.x) - size.x + radius,
            y: Math.abs(p.y - center.y) - size.y + radius
        };
        const outside = this.length({ x: Math.max(q.x, 0), y: Math.max(q.y, 0) });
        const inside = Math.min(Math.max(q.x, q.y), 0);
        return outside + inside - radius;
    },

    sdSegment(p, a, b) {
        const pa = this.sub(p, a);
        const ba = this.sub(b, a);
        const h = this.clamp(this.dot(pa, ba) / this.dot(ba, ba), 0, 1);
        return this.length(this.sub(pa, this.scale(ba, h)));
    },

    // 2D Crease / Sharp Corner SDF (combines two intersecting half-planes)
    // Used specifically for demonstrating Subpixel Edge Reconstruction (SER)
    sdCrease(p, apex, angleRad = Math.PI / 4, length = 120) {
        // Rotated local coordinates
        const rel = this.sub(p, apex);
        // Plane 1 normal and Plane 2 normal
        const n1 = { x: Math.cos(angleRad), y: -Math.sin(angleRad) };
        const n2 = { x: -Math.cos(angleRad), y: -Math.sin(angleRad) };
        const d1 = this.dot(rel, n1);
        const d2 = this.dot(rel, n2);
        // Intersection of half-spaces (convex crease)
        const dCrease = Math.max(d1, d2);
        // Cap the bottom
        const dBottom = rel.y - length;
        return Math.max(dCrease, dBottom);
    },

    // Composite scene evaluation for 2D visualizations
    sceneSDF(p, sceneType = 'default', customParams = {}) {
        if (sceneType === 'crease') {
            const apex = customParams.apex || { x: 340, y: 220 };
            const angle = customParams.angle || Math.PI / 3.5;
            return this.sdCrease(p, apex, angle, 160);
        }

        if (sceneType === 'silhouette') {
            const circleCenter = customParams.circleCenter || { x: 380, y: 200 };
            const circleRadius = customParams.circleRadius || 75;
            const boxCenter = customParams.boxCenter || { x: 500, y: 280 };
            const boxSize = customParams.boxSize || { x: 60, y: 60 };

            const dCircle = this.sdCircle(p, circleCenter, circleRadius);
            const dBox = this.sdBox(p, boxCenter, boxSize, 10);
            return this.opSmoothMin2(dCircle, dBox, 20);
        }

        // Default scene with multiple primitives
        const c1 = this.sdCircle(p, { x: 300, y: 190 }, 65);
        const b1 = this.sdBox(p, { x: 450, y: 230 }, { x: 55, y: 55 }, 8);
        return Math.min(c1, b1);
    },

    // Calculate normal via central differences
    calcNormal2D(p, sceneType = 'default', h = 1.0, customParams = {}) {
        const dx = this.sceneSDF({ x: p.x + h, y: p.y }, sceneType, customParams) -
                   this.sceneSDF({ x: p.x - h, y: p.y }, sceneType, customParams);
        const dy = this.sceneSDF({ x: p.x, y: p.y + h }, sceneType, customParams) -
                   this.sceneSDF({ x: p.x, y: p.y - h }, sceneType, customParams);
        return this.normalize({ x: dx, y: dy });
    },

    // Multi-scale normal & discrete Laplacian curvature (from sdf.cginc calcNormalH4)
    calcNormalAndCurvature2D(p, sceneType = 'default', hMicro = 0.5, hMacro = 20.0, customParams = {}) {
        // Micro-scale normal (nPrimary)
        const nPrimary = this.calcNormal2D(p, sceneType, hMicro, customParams);

        // Macro-scale normal (nLarge)
        const nLarge = this.calcNormal2D(p, sceneType, hMacro, customParams);

        // Discrete 2D Laplacian curvature: Δf(p) = (f(x+h) + f(x-h) + f(y+h) + f(y-h) - 4*f(p))
        const h0 = this.sceneSDF(p, sceneType, customParams);
        const h1 = this.sceneSDF({ x: p.x + hMacro, y: p.y }, sceneType, customParams);
        const h2 = this.sceneSDF({ x: p.x - hMacro, y: p.y }, sceneType, customParams);
        const h3 = this.sceneSDF({ x: p.x, y: p.y + hMacro }, sceneType, customParams);
        const h4 = this.sceneSDF({ x: p.x, y: p.y - hMacro }, sceneType, customParams);
        const curvature = (h1 + h2 + h3 + h4 - 4.0 * h0) / (hMacro * hMacro);

        // Cosine similarity
        const cosSim = this.dot(nPrimary, nLarge);

        return { nPrimary, nLarge, curvature, cosSim };
    },

    /**
     * Discrete 32-bit Visibility Mask Generator (from render.cginc lines 148-201)
     * Maps circular cone cross-section into 6 horizontal rows with 4, 6, 6, 6, 6, 4 bits (32 bits total).
     */
    getVisibilityMask(coneOcclusion, normal2d) {
        // Ensure non-zero components
        const nx = Math.abs(normal2d.x) < 0.001 ? 0.001 * (normal2d.x < 0 ? -1 : 1) : normal2d.x;
        const ny = Math.abs(normal2d.y) < 0.001 ? 0.001 * (normal2d.y < 0 ? -1 : 1) : normal2d.y;

        const len = Math.hypot(nx, ny);
        const n = { x: nx / len, y: ny / len };

        // h = distance to boundary in normalized cone coordinates [-1, 1]
        let h = -(1.0 - 2.0 * coneOcclusion);

        // y = a*x + b line equation
        const a = -n.x / n.y;
        const b = h * (n.y * n.y + n.x * n.x) / n.y;
        const t = 0.5 / a;

        // 6 horizontal sampling lines in [-1, 1]
        const yLevels = [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0];
        const vis = yLevels.map(y => this.saturate((y - b) * t + 0.5));

        const vis_r = (n.x > 0) ? -1.0 : 0.0;
        const shifts = vis.map(v => Math.floor(6.0 * (v + vis_r)));

        let mask_int = 0;
        const mask4 = 0x1E; // 0b00011110
        const mask6 = 0x3F; // 0b00111111

        const shiftVal = (x, nShift) => (nShift >= 0 ? (x << nShift) : (x >> -nShift)) & 0xFFFFFFFF;

        mask_int |= (shiftVal(mask6, shifts[0]) & mask4) << 27;
        mask_int |= (shiftVal(mask6, shifts[1]) & mask6) << 22;
        mask_int |= (shiftVal(mask6, shifts[2]) & mask6) << 16;
        mask_int |= (shiftVal(mask6, shifts[3]) & mask6) << 10;
        mask_int |= (shiftVal(mask6, shifts[4]) & mask6) << 4;
        mask_int |= (shiftVal(mask6, shifts[5]) & mask4) >>> 1;

        return mask_int >>> 0; // Return unsigned 32-bit integer
    },

    // Count 1-bits in a 32-bit integer (popcount)
    bitCountOnes(num) {
        let n = num >>> 0;
        n = n - ((n >>> 1) & 0x55555555);
        n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
        return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
    },

    /**
     * K-Bitmasks Non-Binary Visibility Accumulator (from TVCG 2023 Sec. VI)
     */
    accumulateKBitmasks(kMasks, geomMask, alpha, K = 4) {
        const L = alpha >= 0.99 ? K : Math.max(1, Math.round(alpha * K));
        let addedBits = 0;
        for (let l = 0; l < L; l++) {
            for (let k = 0; k < K; k++) {
                const available = (geomMask & ~kMasks[k]) >>> 0;
                if (available !== 0) {
                    kMasks[k] = (kMasks[k] | available) >>> 0;
                    addedBits += this.bitCountOnes(available);
                    break;
                }
            }
        }
        return addedBits / (K * 32);
    }
};


// --- FILE: simulation/js/animation_sphere.js ---
/**
 * animation_sphere.js
 * Stage 1: Classical Sphere Tracing (Hart 1996) and the Root Cause of Aliasing
 */



class SphereTracingAnimation {
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


// --- FILE: simulation/js/animation_ctss.js ---
/**
 * animation_ctss.js
 * Stage 2: Cone-Traced Supersampling (CTSS) & the 32-Bit Visibility Bitmask
 */



class CTSSAnimation {
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


// --- FILE: simulation/js/animation_ser.js ---
/**
 * animation_ser.js
 * Stage 3: Subpixel Edge Reconstruction (SER) & Analytical Two-Plane Intersection
 */



class SERAnimation {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isPlaying = true;
        this.animTime = 0;

        // SER Parameters matching render_defs.cginc
        this.params = {
            coneMultCos: 2.0,            // _SUBPIXEL_EDGE_RESOLVE_CONE_MULT_COS (Macro normal scale)
            cosSimMax: 0.999,            // _SUBPIXEL_EDGE_RESOLVE_COSSIM_THRESHOLD_MAX
            curvatureThreshold: 0.0001,  // _SUBPIXEL_EDGE_RESOLVE_CURVATURE_THRESHOLD
            coneMult: 1.0,               // _SUBPIXEL_EDGE_RESOLVE_CONE_MULT (Search distance)
            creaseAngleDeg: 55,          // Interactive angle of the sharp corner
            coneRadius: 38,              // Subpixel cone footprint radius in pixels
            showNormals: true,
            showTwoPlanes: true,
            showMathOverlay: true
        };

        // Center apex of the crease
        this.apex = { x: 320, y: 170 };
        // Primary sample point on the left facet
        this.samplePos = { x: 305, y: 190 };
        this.isDraggingSample = false;

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

        this.canvas.addEventListener('mousedown', (e) => {
            const p = getPos(e);
            if (Math.hypot(p.x - this.samplePos.x, p.y - this.samplePos.y) < 18) {
                this.isDraggingSample = true;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDraggingSample) return;
            const p = getPos(e);
            // Constrain sample near apex
            this.samplePos = {
                x: MathSDF.clamp(p.x, this.apex.x - 70, this.apex.x + 70),
                y: MathSDF.clamp(p.y, this.apex.y + 5, this.apex.y + 60)
            };
        });

        window.addEventListener('mouseup', () => {
            this.isDraggingSample = false;
        });
    }

    update(dt) {
        if (this.isPlaying) {
            this.animTime += dt * 0.001;
        }
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

        const angleRad = (this.params.creaseAngleDeg * Math.PI) / 180;
        const customParams = { apex: this.apex, angle: angleRad };

        // 2. Draw the Sharp Crease Geometry (SDF isoline)
        this.drawCreaseGeometry(ctx, angleRad);

        // 3. Draw Subpixel Cone Footprint around sample
        const rCone = this.params.coneRadius;
        ctx.beginPath();
        ctx.arc(this.samplePos.x, this.samplePos.y, rCone, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.font = '11px monospace';
        ctx.fillText(`Subpixel Cone Footprint (r=${rCone}px)`, this.samplePos.x - rCone - 10, this.samplePos.y - rCone - 8);

        // 4. Calculate Dual-Scale Normals & Curvature (from sdf.cginc calcNormalH4)
        const hMicro = 1.0;
        const hMacro = this.params.coneMultCos * rCone;
        const { nPrimary, nLarge, curvature, cosSim } = MathSDF.calcNormalAndCurvature2D(
            this.samplePos, 'crease', hMicro, hMacro, customParams
        );

        // Crease trigger criterion (from render.cginc line 432)
        const hasSecondaryEdge = (cosSim < this.params.cosSimMax) &&
                                 (Math.abs(curvature) > this.params.curvatureThreshold);

        // 5. Draw Dual-Scale Normals
        if (this.params.showNormals) {
            // Micro normal (Primary edge normal)
            this.drawVector(ctx, this.samplePos, nPrimary, 45, '#10b981', 'nPrimary (Micro, h=ε)');

            // Macro normal (Averaged over cone radius)
            this.drawVector(ctx, this.samplePos, nLarge, 55, '#f59e0b', 'nLarge (Macro, h=2·Rc)');
        }

        // 6. Draw Search Direction and Secondary Resolved Edge
        let visibilityPrimary = 1.0;
        let xi = 0;

        if (hasSecondaryEdge) {
            // Search direction: sign(curvature) * normalize(nLarge - nPrimary)
            const diff = MathSDF.sub(nLarge, nPrimary);
            const normDiff = MathSDF.normalize(diff);
            const signCurv = Math.sign(curvature) || 1.0;
            const searchDir = MathSDF.scale(normDiff, signCurv);

            // Secondary sample position: samplePos + searchDir * coneMult * rCone
            const searchDist = this.params.coneMult * rCone;
            const resolvedPos = MathSDF.add(this.samplePos, MathSDF.scale(searchDir, searchDist));
            const nSecondary = MathSDF.calcNormal2D(resolvedPos, 'crease', hMicro, customParams);

            // Draw Search Vector
            this.drawVector(ctx, this.samplePos, searchDir, searchDist, '#ec4899', 'searchDir');

            // Draw Secondary Sample Point & Normal
            ctx.beginPath();
            ctx.arc(resolvedPos.x, resolvedPos.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ec4899';
            ctx.fill();
            this.drawVector(ctx, resolvedPos, nSecondary, 45, '#a855f7', 'nSecondary');

            // 7. Analytical Two-Plane Line Intersection Solve (from render.cginc lines 214-253)
            // Local 2D coordinates: x along searchDir, y along normal to searchDir
            const h1 = MathSDF.sceneSDF(this.samplePos, 'crease', customParams);
            const h2 = MathSDF.sceneSDF(resolvedPos, 'crease', customParams);

            // Line equations: a*x + b
            // In local search space:
            const n1sd = MathSDF.dot(searchDir, nPrimary);
            const n2sd = MathSDF.dot(searchDir, nSecondary);
            const n1p = { x: n1sd, y: Math.sqrt(Math.max(0, 1 - n1sd * n1sd)) };
            const n2p = { x: n2sd, y: Math.sqrt(Math.max(0, 1 - n2sd * n2sd)) };

            const a1 = -n1p.x / (n1p.y || 1e-4);
            const a2 = -n2p.x / (n2p.y || 1e-4);
            const p1 = MathSDF.scale(n1p, -h1);
            const p2 = MathSDF.sub({ x: searchDist, y: 0 }, MathSDF.scale(n2p, h2));

            const b1 = p1.y - a1 * p1.x;
            const b2 = p2.y - a2 * p2.x;

            if (Math.abs(a2 - a1) > 1e-5) {
                xi = (b1 - b2) / (a2 - a1);
                visibilityPrimary = MathSDF.clamp((xi / rCone + 1.0) * 0.5, 0.0, 1.0);
            }

            // Draw intersecting tangent planes inside cone
            if (this.params.showTwoPlanes) {
                this.drawTangentPlane(ctx, this.samplePos, nPrimary, rCone * 1.2, '#10b981');
                this.drawTangentPlane(ctx, resolvedPos, nSecondary, rCone * 1.2, '#a855f7');

                // Draw intersection mark
                const intPoint = MathSDF.add(this.samplePos, MathSDF.scale(searchDir, xi));
                ctx.beginPath();
                ctx.arc(intPoint.x, intPoint.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#fbbf24';
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold 11px monospace';
                ctx.fillText(`Edge Intersection xi = ${xi.toFixed(1)}px`, intPoint.x + 8, intPoint.y - 8);
            }
        }

        // Draw Interactive Sample Handle
        ctx.beginPath();
        ctx.arc(this.samplePos.x, this.samplePos.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 8. Math and Status Dashboard Inset
        if (this.params.showMathOverlay) {
            this.drawMathDashboard(ctx, w, h, hasSecondaryEdge, cosSim, curvature, visibilityPrimary, xi);
        }
    }

    drawCreaseGeometry(ctx, angleRad) {
        const apex = this.apex;
        const length = 220;

        // Plane 1 endpoint (left)
        const leftEnd = {
            x: apex.x - length * Math.sin(angleRad),
            y: apex.y + length * Math.cos(angleRad)
        };
        // Plane 2 endpoint (right)
        const rightEnd = {
            x: apex.x + length * Math.sin(angleRad),
            y: apex.y + length * Math.cos(angleRad)
        };

        // Solid geometry polygon fill
        ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
        ctx.beginPath();
        ctx.moveTo(apex.x, apex.y);
        ctx.lineTo(leftEnd.x, leftEnd.y);
        ctx.lineTo(rightEnd.x, rightEnd.y);
        ctx.closePath();
        ctx.fill();

        // Sharp edges
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(leftEnd.x, leftEnd.y);
        ctx.lineTo(apex.x, apex.y);
        ctx.lineTo(rightEnd.x, rightEnd.y);
        ctx.stroke();

        // Apex marker
        ctx.beginPath();
        ctx.arc(apex.x, apex.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('Sharp Crease Apex (Subpixel Feature)', apex.x - 90, apex.y - 12);
    }

    drawVector(ctx, origin, dir, length, color, label) {
        const dest = MathSDF.add(origin, MathSDF.scale(dir, length));
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(dest.x, dest.y);
        ctx.stroke();

        // Arrowhead
        const headLen = 7;
        const angle = Math.atan2(dest.y - origin.y, dest.x - origin.x);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(dest.x, dest.y);
        ctx.lineTo(dest.x - headLen * Math.cos(angle - Math.PI / 6), dest.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(dest.x - headLen * Math.cos(angle + Math.PI / 6), dest.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText(label, dest.x + 6, dest.y + 4);
    }

    drawTangentPlane(ctx, point, normal, length, color) {
        const tangent = { x: -normal.y, y: normal.x };
        const pA = MathSDF.add(point, MathSDF.scale(tangent, -length));
        const pB = MathSDF.add(point, MathSDF.scale(tangent, length));

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawMathDashboard(ctx, w, h, hasEdge, cosSim, curvature, visPrimary, xi) {
        const dw = 250;
        const dh = 180;
        const dx = w - dw - 15;
        const dy = 15;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = hasEdge ? '#10b981' : '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(dx, dy, dw, dh, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('SER Analytical Edge Resolver', dx + 12, dy + 20);

        ctx.font = '11px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`cos(θ) Sim:   ${cosSim.toFixed(4)}`, dx + 12, dy + 42);
        ctx.fillText(`Curvature κ:  ${curvature.toFixed(5)}`, dx + 12, dy + 58);

        ctx.fillStyle = hasEdge ? '#10b981' : '#f43f5e';
        const status = hasEdge ? '✓ CREASE DETECTED (Trigger SER)' : '✗ FLAT SURFACE (Skip SER)';
        ctx.fillText(status, dx + 12, dy + 80);

        if (hasEdge) {
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(`2-Plane Intersect xi: ${xi.toFixed(2)} px`, dx + 12, dy + 104);

            const pctLeft = (visPrimary * 100).toFixed(1);
            const pctRight = ((1.0 - visPrimary) * 100).toFixed(1);
            ctx.fillStyle = '#10b981';
            ctx.fillText(`Primary Facet Area:   ${pctLeft}%`, dx + 12, dy + 124);
            ctx.fillStyle = '#a855f7';
            ctx.fillText(`Secondary Facet Area: ${pctRight}%`, dx + 12, dy + 140);

            // Area bar
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(dx + 12, dy + 152, dw - 24, 12);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(dx + 12, dy + 152, (dw - 24) * visPrimary, 12);
            ctx.fillStyle = '#a855f7';
            ctx.fillRect(dx + 12 + (dw - 24) * visPrimary, dy + 152, (dw - 24) * (1.0 - visPrimary), 12);
        } else {
            ctx.fillStyle = '#64748b';
            ctx.fillText('Normal agreement within threshold', dx + 12, dy + 110);
            ctx.fillText('Treating pixel as single flat plane.', dx + 12, dy + 126);
        }
    }
}


// --- FILE: simulation/js/comparison_view.js ---
/**
 * comparison_view.js
 * Stage 4: Real-Time Side-by-Side Pixel Grid Comparison
 * Compares: No AA vs SSAA (4x/8x) vs CTSS vs CTSS + SER
 */



class ComparisonView {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.angle = 0.35; // Interactive rotation angle
        this.zoom = 1.0;
        this.isDragging = false;
        this.lastMouseX = 0;

        // Render resolution for the comparison tiles
        this.tileRes = 64; // 64x64 virtual pixels rendered and magnified
        this.setupEvents();
    }

    setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.lastMouseX;
            this.lastMouseX = e.clientX;
            this.angle += dx * 0.01;
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    update(dt) {
        // Subtle ambient wobble if not dragging
        if (!this.isDragging) {
            this.angle += dt * 0.0003;
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        const halfW = w / 2;
        const halfH = h / 2;

        // 4 Quadrants:
        // Top-Left:     No AA (Classic Sphere Tracing)
        // Top-Right:    Conventional SSAA (4x Brute-Force)
        // Bottom-Left:  CTSS Only (Smooth Silhouettes, Aliased Creases)
        // Bottom-Right: CTSS + SER (Full Antialiased Solution)
        this.renderTile(ctx, 0, 0, halfW, halfH, 'No AA (Standard Sphere Tracing)', 'no_aa', '#f43f5e', '1 Ray/Pixel | Heavy Jaggies');
        this.renderTile(ctx, halfW, 0, halfW, halfH, 'Conventional SSAA (4x Grid)', 'ssaa', '#38bdf8', '4 Rays/Pixel | 4x Heavy Cost');
        this.renderTile(ctx, 0, halfH, halfW, halfH, 'CTSS Only (Cone-Traced)', 'ctss', '#fbbf24', '1 Cone/Pixel | Silhouettes Smooth, Creases Aliased');
        this.renderTile(ctx, halfW, halfH, halfW, halfH, 'CTSS + SER (This Project)', 'ctss_ser', '#10b981', '1 Cone/Pixel | Full Analytical Subpixel AA');

        // Divider lines
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(halfW, 0); ctx.lineTo(halfW, h);
        ctx.moveTo(0, halfH); ctx.lineTo(w, halfH);
        ctx.stroke();
    }

    renderTile(ctx, rx, ry, rw, rh, title, mode, badgeColor, subtext) {
        // Tile background
        ctx.fillStyle = '#090d16';
        ctx.fillRect(rx, ry, rw, rh);

        // Render synthetic test scene (crease + silhouette) at virtual pixel resolution
        const margin = 10;
        const headerH = 45;
        const renderW = rw - margin * 2;
        const renderH = rh - headerH - margin;

        const imgData = ctx.createImageData(this.tileRes, this.tileRes);
        const data = imgData.data;

        const cosA = Math.cos(this.angle);
        const sinA = Math.sin(this.angle);

        // Render each virtual pixel
        for (let py = 0; py < this.tileRes; py++) {
            for (let px = 0; px < this.tileRes; px++) {
                // Normalized coordinates [-1, 1]
                const u = (px / (this.tileRes - 1)) * 2 - 1;
                const v = (py / (this.tileRes - 1)) * 2 - 1;

                // Rotate coordinates
                const ru = u * cosA - v * sinA;
                const rv = u * sinA + v * cosA;

                let color = this.evaluatePixel(ru, rv, mode);

                const idx = (py * this.tileRes + px) * 4;
                data[idx] = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = 255;
            }
        }

        // Draw pixelated image magnified into canvas
        createImageBitmap(imgData).then(bitmap => {
            ctx.save();
            ctx.imageSmoothingEnabled = false; // Keep nearest-neighbor to emphasize subpixel AA differences
            ctx.drawImage(bitmap, rx + margin, ry + headerH, renderW, renderH);
            ctx.restore();
        });

        // Header & Badge
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(title, rx + 14, ry + 22);

        ctx.fillStyle = badgeColor;
        ctx.font = '10px monospace';
        ctx.fillText(subtext, rx + 14, ry + 37);
    }

    evaluatePixel(u, v, mode) {
        // Scene SDF composed of an internal sharp crease (cube corner) + silhouette
        const p = { x: u * 1.5, y: v * 1.5 };

        // Normal colors for the two faces of the crease
        const colLeft = { r: 34, g: 197, b: 94 };    // Greenish facet
        const colRight = { r: 168, g: 85, b: 247 };  // Purple facet
        const colBg = { r: 15, g: 23, b: 42 };        // Background

        // Sharp crease boundary along x = 0 (transformed)
        const dCrease = p.x;
        // Silhouette boundary along y = -0.5
        const dSilhouette = p.y + 0.45;

        // Is inside object?
        const isSolid = (dSilhouette < 0) && (Math.abs(p.x) < 0.7);

        if (!isSolid) {
            return colBg;
        }

        const pixelSize = 2.0 / this.tileRes;

        if (mode === 'no_aa') {
            // 1-bit point sample at pixel center
            return dCrease < 0 ? colLeft : colRight;
        }

        if (mode === 'ssaa') {
            // 4x subpixel jittered sampling
            let r = 0, g = 0, b = 0;
            const subOffsets = [
                [-0.25, -0.25], [0.25, -0.25],
                [-0.25, 0.25], [0.25, 0.25]
            ];
            subOffsets.forEach(([ox, oy]) => {
                const spx = p.x + ox * pixelSize;
                const spy = p.y + oy * pixelSize;
                const subSolid = (spy + 0.45 < 0) && (Math.abs(spx) < 0.7);
                if (!subSolid) {
                    r += colBg.r; g += colBg.g; b += colBg.b;
                } else if (spx < 0) {
                    r += colLeft.r; g += colLeft.g; b += colLeft.b;
                } else {
                    r += colRight.r; g += colRight.g; b += colRight.b;
                }
            });
            return { r: Math.round(r / 4), g: Math.round(g / 4), b: Math.round(b / 4) };
        }

        if (mode === 'ctss') {
            // CTSS smooths the silhouette, but DOES NOT resolve the internal crease
            // Silhouette coverage:
            const distToSil = Math.abs(dSilhouette);
            const silCoverage = MathSDF.clamp((distToSil / pixelSize), 0, 1);

            // Crease is still 1-bit binary!
            const facetColor = dCrease < 0 ? colLeft : colRight;

            // Blend silhouette smoothly with background, but leave crease aliased
            return {
                r: Math.round(MathSDF.lerp(facetColor.r, colBg.r, silCoverage)),
                g: Math.round(MathSDF.lerp(facetColor.g, colBg.g, silCoverage)),
                b: Math.round(MathSDF.lerp(facetColor.b, colBg.b, silCoverage))
            };
        }

        if (mode === 'ctss_ser') {
            // CTSS + SER: Both the silhouette AND the internal crease are analytically resolved
            const distToSil = Math.abs(dSilhouette);
            const silCoverage = MathSDF.clamp((distToSil / pixelSize), 0, 1);

            // Analytical two-plane coverage across the subpixel cone footprint
            const creaseCoverage = MathSDF.clamp((dCrease / (pixelSize * 1.2) + 0.5), 0, 1);
            const facetR = MathSDF.lerp(colLeft.r, colRight.r, creaseCoverage);
            const facetG = MathSDF.lerp(colLeft.g, colRight.g, creaseCoverage);
            const facetB = MathSDF.lerp(colLeft.b, colRight.b, creaseCoverage);

            return {
                r: Math.round(MathSDF.lerp(facetR, colBg.r, silCoverage)),
                g: Math.round(MathSDF.lerp(facetG, colBg.g, silCoverage)),
                b: Math.round(MathSDF.lerp(facetB, colBg.b, silCoverage))
            };
        }

        return colBg;
    }
}


// --- FILE: simulation/js/app.js ---
/**
 * app.js
 * Main simulation orchestrator, tab coordinator, and parameter tooltip engine
 */






// Parameter definitions database with the three required user explanations:
// 1. Definition / Code role
// 2. Animation effect
// 3. Final rendered result impact
const PARAMETER_INFO = {
    // Stage 1 parameters
    stepSizeMult: {
        title: "Step Size Multiplier (SPHERE_TRACE_STEPSIZE_MULT)",
        code: "SPHERE_TRACE_STEPSIZE_MULT = 1.0 (render_defs.cginc)",
        desc: "Multiplicador escalar aplicado sobre o valor de distância retornado pelo SDF a cada passo do raymarching.",
        animEffect: "Altera o raio das esferas amarelas de segurança desenhadas ao longo do raio. Valores menores que 1.0 dão passos mais curtos e aumentam o número de círculos necessários para atingir a superfície.",
        finalResult: "Evita artefatos de overshoot (atravessar superfícies) em SDFs que não sejam estritamente euclidianos (funções não-Eikonal onde |∇f| ≠ 1). Valores menores aumentam a robustez, mas reduzem a performance de renderização."
    },
    enableSSAA: {
        title: "Brute-Force SSAA Toggle (Conventional 4x SSAA)",
        code: "_AA_FACTOR = 2 (NxN grid em primitives.shader)",
        desc: "Supersampling convencional: dispara múltiplos raios espaciais independentes e ligeiramente deslocados para cada pixel.",
        animEffect: "Exibe 4 raios tracejados simultâneos com cores indicando se cada um acertou (vermelho) ou errou (azul) a geometria.",
        finalResult: "Reduz o serrilhado através de força bruta multiplicando a quantidade de raios por 4x ou 8x, o que torna o raymarching de SDFs inviável para aplicações em tempo real."
    },

    // Stage 2 parameters
    tanTheta: {
        title: "Cone Opening Angle (tan_theta / PIXEL_SIZE_MULT)",
        code: "tan_theta = 2.0 * PIXEL_SIZE_MULT / Screen.y / FOCAL_LENGTH",
        desc: "Tangente do semi-ângulo de abertura do cone de visão do pixel. Define a taxa com que o cone se alarga com a distância (r = t · tan θ).",
        animEffect: "Alarga ou estreita a abertura do feixe cônico azul e o tamanho do disco de teste na ponta da marcha.",
        finalResult: "Controla a espessura da zona de transição de antialiasing. Um cone muito estreito não captura silhuetas finas; um cone muito largo gera desfoque excessivo (blur)."
    },
    occlusionSoft: {
        title: "Soft Hit Threshold (OCCLUSION_SOFT)",
        code: "OCCLUSION_SOFT = (0.0 - OCCLUSION_EPS) (render_defs.cginc)",
        desc: "Limiar mínimo de oclusão do cone para detectar que ele começou a passar de raspão por uma silhueta (Soft Hit).",
        animEffect: "Determina o ponto exato da trajetória em que o cone marca o início de uma amostra de silhueta (t_in) e começa a preencher a máscara de bits.",
        finalResult: "Garante que o renderizador registre contornos parciais com antecedência suficiente, evitando perda de arestas silhuetadas a longas distâncias."
    },
    occlusionHard: {
        title: "Hard Hit Threshold (OCCLUSION_HARD)",
        code: "OCCLUSION_HARD = (0.5 - OCCLUSION_EPS) (render_defs.cginc)",
        desc: "Limiar de oclusão que indica que o eixo central do cone penetrou uma superfície sólida.",
        animEffect: "Muda a cor do anel na ponta do cone de amarelo (soft) para vermelho (hard hit) e marca a amostra primária de profundidade.",
        finalResult: "Diferencia o que é apenas contorno periférico do que é o corpo principal visível do objeto que dominará a cor central do pixel."
    },
    occlusionStop: {
        title: "Full Hit Stop Threshold (OCCLUSION_STOP)",
        code: "OCCLUSION_STOP = (1.0 - OCCLUSION_EPS) (render_defs.cginc)",
        desc: "Limiar de oclusão total para encerrar a marcha do cone. Se configurado em 0.5 (modo Relaxed / USE_CTSS_R), encerra no hard hit; se em 0.99 (Full CTSS), só encerra quando 100% ocluído.",
        animEffect: "Define se o cone continua viajando após tocar o objeto ou se interrompe a simulação imediatamente.",
        finalResult: "O modo Relaxed (0.5) é mais rápido, mas perde camadas transparentes ou silhuetas complexas sobrepostas. O modo Full (0.99) entrega antialiasing perfeito entre múltiplos objetos em profundidade."
    },

    // Stage 3 parameters
    creaseAngleDeg: {
        title: "Crease Apex Angle (Geometria da Aresta)",
        code: "Geometria da quina subpixel (teste analítico)",
        desc: "Ângulo diedro entre as duas faces da quina sólida dentro do pixel.",
        animEffect: "Dobra as arestas vermelhas do polígono, tornando a quina mais afiada ou mais aberta.",
        finalResult: "Simula como o algoritmo se comporta em quinas vivas (90° em cubos, 45° em pirâmides) versus superfícies suavemente curvadas."
    },
    cosSimMax: {
        title: "Normal Cosine Similarity Max (_SUBPIXEL_EDGE_RESOLVE_COSSIM_THRESHOLD_MAX)",
        code: "_SUBPIXEL_EDGE_RESOLVE_COSSIM_THRESHOLD_MAX = 0.999 (primitives.shader)",
        desc: "Limiar máximo do produto escalar dot(nPrimary, nLarge). Se as normais micro e macro discordarem além deste limiar, uma aresta interna é detectada.",
        animEffect: "Controla se o painel verde ativa 'CREASE DETECTED' ou se desliga para 'FLAT SURFACE'.",
        finalResult: "Evita que superfícies planas ou com curvas suaves disparem desnecessariamente o cálculo do SER, concentrando o processamento exclusivamente em quinas afiadas."
    },
    coneMultCos: {
        title: "Macro Normal Scale (_SUBPIXEL_EDGE_RESOLVE_CONE_MULT_COS)",
        code: "_SUBPIXEL_EDGE_RESOLVE_CONE_MULT_COS = 2.0 (render_defs.cginc)",
        desc: "Multiplicador do raio do cone (h = mult · Rc) usado para avaliar a normal macroscópica em grande escala.",
        animEffect: "Alonga o vetor de amostragem macroscópica (laranja) para além do ponto central da amostra.",
        finalResult: "Se for muito pequeno, a normal macro será quase idêntica à micro e quinas não serão detectadas. Se for muito grande, detalhes distantes podem poluir a detecção da quina local."
    },
    coneMult: {
        title: "Search Distance Multiplier (_SUBPIXEL_EDGE_RESOLVE_CONE_MULT)",
        code: "_SUBPIXEL_EDGE_RESOLVE_CONE_MULT = 1.0 (render_defs.cginc)",
        desc: "Distância ao longo do vetor de busca (d_search) para encontrar a face secundária da quina.",
        animEffect: "Estende a seta rosa (searchDir) que localiza o ponto secundário e a normal roxa (nSecondary).",
        finalResult: "Permite que o algoritmo alcance o outro lado da quina dentro da pegada do cone para calcular a interseção analítica dos dois planos."
    },
    curvatureThreshold: {
        title: "Curvature Threshold (_SUBPIXEL_EDGE_RESOLVE_CURVATURE_THRESHOLD)",
        code: "_SUBPIXEL_EDGE_RESOLVE_CURVATURE_THRESHOLD = 0.00001 (render_defs.cginc)",
        desc: "Limiar mínimo do Laplaciano discreto 3D do SDF (|Δf| > threshold) para confirmar que a discordância de normais é uma quina real e não ruído numérico.",
        animEffect: "Filtra o gatilho de detecção da aresta no painel analítico.",
        finalResult: "Elimina falsos positivos em regiões planas causados por pequenas imprecisões de ponto flutuante na derivada do SDF."
    }
};

class SimulationApp {
    constructor() {
        this.currentStage = 'stage-sphere';
        this.lastTimestamp = performance.now();

        // Canvases
        this.canvasSphere = document.getElementById('canvas-sphere');
        this.canvasCTSS = document.getElementById('canvas-ctss');
        this.canvasBitmask = document.getElementById('canvas-bitmask');
        this.canvasSER = document.getElementById('canvas-ser');
        this.canvasComp = document.getElementById('canvas-comparison');

        // Animations instances
        this.animSphere = new SphereTracingAnimation(this.canvasSphere);
        this.animCTSS = new CTSSAnimation(this.canvasCTSS, this.canvasBitmask);
        this.animSER = new SERAnimation(this.canvasSER);
        this.animComp = new ComparisonView(this.canvasComp);

        this.setupTabs();
        this.setupControls();
        this.setupTooltips();
        this.startLoop();
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                this.switchTab(target);
            });
        });
    }

    switchTab(tabId) {
        this.currentStage = tabId;

        // Update active tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update visible panels
        document.querySelectorAll('.stage-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === tabId);
        });

        // Update sidebar parameter groups
        document.querySelectorAll('.params-group').forEach(group => {
            group.classList.toggle('active', group.dataset.group === tabId);
        });
    }

    setupControls() {
        // Stage 1 controls
        const s1Play = document.getElementById('s1-btn-play');
        const s1StepFwd = document.getElementById('s1-btn-step-fwd');
        const s1StepBwd = document.getElementById('s1-btn-step-bwd');
        const s1StepSize = document.getElementById('s1-step-size');
        const s1SSAA = document.getElementById('s1-toggle-ssaa');

        if (s1Play) s1Play.addEventListener('click', () => {
            this.animSphere.togglePlay();
            s1Play.textContent = this.animSphere.isPlaying ? '⏸ Pausar' : '▶ Reproduzir';
        });
        if (s1StepFwd) s1StepFwd.addEventListener('click', () => this.animSphere.stepForward());
        if (s1StepBwd) s1StepBwd.addEventListener('click', () => this.animSphere.stepBackward());
        if (s1StepSize) s1StepSize.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animSphere.setParam('stepSizeMult', v);
            document.getElementById('s1-step-size-val').textContent = v.toFixed(2);
        });
        if (s1SSAA) s1SSAA.addEventListener('change', (e) => {
            this.animSphere.setParam('enableSSAA', e.target.checked);
        });

        // Stage 2 controls
        const s2Play = document.getElementById('s2-btn-play');
        const s2Tan = document.getElementById('s2-tan-theta');
        const s2Soft = document.getElementById('s2-occ-soft');
        const s2Hard = document.getElementById('s2-occ-hard');
        const s2Stop = document.getElementById('s2-occ-stop');

        if (s2Play) s2Play.addEventListener('click', () => {
            this.animCTSS.isPlaying = !this.animCTSS.isPlaying;
            s2Play.textContent = this.animCTSS.isPlaying ? '⏸ Pausar' : '▶ Reproduzir';
        });
        if (s2Tan) s2Tan.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animCTSS.setParam('tanTheta', v);
            document.getElementById('s2-tan-theta-val').textContent = v.toFixed(3);
        });
        if (s2Soft) s2Soft.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animCTSS.setParam('occlusionSoft', v);
            document.getElementById('s2-occ-soft-val').textContent = v.toFixed(2);
        });
        if (s2Hard) s2Hard.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animCTSS.setParam('occlusionHard', v);
            document.getElementById('s2-occ-hard-val').textContent = v.toFixed(2);
        });
        if (s2Stop) s2Stop.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animCTSS.setParam('occlusionStop', v);
            document.getElementById('s2-occ-stop-val').textContent = v.toFixed(2);
        });

        // Stage 3 controls
        const s3Angle = document.getElementById('s3-crease-angle');
        const s3CosSim = document.getElementById('s3-cossim-max');
        const s3ConeCos = document.getElementById('s3-cone-cos');
        const s3ConeMult = document.getElementById('s3-cone-mult');

        if (s3Angle) s3Angle.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animSER.setParam('creaseAngleDeg', v);
            document.getElementById('s3-crease-angle-val').textContent = `${v}°`;
        });
        if (s3CosSim) s3CosSim.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animSER.setParam('cosSimMax', v);
            document.getElementById('s3-cossim-max-val').textContent = v.toFixed(3);
        });
        if (s3ConeCos) s3ConeCos.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animSER.setParam('coneMultCos', v);
            document.getElementById('s3-cone-cos-val').textContent = `${v.toFixed(1)}x`;
        });
        if (s3ConeMult) s3ConeMult.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.animSER.setParam('coneMult', v);
            document.getElementById('s3-cone-mult-val').textContent = `${v.toFixed(1)}x`;
        });
    }

    /**
     * Setup rich hover and focus tooltip inspector for every parameter card
     */
    setupTooltips() {
        const tooltipBox = document.getElementById('param-tooltip-card');
        const titleEl = document.getElementById('tooltip-title');
        const codeEl = document.getElementById('tooltip-code');
        const descEl = document.getElementById('tooltip-desc');
        const animEl = document.getElementById('tooltip-anim');
        const resultEl = document.getElementById('tooltip-result');

        const elements = document.querySelectorAll('[data-param-key]');

        elements.forEach(el => {
            const key = el.dataset.paramKey;
            const info = PARAMETER_INFO[key];
            if (!info) return;

            const showInfo = () => {
                titleEl.textContent = info.title;
                codeEl.textContent = info.code;
                descEl.textContent = info.desc;
                animEl.textContent = info.animEffect;
                resultEl.textContent = info.finalResult;
                tooltipBox.classList.add('visible');
            };

            el.addEventListener('mouseenter', showInfo);
            el.addEventListener('focusin', showInfo);
        });
    }

    startLoop() {
        const loop = (timestamp) => {
            const dt = timestamp - this.lastTimestamp;
            this.lastTimestamp = timestamp;

            // Update & render active stage
            if (this.currentStage === 'stage-sphere') {
                this.animSphere.update(dt);
                this.animSphere.render();
            } else if (this.currentStage === 'stage-ctss') {
                this.animCTSS.update(dt);
                this.animCTSS.render();
            } else if (this.currentStage === 'stage-ser') {
                this.animSER.update(dt);
                this.animSER.render();
            } else if (this.currentStage === 'stage-comparison') {
                this.animComp.update(dt);
                this.animComp.render();
            }

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

// Bootstrap on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new SimulationApp();
});


})();