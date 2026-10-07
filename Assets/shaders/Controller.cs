using System;
using UnityEngine;

namespace shaders
{
    public class Controller : MonoBehaviour
    {
        private Material mat;

        private int coverageMode = 2; // 0: Bitmask, 1: Popcnt, 2: Analytic, 3: Smoothstep
        private bool enableCTSS = true;
        private int aaFactor = 1; // 1: 1x1, 2: 2x2 (4xSSAA), 3: 3x3 (9xSSAA)
        private bool showGUI = true;

        private float deltaTime = 0.0f;

        void Awake()
        {
            this.mat = this.GetComponent<Renderer>().material;
            this.mat.SetVector("_MousePos", new Vector4(1f, 0f, 0f, 0f));
            ApplyShaderSettings();
        }

        private void ApplyShaderSettings()
        {
            if (this.mat == null) return;
            this.mat.SetFloat("_ENABLE_CTSS", enableCTSS ? 1.0f : 0.0f);
            this.mat.SetInt("_COVERAGE_MODE", coverageMode);
            this.mat.SetInt("_AA_FACTOR", aaFactor);
        }

        public static int GetUnixTime()
        {
            return (int)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
        }

        void Update()
        {
            deltaTime += (Time.unscaledDeltaTime - deltaTime) * 0.1f;

            if (Input.GetMouseButton(0))
            {
                var pos = Input.mousePosition;
                this.mat.SetVector("_MousePos", new Vector4(1f - pos.x / Screen.width, pos.y / Screen.height, 0f, 0f));
            }

            if (Input.GetKeyDown(KeyCode.S))
            {
                string path = "screenshot-" + GetUnixTime() + ".png";
                ScreenCapture.CaptureScreenshot(path);
                Debug.Log("Saved screenshot " + path);
            }

            if (Input.GetKeyDown(KeyCode.R))
            {
                Vector3 pos = new Vector3(0f, 0f, 0f);
                this.mat.SetVector("_MousePos", new Vector4(1f - pos.x / Screen.width, pos.y / Screen.height, 0f, 0f));
                Debug.Log("Reset mouse position to default.");
            }

            // Alternância entre os Modos da Pesquisa
            if (Input.GetKeyDown(KeyCode.Alpha0))
            {
                enableCTSS = false;
                ApplyShaderSettings();
                Debug.Log("[AA] Modo: Sem Antialiasing (Sphere Tracing puro)");
            }
            if (Input.GetKeyDown(KeyCode.Alpha1))
            {
                enableCTSS = true;
                coverageMode = 0;
                ApplyShaderSettings();
                Debug.Log("[AA] Modo: 0 - Baseline (Bitmask 32-bit original dos autores)");
            }
            if (Input.GetKeyDown(KeyCode.Alpha2))
            {
                enableCTSS = true;
                coverageMode = 1;
                ApplyShaderSettings();
                Debug.Log("[AA] Modo: 1 - Bitmask 32-bit + Hardware POPCNT (countbits)");
            }
            if (Input.GetKeyDown(KeyCode.Alpha3))
            {
                enableCTSS = true;
                coverageMode = 2;
                ApplyShaderSettings();
                Debug.Log("[AA] Modo: 2 - Proposta 1: Função Analítica Contínua (Segmento Circular)");
            }
            if (Input.GetKeyDown(KeyCode.Alpha4))
            {
                enableCTSS = true;
                coverageMode = 3;
                ApplyShaderSettings();
                Debug.Log("[AA] Modo: 3 - Variante: Cobertura Suave Polinomial (Smoothstep)");
            }

            // Alternar Supersampling (SSAA Ground Truth)
            if (Input.GetKeyDown(KeyCode.F))
            {
                aaFactor = (aaFactor % 3) + 1; // 1 -> 2 -> 3 -> 1
                ApplyShaderSettings();
                Debug.Log("[AA] Fator SSAA alterado para: " + aaFactor + "x" + aaFactor);
            }

            // Alternar visibilidade da interface HUD
            if (Input.GetKeyDown(KeyCode.H))
            {
                showGUI = !showGUI;
            }
        }

        private string GetCurrentModeDescription()
        {
            if (!enableCTSS) return "SEM Antialiasing (No AA)";
            switch (coverageMode)
            {
                case 0: return "[1] Baseline (Bitmask 32-bit)";
                case 1: return "[2] Bitmask + Hardware POPCNT";
                case 2: return "[3] PROPOSTA: Analítica Contínua";
                case 3: return "[4] Suave (Smoothstep)";
                default: return "Desconhecido";
            }
        }

        void OnGUI()
        {
            if (!showGUI) return;

            float msec = deltaTime * 1000.0f;
            float fps = 1.0f / Mathf.Max(0.0001f, deltaTime);

            GUI.Box(new Rect(10, 10, 360, 175), "Pesquisa CG: Cone-Traced Supersampling");

            GUIStyle labelStyle = new GUIStyle(GUI.skin.label);
            labelStyle.fontStyle = FontStyle.Bold;

            GUI.Label(new Rect(20, 32, 340, 20), "Modo Atual: " + GetCurrentModeDescription(), labelStyle);
            GUI.Label(new Rect(20, 52, 340, 20), string.Format("Desempenho: {0:0.0} ms ({1:0.} FPS) | Grid SSAA: {2}x{2}", msec, fps, aaFactor));

            GUI.Label(new Rect(20, 75, 340, 18), "[0] Desativar AA (Sem Antialiasing)");
            GUI.Label(new Rect(20, 93, 340, 18), "[1] Baseline dos Autores (Bitmask 32-bit)");
            GUI.Label(new Rect(20, 111, 340, 18), "[2] Bitmask com Hardware POPCNT");
            GUI.Label(new Rect(20, 129, 340, 18), "[3] PROPOSTA 1: Função Analítica Contínua");
            GUI.Label(new Rect(20, 147, 340, 18), "[4] Suave Smoothstep | [F] SSAA | [H] Ocultar HUD");
        }
    }
}
