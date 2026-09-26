// Visuals for gas giants, stars, rings and distant point-like bodies.
import * as THREE from 'three';
import { buildRingStrip, ringSpecFor } from './ringgen.js';
import { NOISE3, EQUIRECT, blackbody } from './glsl.js';
import { planetTexture, PLANET_MAPS, PLANET_EXTRA } from './textures.js';

const LOGDEPTH_V = `#include <common>\n#include <logdepthbuf_pars_vertex>`;

// ---------------------------------------------------------------- gas giants
// Albedo = real map (Solar System) or a Kupiter bake; motion = the Kupiter flow map (east/north
// wind). The deck is advected with two-phase flow mapping, so jets shear and storms keep
// swirling forever without smearing, and three parallax layers with self-shadowing give the
// cloud tops depth.
export function makeGasMaterial(body, gg) {
  const st = body.style || {};
  const real = body.sys.real && PLANET_MAPS[body.name];
  const dummy = new THREE.DataTexture(new Uint8Array([200, 180, 150, 255]), 1, 1); dummy.needsUpdate = true;
  const flat = new THREE.DataTexture(new Uint16Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType); flat.needsUpdate = true;
  const U = {
    uTex: { value: real ? planetTexture(PLANET_MAPS[body.name]) : (gg && gg.albedo) || dummy }, uFlow: { value: (gg && gg.flow) || flat }, uHasFlow: { value: gg && gg.flow ? 1 : 0 },
    uBandTint: { value: new THREE.Vector3(...((st.bands && st.bands[0]) || [0.8, 0.7, 0.6])) }, uHasAlbedo: { value: real || (gg && gg.albedo) ? 1 : 0 },
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uWorldToBody: { value: new THREE.Matrix3() }, uEmissive: { value: new THREE.Vector3(...(st.emissive || [0, 0, 0])) },
    uRingIn: { value: st.rings ? ringData(body).inner : 0 }, uRingOut: { value: st.rings ? ringData(body).outer : 0 }, uRingTex: { value: st.rings ? ringData(body).tex : dummy },
    uHasRingTex: { value: st.rings ? 1 : 0 }, uCenter: { value: new THREE.Vector3() }, uRadius: { value: body.radius }, uPole: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Vector3(1, 1, 1) }, uFlowGain: { value: real ? 0.02 : 0.035 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `${LOGDEPTH_V}
      varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      ${EQUIRECT}
      uniform sampler2D uTex, uFlow, uRingTex; uniform float uHasFlow, uHasAlbedo, uTime, uRingIn, uRingOut, uHasRingTex, uRadius, uFlowGain;
      uniform vec3 uSun, uEmissive, uCenter, uPole, uSunColor, uBandTint; uniform mat3 uWorldToBody;
      varying vec3 vN; varying vec3 vW;
      vec2 dUVdt(vec2 uv){ // flow map (east,north) -> uv velocity
        vec2 f = texture(uFlow, uv).rg; float lat = (uv.y - 0.5) * PI;
        return vec2(-f.x / (6.2831853 * max(cos(lat), 0.12)), f.y / PI);
      }
      vec3 deck(vec2 uv, vec2 gx, vec2 gy, float t){
        if (uHasFlow < 0.5) return textureGrad(uTex, uv, gx, gy).rgb;
        vec2 v = dUVdt(uv) * uFlowGain;
        float T = 6.0; float p1 = fract(t / T), p2 = fract(t / T + 0.5);
        vec3 c1 = textureGrad(uTex, uv - v * p1 * T, gx, gy).rgb;
        vec3 c2 = textureGrad(uTex, uv - v * p2 * T, gx, gy).rgb;
        return mix(c1, c2, abs(p1 * 2.0 - 1.0));
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN); vec3 d = normalize(uWorldToBody * n);
        vec3 V = normalize(-vW); vec3 L = normalize(uSun);
        vec2 uv0 = eqUV(d); vec2 gx = dFdx(uv0), gy = dFdy(uv0);
        if (abs(gx.x) > 0.5) gx.x -= sign(gx.x); if (abs(gy.x) > 0.5) gy.x -= sign(gy.x);
        // three cloud decks sampled along the view ray (parallax) -> volumetric depth
        vec3 dB = uWorldToBody * V;
        vec3 col = vec3(0.0); float acc = 0.0;
        for (int k = 0; k < 3; k++) {
          float hgt = float(k) * 0.0022;
          vec2 uvk = eqUV(normalize(d - dB * hgt));
          vec3 c = uHasAlbedo > 0.5 ? deck(uvk, gx, gy, uTime + float(k) * 2.1) : uBandTint;
          float lumK = dot(c, vec3(0.3, 0.5, 0.2));
          float wgt = k == 0 ? 1.0 : 0.3 * smoothstep(0.45, 0.85, lumK);
          col += c * wgt; acc += wgt;
        }
        col /= acc;
        // self-shadowing: bright (high) clouds shade toward the anti-sun side
        vec3 Lb = uWorldToBody * L;
        vec2 uvs = eqUV(normalize(d + (Lb - d * dot(Lb, d)) * 0.004));
        float hC = dot(col, vec3(0.3, 0.5, 0.2)), hS = uHasAlbedo > 0.5 ? dot(deck(uvs, gx, gy, uTime), vec3(0.3, 0.5, 0.2)) : hC;
        float shade = clamp(1.0 + (hC - hS) * 2.5, 0.6, 1.15);
        float NdL = dot(n, L); float mu = max(dot(n, V), 0.0);
        float diff = pow(max(NdL, 0.0), 0.95) * pow(mu, 0.28) + smoothstep(-0.12, 0.0, NdL) * 0.02; // Minnaert-style limb
        float ringSh = 1.0;
        if (uRingOut > 0.0) {
          vec3 p = vW - uCenter; float den = dot(L, uPole);
          if (abs(den) > 1e-4) { float t = -dot(p, uPole) / den; if (t > 0.0) { vec3 q = p + L * t; float r = length(q) / uRadius;
            if (r > uRingIn && r < uRingOut) { float u = (r - uRingIn) / (uRingOut - uRingIn); float a = uHasRingTex > 0.5 ? texture(uRingTex, vec2(u, 0.5)).a : 0.5; ringSh = 1.0 - a * 0.85; } } }
        }
        vec3 lit = col * diff * shade * ringSh * uSunColor * 0.7 + col * 0.003;
        lit += uEmissive * (1.0 - smoothstep(-0.2, 0.2, NdL)) * 0.8;
        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
  mat.userData.U = U;
  return mat;
}

// ---------------------------------------------------------------- stars
export function makeStarMaterial(body) {
  const T = body.temp || body.style?.temp || 5772;
  const real = body.name === 'Sun' && body.sys.real;
  const col = blackbody(T); const m = Math.max(...col);
  const U = { uTex: { value: real ? planetTexture('sun') : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }, uReal: { value: real ? 1 : 0 },
    uColor: { value: new THREE.Vector3(col[0] / m, col[1] / m, col[2] / m) }, uTime: { value: 0 }, uWorldToBody: { value: new THREE.Matrix3() }, uIntensity: { value: 30 } };
  U.uTex.value.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `${LOGDEPTH_V}
      varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE3}
      ${EQUIRECT}
      uniform sampler2D uTex; uniform float uReal, uTime, uIntensity; uniform vec3 uColor; uniform mat3 uWorldToBody;
      varying vec3 vN; varying vec3 vW;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN); vec3 V = normalize(-vW); vec3 d = normalize(uWorldToBody * n);
        float mu = max(dot(n, V), 0.0);
        float limb = 1.0 - 0.6 * (1.0 - pow(mu, 0.5)); // limb darkening
        float gran = 0.75 + 0.25 * (snoise(d * 180.0 + uTime * 0.02) * 0.5 + 0.5) + 0.12 * snoise(d * 20.0 - uTime * 0.005);
        vec3 c = uReal > 0.5 ? sampleEqGrad(uTex, eqUV(d)).rgb * 1.6 : uColor * gran;
        if (uReal > 0.5) c *= 0.85 + 0.25 * (snoise(d * 220.0 + uTime * 0.03) * 0.5 + 0.5);
        gl_FragColor = vec4(c * uColor * limb * uIntensity, 1.0);
      }`,
  });
  mat.userData.U = U;
  return mat;
}

// glow sprite (additive), used for stars at every distance
export function makeGlowSprite(colorArr) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Vector3(...colorArr) }, uIntensity: { value: 1 } },
    vertexShader: `${LOGDEPTH_V}
      varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vUv); if (r > 1.0) discard;
        float edge = (1.0 - r * r) * (1.0 - r * r); // exactly zero at the quad's rim: no visible disc
        float g = (exp(-r * 7.0) * 1.5 + exp(-r * 2.5) * 0.25) * edge;
        float rays = pow(max(0.0, 1.0 - abs(vUv.x * vUv.y) * 60.0), 6.0) * edge * 0.25;
        gl_FragColor = vec4(uColor * (g + rays) * uIntensity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  s.frustumCulled = false;
  return s;
}

