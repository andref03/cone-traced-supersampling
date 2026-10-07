/**
 * animation_ser.js
 * Stage 3: Subpixel Edge Reconstruction (SER) & Analytical Two-Plane Intersection
 */

import { MathSDF } from './math_sdf.js';

export class SERAnimation {
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
