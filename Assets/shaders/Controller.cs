using System;
using UnityEngine;

namespace shaders
{
    public class Controller : MonoBehaviour
    {
        private Material mat;

        void Awake()
        {
            this.mat = this.GetComponent<Renderer>().material;

            this.mat.SetVector("_MousePos", new Vector4(1f, 0f, 0f, 0f));
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
        }
    }
}
