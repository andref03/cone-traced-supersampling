#ifndef SDF_TRANSPARENCY_H
#define SDF_TRANSPARENCY_H

#include "primitives.cginc"

// Material ID constants for transparency
#define ID_FLOOR 0.0
#define ID_OPAQUE_RED_SPHERE 15.0
#define ID_OPAQUE_GOLD_TORUS 25.0
#define ID_OPAQUE_BLUE_BOX 35.0

#define ID_TRANSPARENT_SPHERE 101.0
#define ID_TRANSPARENT_BOX 102.0

bool isTransparentObj(float id)
{
    return (id >= 100.0 && id <= 110.0);
}

float2 sdf_opaque(in float3 p)
{
    float2 res = float2(1e10, 0.0);

    // 1. Piso xadrez (Opaco)
    res = opU(res, float2(sdPlane(p, 0.0), ID_FLOOR));

    // 2. Objetos opacos posicionados ATRÁS dos vidros para validação de transparência
    // Esfera vermelha (visível através da caixa âmbar)
    float dRedSphere = sdSphere(p - float3(-0.55, 0.42, 0.85), 0.35);
    res = opU(res, float2(dRedSphere, ID_OPAQUE_RED_SPHERE));

    // Toro dourado (visível através da esfera ciano)
    float dGoldTorus = sdTorus((p - float3(0.55, 0.40, 0.85)).xzy, float2(0.28, 0.08));
    res = opU(res, float2(dGoldTorus, ID_OPAQUE_GOLD_TORUS));

    // Pilar azul alto no vão central entre os dois vidros
    float dBlueBox = sdBox(p - float3(0.0, 0.55, 1.05), float3(0.18, 0.55, 0.18));
    res = opU(res, float2(dBlueBox, ID_OPAQUE_BLUE_BOX));

    return res;
}

float2 sdf_transparent(in float3 p)
{
    float2 res = float2(1e10, 0.0);

    // Caixa de vidro âmbar / laranja (à esquerda, sem intersecção)
    float dGlassBox = sdBox(p - float3(-0.55, 0.40, 0.0), float3(0.25, 0.38, 0.25));
    res = opU(res, float2(dGlassBox, ID_TRANSPARENT_BOX));

    // Esfera de vidro ciano (à direita, sem intersecção)
    float dGlassSphere = sdSphere(p - float3(0.55, 0.42, 0.0), 0.38);
    res = opU(res, float2(dGlassSphere, ID_TRANSPARENT_SPHERE));

    return res;
}

float2 sdf(in float3 p)
{
    return opU(sdf_opaque(p), sdf_transparent(p));
}

#endif