// ---------------------------------------------------------------- rings
// Ring strip texture + radial extent for a body (Kalileo generator, or Saturn's real imagery)
export function ringData(body) {
  if (body._ring) return body._ring;
  const real = body.name === 'Saturn' && body.sys.real;
  if (real) { body._ring = { inner: body.style.rings.inner, outer: body.style.rings.outer, tex: planetTexture('saturn_ring'), real: true, dusty: false }; return body._ring; }
  const { inner, outer, spec } = ringSpecFor(body);
  const W = 4096; const data = buildRingStrip(spec, W);
  const tex = new THREE.DataTexture(data, W, 1); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  body._ring = { inner, outer, tex, real: false, dusty: spec.style === 'faint' || spec.style === 'dust' };
  return body._ring;
}
export function makeRings(body) {
  const rd = ringData(body); const R = body.radius;
  const geo = new THREE.RingGeometry(R * rd.inner, R * rd.outer, 512, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const rr = Math.hypot(pos.getX(i), pos.getY(i)) / R; uv.setXY(i, (rr - rd.inner) / (rd.outer - rd.inner), 0.5); }
  geo.rotateX(-Math.PI / 2);
  const U = { uTex: { value: rd.tex }, uDusty: { value: rd.dusty ? 1 : 0 },
    uSun: { value: new THREE.Vector3(1, 0, 0) }, uCenter: { value: new THREE.Vector3() }, uRadius: { value: R }, uSunColor: { value: new THREE.Vector3(1, 1, 1) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `${LOGDEPTH_V}
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0,1.0,0.0)); gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uTex; uniform float uRadius, uDusty; uniform vec3 uSun, uCenter, uSunColor;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
      void main(){
        #include <logdepthbuf_fragment>
        vec4 c = texture(uTex, vec2(vUv.x, 0.5));
        vec3 N = normalize(vN), L = normalize(uSun), V = normalize(-vW);
        float nl = dot(N, L), nv = dot(N, V);
        // slant path through the sheet: nearly edge-on rings look more opaque
        float tau = -log(max(1.0 - c.a * 0.98, 0.02));
        float a = 1.0 - exp(-tau / max(abs(nv), 0.04));
        // planet shadow with a soft edge
        vec3 p = vW - uCenter; float b = dot(p, L); float q = length(p - L * b);
        float sh = b < 0.0 ? smoothstep(uRadius * 0.985, uRadius * 1.02, q) : 1.0;
        bool litSide = nl * nv > 0.0;
        float cosA = dot(-V, L); // phase: 1 = looking toward the sun (backlit)
        float refl = abs(nl) * 0.8 + 0.2;
        float fwd = hg(cosA, uDusty > 0.5 ? 0.75 : 0.35) * 12.566;
        // lit face reflects; the unlit face only glows with light diffusing through the sheet
        float bright = litSide ? refl * (0.85 + 0.25 * fwd * (1.0 - c.a)) : (1.0 - c.a) * c.a * 2.2 * (0.25 + fwd * 0.8) + 0.04;
        if (uDusty > 0.5) bright = 0.25 + fwd * 1.2;
        vec3 col = c.rgb * bright * sh * uSunColor * 1.05;
        gl_FragColor = vec4(col, a);
      }`,
  });
  mat.userData.U = U;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

// ---------------------------------------------------------------- point sprites for tiny bodies
export class BodyPoints {
  constructor(max = 4096) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `${LOGDEPTH_V}
        attribute float aSize; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec3 vC; void main(){
        #include <logdepthbuf_fragment>
        vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d,d); if (r > 1.0) discard; gl_FragColor = vec4(vC * max(0.0, exp(-r * 3.0) - 0.0498) * 1.052, 1.0); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 1;
    this.n = 0;
  }
  begin() { this.n = 0; }
  add(x, y, z, r, g, b, s) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.size[i] = s;
  }
  end() {
    const g = this.geo; g.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'aSize']) { g.attributes[k].needsUpdate = true; g.attributes[k].updateRange && (g.attributes[k].updateRange.count = -1); }
  }
}
