#ifndef SDF_TRANSPARENCY_LAYERS_H
#define SDF_TRANSPARENCY_LAYERS_H

#include "primitives.cginc"

// Material ID constants for transparency layers
#define ID_FLOOR 0.0
#define ID_OPAQUE_RED_SPHERE 15.0
#define ID_OPAQUE_GOLD_TORUS 25.0
#define ID_OPAQUE_BLUE_BOX 35.0

#define ID_TRANSPARENT_SPHERE 101.0 // Camada 2: Vidro Ciano
#define ID_TRANSPARENT_BOX 102.0    // Camada 1: Vidro Âmbar

bool isTransparentObj(float id)
{
    return (id >= 100.0 && id <= 110.0);
}

// 1. Piso e objetos opacos de fundo (camada 3 / fundo)
float2 sdf_opaque(in float3 p)
{
    float2 res = float2(1e10, 0.0);

    // Piso xadrez
    res = opU(res, float2(sdPlane(p, 0.0), ID_FLOOR));

    // Esfera vermelha (à esquerda, atrás do Vidro 1 sozinho)
    float dRedSphere = sdSphere(p - float3(-0.42, 0.42, 1.15), 0.35);
    res = opU(res, float2(dRedSphere, ID_OPAQUE_RED_SPHERE));

    // Toro dourado (ao centro, diretamente atrás da SOBREPOSIÇÃO das 2 camadas de vidro!)
    float dGoldTorus = sdTorus((p - float3(0.0, 0.42, 1.15)).xzy, float2(0.28, 0.09));
    res = opU(res, float2(dGoldTorus, ID_OPAQUE_GOLD_TORUS));

    // Pilar azul alto (à direita, atrás do Vidro 2 sozinho)
    float dBlueBox = sdBox(p - float3(0.45, 0.52, 1.15), float3(0.18, 0.52, 0.18));
    res = opU(res, float2(dBlueBox, ID_OPAQUE_BLUE_BOX));

    return res;
}

// 2. Camada 1 de transparência (Frente): Caixa/Painel de Vidro Âmbar
// Z em torno de -0.05, cobrindo de X = -0.55 até X = +0.15
float2 sdf_trans1(in float3 p)
{
    float dBox = sdBox(p - float3(-0.20, 0.40, -0.05), float3(0.35, 0.38, 0.08));
    return float2(dBox, ID_TRANSPARENT_BOX);
}

// 3. Camada 2 de transparência (Meio): Esfera de Vidro Ciano
// Z em torno de +0.45, cobrindo de X = -0.18 até X = +0.58
// Faixa de X entre -0.18 e +0.15 é a SOBREPOSIÇÃO DE 2 CAMADAS TRANSPARENTES!
float2 sdf_trans2(in float3 p)
{
    float dSphere = sdSphere(p - float3(0.20, 0.42, 0.45), 0.38);
    return float2(dSphere, ID_TRANSPARENT_SPHERE);
}

// Consulta dinâmica conforme o raio atravessa as camadas de vidro
float2 sdf_query(in float3 p, in bool hitL1, in bool hitL2)
{
    float2 res = sdf_opaque(p);
    if (!hitL1) res = opU(res, sdf_trans1(p));
    if (!hitL2) res = opU(res, sdf_trans2(p));
    return res;
}

float2 sdf_transparent(in float3 p)
{
    return opU(sdf_trans1(p), sdf_trans2(p));
}

float2 sdf(in float3 p)
{
    return sdf_query(p, false, false);
}

#endif

