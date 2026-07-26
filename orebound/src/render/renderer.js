// WebGL2 renderer.
//
// Passes, in order: procedural sky -> opaque terrain (alpha-tested) -> entities
// -> translucent terrain (water, back-to-front) -> block selection + crack
// overlay -> particles. Terrain is drawn one VAO per 16^3 sub-chunk so frustum
// culling has something useful to reject.

import { mat4, identity, perspective, lookAt, multiply, invert, frustumPlanes, aabbInFrustum } from '../core/math.js';
import { WORLD, CONFIG } from '../core/config.js';
import { STRIDE } from './mesher.js';

const TERRAIN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in uint a_layer;
layout(location=3) in uvec4 a_light;
layout(location=4) in vec4 a_tint;

uniform mat4 u_viewProj;
uniform vec3 u_chunkPos;
uniform vec3 u_camPos;
uniform float u_dayLight;
uniform float u_time;

out vec2 v_uv;
flat out uint v_layer;
out vec3 v_tint;
out float v_shade;
out float v_dist;
out float v_alphaMul;

const float SHADE[6] = float[6](0.74, 0.74, 0.55, 1.0, 0.87, 0.87);

void main() {
  vec3 world = a_pos + u_chunkPos;
  // gentle sway for cross-rendered foliage; only the upper vertices move
  if (a_tint.a > 0.5 && a_uv.y < 0.5) {
    world.x += sin(u_time * 1.6 + world.x * 0.8 + world.z * 1.1) * 0.055;
    world.z += cos(u_time * 1.3 + world.x * 1.2 + world.z * 0.7) * 0.045;
  }
  gl_Position = u_viewProj * vec4(world, 1.0);
  v_uv = a_uv;
  v_layer = a_layer;
  v_tint = a_tint.rgb;

  float sky = float(a_light.x) / 15.0;
  float blk = float(a_light.y) / 15.0;
  float ao = 0.52 + float(a_light.z) / 3.0 * 0.48;
  float lum = max(sky * u_dayLight, blk * (1.0 - 0.25 * blk) + blk * 0.25);
  lum = lum * lum * 0.82 + lum * 0.14 + 0.035;
  v_shade = SHADE[a_light.w] * ao * lum;
  v_dist = distance(world, u_camPos);
  v_alphaMul = 1.0;
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 v_uv;
flat in uint v_layer;
in vec3 v_tint;
in float v_shade;
in float v_dist;
in float v_alphaMul;

uniform sampler2DArray u_tex;
uniform sampler2DArray u_mask;
uniform vec3 u_fogColor;
uniform float u_fogStart;
uniform float u_fogEnd;
uniform float u_alphaTest;

out vec4 frag;

void main() {
  vec4 t = texture(u_tex, vec3(v_uv, float(v_layer)));
  if (t.a < u_alphaTest) discard;
  float m = texture(u_mask, vec3(v_uv, float(v_layer))).r;
  vec3 col = t.rgb * mix(vec3(1.0), v_tint, m);
  col *= v_shade;
  float f = smoothstep(u_fogStart, u_fogEnd, v_dist);
  col = mix(col, u_fogColor, f);
  frag = vec4(col, t.a * v_alphaMul);
}`;

const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
uniform mat4 u_invViewProj;
out vec3 v_dir;
void main() {
  gl_Position = vec4(a_pos, 0.9999, 1.0);
  vec4 near = u_invViewProj * vec4(a_pos, -1.0, 1.0);
  vec4 far  = u_invViewProj * vec4(a_pos,  1.0, 1.0);
  v_dir = normalize(far.xyz / far.w - near.xyz / near.w);
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec3 v_dir;
uniform vec3 u_skyTop;
uniform vec3 u_skyHorizon;
uniform vec3 u_fogColor;
uniform vec3 u_sunDir;
uniform float u_dayLight;
uniform float u_time;
uniform float u_rain;
out vec4 frag;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(v_dir);
  float h = clamp(d.y * 1.35 + 0.12, 0.0, 1.0);
  vec3 col = mix(u_skyHorizon, u_skyTop, pow(h, 0.72));

  // stars fade in as the sun sets
  float night = clamp(1.0 - u_dayLight * 1.6, 0.0, 1.0);
  if (d.y > 0.0 && night > 0.01) {
    vec2 sp = d.xz / max(d.y, 0.08) * 3.0;
    float st = hash(floor(sp * 22.0));
    float twinkle = 0.6 + 0.4 * sin(u_time * 2.3 + st * 40.0);
    if (st > 0.9965) col += vec3(0.9, 0.93, 1.0) * night * twinkle * 1.4;
  }

  // sun and moon discs
  float sd = dot(d, u_sunDir);
  col += vec3(1.0, 0.93, 0.75) * smoothstep(0.9985, 0.9995, sd) * 2.2;
  col += vec3(1.0, 0.85, 0.6) * pow(max(sd, 0.0), 32.0) * 0.35 * u_dayLight;
  float md = dot(d, -u_sunDir);
  col += vec3(0.85, 0.88, 1.0) * smoothstep(0.9988, 0.9996, md) * 1.6 * night;

  // a slow cloud sheet, intersected analytically with a plane above the world
  if (d.y > 0.02) {
    vec2 cp = d.xz / d.y * 0.55 + vec2(u_time * 0.012, u_time * 0.004);
    float c = fbm(cp * 1.6);
    float cover = mix(0.56, 0.30, u_rain);
    float cl = smoothstep(cover, cover + 0.20, c) * smoothstep(0.02, 0.22, d.y);
    vec3 cloudCol = mix(vec3(1.0), vec3(0.55, 0.57, 0.62), u_rain) * (0.35 + 0.65 * u_dayLight);
    col = mix(col, cloudCol, cl * 0.85);
  }

  // horizon haze ties the sky to the terrain fog
  col = mix(col, u_fogColor, smoothstep(0.10, -0.05, d.y));
  frag = vec4(col, 1.0);
}`;

const FLAT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_color;
uniform mat4 u_viewProj;
out vec4 v_color;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); v_color = a_color; }`;

const FLAT_FS = `#version 300 es
precision highp float;
in vec4 v_color;
uniform vec3 u_fogColor;
out vec4 frag;
void main() { frag = v_color; }`;

const OVERLAY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_viewProj;
out vec2 v_uv;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); v_uv = a_uv; }`;

