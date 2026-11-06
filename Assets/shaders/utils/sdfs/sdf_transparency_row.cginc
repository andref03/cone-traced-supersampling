#ifndef SDF_TRANSPARENCY_ROW_H
#define SDF_TRANSPARENCY_ROW_H

#include "primitives.cginc"

// Uniforms de controle de visibilidade da fileira
float _SHOW_TRANS_1;
float _SHOW_TRANS_2;
float _SHOW_TRANS_3;

// Material ID constants for transparency row
#define ID_FLOOR 0.0
#define ID_OPAQUE_RED_SPHERE 15.0
#define ID_OPAQUE_GOLD_TORUS 25.0
#define ID_OPAQUE_BLUE_BOX 35.0

#define ID_TRANSPARENT_SPHERE 101.0  // Camada 2: Vidro Ciano
#define ID_TRANSPARENT_BOX 102.0     // Camada 1: Vidro Âmbar
#define ID_TRANSPARENT_MAGENTA 103.0 // Camada 3: Vidro Magenta

bool isTransparentObj(float id)
{
    return (id >= 100.0 && id <= 110.0);
}

// 1. Piso e objetos opacos de fundo (atrás de todas as camadas de vidro)
float2 sdf_opaque(in float3 p)
{
    float2 res = float2(1e10, 0.0);

    // Piso xadrez
    res = opU(res, float2(sdPlane(p, 0.0), ID_FLOOR));

    // Toro dourado ao centro (Z = 1.55), diretamente alinhado com a fileira
    float dGoldTorus = sdTorus((p - float3(0.0, 0.42, 1.55)).xzy, float2(0.28, 0.09));
    res = opU(res, float2(dGoldTorus, ID_OPAQUE_GOLD_TORUS));

    // Esfera vermelha opaca (Z = 1.55, à esquerda)
    float dRedSphere = sdSphere(p - float3(-0.65, 0.42, 1.55), 0.35);
    res = opU(res, float2(dRedSphere, ID_OPAQUE_RED_SPHERE));

    // Pilar azul opaco (Z = 1.55, à direita)
    float dBlueBox = sdBox(p - float3(0.65, 0.52, 1.55), float3(0.18, 0.52, 0.18));
    res = opU(res, float2(dBlueBox, ID_OPAQUE_BLUE_BOX));

    return res;
}

// 2. Camada 1 de transparência (Frente, Z = -0.30): Painel de Vidro Âmbar
float2 sdf_trans1(in float3 p)
{
    float dBox = sdBox(p - float3(0.0, 0.40, -0.30), float3(0.38, 0.38, 0.08));
    return float2(dBox, ID_TRANSPARENT_BOX);
}

// 3. Camada 2 de transparência (Meio, Z = 0.30): Esfera de Vidro Ciano
float2 sdf_trans2(in float3 p)
{
    float dSphere = sdSphere(p - float3(0.0, 0.42, 0.30), 0.36);
    return float2(dSphere, ID_TRANSPARENT_SPHERE);
}

// 4. Camada 3 de transparência (Fundo, Z = 0.90): Painel Arredondado de Vidro Magenta
float2 sdf_trans3(in float3 p)
{
    float dRoundBox = sdRoundBox(p - float3(0.0, 0.40, 0.90), float3(0.35, 0.36, 0.08), 0.05);
    return float2(dRoundBox, ID_TRANSPARENT_MAGENTA);
}

// Consulta dinâmica conforme o raio atravessa as 3 camadas e respeitando visibilidade
float2 sdf_query(in float3 p, in bool hitL1, in bool hitL2, in bool hitL3)
{
    float2 res = sdf_opaque(p);
    if (!hitL1 && _SHOW_TRANS_1 > 0.5) res = opU(res, sdf_trans1(p));
    if (!hitL2 && _SHOW_TRANS_2 > 0.5) res = opU(res, sdf_trans2(p));
    if (!hitL3 && _SHOW_TRANS_3 > 0.5) res = opU(res, sdf_trans3(p));
    return res;
}

float2 sdf_transparent(in float3 p)
{
    float2 res = float2(1e10, 0.0);
    if (_SHOW_TRANS_1 > 0.5) res = opU(res, sdf_trans1(p));
    if (_SHOW_TRANS_2 > 0.5) res = opU(res, sdf_trans2(p));
    if (_SHOW_TRANS_3 > 0.5) res = opU(res, sdf_trans3(p));
    return res;
}

float2 sdf(in float3 p)
{
    return sdf_query(p, false, false, false);
}

#endif

