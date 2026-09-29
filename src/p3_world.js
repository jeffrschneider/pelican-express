/* =====================================================================
   PART 3 — renderer, sky, light, and a WINDING road with terrain + scenery hugging it
   ===================================================================== */

const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug');
const TARGET_T = Math.max(20, Number(qs.get('t')) || 90);          // ride length in seconds (?t=60)
let firstIdx = 0;
if (qs.get('from')) {                                              // ?from=2026-03-01 starts mid-timeline
  const fd = parseDate(qs.get('from'));
  firstIdx = AGENTS.findIndex((a) => a.days >= fd);
  if (firstIdx < 0) firstIdx = AGENTS.length - 1;
}
const RIDE = { sStart: AGENTS[firstIdx].s - 22, sEnd: AGENTS[AGENTS.length - 1].s + 28, firstIdx };
const RIDER_X = 1.55;                    // riding in the right-hand lane (metres right of the centre line)

/* ---- noise helpers ---- */
function hash2(ix, iy) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

/* =====================================================================
   The road centre line. Heading theta(s) is a sum of two sine waves in arc length s
   (a long sweeping S plus a quicker wiggle); position comes from integrating the heading.
   Forward = (sin th, -cos th); right = (cos th, sin th); th > 0 turns right.
   Tightest bend ~23 m radius, heading never beyond ~66 deg so z always advances.
   ===================================================================== */
const TAU = Math.PI * 2;
const HEAD = { a1: 0.90, l1: 220, p1: 0.7, a2: 0.26, l2: 97, p2: 2.3 };
const thetaAt = (s) => HEAD.a1 * Math.sin(TAU * s / HEAD.l1 + HEAD.p1) + HEAD.a2 * Math.sin(TAU * s / HEAD.l2 + HEAD.p2);
const kappaAt = (s) => HEAD.a1 * TAU / HEAD.l1 * Math.cos(TAU * s / HEAD.l1 + HEAD.p1) + HEAD.a2 * TAU / HEAD.l2 * Math.cos(TAU * s / HEAD.l2 + HEAD.p2);

const PATH = (function () {
  const DS = 0.5, s0 = RIDE.sStart - 240, s1 = RIDE.sEnd + 480, n = Math.ceil((s1 - s0) / DS) + 1;
  const X = new Float32Array(n), Z = new Float32Array(n);
  let x = 0, z = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) {
    X[i] = x; Z[i] = z;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    const th = thetaAt(s0 + (i + 0.5) * DS);
    x += Math.sin(th) * DS; z -= Math.cos(th) * DS;
  }
  return { s0, s1, DS, n, X, Z, minX, maxX, minZ, maxZ };
})();

function roadAt(s, o) {
  o = o || {};
  const f = clamp((s - PATH.s0) / PATH.DS, 0, PATH.n - 1.001), i = Math.floor(f), u = f - i;
  o.x = PATH.X[i] + (PATH.X[i + 1] - PATH.X[i]) * u;
  o.z = PATH.Z[i] + (PATH.Z[i + 1] - PATH.Z[i]) * u;
  o.th = thetaAt(s); o.k = kappaAt(s);
  o.fx = Math.sin(o.th); o.fz = -Math.cos(o.th); o.rx = Math.cos(o.th); o.rz = Math.sin(o.th);
  return o;
}
/* distance from any world point to the road centre line (samples every 4 m) */
const ROAD_SAMPLES = (function () {
  const st = 8, m = Math.floor((PATH.n - 1) / st) + 1, sx = new Float32Array(m), sz = new Float32Array(m);
  for (let i = 0; i < m; i++) { sx[i] = PATH.X[i * st]; sz[i] = PATH.Z[i * st]; }
  return { m, sx, sz };
})();
function roadDist(x, z) {
  const { m, sx, sz } = ROAD_SAMPLES;
  let best = 1e18;
  for (let i = 0; i < m; i++) { const dx = x - sx[i], dz = z - sz[i], d = dx * dx + dz * dz; if (d < best) best = d; }
  return Math.sqrt(best);
}
/* world position at arc length s and signed lateral offset u (right positive) */
const atRoad = (s, u, o) => { const r = roadAt(s, _tmpRoad); return o.set(r.x + r.rx * u, 0, r.z + r.rz * u); };
const _tmpRoad = {};

