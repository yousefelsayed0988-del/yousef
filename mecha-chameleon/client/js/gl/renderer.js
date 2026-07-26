// WebGL2 forward renderer. Four instanced primitives, one directional shadow
// map, sixteen point lights and a torch cone. A 600-prop map costs four draw
// calls for the static world plus one per primitive type for everything that
// moves.

import { buildPrimitives } from './meshes.js';
import {
  SCENE_VS, SCENE_FS, SHADOW_VS, SHADOW_FS, SKY_VS, SKY_FS,
  SPRITE_VS, SPRITE_FS, MAX_LIGHTS,
} from './shaders.js';
import {
  mat4, mat4Mul, mat4Perspective, mat4Ortho, mat4LookAt, mat4Identity, clamp,
} from '../../../shared/math.js';

const FLOATS_PER_INSTANCE = 16; // pos3 size3 rot3 colour3 params4
const SHADOW_SIZE = 2048;

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`${label} shader failed: ${info}`);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc, label) {
  const prog = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, `${label} vertex`);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, `${label} fragment`);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`${label} program failed: ${info}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u: uniforms };
}

export function createRenderer(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: opts.antialias !== false,
    alpha: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const scene = link(gl, SCENE_VS, SCENE_FS, 'scene');
  const shadow = link(gl, SHADOW_VS, SHADOW_FS, 'shadow');
  const sky = link(gl, SKY_VS, SKY_FS, 'sky');
  const sprite = link(gl, SPRITE_VS, SPRITE_FS, 'sprite');

  // ------------------------------------------------------------ geometry --
  const prims = buildPrimitives().map((mesh) => {
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);

    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.STATIC_DRAW);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);

    return {
      posBuf, nrmBuf, idxBuf, count: mesh.idx.length,
      // Two instance streams: the map (uploaded once) and everything dynamic.
      staticBuf: gl.createBuffer(), staticCount: 0,
      dynBuf: gl.createBuffer(), dynData: new Float32Array(FLOATS_PER_INSTANCE * 512), dynCount: 0,
      alphaBuf: gl.createBuffer(), alphaCount: 0,
      staticVao: null, dynVao: null, alphaVao: null,
    };
  });

  function bindInstanceVao(p, instanceBuf) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, p.posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, p.nrmBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.idxBuf);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    const attr = (loc, size, offset) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(2, 3, 0);   // pos
    attr(3, 3, 3);   // size
    attr(4, 3, 6);   // rotation (yaw, pitch, roll)
    attr(5, 3, 9);   // colour
    attr(6, 4, 12);  // params
    gl.bindVertexArray(null);
    return vao;
  }

  for (const p of prims) {
    p.staticVao = bindInstanceVao(p, p.staticBuf);
    p.dynVao = bindInstanceVao(p, p.dynBuf);
    p.alphaVao = bindInstanceVao(p, p.alphaBuf);
  }

  // Fullscreen triangle for the sky.
  const skyVao = gl.createVertexArray();
  gl.bindVertexArray(skyVao);
  const skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Sprite quad.
  const spriteVao = gl.createVertexArray();
  const spriteInstBuf = gl.createBuffer();
  let spriteData = new Float32Array(FLOATS_PER_INSTANCE * 256);
  let spriteCount = 0;
  {
    gl.bindVertexArray(spriteVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteInstBuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    for (const [loc, size, off] of [[2, 3, 0], [3, 3, 3], [5, 3, 9], [6, 4, 12]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  // ----------------------------------------------------------- shadow map --
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0,
    gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // -------------------------------------------------------------- state ---
  const viewProj = mat4();
  const view = mat4();
  const proj = mat4();
  const sunRaw = mat4();
  const sunBiased = mat4();
  const biasMat = new Float32Array([
    0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1,
  ]);

  let env = {
    sky: [0.5, 0.6, 0.7], ambient: [0.35, 0.37, 0.42], sunDir: [-0.4, -0.8, -0.4],
    sunColor: [1, 0.95, 0.88], sunIntensity: 1, fogColor: [0.5, 0.6, 0.7],
    fogDensity: 0.012, exposure: 1, indoor: true,
  };
  let mapLights = [];
  let dynLights = [];
  let camera = { pos: { x: 0, y: 2, z: 0 }, yaw: 0, pitch: 0, fov: 1.2, aspect: 1 };
  let torch = null;
  let width = 1, height = 1, dpr = 1;
  let frameTime = 0;
  let mapBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50, maxY: 20 };
  const stats = { draws: 0, instances: 0 };

  const lightPos = new Float32Array(MAX_LIGHTS * 3);
  const lightColor = new Float32Array(MAX_LIGHTS * 3);
  const lightRange = new Float32Array(MAX_LIGHTS);

  function resize(w, h, ratio = 1) {
    dpr = ratio;
    width = Math.max(1, Math.floor(w * ratio));
    height = Math.max(1, Math.floor(h * ratio));
    canvas.width = width;
    canvas.height = height;
    camera.aspect = width / height;
  }

  /** Bake a map's props into the static instance streams. */
  function loadMap(mapDef) {
    env = { ...env, ...mapDef.env };
    mapBounds = mapDef.bounds;
    mapLights = (mapDef.lights || []).map((l) => ({
      p: l.p, c: [l.c[0] * l.i, l.c[1] * l.i, l.c[2] * l.i], r: l.r,
    }));

    const opaqueBuckets = prims.map(() => []);
    const alphaBuckets = prims.map(() => []);
    for (const p of mapDef.props) {
      const t = clamp(p.t | 0, 0, 3);
      // Non-opaque props (glass, water) are drawn in a second, blended pass.
      const translucent = p.opaque === false;
      const bucket = translucent ? alphaBuckets[t] : opaqueBuckets[t];
      bucket.push(
        p.p[0], p.p[1], p.p[2],
        p.s[0] * 2, p.s[1] * 2, p.s[2] * 2,
        p.yaw || 0, 0, 0,
        p.c[0], p.c[1], p.c[2],
        p.rough ?? 0.85, p.metal ?? 0, p.emis ?? 0, translucent ? 0.42 : 1,
      );
    }

    prims.forEach((prim, i) => {
      const data = new Float32Array(opaqueBuckets[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, prim.staticBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      prim.staticCount = data.length / FLOATS_PER_INSTANCE;

      const adata = new Float32Array(alphaBuckets[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, prim.alphaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, adata, gl.STATIC_DRAW);
      prim.alphaCount = adata.length / FLOATS_PER_INSTANCE;
    });
  }

  // -------------------------------------------------------------- drawing --
  function beginFrame(cam, time) {
    camera = { ...camera, ...cam };
    frameTime = time;
    for (const p of prims) p.dynCount = 0;
    spriteCount = 0;
    dynLights.length = 0;
    stats.draws = 0;
    stats.instances = 0;
  }

  /**
   * `rot` may be a plain yaw in radians, or [yaw, pitch, roll], or
   * {yaw, pitch, roll} - map props only ever need the first form.
   */
  function drawInstance(type, pos, size, rot, colour, params) {
    const p = prims[clamp(type | 0, 0, 3)];
    const need = (p.dynCount + 1) * FLOATS_PER_INSTANCE;
    if (need > p.dynData.length) {
      const grown = new Float32Array(Math.max(need, p.dynData.length * 2));
      grown.set(p.dynData);
      p.dynData = grown;
    }
    const o = p.dynCount * FLOATS_PER_INSTANCE;
    const d = p.dynData;
    d[o] = pos.x ?? pos[0]; d[o + 1] = pos.y ?? pos[1]; d[o + 2] = pos.z ?? pos[2];
    d[o + 3] = size.x ?? size[0]; d[o + 4] = size.y ?? size[1]; d[o + 5] = size.z ?? size[2];
    if (typeof rot === 'number' || rot == null) {
      d[o + 6] = rot || 0; d[o + 7] = 0; d[o + 8] = 0;
    } else {
      d[o + 6] = rot.yaw ?? rot[0] ?? 0;
      d[o + 7] = rot.pitch ?? rot[1] ?? 0;
      d[o + 8] = rot.roll ?? rot[2] ?? 0;
    }
    d[o + 9] = colour[0]; d[o + 10] = colour[1]; d[o + 11] = colour[2];
    d[o + 12] = params?.[0] ?? 0.85;
    d[o + 13] = params?.[1] ?? 0;
    d[o + 14] = params?.[2] ?? 0;
    d[o + 15] = params?.[3] ?? 1;
    p.dynCount++;
  }

  function drawSprite(pos, sizeX, sizeY, colour, shape = 0, alpha = 1) {
    const need = (spriteCount + 1) * FLOATS_PER_INSTANCE;
    if (need > spriteData.length) {
      const grown = new Float32Array(Math.max(need, spriteData.length * 2));
      grown.set(spriteData);
      spriteData = grown;
    }
    const o = spriteCount * FLOATS_PER_INSTANCE;
    spriteData[o] = pos.x; spriteData[o + 1] = pos.y; spriteData[o + 2] = pos.z;
    spriteData[o + 3] = sizeX; spriteData[o + 4] = sizeY; spriteData[o + 5] = 1;
    spriteData[o + 6] = 0; spriteData[o + 7] = 0; spriteData[o + 8] = 0;
    spriteData[o + 9] = colour[0]; spriteData[o + 10] = colour[1]; spriteData[o + 11] = colour[2];
    spriteData[o + 12] = 0; spriteData[o + 13] = 0; spriteData[o + 14] = shape; spriteData[o + 15] = alpha;
    spriteCount++;
  }

  /** A tracer is just a very thin, very long box pointed at the impact. */
  function drawTracer(from, to, colour, thickness = 0.03) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return;
    // Local +Z is the long axis; YXZ euler puts it on (cp*sy, -sp, cp*cy).
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.asin(clamp(dy / len, -1, 1));
    drawInstance(0,
      { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 },
      { x: thickness, y: thickness, z: len },
      [yaw, pitch, 0], colour, [0.4, 0, 2.5, 0.85]);
  }

  function addLight(pos, colour, range, intensity = 1) {
    dynLights.push({ p: [pos.x, pos.y, pos.z], c: [colour[0] * intensity, colour[1] * intensity, colour[2] * intensity], r: range });
  }

  function setTorch(t) { torch = t; }

  function pickLights() {
    const cam = camera.pos;
    const all = mapLights.concat(dynLights);
    all.sort((a, b) => {
      const da = (a.p[0] - cam.x) ** 2 + (a.p[1] - cam.y) ** 2 + (a.p[2] - cam.z) ** 2;
      const db = (b.p[0] - cam.x) ** 2 + (b.p[1] - cam.y) ** 2 + (b.p[2] - cam.z) ** 2;
      return da - db;
    });
    const n = Math.min(MAX_LIGHTS, all.length);
    for (let i = 0; i < n; i++) {
      lightPos[i * 3] = all[i].p[0]; lightPos[i * 3 + 1] = all[i].p[1]; lightPos[i * 3 + 2] = all[i].p[2];
      lightColor[i * 3] = all[i].c[0]; lightColor[i * 3 + 1] = all[i].c[1]; lightColor[i * 3 + 2] = all[i].c[2];
      lightRange[i] = all[i].r;
    }
    return n;
  }

  function buildMatrices() {
    const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const fwd = { x: -sy * cp, y: sp, z: -cy * cp };
    const target = {
      x: camera.pos.x + fwd.x, y: camera.pos.y + fwd.y, z: camera.pos.z + fwd.z,
    };
    mat4Perspective(proj, camera.fov, camera.aspect, 0.06, 320);
    mat4LookAt(view, camera.pos, target, { x: 0, y: 1, z: 0 });
    mat4Mul(viewProj, proj, view);

    // Fit the shadow frustum just ahead of the camera so texels stay dense.
    const focus = {
      x: camera.pos.x + fwd.x * 14,
      y: clamp(camera.pos.y, 0, mapBounds.maxY),
      z: camera.pos.z + fwd.z * 14,
    };
    const d = env.sunDir;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const eye = {
      x: focus.x - (d[0] / dl) * 55,
      y: focus.y - (d[1] / dl) * 55,
      z: focus.z - (d[2] / dl) * 55,
    };
    const lview = mat4();
    const lproj = mat4();
    const extent = 34;
    mat4Ortho(lproj, -extent, extent, -extent, extent, 1, 130);
    mat4LookAt(lview, eye, focus, { x: 0, y: 1, z: 0 });
    mat4Mul(sunRaw, lproj, lview);
    mat4Mul(sunBiased, biasMat, sunRaw);
  }

  function uploadDynamic() {
    for (const p of prims) {
      if (!p.dynCount) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, p.dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, p.dynData.subarray(0, p.dynCount * FLOATS_PER_INSTANCE), gl.DYNAMIC_DRAW);
    }
    if (spriteCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteInstBuf);
      gl.bufferData(gl.ARRAY_BUFFER, spriteData.subarray(0, spriteCount * FLOATS_PER_INSTANCE), gl.DYNAMIC_DRAW);
    }
  }

  function drawPrims(which) {
    for (const p of prims) {
      const vao = which === 'static' ? p.staticVao : which === 'alpha' ? p.alphaVao : p.dynVao;
      const count = which === 'static' ? p.staticCount : which === 'alpha' ? p.alphaCount : p.dynCount;
      if (!count) continue;
      gl.bindVertexArray(vao);
      gl.drawElementsInstanced(gl.TRIANGLES, p.count, gl.UNSIGNED_SHORT, 0, count);
      stats.draws++;
      stats.instances += count;
    }
  }

  function endFrame() {
    buildMatrices();
    uploadDynamic();

    // -- shadow pass ------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shadow.prog);
    gl.uniformMatrix4fv(shadow.u.uSunMatrix, false, sunRaw);
    // Front-face culling in the shadow pass keeps thin props from self-acneing.
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    drawPrims('static');
    drawPrims('dynamic');
    gl.cullFace(gl.BACK);

    // -- main pass --------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky
    gl.depthMask(false);
    gl.useProgram(sky.prog);
    gl.uniform3f(sky.u.uSkyTop, env.sky[0], env.sky[1], env.sky[2]);
    gl.uniform3f(sky.u.uSkyBottom, env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    gl.uniform1f(sky.u.uHorizon, 0.42);
    gl.bindVertexArray(skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    const lightCount = pickLights();
    gl.useProgram(scene.prog);
    gl.uniformMatrix4fv(scene.u.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(scene.u.uSunMatrix, false, sunBiased);
    gl.uniform3f(scene.u.uCamPos, camera.pos.x, camera.pos.y, camera.pos.z);
    const dl = Math.hypot(env.sunDir[0], env.sunDir[1], env.sunDir[2]) || 1;
    gl.uniform3f(scene.u.uSunDir, env.sunDir[0] / dl, env.sunDir[1] / dl, env.sunDir[2] / dl);
    gl.uniform3f(scene.u.uSunColor,
      env.sunColor[0] * env.sunIntensity, env.sunColor[1] * env.sunIntensity, env.sunColor[2] * env.sunIntensity);
    gl.uniform3f(scene.u.uAmbient, env.ambient[0], env.ambient[1], env.ambient[2]);
    gl.uniform3f(scene.u.uSkyColor, env.sky[0], env.sky[1], env.sky[2]);
    gl.uniform3f(scene.u.uFogColor, env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    gl.uniform1f(scene.u.uFogDensity, env.fogDensity);
    gl.uniform1f(scene.u.uExposure, env.exposure ?? 1);
    gl.uniform1f(scene.u.uTime, frameTime);
    gl.uniform1i(scene.u.uLightCount, lightCount);
    if (lightCount) {
      gl.uniform3fv(scene.u.uLightPos, lightPos.subarray(0, lightCount * 3));
      gl.uniform3fv(scene.u.uLightColor, lightColor.subarray(0, lightCount * 3));
      gl.uniform1fv(scene.u.uLightRange, lightRange.subarray(0, lightCount));
    }
    if (torch) {
      gl.uniform4f(scene.u.uTorch, torch.pos.x, torch.pos.y, torch.pos.z, Math.cos(torch.angle));
      gl.uniform3f(scene.u.uTorchDir, torch.dir.x, torch.dir.y, torch.dir.z);
      gl.uniform3f(scene.u.uTorchColor, torch.color[0], torch.color[1], torch.color[2]);
    } else {
      gl.uniform4f(scene.u.uTorch, 0, 0, 0, 0);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(scene.u.uShadowMap, 0);
    gl.uniform1f(scene.u.uShadowTexel, 1 / SHADOW_SIZE);

    gl.enable(gl.CULL_FACE);
    drawPrims('static');
    drawPrims('dynamic');

    // Translucent world geometry, then screen sprites.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    drawPrims('alpha');

    if (spriteCount) {
      gl.useProgram(sprite.prog);
      gl.uniformMatrix4fv(sprite.u.uViewProj, false, viewProj);
      // Billboard basis straight out of the view matrix.
      gl.uniform3f(sprite.u.uRight, view[0], view[4], view[8]);
      gl.uniform3f(sprite.u.uUp, view[1], view[5], view[9]);
      gl.bindVertexArray(spriteVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, spriteCount);
      stats.draws++;
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /** Project a world point to CSS pixels, for name tags and markers. */
  function worldToScreen(p) {
    const x = viewProj[0] * p.x + viewProj[4] * p.y + viewProj[8] * p.z + viewProj[12];
    const y = viewProj[1] * p.x + viewProj[5] * p.y + viewProj[9] * p.z + viewProj[13];
    const w = viewProj[3] * p.x + viewProj[7] * p.y + viewProj[11] * p.z + viewProj[15];
    if (w <= 0.001) return { x: 0, y: 0, visible: false };
    return {
      x: ((x / w) * 0.5 + 0.5) * (width / dpr),
      y: (1 - ((y / w) * 0.5 + 0.5)) * (height / dpr),
      visible: true,
      depth: w,
    };
  }

  function dispose() {
    for (const p of prims) {
      gl.deleteBuffer(p.posBuf); gl.deleteBuffer(p.nrmBuf); gl.deleteBuffer(p.idxBuf);
      gl.deleteBuffer(p.staticBuf); gl.deleteBuffer(p.dynBuf); gl.deleteBuffer(p.alphaBuf);
      gl.deleteVertexArray(p.staticVao); gl.deleteVertexArray(p.dynVao); gl.deleteVertexArray(p.alphaVao);
    }
    gl.deleteTexture(shadowTex);
    gl.deleteFramebuffer(shadowFbo);
    for (const prog of [scene, shadow, sky, sprite]) gl.deleteProgram(prog.prog);
  }

  return {
    gl,
    stats,
    loadMap,
    beginFrame,
    drawInstance,
    drawSprite,
    drawTracer,
    addLight,
    setTorch,
    endFrame,
    resize,
    worldToScreen,
    dispose,
    get env() { return env; },
    set env(v) { env = { ...env, ...v }; },
  };
}
