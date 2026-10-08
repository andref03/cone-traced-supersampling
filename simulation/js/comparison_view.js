/**
 * comparison_view.js
 * Stage 4: Real-Time Side-by-Side Pixel Grid Comparison
 * Compares: No AA vs SSAA (4x/8x) vs CTSS vs CTSS + SER
 */

import { MathSDF } from './math_sdf.js';

export class ComparisonView {
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
