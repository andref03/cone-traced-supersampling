using System;
using UnityEngine;

namespace shaders
{
    public class Controller : MonoBehaviour
    {
        private Material mat;
        private Vector4 mousePos = new Vector4(1f, 0f, 0f, 0f);
        [Header("Camera Controls")]
        [Tooltip("Sensibilidade da movimentação da câmera pelas setas do teclado.")]
        [Range(0.05f, 2.5f)]
        [SerializeField] private float cameraMoveSpeed = 0.6f;

        private bool showTrans1 = true;
        private bool showTrans2 = true;
        private bool showTrans3 = true;

        void Awake()
        {
            this.mat = this.GetComponent<Renderer>().material;

            if (this.mat.HasProperty("_MousePos"))
            {
                this.mousePos = this.mat.GetVector("_MousePos");
                if (this.mousePos == Vector4.zero)
                    this.mousePos = new Vector4(1f, 0f, 0f, 0f);
            }
            this.mat.SetVector("_MousePos", this.mousePos);

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
            // Controle da câmera pelo clique e arraste do mouse
            if (Input.GetMouseButton(0))
            {
                var pos = Input.mousePosition;
                this.mousePos = new Vector4(1f - pos.x / Screen.width, pos.y / Screen.height, 0f, 0f);
                this.mat.SetVector("_MousePos", this.mousePos);
                Debug.Log("mousePosition " + pos);
            }

            // Controle da câmera pelas setinhas do teclado
            float currentSpeed = cameraMoveSpeed;
            if (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift))
            {
                currentSpeed *= 2.0f; // velocidade rápida com Shift
            }

            bool cameraMoved = false;

            // Seta Esquerda: gira a câmera em órbita horizontal para a esquerda
            if (Input.GetKey(KeyCode.LeftArrow))
            {
                this.mousePos.x += currentSpeed * Time.deltaTime;
                cameraMoved = true;
            }

            // Seta Direita: gira a câmera em órbita horizontal para a direita
            if (Input.GetKey(KeyCode.RightArrow))
            {
                this.mousePos.x -= currentSpeed * Time.deltaTime;
                cameraMoved = true;
            }

            // Seta Cima: eleva a câmera / visualiza em ângulo mais alto
            if (Input.GetKey(KeyCode.UpArrow))
            {
                this.mousePos.y += currentSpeed * Time.deltaTime;
                cameraMoved = true;
            }

            // Seta Baixo: abaixa a câmera / aproxima do plano do chão
            if (Input.GetKey(KeyCode.DownArrow))
            {
                this.mousePos.y -= currentSpeed * Time.deltaTime;
                cameraMoved = true;
            }

            if (cameraMoved)
            {
                // Limita a elevação para manter a visão coerente e não inverter
                this.mousePos.y = Mathf.Clamp(this.mousePos.y, -0.3f, 1.25f);
                this.mat.SetVector("_MousePos", this.mousePos);
            }

            if (Input.GetKeyDown(KeyCode.S))
            {
                string path = "screenshot-" + GetUnixTime() + ".png";
                ScreenCapture.CaptureScreenshot(path);
                Debug.Log("Saved screenshot " + path);
            }

            if (Input.GetKeyDown(KeyCode.R))
            {
                this.mousePos = new Vector4(1f, 0f, 0f, 0f);
                this.mat.SetVector("_MousePos", this.mousePos);
                Debug.Log("Reset mouse position to default.");
            }

            // Ajuste rápido de sensibilidade pelo teclado (+ e -)
            if (Input.GetKeyDown(KeyCode.Equals) || Input.GetKeyDown(KeyCode.KeypadPlus))
            {
                cameraMoveSpeed = Mathf.Min(2.5f, cameraMoveSpeed + 0.1f);
                Debug.Log("Sensibilidade da câmera: " + cameraMoveSpeed.ToString("F2"));
            }
            if (Input.GetKeyDown(KeyCode.Minus) || Input.GetKeyDown(KeyCode.KeypadMinus))
            {
                cameraMoveSpeed = Mathf.Max(0.05f, cameraMoveSpeed - 0.1f);
                Debug.Log("Sensibilidade da câmera: " + cameraMoveSpeed.ToString("F2"));
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
            GUILayout.BeginArea(new Rect(12, 12, 280, 475), GUI.skin.box);
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

            GUILayout.Space(6);
            GUILayout.Label("<b>Câmera:</b> Setas (↑ ↓ ← →)");
            GUILayout.BeginHorizontal();
            GUILayout.Label(string.Format("Sensibilidade: {0:F2}", cameraMoveSpeed), GUILayout.Width(130));
            if (GUILayout.Button("-", GUILayout.Width(28))) cameraMoveSpeed = Mathf.Max(0.05f, cameraMoveSpeed - 0.1f);
            if (GUILayout.Button("+", GUILayout.Width(28))) cameraMoveSpeed = Mathf.Min(2.5f, cameraMoveSpeed + 0.1f);
            GUILayout.EndHorizontal();
            cameraMoveSpeed = GUILayout.HorizontalSlider(cameraMoveSpeed, 0.05f, 2.5f);
            GUILayout.Label("<size=10><color=#999999>Shift: 2x Vel. | R: Reset | +/-: Ajuste</color></size>");

            GUILayout.EndArea();
        }
    }
}