/* terrain height: flat verge hugging the road, gentle meadow rolls further out, big hills far away */
function terrainH(x, z, d) {
  const roll = (fbm(x * 0.02 + 11, z * 0.02) - 0.35) * 5.0;
  const hills = fbm(x * 0.006 + 3, z * 0.006 + 9) * 40;
  const k = smooth(50, 150, d);
  return -0.09 + smooth(14, 46, d) * roll * 0.5 + k * k * hills;
}

/* ---- renderer / scene / camera ---- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0xe6dccd);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0042);
scene.background = FOG_COLOR;

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.3, 3200);
camera.position.set(6, 3, 8);

/* ---- sky dome (gradient + sun disc, all in a shader); it follows the camera ---- */
const SUN_DIR = new THREE.Vector3(-0.42, 0.40, 0.81).normalize();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1800, 40, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(0.93, 0.86, 0.76);
        vec3 mid = vec3(0.62, 0.78, 0.93);
        vec3 zenith = vec3(0.24, 0.47, 0.82);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.18, 0.85, h));
        float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.72, 0.42) * pow(sd, 8.0) * 0.35;
        col += vec3(1.0, 0.85, 0.6) * pow(sd, 90.0) * 0.6;
        col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9998, sd) * 2.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

/* ---- lights ---- */
const hemi = new THREE.HemisphereLight(0xb4d0ff, 0x6f7d48, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b0, 3.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 28;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 240 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
function updateSun(cx, cz) {
  sun.target.position.set(cx, 0, cz);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 120);
}

/* ---- world extents ---- */
const WB = { minX: PATH.minX - 340, maxX: PATH.maxX + 340, minZ: PATH.minZ - 340, maxZ: PATH.maxZ + 340 };
const PATH_LEN = PATH.s1 - PATH.s0;

/* ---- terrain: regular grid, height/colour from distance to the road ---- */
(function buildTerrain() {
  const CELL = 5, M = 340;
  const nx = Math.ceil((WB.maxX - WB.minX) / CELL), nz = Math.ceil((WB.maxZ - WB.minZ) / CELL), vx = nx + 1, vz = nz + 1;
  const pos = new Float32Array(vx * vz * 3), col = new Float32Array(vx * vz * 3), dist = new Float32Array(vx * vz);
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) dist[j * vx + i] = roadDist(WB.minX + i * CELL, WB.minZ + j * CELL);
  const cA = new THREE.Color(0x5f8f3a), cB = new THREE.Color(0x3f6f2e), cC = new THREE.Color(0x9aa552), cD = new THREE.Color(0x7d7a55), cRock = new THREE.Color(0x8b8f80), c = new THREE.Color();
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
    const k = j * vx + i, x = WB.minX + i * CELL, z = WB.minZ + j * CELL, d = dist[k];
    pos[k * 3] = x; pos[k * 3 + 2] = z;
    if (d > M + 40) { pos[k * 3 + 1] = -5; continue; }
    const h = terrainH(x, z, d);
    pos[k * 3 + 1] = h;
    const n = fbm(x * 0.05 + 40, z * 0.05), dry = fbm(x * 0.013 + 5, z * 0.013 + 70);
    c.copy(cB).lerp(cA, smooth(0.25, 0.6, n)).lerp(cC, smooth(0.5, 0.75, dry) * 0.6);
    c.lerp(cD, (1 - Math.min(1, d / 10)) * 0.5);
    if (h > 14) c.lerp(cRock, smooth(14, 34, h) * 0.6);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * vx + i, b = a + 1, cc = a + vx, dd = cc + 1;
    if (Math.min(dist[a], dist[b], dist[cc], dist[dd]) > M) continue;
    idx.push(a, cc, b, b, cc, dd);                                   // counter-clockwise seen from above
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  scene.add(m);
})();

/* ---- distant mountain ring; it follows the camera like a backdrop ---- */
const ridge = (function buildRidge() {
  const N = 220, R = 950, pos = [], col = [], idx = [];
  const c1 = new THREE.Color(0xe6dccd), c2 = new THREE.Color(0x93aac6);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const h = 60 + fbm(Math.cos(a) * 2.2 + 4, Math.sin(a) * 2.2 + 8, 5) * 230;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    pos.push(x, -30, z, x, h, z);
    col.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false;
  scene.add(m);
  return m;
})();

