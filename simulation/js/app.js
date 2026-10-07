/**
 * app.js
 * Main simulation orchestrator, tab coordinator, and parameter tooltip engine
 */

import { SphereTracingAnimation } from './animation_sphere.js';
import { CTSSAnimation } from './animation_ctss.js';
import { SERAnimation } from './animation_ser.js';
import { ComparisonView } from './comparison_view.js';

// Parameter definitions database with the three required user explanations:
// 1. Definition / Code role
// 2. Animation effect
// 3. Final rendered result impact
export const PARAMETER_INFO = {
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