const OVERLAY_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
uniform sampler2DArray u_tex;
uniform float u_layer;
out vec4 frag;
void main() {
  vec4 t = texture(u_tex, vec3(v_uv, u_layer));
  if (t.a < 0.05) discard;
  frag = vec4(0.0, 0.0, 0.0, t.a * 0.72);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', desynchronized: true,
    });
    if (!gl) throw new Error('WebGL2 is required and is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;

    this.terrain = program(gl, TERRAIN_VS, TERRAIN_FS);
    this.sky = program(gl, SKY_VS, SKY_FS);
    this.flat = program(gl, FLAT_VS, FLAT_FS);
    this.overlay = program(gl, OVERLAY_VS, OVERLAY_FS);

    this.viewProj = mat4();
    this.view = mat4();
    this.proj = mat4();
    this.invViewProj = mat4();
    this.planes = new Float32Array(24);

    // fullscreen triangle for the sky
    this.skyVAO = gl.createVertexArray();
    gl.bindVertexArray(this.skyVAO);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.dynVAO = gl.createVertexArray();
    this.dynBuf = gl.createBuffer();
    gl.bindVertexArray(this.dynVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this.dynData = new Float32Array(7 * 6 * 4096);
    this.dynCount = 0;

    this.ovVAO = gl.createVertexArray();
    this.ovBuf = gl.createBuffer();
    gl.bindVertexArray(this.ovVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ovBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    this.ovData = new Float32Array(5 * 6 * 6 * 4);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.5, 0.7, 1.0, 1);

    this.stats = { drawCalls: 0, sections: 0, triangles: 0 };
    this.meshCount = 0;
  }

  uploadAtlas(atlas) {
    const gl = this.gl;
    const { layers, data, mask } = atlas;
    this.atlas = atlas;

    this.texArray = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      const max = Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }

    this.maskArray = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskArray);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, 16, 16, layers, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * CONFIG.renderScale;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / Math.max(1, h);
  }

  // ------------------------------------------------------------ mesh buffers
  createMesh(data) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, true, STRIDE, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_SHORT, STRIDE, 14);
    gl.enableVertexAttribArray(3); gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, STRIDE, 16);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.meshCount++;
    return { vao, vb, ib, count: data.count };
  }

  freeMesh(handle) {
    if (!handle) return;
    const gl = this.gl;
    if (handle.opaque) { this.freeMesh(handle.opaque); handle.opaque = null; }
    if (handle.translucent) { this.freeMesh(handle.translucent); handle.translucent = null; }
    if (handle.vao) {
      gl.deleteVertexArray(handle.vao);
      gl.deleteBuffer(handle.vb);
      gl.deleteBuffer(handle.ib);
      handle.vao = null;
      this.meshCount--;
    }
  }

  // ----------------------------------------------------------------- drawing
  setCamera(pos, yaw, pitch, fovDeg) {
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    const dir = [Math.sin(yaw) * cy, sy, -Math.cos(yaw) * cy];
    const target = [pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2]];
    perspective(this.proj, fovDeg * Math.PI / 180, this.aspect, 0.06, 1200);
    lookAt(this.view, pos, target, [0, 1, 0]);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);
    frustumPlanes(this.planes, this.viewProj);
    this.camPos = pos;
    this.camDir = dir;
  }

  drawSky(env) {
    const gl = this.gl;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    const { p, u } = this.sky;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.u_invViewProj, false, this.invViewProj);
    gl.uniform3fv(u.u_skyTop, env.skyTop);
    gl.uniform3fv(u.u_skyHorizon, env.skyHorizon);
    gl.uniform3fv(u.u_fogColor, env.fogColor);
    gl.uniform3fv(u.u_sunDir, env.sunDir);
    gl.uniform1f(u.u_dayLight, env.dayLight);
    gl.uniform1f(u.u_time, env.time);
    gl.uniform1f(u.u_rain, env.rain);
    gl.bindVertexArray(this.skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  beginFrame(env) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.stats.drawCalls = 0; this.stats.sections = 0; this.stats.triangles = 0;
    this.drawSky(env);
  }

  /** @param {Array} list of { mesh, ox, oy, oz, dist } */
  drawTerrain(list, env, translucent) {
    const gl = this.gl;
    const { p, u } = this.terrain;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskArray);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform1i(u.u_mask, 1);
    gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
    gl.uniform3fv(u.u_camPos, this.camPos);
    gl.uniform1f(u.u_dayLight, env.dayLight);
    gl.uniform1f(u.u_time, env.time);
    gl.uniform3fv(u.u_fogColor, env.fogColor);
    gl.uniform1f(u.u_fogStart, env.fogStart);
    gl.uniform1f(u.u_fogEnd, env.fogEnd);
    gl.uniform1f(u.u_alphaTest, translucent ? 0.02 : 0.35);

    if (translucent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true);
    } else {
      gl.disable(gl.BLEND);
    }

    for (const e of list) {
      gl.uniform3f(u.u_chunkPos, e.ox, e.oy, e.oz);
      gl.bindVertexArray(e.mesh.vao);
      gl.drawElements(gl.TRIANGLES, e.mesh.count, gl.UNSIGNED_INT, 0);
      this.stats.drawCalls++;
      this.stats.triangles += e.mesh.count / 3;
    }
    gl.bindVertexArray(null);
    if (translucent) gl.disable(gl.BLEND);
  }

  // ---------------------------------------------------- immediate-mode boxes
  beginDyn() { this.dynCount = 0; }
  pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b, a) {
    if (this.dynCount + 3 > this.dynData.length / 7) return;
    const d = this.dynData;
    let o = this.dynCount * 7;
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a; o += 7;
    d[o] = bx; d[o + 1] = by; d[o + 2] = bz; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a; o += 7;
    d[o] = cx; d[o + 1] = cy; d[o + 2] = cz; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a;
    this.dynCount += 3;
  }
  pushQuad(v0, v1, v2, v3, r, g, b, a) {
    this.pushTri(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], r, g, b, a);
    this.pushTri(v0[0], v0[1], v0[2], v2[0], v2[1], v2[2], v3[0], v3[1], v3[2], r, g, b, a);
  }
  /** Axis-aligned box, optionally rotated about Y around (cx,cz). */
  pushBox(x0, y0, z0, x1, y1, z1, color, light, yaw, px, pz) {
    const shades = [0.74, 0.74, 0.58, 1.0, 0.87, 0.87];
    const r0 = (color >> 16 & 255) / 255, g0 = (color >> 8 & 255) / 255, b0 = (color & 255) / 255;
    const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
    const T = (x, y, z) => {
      if (!yaw) return [x, y, z];
      const dx = x - px, dz = z - pz;
      return [px + dx * cs - dz * sn, y, pz + dx * sn + dz * cs];
    };
    const c = [
      T(x0, y0, z0), T(x1, y0, z0), T(x1, y0, z1), T(x0, y0, z1),
      T(x0, y1, z0), T(x1, y1, z0), T(x1, y1, z1), T(x0, y1, z1),
    ];
    const faces = [
      [c[0], c[3], c[7], c[4], 0], [c[2], c[1], c[5], c[6], 1],
      [c[0], c[1], c[2], c[3], 2], [c[7], c[6], c[5], c[4], 3],
      [c[1], c[0], c[4], c[5], 4], [c[3], c[2], c[6], c[7], 5],
    ];
    for (const f of faces) {
      const s = shades[f[4]] * light;
      this.pushQuad(f[0], f[1], f[2], f[3], r0 * s, g0 * s, b0 * s, 1);
    }
  }
  flushDyn(blend) {
    if (this.dynCount === 0) return;
    const gl = this.gl;
    const { p, u } = this.flat;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
    gl.bindVertexArray(this.dynVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dynData.subarray(0, this.dynCount * 7), gl.DYNAMIC_DRAW);
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    gl.drawArrays(gl.TRIANGLES, 0, this.dynCount);
    if (blend) gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
    this.dynCount = 0;
  }

  /** Wireframe selection box. */
  drawSelection(x, y, z, boxes) {
    const gl = this.gl;
    this.beginDyn();
    const t = 0.006, e = 0.002;
    for (const b of boxes) {
      const x0 = x + b[0] - e, y0 = y + b[1] - e, z0 = z + b[2] - e;
      const x1 = x + b[3] + e, y1 = y + b[4] + e, z1 = z + b[5] + e;
      const edges = [
        [x0, y0, z0, x1, y0, z0], [x0, y0, z1, x1, y0, z1], [x0, y1, z0, x1, y1, z0], [x0, y1, z1, x1, y1, z1],
        [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x0, y0, z1, x0, y1, z1], [x1, y0, z1, x1, y1, z1],
        [x0, y0, z0, x0, y0, z1], [x1, y0, z0, x1, y0, z1], [x0, y1, z0, x0, y1, z1], [x1, y1, z0, x1, y1, z1],
      ];
      for (const ed of edges) {
        const [ax, ay, az, bx, by, bz] = ed;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        // expand the line into a thin box so it survives without line width support
        const ox = dx === 0 ? t : 0, oy = dy === 0 ? t : 0, oz = dz === 0 ? t : 0;
        this.pushBox(Math.min(ax, bx) - ox, Math.min(ay, by) - oy, Math.min(az, bz) - oz,
          Math.max(ax, bx) + ox, Math.max(ay, by) + oy, Math.max(az, bz) + oz, 0x000000, 1, 0, 0, 0);
      }
    }
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -2);
    this.flushDyn(false);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  /**
   * 10-stage crack overlay on the block being mined.
   *
   * `progress` (0..1) also drives a small strain pulse: the overlay swells and
   * shudders slightly as the block nears failure. It is the overlay that moves,
   * not the block -- the block itself lives in a static chunk mesh -- but at
   * these amplitudes it reads as the block straining under the tool.
   */
  drawCrack(x, y, z, stage, boxes, progress = 0, time = 0) {
    if (stage < 0) return;
    const gl = this.gl;
    const layer = this.atlas.layerOf.get('crack_' + Math.min(9, stage));
    if (layer === undefined) return;
    const strain = progress * progress;
    const swell = 0.004 + strain * 0.02;
    const shudder = strain * 0.012;
    const jx = Math.sin(time * 47) * shudder;
    const jy = Math.sin(time * 41 + 1.7) * shudder;
    const jz = Math.cos(time * 53 + 0.9) * shudder;
    let n = 0;
    const D = this.ovData;
    const push = (px, py, pz, u, v) => {
      D[n++] = px; D[n++] = py; D[n++] = pz; D[n++] = u; D[n++] = v;
    };
    const FV = [
      [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]],
      [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]],
      [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
      [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
      [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
      [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]],
    ];
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const eps = swell;
    for (const b of boxes) {
      for (let f = 0; f < 6; f++) {
        const vs = FV[f];
        const pts = vs.map(cv => [
          x + jx + (cv[0] ? b[3] : b[0]) + (cv[0] ? eps : -eps),
          y + jy + (cv[1] ? b[4] : b[1]) + (cv[1] ? eps : -eps),
          z + jz + (cv[2] ? b[5] : b[2]) + (cv[2] ? eps : -eps),
        ]);
        if (n + 30 > D.length) break;
        push(pts[0][0], pts[0][1], pts[0][2], UV[0][0], UV[0][1]);
        push(pts[1][0], pts[1][1], pts[1][2], UV[1][0], UV[1][1]);
        push(pts[2][0], pts[2][1], pts[2][2], UV[2][0], UV[2][1]);
        push(pts[0][0], pts[0][1], pts[0][2], UV[0][0], UV[0][1]);
        push(pts[2][0], pts[2][1], pts[2][2], UV[2][0], UV[2][1]);
        push(pts[3][0], pts[3][1], pts[3][2], UV[3][0], UV[3][1]);
      }
    }
    if (n === 0) return;
    const { p, u } = this.overlay;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform1f(u.u_layer, layer);
    gl.bindVertexArray(this.ovVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ovBuf);
    gl.bufferData(gl.ARRAY_BUFFER, D.subarray(0, n), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-3, -3);
    gl.drawArrays(gl.TRIANGLES, 0, n / 5);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
  }

  visible(ox, oy, oz) {
    return aabbInFrustum(this.planes, ox, oy, oz, ox + 16, oy + 16, oz + 16);
  }

  /** Wipe depth so the view model can never be clipped by nearby geometry. */
  clearDepth() {
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
  }

  // ------------------------------------------- textured view-model geometry
  // Same vertex layout as terrain, but built per frame in world space, so the
  // block in the player's hand samples the real texture array.
  beginViewGeo() {
    if (!this.viewGeo) {
      const cap = 256;
      const buf = new ArrayBuffer(cap * STRIDE);
      this.viewGeo = {
        cap, buf, f32: new Float32Array(buf), u8: new Uint8Array(buf), u16: new Uint16Array(buf),
        n: 0, idx: new Uint32Array(cap * 3 / 2 | 0), ni: 0,
      };
      const gl = this.gl;
      this.viewVAO = gl.createVertexArray();
      this.viewVB = gl.createBuffer();
      this.viewIB = gl.createBuffer();
      gl.bindVertexArray(this.viewVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.viewVB);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, true, STRIDE, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_SHORT, STRIDE, 14);
      gl.enableVertexAttribArray(3); gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, STRIDE, 16);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.viewIB);
      gl.bindVertexArray(null);
    }
    this.viewGeo.n = 0;
    this.viewGeo.ni = 0;
  }

  pushViewQuad(p0, p1, p2, p3, layer, light, normal, tint) {
    const V = this.viewGeo;
    if (V.n + 4 > V.cap) return;
    const l = Math.max(0, Math.min(15, Math.round(light * 15)));
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    const uv = [[0, 0], [255, 0], [255, 255], [0, 255]];
    const pts = [p0, p1, p2, p3];
    for (let i = 0; i < 4; i++) {
      const o = V.n * STRIDE, fo = o >> 2;
      V.f32[fo] = pts[i][0]; V.f32[fo + 1] = pts[i][1]; V.f32[fo + 2] = pts[i][2];
      V.u8[o + 12] = uv[i][0]; V.u8[o + 13] = uv[i][1];
      V.u16[(o >> 1) + 7] = layer;
      // hand geometry is lit uniformly: it is not part of the world grid
      V.u8[o + 16] = l; V.u8[o + 17] = l; V.u8[o + 18] = 3; V.u8[o + 19] = normal;
      V.u8[o + 20] = tr; V.u8[o + 21] = tg; V.u8[o + 22] = tb; V.u8[o + 23] = 0;
      V.n++;
    }
    const b = V.n - 4;
    V.idx[V.ni++] = b; V.idx[V.ni++] = b + 1; V.idx[V.ni++] = b + 2;
    V.idx[V.ni++] = b; V.idx[V.ni++] = b + 2; V.idx[V.ni++] = b + 3;
  }

  flushViewGeo(env) {
    const V = this.viewGeo;
    if (!V || V.ni === 0) return;
    const gl = this.gl;
    const { p, u } = this.terrain;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskArray);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform1i(u.u_mask, 1);
    gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
    gl.uniform3fv(u.u_camPos, this.camPos);
    gl.uniform1f(u.u_dayLight, 1.0);
    gl.uniform1f(u.u_time, env.time);
    gl.uniform3fv(u.u_fogColor, env.fogColor);
    // fog must not touch the hand: it is centimetres from the camera
    gl.uniform1f(u.u_fogStart, 1e9);
    gl.uniform1f(u.u_fogEnd, 1e9 + 1);
    gl.uniform1f(u.u_alphaTest, 0.35);
    gl.uniform3f(u.u_chunkPos, 0, 0, 0);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.viewVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.viewVB);
    gl.bufferData(gl.ARRAY_BUFFER, V.u8.subarray(0, V.n * STRIDE), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.viewIB);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, V.idx.subarray(0, V.ni), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, V.ni, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
    V.ni = 0; V.n = 0;
  }
}