/* ---- road surface, shoulders, edge lines, dashed centre line, delineators (all follow the curve) ---- */
const _rt = {};
function stripGeo(uL, uR, y, ranges, step, uvW, uvL) {
  const pos = [], uv = [], idx = [];
  ranges.forEach(([sa, sb]) => {
    const n = Math.max(1, Math.ceil((sb - sa) / step)), base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const s = sa + (sb - sa) * i / n, r = roadAt(s, _rt);
      pos.push(r.x + r.rx * uL, y, r.z + r.rz * uL, r.x + r.rx * uR, y, r.z + r.rz * uR);
      uv.push(0, s / uvL, uvW, s / uvL);
      if (i > 0) { const a = base + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
(function buildRoad() {
  const noiseSize = 128, data = new Uint8Array(noiseSize * noiseSize * 4);
  for (let y = 0; y < noiseSize; y++) for (let x = 0; x < noiseSize; x++) {
    const n = fbm(x * 0.15, y * 0.15, 3) * 0.6 + hash2(x, y * 7 + 3) * 0.4;
    const v = Math.floor(170 + n * 85);
    const i = (y * noiseSize + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, noiseSize, noiseSize, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = 8; tex.needsUpdate = true;

  const full = [[PATH.s0, PATH.s1]];
  const road = new THREE.Mesh(stripGeo(-3.2, 3.2, 0, full, 1.0, 2.5, 3), new THREE.MeshStandardMaterial({ color: 0x5a5d63, map: tex, roughness: 0.92 }));
  road.receiveShadow = true; scene.add(road);

  const shMat = new THREE.MeshStandardMaterial({ color: 0x9a9587, roughness: 1 });
  [[3.2, 4.8], [-4.8, -3.2]].forEach(([a, b]) => { const m = new THREE.Mesh(stripGeo(a, b, -0.012, full, 1.5, 1, 4), shMat); m.receiveShadow = true; scene.add(m); });

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const yelMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  [[2.875, 3.025], [-3.025, -2.875]].forEach(([a, b]) => { const m = new THREE.Mesh(stripGeo(a, b, 0.008, full, 1.0, 1, 4), lineMat); m.receiveShadow = true; scene.add(m); });
  const dashes = [];
  for (let s = PATH.s0 + 3; s < PATH.s1 - 5; s += 9) dashes.push([s, s + 4]);
  const dm = new THREE.Mesh(stripGeo(-0.08, 0.08, 0.008, dashes, 1.0, 1, 4), yelMat); dm.receiveShadow = true; scene.add(dm);

  // roadside delineator posts with red reflectors, alternating sides
  const cnt = Math.floor(PATH_LEN / 24);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.6 }), cnt);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0xd9241c, emissive: 0xd9241c, emissiveIntensity: 0.3, roughness: 0.4 }), cnt);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < cnt; i++) {
    const r = roadAt(PATH.s0 + 6 + i * 24, _rt), side = i % 2 ? 1 : -1;
    q.setFromAxisAngle(yAx, -r.th);
    p.set(r.x + r.rx * side * 3.9, 0.42, r.z + r.rz * side * 3.9); m4.compose(p, q, one); posts.setMatrixAt(i, m4);
    p.y = 0.78; m4.compose(p, q, one); caps.setMatrixAt(i, m4);
  }
  posts.castShadow = true; scene.add(posts, caps);
})();

