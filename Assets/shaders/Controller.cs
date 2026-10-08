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

            if (Input.GetKeyDown(KeyCode.T))
            {
                float currentTrans = this.mat.GetFloat("_USE_TRANSPARENCY");
                float newTrans = (currentTrans > 0.5f) ? 0f : 1f;
                this.mat.SetFloat("_USE_TRANSPARENCY", newTrans);
                Debug.Log("Toggled Transparency (K-Bitmasks): " + (newTrans > 0.5f ? "ON (After)" : "OFF (Before)"));
            }

            // Atalhos para trocar de cena/shader em tempo real:
            if (Input.GetKeyDown(KeyCode.Alpha1))
            {
                var s = Shader.Find("Unlit/primitives");
                if (s != null) { this.mat.shader = s; Debug.Log("Cena trocada: 1. Primitives"); }
            }

            if (Input.GetKeyDown(KeyCode.Alpha2))
            {
                var s = Shader.Find("Unlit/transparency");
                if (s != null) { this.mat.shader = s; Debug.Log("Cena trocada: 2. Transparency Test"); }
            }

            if (Input.GetKeyDown(KeyCode.Alpha3))
            {
                var s = Shader.Find("Unlit/sponza");
                if (s != null) { this.mat.shader = s; Debug.Log("Cena trocada: 3. Sponza"); }
            }

            if (Input.GetKeyDown(KeyCode.Alpha4))
            {
                var s = Shader.Find("Unlit/grid_box");
                if (s != null) { this.mat.shader = s; Debug.Log("Cena trocada: 4. Grid Box"); }
            }
        }
    }
}
