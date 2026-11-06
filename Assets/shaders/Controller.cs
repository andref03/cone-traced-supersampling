using System;
using UnityEngine;

namespace shaders
{
    public class Controller : MonoBehaviour
    {
        private Material mat;
        private bool showTrans1 = true;
        private bool showTrans2 = true;
        private bool showTrans3 = true;

        void Awake()
        {
            this.mat = this.GetComponent<Renderer>().material;

            this.mat.SetVector("_MousePos", new Vector4(1f, 0f, 0f, 0f));

            if (this.mat.HasProperty("_SHOW_TRANS_1"))
                showTrans1 = this.mat.GetFloat("_SHOW_TRANS_1") > 0.5f;
            if (this.mat.HasProperty("_SHOW_TRANS_2"))
                showTrans2 = this.mat.GetFloat("_SHOW_TRANS_2") > 0.5f;
            if (this.mat.HasProperty("_SHOW_TRANS_3"))
                showTrans3 = this.mat.GetFloat("_SHOW_TRANS_3") > 0.5f;
        }

        public static int GetUnixTime()
        {
            return (int) (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
        }

        void Update()
        {
            if (Input.GetMouseButton(0))
            {
                var pos = Input.mousePosition;
                this.mat.SetVector("_MousePos", new Vector4(1f - pos.x / Screen.width, pos.y / Screen.height, 0f, 0f));
                Debug.Log("mousePosition " + pos);
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

            if (Input.GetKeyDown(KeyCode.Alpha5))
            {
                var s = Shader.Find("Unlit/transparency_layers");
                if (s != null) { this.mat.shader = s; Debug.Log("Cena trocada: 5. Transparency Multi-layer (2 Camadas)"); }
            }

            if (Input.GetKeyDown(KeyCode.Alpha6))
            {
                var s = Shader.Find("Unlit/transparency_row");
                if (s != null) { this.mat.shader = s; Debug.Log("Cena trocada: 6. Transparency Row (3 Camadas)"); }
            }

            // Comandos para adicionar / esconder objetos transparentes na fileira:
            if (Input.GetKeyDown(KeyCode.Alpha7) || Input.GetKeyDown(KeyCode.J))
            {
                showTrans1 = !showTrans1;
                this.mat.SetFloat("_SHOW_TRANS_1", showTrans1 ? 1.0f : 0.0f);
                Debug.Log("Vidro 1 (Âmbar): " + (showTrans1 ? "Visível" : "Escondido"));
            }

            if (Input.GetKeyDown(KeyCode.Alpha8) || Input.GetKeyDown(KeyCode.K))
            {
                showTrans2 = !showTrans2;
                this.mat.SetFloat("_SHOW_TRANS_2", showTrans2 ? 1.0f : 0.0f);
                Debug.Log("Vidro 2 (Ciano): " + (showTrans2 ? "Visível" : "Escondido"));
            }

            if (Input.GetKeyDown(KeyCode.Alpha9) || Input.GetKeyDown(KeyCode.L))
            {
                showTrans3 = !showTrans3;
                this.mat.SetFloat("_SHOW_TRANS_3", showTrans3 ? 1.0f : 0.0f);
                Debug.Log("Vidro 3 (Magenta): " + (showTrans3 ? "Visível" : "Escondido"));
            }

            if (Input.GetKeyDown(KeyCode.Alpha0))
            {
                bool anyOn = showTrans1 || showTrans2 || showTrans3;
                showTrans1 = !anyOn;
                showTrans2 = !anyOn;
                showTrans3 = !anyOn;
                this.mat.SetFloat("_SHOW_TRANS_1", showTrans1 ? 1.0f : 0.0f);
                this.mat.SetFloat("_SHOW_TRANS_2", showTrans2 ? 1.0f : 0.0f);
                this.mat.SetFloat("_SHOW_TRANS_3", showTrans3 ? 1.0f : 0.0f);
                Debug.Log("Todos os vidros da fileira: " + (showTrans1 ? "Visíveis" : "Escondidos"));
            }
        }

        void OnGUI()
        {
            // Interface gráfica interativa na tela com botões clicáveis
            GUILayout.BeginArea(new Rect(12, 12, 280, 360), GUI.skin.box);
            GUILayout.Label("<b>Controle de Transparência (3 Camadas)</b>");

            bool curTrans = this.mat.HasProperty("_USE_TRANSPARENCY") && this.mat.GetFloat("_USE_TRANSPARENCY") > 0.5f;
            if (GUILayout.Button(curTrans ? "K-Bitmasks: ATIVO (T)" : "K-Bitmasks: DESATIVADO (T)"))
            {
                this.mat.SetFloat("_USE_TRANSPARENCY", curTrans ? 0f : 1f);
            }

            GUILayout.Space(6);
            GUILayout.Label("<b>Visibilidade da Fileira de Vidros:</b>");

            // Botão Camada 1
            string txtL1 = showTrans1 ? "[ON]  1. Vidro Âmbar (Frente) [7]" : "[OFF] 1. Vidro Âmbar (Frente) [7]";
            if (GUILayout.Button(txtL1))
            {
                showTrans1 = !showTrans1;
                this.mat.SetFloat("_SHOW_TRANS_1", showTrans1 ? 1.0f : 0.0f);
            }

            // Botão Camada 2
            string txtL2 = showTrans2 ? "[ON]  2. Vidro Ciano (Meio) [8]" : "[OFF] 2. Vidro Ciano (Meio) [8]";
            if (GUILayout.Button(txtL2))
            {
                showTrans2 = !showTrans2;
                this.mat.SetFloat("_SHOW_TRANS_2", showTrans2 ? 1.0f : 0.0f);
            }

            // Botão Camada 3
            string txtL3 = showTrans3 ? "[ON]  3. Vidro Magenta (Fundo) [9]" : "[OFF] 3. Vidro Magenta (Fundo) [9]";
            if (GUILayout.Button(txtL3))
            {
                showTrans3 = !showTrans3;
                this.mat.SetFloat("_SHOW_TRANS_3", showTrans3 ? 1.0f : 0.0f);
            }

            GUILayout.Space(6);
            if (GUILayout.Button("Alternar Todos os Vidros [0]"))
            {
                bool anyOn = showTrans1 || showTrans2 || showTrans3;
                showTrans1 = !anyOn;
                showTrans2 = !anyOn;
                showTrans3 = !anyOn;
                this.mat.SetFloat("_SHOW_TRANS_1", showTrans1 ? 1.0f : 0.0f);
                this.mat.SetFloat("_SHOW_TRANS_2", showTrans2 ? 1.0f : 0.0f);
                this.mat.SetFloat("_SHOW_TRANS_3", showTrans3 ? 1.0f : 0.0f);
            }

            GUILayout.Space(6);
            GUILayout.Label("<i>Trocar Shader/Cena:</i>");
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Fileira (6)"))
            {
                var s = Shader.Find("Unlit/transparency_row");
                if (s != null) this.mat.shader = s;
            }
            if (GUILayout.Button("2 Camadas (5)"))
            {
                var s = Shader.Find("Unlit/transparency_layers");
                if (s != null) this.mat.shader = s;
            }
            if (GUILayout.Button("Base (2)"))
            {
                var s = Shader.Find("Unlit/transparency");
                if (s != null) this.mat.shader = s;
            }
            GUILayout.EndHorizontal();

            GUILayout.EndArea();
        }
    }
}
