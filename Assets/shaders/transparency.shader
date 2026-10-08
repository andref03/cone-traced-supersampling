Shader "Unlit/transparency"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _MousePos ("MousePos", Vector) = (0.,0.,0.,0.)
        
        _AA_FACTOR ("AA factor N for NxN grid (supported 1x1, 2x2, 3x3)", Int) = 1
        _MAX_RAYMARCH_STEPS ("Sphere Tracing Max Steps", Int) = 2048

        [Toggle] _CAMERA_STATIC("Static camera", Float) = 1
        _CAMERA_SPEED ("CAMERA_SPEED", Range(0.0001, 1.0)) = 0.05
        _CAMERA_SPIN ("CAMERA_SPIN", Range(0.0001, 1.0)) = 0.025

        [Header(Transparency Settings)]
        [Toggle] _USE_TRANSPARENCY ("Enable Transparency (K-Bitmasks)", Float) = 1
        _TRANSPARENCY_K ("Transparency K Levels (2..4)", Int) = 4
        _TRANSPARENT_ALPHA_1 ("Glass Sphere Opacity (ID 101)", Range(0.05, 0.95)) = 0.45
        _TRANSPARENT_ALPHA_2 ("Glass Box Opacity (ID 102)", Range(0.05, 0.95)) = 0.55

        [Header(Subpixel Edge Resolve)]
        [Toggle] _USE_SUBPIXEL_EDGE_RESOLVE ("Use SER", Float) = 1
        _SUBPIXEL_EDGE_RESOLVE_CONE_MULT ("SER_CONE_MULT", Range(0.01, 10.0)) = 1.0
        _SUBPIXEL_EDGE_RESOLVE_CONE_MULT_COS ("SER_CONE_MULT_COS", Range(0.01, 10.0)) = 2.0
        _SUBPIXEL_EDGE_RESOLVE_COSSIM_THRESHOLD_MAX ("SER_COSSIM_THRESHOLD_MAX", Range(0.0, 1.0)) = 0.999
        _SUBPIXEL_EDGE_RESOLVE_COSSIM_THRESHOLD_MIN ("SER_COSSIM_THRESHOLD_MIN", Range(0.0, 1.0)) = 0.8
        _SUBPIXEL_EDGE_RESOLVE_CURVATURE_THRESHOLD ("SER_CURVATURE_THRESHOLD", Range(0.0, 0.01)) = 0.00001
        [Toggle] _SUBPIXEL_EDGE_RESOLVE_TWO_PLANE_INTERSECTION ("Resolve subpixel plane-plane intersection", Float) = 1
    }
    SubShader
    {
        Tags
        {
            "RenderType"="Opaque"
        }
        LOD 100

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            // vertex and fragment shaders
            #include "utils/vertex_fragment.cginc"

            #include "utils/scenes.cginc"
            #define SCENE SCENE_TRANSPARENCY

            #include "utils/shading_defs.cginc"
            #undef FOG_FALLOFF
            #define FOG_FALLOFF 0.0001
            #undef FOG_START_DISTANCE
            #define FOG_START_DISTANCE 1.

            #include "utils/render.cginc"

            // define a focal length for this scene
            #define FOCAL_LENGTH 3.5

            //------------------------------------------------------------------

            float4 _MousePos;

            float4 mainImage(in float2 pixel)
            {
                float time = 32.0 + _Time.y * 0.25;
                float t = (0.5 + 0.5 * sin(2. * 6.28 * _CAMERA_SPEED * time)) * clamp(_CAMERA_SPIN, 0., 1.);
                if (_CAMERA_STATIC)
                    t *= 0.0;

                float2 mo = _MousePos.xy + float2(0.4, 0.25);

                float3 ta = float3(0.05, 0.40, 0.35);
                float3 ro = ta + 4.2 * float3(sin(6.28 * (mo.x + t)), 0.9 * mo.y + 0.2, cos(6.28 * (mo.x + t)));

                float tan_theta = 2. * PIXEL_SIZE_MULT / _ScreenParams.y / FOCAL_LENGTH;

                // render with CTSS + SER + Transparency
                float3 col = pixelColor(pixel, ro, ta, tan_theta, FOCAL_LENGTH);

                return float4(col, 1.0);
            }

            ENDCG
        }
    }
}
