// GLSL ES 3.00 sources. Kept in one place so the lighting model is defined
// exactly once - the shadow pass and the scene pass must agree on how an
// instance's model matrix is built or shadows detach from their objects.

export const MAX_LIGHTS = 16;

// Instance layout, shared by both passes:
//   2 iPos (vec3)  3 iSize (vec3)  4 iRot (vec3 yaw/pitch/roll)
//   5 iColor (vec3)  6 iParams (vec4)
// Map props only ever use yaw; the chameleon needs all three to splay its legs
// and curl its tail, so the rotation is a full YXZ euler triple.
const INSTANCE_ATTRS = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec3 iPos;
layout(location = 3) in vec3 iSize;
layout(location = 4) in vec3 iRot;
layout(location = 5) in vec3 iColor;
layout(location = 6) in vec4 iParams;

mat3 rotation(vec3 r) {
  float cy = cos(r.x), sy = sin(r.x);
  float cp = cos(r.y), sp = sin(r.y);
  float cr = cos(r.z), sr = sin(r.z);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 rz = mat3(cr, sr, 0.0, -sr, cr, 0.0, 0.0, 0.0, 1.0);
  return ry * rx * rz;
}

void modelSpace(out vec3 world, out vec3 normal) {
  mat3 rot = rotation(iRot);
  world = rot * (aPos * iSize) + iPos;
  normal = normalize(rot * (aNrm / max(iSize, vec3(1e-4))));
}
`;

export const SCENE_VS = `#version 300 es
precision highp float;
${INSTANCE_ATTRS}

uniform mat4 uViewProj;
uniform mat4 uSunMatrix;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec4 vParams;
out vec4 vSunPos;

void main() {
  vec3 world, normal;
  modelSpace(world, normal);
  vWorld = world;
  vNormal = normal;
  vColor = iColor;
  vParams = iParams;
  vSunPos = uSunMatrix * vec4(world, 1.0);
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const SCENE_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;

in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec4 vParams;
in vec4 vSunPos;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uSkyColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uExposure;
uniform float uTime;

uniform int uLightCount;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];

// Hunter torch in blackout mode: xyz position, w cos(cone angle)
uniform vec4 uTorch;
uniform vec3 uTorchDir;
uniform vec3 uTorchColor;

uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;

out vec4 fragColor;

float shadowFactor(vec3 normal) {
  vec3 proj = vSunPos.xyz / vSunPos.w;
  if (any(lessThan(proj.xy, vec2(0.0))) || any(greaterThan(proj.xy, vec2(1.0))) || proj.z > 1.0) {
    return 1.0;
  }
  float ndl = max(dot(normal, -uSunDir), 0.0);
  float bias = mix(0.0035, 0.0008, ndl);
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uShadowTexel;
      sum += texture(uShadowMap, vec3(proj.xy + off, proj.z - bias));
    }
  }
  return sum / 9.0;
}

