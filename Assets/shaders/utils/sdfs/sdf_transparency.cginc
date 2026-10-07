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

    // 1. Checkerboard Floor (Opaque)
    res = opU(res, float2(sdPlane(p, 0.0), ID_FLOOR));

    // 2. Background Opaque Objects (positioned behind the transparent objects)
    // Red Sphere
    float dRedSphere = sdSphere(p - float3(-0.35, 0.45, 0.7), 0.35);
    res = opU(res, float2(dRedSphere, ID_OPAQUE_RED_SPHERE));

    // Gold Torus
    float dGoldTorus = sdTorus((p - float3(0.45, 0.35, 0.6)).xzy, float2(0.28, 0.08));
    res = opU(res, float2(dGoldTorus, ID_OPAQUE_GOLD_TORUS));

    // Blue Pillar/Box
    float dBlueBox = sdBox(p - float3(0.05, 0.5, 1.3), float3(0.2, 0.5, 0.2));
    res = opU(res, float2(dBlueBox, ID_OPAQUE_BLUE_BOX));

    return res;
}

float2 sdf_transparent(in float3 p)
{
    float2 res = float2(1e10, 0.0);

    // Glass Sphere (Cyan tint, ID = 101.0)
    float dGlassSphere = sdSphere(p - float3(-0.15, 0.42, -0.05), 0.40);
    res = opU(res, float2(dGlassSphere, ID_TRANSPARENT_SPHERE));

    // Glass Box / Cube (Amber tint, ID = 102.0)
    float dGlassBox = sdBox(p - float3(0.32, 0.35, -0.15), float3(0.22, 0.32, 0.22));
    res = opU(res, float2(dGlassBox, ID_TRANSPARENT_BOX));

    return res;
}

float2 sdf(in float3 p)
{
    return opU(sdf_opaque(p), sdf_transparent(p));
}

#endif
