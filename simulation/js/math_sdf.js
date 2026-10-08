/**
 * math_sdf.js
 * Mathematical primitives and Signed Distance Field (SDF) functions
 * ported and adapted from Assets/shaders/utils/{math.cginc, sdf.cginc, render_defs.cginc}
 */

export const MathSDF = {
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