vec3 tonemap(vec3 c) {
  // Cheap ACES-ish curve: keeps neon and paint from blowing out to white.
  const float a = 2.51, b = 0.03, cc = 2.43, d = 0.59, e = 0.14;
  return clamp((c * (a * c + b)) / (c * (cc * c + d) + e), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(uCamPos - vWorld);
  float rough = clamp(vParams.x, 0.04, 1.0);
  float metal = clamp(vParams.y, 0.0, 1.0);
  float emissive = vParams.z;
  float alpha = clamp(vParams.w, 0.0, 1.0);

  vec3 albedo = vColor;
  vec3 spec = mix(vec3(0.04), albedo, metal);
  vec3 diffuse = albedo * (1.0 - metal);

  // Hemispheric ambient: sky above, a bounced tint of the surface below.
  // Linear in uAmbient on purpose - squaring it (which is easy to do by
  // accident here) turns a deliberately dim map into a black one.
  float up = n.y * 0.5 + 0.5;
  vec3 ambient = mix(uAmbient * 0.8, uSkyColor * 0.6 + uAmbient * 0.7, up);
  vec3 color = diffuse * ambient;

  // Sun
  float ndl = max(dot(n, -uSunDir), 0.0);
  if (ndl > 0.0) {
    float sh = shadowFactor(n);
    vec3 h = normalize(-uSunDir + viewDir);
    float sp = pow(max(dot(n, h), 0.0), mix(128.0, 8.0, rough)) * (1.0 - rough) * 0.7;
    color += (diffuse * ndl + spec * sp) * uSunColor * sh;
  }

  // Point lights
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i] - vWorld;
    float dist = length(toLight);
    if (dist > uLightRange[i]) continue;
    vec3 ld = toLight / max(dist, 0.001);
    float atten = 1.0 - dist / uLightRange[i];
    atten *= atten;
    float d = max(dot(n, ld), 0.0);
    vec3 h = normalize(ld + viewDir);
    float sp = pow(max(dot(n, h), 0.0), mix(96.0, 6.0, rough)) * (1.0 - rough) * 0.5;
    color += (diffuse * d + spec * sp) * uLightColor[i] * atten;
  }

  // Torch cone
  if (uTorch.w > 0.0) {
    vec3 toTorch = uTorch.xyz - vWorld;
    float dist = length(toTorch);
    vec3 ld = toTorch / max(dist, 0.001);
    float cone = dot(-ld, normalize(uTorchDir));
    if (cone > uTorch.w) {
      float edge = smoothstep(uTorch.w, uTorch.w * 0.55 + 0.45, cone);
      float atten = edge / (1.0 + dist * dist * 0.02);
      color += diffuse * max(dot(n, ld), 0.0) * uTorchColor * atten * 2.2;
    }
  }

  color += albedo * emissive;

  // Distance fog, thickened slightly toward the horizon.
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist * dist * uFogDensity * uFogDensity);
  color = mix(color, uFogColor, clamp(fog, 0.0, 0.92));

  fragColor = vec4(tonemap(color * uExposure), alpha);
}
`;

export const SHADOW_VS = `#version 300 es
precision highp float;
${INSTANCE_ATTRS}
uniform mat4 uSunMatrix;
void main() {
  vec3 world, normal;
  modelSpace(world, normal);
  gl_Position = uSunMatrix * vec4(world, 1.0);
}
`;

export const SHADOW_FS = `#version 300 es
precision highp float;
void main() {}
`;

// Fullscreen sky. Drawn first with depth writes off.
export const SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.999, 1.0);
}
`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform float uHorizon;
out vec4 fragColor;
void main() {
  float t = smoothstep(0.0, 1.0, (vUv.y - uHorizon) / max(1.0 - uHorizon, 0.001));
  vec3 c = mix(uSkyBottom, uSkyTop, clamp(t, 0.0, 1.0));
  fragColor = vec4(c, 1.0);
}
`;

// Screen-space overlays: reveal pings, hit markers, name tags anchored in 3D.
export const SPRITE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 2) in vec3 iPos;
layout(location = 3) in vec3 iSize;
layout(location = 5) in vec3 iColor;
layout(location = 6) in vec4 iParams;
uniform mat4 uViewProj;
uniform vec3 uRight;
uniform vec3 uUp;
out vec2 vUv;
out vec3 vColor;
out vec4 vParams;
void main() {
  vUv = aCorner;
  vColor = iColor;
  vParams = iParams;
  vec3 world = iPos + uRight * (aCorner.x * iSize.x) + uUp * (aCorner.y * iSize.y);
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vColor;
in vec4 vParams;
out vec4 fragColor;
void main() {
  float d = length(vUv);
  // params.z picks the shape: 0 soft dot, 1 ring, 2 crosshair tick
  float a;
  if (vParams.z < 0.5) a = smoothstep(1.0, 0.25, d);
  else if (vParams.z < 1.5) a = smoothstep(1.0, 0.86, d) * smoothstep(0.6, 0.75, d);
  else a = step(abs(vUv.x), 0.16) + step(abs(vUv.y), 0.16);
  a *= vParams.w;
  if (a < 0.01) discard;
  fragColor = vec4(vColor, clamp(a, 0.0, 1.0));
}
`;