/* ---- roadside scenery, placed by (arc length, lateral offset) so it follows every bend ---- */
(function buildScenery() {
  const rnd = makeRng(20260928);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const pt = new THREE.Vector3();
  // pick a spot at (arc length, lateral offset) and re-roll if a bend put it nearer another
  // stretch of road than uMin (scenery must never land on tarmac)
  let spotD = 0;
  const randSpot = (uMin, uSpan, pw) => {
    for (let tries = 0; tries < 8; tries++) {
      const sArc = lerp(PATH.s0 + 4, PATH.s1 - 4, rnd()), side = rnd() < 0.5 ? -1 : 1;
      atRoad(sArc, side * (uMin + Math.pow(rnd(), pw) * uSpan), pt);
      spotD = roadDist(pt.x, pt.z);
      if (spotD >= uMin - 0.2) break;
    }
    return pt;
  };

  // trees: conifers (trunk + 3 cones) and broadleaf (trunk + blob), kept >= 14 m from the road
  const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0);
  const coneG = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const blobG = new THREE.IcosahedronGeometry(1, 1);
  const treeCount = Math.floor(PATH_LEN / 2.4);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }), treeCount);
  const cones = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), treeCount * 3);
  const blobs = new THREE.InstancedMesh(blobG, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), treeCount);
  let ti = 0, ci = 0, bi = 0;
  for (let i = 0; i < treeCount; i++) {
    const sp = randSpot(15, 90, 1.5), x = sp.x, z = sp.z, d = spotD;
    if (d < 14) continue;
    const y = terrainH(x, z, d), sc = 0.8 + rnd() * 1.1;
    if (rnd() < 0.62) {
      p.set(x, y, z); s.set(sc, 2.2 * sc, sc); q.identity(); m4.compose(p, q, s); trunks.setMatrixAt(ti++, m4);
      for (let t = 0; t < 3; t++) {
        const r = (2.0 - t * 0.5) * sc, h = (3.3 - t * 0.5) * sc;
        p.set(x, y + (1.6 + t * 1.6) * sc, z); s.set(r, h, r); e.set(0, rnd() * 6, 0); q.setFromEuler(e); m4.compose(p, q, s);
        cones.setMatrixAt(ci, m4); col.setHSL(0.34 + rnd() * 0.05, 0.42, 0.20 + rnd() * 0.07); cones.setColorAt(ci, col); ci++;
      }
    } else {
      p.set(x, y, z); s.set(sc, 2.6 * sc, sc); q.identity(); m4.compose(p, q, s); trunks.setMatrixAt(ti++, m4);
      p.set(x, y + 3.6 * sc, z); s.set(2.0 * sc, 1.7 * sc, 2.0 * sc); e.set(rnd(), rnd() * 6, rnd()); q.setFromEuler(e); m4.compose(p, q, s);
      blobs.setMatrixAt(bi, m4); col.setHSL(0.24 + rnd() * 0.1, 0.5, 0.28 + rnd() * 0.1); blobs.setColorAt(bi, col); bi++;
    }
  }
  trunks.count = ti; cones.count = ci; blobs.count = bi;
  [trunks, cones, blobs].forEach((m) => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });

  // grass tufts along the verge
  const tuftG = new THREE.ConeGeometry(0.045, 0.34, 4).translate(0, 0.17, 0);
  const tuftN = Math.min(6500, Math.floor(PATH_LEN * 4.2));
  const tufts = new THREE.InstancedMesh(tuftG, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), tuftN);
  for (let i = 0; i < tuftN; i++) {
    const sp = randSpot(4.7, 17, 1.4);
    if (spotD < 4.5) { s.setScalar(0); m4.compose(p.set(sp.x, -5, sp.z), q.identity(), s); tufts.setMatrixAt(i, m4); continue; }
    p.set(sp.x, terrainH(sp.x, sp.z, spotD), sp.z); const k = 0.6 + rnd() * 1.0; s.set(k, k * (0.7 + rnd() * 0.9), k);
    e.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4); q.setFromEuler(e); m4.compose(p, q, s); tufts.setMatrixAt(i, m4);
    col.setHSL(0.22 + rnd() * 0.08, 0.5, 0.26 + rnd() * 0.16); tufts.setColorAt(i, col);
  }
  tufts.receiveShadow = true; scene.add(tufts);

  // wildflowers
  const flN = Math.min(2200, Math.floor(PATH_LEN * 1.6));
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.6 }), flN);
  const flCols = [0xffe066, 0xffffff, 0xff8fab, 0xc77dff];
  for (let i = 0; i < flN; i++) {
    const sp = randSpot(4.9, 9, 1);
    if (spotD < 4.6) { s.setScalar(0); m4.compose(p.set(sp.x, -5, sp.z), q.identity(), s); flowers.setMatrixAt(i, m4); continue; }
    p.set(sp.x, terrainH(sp.x, sp.z, spotD) + 0.28, sp.z); s.setScalar(0.8 + rnd() * 0.8); q.identity(); m4.compose(p, q, s);
    flowers.setMatrixAt(i, m4); col.setHex(flCols[Math.floor(rnd() * flCols.length)]); flowers.setColorAt(i, col);
  }
  scene.add(flowers);

  // rocks
  const rkN = Math.floor(PATH_LEN / 9);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: 1, flatShading: true }), rkN);
  for (let i = 0; i < rkN; i++) {
    const sp = randSpot(5.8, 13, 1);
    if (spotD < 5.6) { s.setScalar(0); m4.compose(p.set(sp.x, -5, sp.z), q.identity(), s); rocks.setMatrixAt(i, m4); continue; }
    p.set(sp.x, terrainH(sp.x, sp.z, spotD) + 0.05, sp.z); s.set(0.3 + rnd() * 0.7, 0.2 + rnd() * 0.4, 0.3 + rnd() * 0.6);
    e.set(rnd() * 3, rnd() * 6, rnd() * 3); q.setFromEuler(e); m4.compose(p, q, s); rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

  // utility poles with sagging wires down the right-hand side
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.95 });
  const poleG = new THREE.CylinderGeometry(0.11, 0.15, 9, 8).translate(0, 4.5, 0), armG = new THREE.BoxGeometry(2.2, 0.12, 0.12);
  const wirePts = [], spacing = 46, poleU = 16.5, tops = [];
  for (let sArc = PATH.s0 + 20; sArc < PATH.s1 - 20; sArc += spacing) {
    const r = roadAt(sArc, _rt), x = r.x + r.rx * poleU, z = r.z + r.rz * poleU, y = terrainH(x, z, roadDist(x, z));
    const pole = new THREE.Mesh(poleG, poleMat); pole.position.set(x, y, z); pole.castShadow = true; scene.add(pole);
    const arm = new THREE.Mesh(armG, poleMat); arm.position.set(x, y + 8.4, z); arm.rotation.y = -r.th; arm.castShadow = true; scene.add(arm);
    tops.push({ x, y: y + 8.4, z, rx: r.rx, rz: r.rz });
  }
  for (let k = 0; k < tops.length - 1; k++) for (const dz of [-0.95, 0, 0.95]) {
    const A = tops[k], B = tops[k + 1];
    let prev = null;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, sag = Math.sin(t * Math.PI) * 1.1;
      const pt2 = [lerp(A.x + A.rx * dz, B.x + B.rx * dz, t), lerp(A.y, B.y, t) - sag, lerp(A.z + A.rz * dz, B.z + B.rz * dz, t)];
      if (prev) wirePts.push(...prev, ...pt2); prev = pt2;
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2c2c30 })));

  // clouds drift across the whole valley
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xfff2e0, emissiveIntensity: 0.32, transparent: true, opacity: 0.96, fog: false });
  const cloudG = new THREE.SphereGeometry(1, 14, 10);
  window.__clouds = [];
  for (let i = 0; i < 22; i++) {
    const cl = new THREE.Group(), n = 6 + Math.floor(rnd() * 6), base = 18 + rnd() * 18;
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(cloudG, cloudMat);
      const r = base * (0.45 + rnd() * 0.55);
      b.position.set((k - n / 2) * base * 0.62 + (rnd() - 0.5) * 8, (rnd() - 0.3) * base * 0.35, (rnd() - 0.5) * base * 0.9);
      b.scale.set(r * 1.25, r * 0.62, r); cl.add(b);
    }
    cl.position.set(lerp(WB.minX - 200, WB.maxX + 200, rnd()), 130 + rnd() * 90, lerp(WB.minZ, WB.maxZ, rnd()));
    cl.userData.speed = 1.2 + rnd() * 1.6; cl.userData.x0 = cl.position.x; scene.add(cl); window.__clouds.push(cl);
  }
})();

/* ---- signs ---- */
const signGroup = new THREE.Group();
AGENTS.forEach((a) => signGroup.add(buildSign(a)));
scene.add(signGroup);
