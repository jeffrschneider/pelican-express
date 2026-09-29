/* =====================================================================
   PART 2 — road signs: six shapes, procedurally generated emblems, lettering
   (Emblems are original generated stand-ins — not the products' real logos.)
   ===================================================================== */

function polyShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
function roundedRectShape(w, h, r) {
  const x = -w / 2, y = -h / 2, s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function circleShape(r) { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; }
function regularPoly(n, R, rot) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  return pts;
}

/* Each spec: outline builder, inset scale, half-width function (for fitting text),
   and where the emblem / name / date go (sign-local metres, before lane scale). */
const SIGN_SPECS = {
  rect: {
    height: 2.2, outline: () => roundedRectShape(3.2, 2.2, 0.18), inset: [0.93, 0.90],
    hw: () => 1.6, emblemY: 0.58, emblemR: 0.40, nameY: -0.12, nameH: 0.34, dateY: -0.74, dateH: 0.22,
  },
  circle: {
    height: 2.5, outline: () => circleShape(1.25), inset: [0.9, 0.9],
    hw: (y) => Math.sqrt(Math.max(0, 1.25 * 1.25 - y * y)), emblemY: 0.58, emblemR: 0.36, nameY: -0.12, nameH: 0.32, dateY: -0.66, dateH: 0.21,
  },
  diamond: {
    height: 3.2, outline: () => polyShape([[0, 1.6], [1.6, 0], [0, -1.6], [-1.6, 0]]), inset: [0.9, 0.9],
    hw: (y) => Math.max(0, 1.6 - Math.abs(y)), emblemY: 0.66, emblemR: 0.32, nameY: -0.04, nameH: 0.32, dateY: -0.6, dateH: 0.21,
  },
  hexagon: {
    height: 2.34, outline: () => polyShape(regularPoly(6, 1.35, 0)), inset: [0.9, 0.9],
    hw: (y) => Math.max(0, 1.35 - Math.abs(y) / Math.sqrt(3)), emblemY: 0.56, emblemR: 0.33, nameY: -0.12, nameH: 0.32, dateY: -0.64, dateH: 0.21,
  },
  pentagon: {
    height: 2.45, outline: () => polyShape([[-1.25, -1.1], [1.25, -1.1], [1.25, 0.35], [0, 1.35], [-1.25, 0.35]]), inset: [0.9, 0.9],
    hw: (y) => (y <= 0.35 ? 1.25 : Math.max(0, 1.25 * (1.35 - y))), emblemY: 0.42, emblemR: 0.31, nameY: -0.24, nameH: 0.3, dateY: -0.74, dateH: 0.2,
  },
  octagon: {
    height: 2.4, outline: () => polyShape(regularPoly(8, 1.299, Math.PI / 8)), inset: [0.9, 0.9],
    hw: (y) => Math.min(1.2, Math.max(0, 1.697 - Math.abs(y))), emblemY: 0.58, emblemR: 0.36, nameY: -0.12, nameH: 0.34, dateY: -0.7, dateH: 0.22,
  },
};

/* ---- shared geometry / materials ---- */
const SG = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.075, 8, 48),
  hex: new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2),
  post: new THREE.CylinderGeometry(0.05, 0.05, 1, 10),
  shapeCache: {},
};
const SM = {
  post: new THREE.MeshStandardMaterial({ color: 0x8b9199, metalness: 0.7, roughness: 0.4 }),
  back: new THREE.MeshStandardMaterial({ color: 0xa4abb2, metalness: 0.35, roughness: 0.55 }),
};
const catMats = {};
Object.keys(CATEGORY).forEach((k) => {
  const c = CATEGORY[k];
  catMats[k] = {
    face: new THREE.MeshStandardMaterial({ color: c.face, roughness: 0.42, metalness: 0.05, emissive: c.face, emissiveIntensity: 0.14 }),
    edge: new THREE.MeshStandardMaterial({ color: c.edge, roughness: 0.5, metalness: 0.05, emissive: c.edge, emissiveIntensity: 0.1 }),
    ink: new THREE.MeshStandardMaterial({ color: c.ink, roughness: 0.4, metalness: 0.0, emissive: c.ink, emissiveIntensity: 0.12 }),
  };
});
const accentMatCache = {};
function accentMat(hex) {
  return accentMatCache[hex] || (accentMatCache[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, emissive: hex, emissiveIntensity: 0.12 }));
}

function signGeometries(type) {
  if (SG.shapeCache[type]) return SG.shapeCache[type];
  const spec = SIGN_SPECS[type];
  const outline = spec.outline();
  const border = new THREE.ExtrudeGeometry(outline, { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 28 });
  const face = new THREE.ExtrudeGeometry(spec.outline(), { depth: 0.03, bevelEnabled: false, curveSegments: 28 });
  face.scale(spec.inset[0], spec.inset[1], 1);
  const back = new THREE.ShapeGeometry(spec.outline(), 28);
  return (SG.shapeCache[type] = { border, face, back });
}

/* ---- seeded random ---- */
function hashStr(s) { let h = 2166136261 >>> 0; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- generated emblem: unique per product name, 8 different construction styles ---- */
function buildEmblem(agent, R, catKey) {
  const g = new THREE.Group();
  const seed = hashStr(agent.name);
  const rnd = makeRng(seed);
  const light = CATEGORY[catKey].ink === 0xffffff;
  const inkMat = catMats[catKey].ink;
  const accent = accentMat(light
    ? [0xffd166, 0x9bf6ff, 0xcaffbf, 0xffc6ff][seed % 4]
    : [0x1d3557, 0x7b2cbf, 0x0b3d91, 0x6a040f][seed % 4]);
  const Z = 0.05;
  const part = (geo, mat, x, y, sx, sy, sz, rz = 0, z = Z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz;
    m.castShadow = false; g.add(m); return m;
  };
  const style = seed % 8;
  if (style === 0) {                                   // rosette
    const n = 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      part(SG.sphere, inkMat, Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.5, R * 0.2, 0.05, a);
    }
    part(SG.sphere, accent, 0, 0, R * 0.24, R * 0.24, 0.07);
  } else if (style === 1) {                            // concentric rings
    part(SG.torus, inkMat, 0, 0, R * 0.95, R * 0.95, 0.6);
    part(SG.torus, accent, 0, 0, R * 0.63, R * 0.63, 0.6);
    part(SG.torus, inkMat, 0, 0, R * 0.33, R * 0.33, 0.6);
    part(SG.sphere, accent, 0, 0, R * 0.1, R * 0.1, 0.07);
  } else if (style === 2) {                            // orbit
    part(SG.torus, inkMat, 0, 0, R * 0.85, R * 0.85, 0.6);
    part(SG.sphere, accent, 0, 0, R * 0.3, R * 0.3, 0.1);
    const off = rnd() * 6.28;
    for (let k = 0; k < 3; k++) {
      const a = off + (k / 3) * Math.PI * 2;
      part(SG.sphere, inkMat, Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, R * 0.15, R * 0.15, 0.09);
    }
  } else if (style === 3) {                            // spikes
    const n = 8 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      part(SG.box, inkMat, Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.8, R * 0.09, 0.05, a);
    }
    part(SG.torus, accent, 0, 0, R * 0.3, R * 0.3, 0.7);
  } else if (style === 4) {                            // hex cluster
    const hr = R * 0.36, skip = Math.floor(rnd() * 6);
    part(SG.hex, accent, 0, 0, hr * 0.92, hr * 0.92, 0.07);
    for (let k = 0; k < 6; k++) {
      if (k === skip) continue;
      const a = k * Math.PI / 3 + Math.PI / 6;
      part(SG.hex, inkMat, Math.cos(a) * hr * 1.8, Math.sin(a) * hr * 1.8, hr * 0.92, hr * 0.92, 0.06);
    }
  } else if (style === 5) {                            // skyline bars
    for (let k = 0; k < 5; k++) {
      const h = R * (0.7 + rnd() * 1.1);
      part(SG.box, k % 2 ? accent : inkMat, (k - 2) * R * 0.4, h / 2 - R * 0.85, R * 0.28, h, 0.06);
    }
  } else if (style === 6) {                            // chevrons
    for (let k = 0; k < 3; k++) {
      const y = (1 - k) * R * 0.5 - R * 0.05;
      const mat = k === 1 ? accent : inkMat;
      part(SG.box, mat, -R * 0.3, y, R * 0.75, R * 0.14, 0.06, -0.62);
      part(SG.box, mat, R * 0.3, y, R * 0.75, R * 0.14, 0.06, 0.62);
    }
  } else {                                             // spiral of dots
    for (let k = 0; k < 15; k++) {
      const t = k / 14, a = t * Math.PI * 4.2 + rnd() * 0.2, r = R * (0.1 + 0.85 * t);
      part(SG.sphere, k % 4 === 0 ? accent : inkMat, Math.cos(a) * r, Math.sin(a) * r, R * (0.16 - 0.08 * (1 - t)), R * (0.16 - 0.08 * (1 - t)), 0.07);
    }
  }
  return g;
}

/* ---- text layout that fits inside each shape ---- */
function fitHeight(str, y, hBase, spec) {
  const perUnit = measureText(str) / 6;
  let h = hBase;
  for (let i = 0; i < 60; i++) {
    const hw = spec.hw(Math.abs(y) + h / 2) * 0.86;
    if (perUnit * h <= 2 * hw) return h;
    h -= 0.008;
  }
  return Math.max(h, 0.06);
}
function layoutName(name, spec) {
  const single = fitHeight(name, spec.nameY, spec.nameH, spec);
  if (single >= 0.25 || !name.includes(' ')) return [{ str: name, y: spec.nameY, h: single }];
  // try every split point, keep the most legible
  let best = null;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== ' ') continue;
    const a = name.slice(0, i), b = name.slice(i + 1);
    const y1 = spec.nameY + 0.2, y2 = spec.nameY - 0.17;
    const h1 = fitHeight(a, y1, spec.nameH * 0.9, spec), h2 = fitHeight(b, y2, spec.nameH * 0.9, spec);
    const score = Math.min(h1, h2);
    if (!best || score > best.score) best = { score, lines: [{ str: a, y: y1, h: h1 }, { str: b, y: y2, h: h2 }] };
  }
  return best.score > single ? best.lines : [{ str: name, y: spec.nameY, h: single }];
}

/* ---- one complete road sign ---- */
const signHits = [];
function buildSign(agent) {
  const cat = CATEGORY[agent.cat], spec = SIGN_SPECS[cat.shape];
  const mats = catMats[agent.cat];
  const root = new THREE.Group();
  const scale = agent.scale;
  const centerY = (1.5 + spec.height / 2) * scale;

  // posts (unscaled thickness)
  const posts = cat.shape === 'rect' ? [-0.95 * scale, 0.95 * scale] : [0];
  posts.forEach((px) => {
    const h = cat.shape === 'rect' ? centerY - 0.4 * scale : centerY;
    const p = new THREE.Mesh(SG.post, SM.post);
    p.scale.set(1, h + 0.1, 1); p.position.set(px, h / 2 - 0.05, -0.09);
    p.castShadow = true; p.receiveShadow = true; root.add(p);
  });

  const plate = new THREE.Group();
  plate.position.y = centerY; plate.scale.setScalar(scale);
  const geos = signGeometries(cat.shape);
  const border = new THREE.Mesh(geos.border, mats.edge);
  border.position.z = -0.045; border.castShadow = true; border.receiveShadow = true;
  const face = new THREE.Mesh(geos.face, mats.face);
  face.position.z = 0.03; face.receiveShadow = true;
  const back = new THREE.Mesh(geos.back, SM.back);
  back.rotation.y = Math.PI; back.position.z = -0.0665; back.scale.setScalar(1.005); back.receiveShadow = true;
  plate.add(border, face, back);

  const textZ = 0.065;
  const ink = mats.ink;
  layoutName(agent.name, spec).forEach((ln) => {
    const t = buildTextGeometry(ln.str, ln.h, 0.03);
    const m = new THREE.Mesh(t.geo, ink); m.position.set(0, ln.y, textZ); plate.add(m);
  });
  const dText = buildTextGeometry(agent.dateStr, fitHeight(agent.dateStr, spec.dateY, spec.dateH, spec), 0.03);
  const dm = new THREE.Mesh(dText.geo, ink); dm.position.set(0, spec.dateY, textZ); plate.add(dm);

  const emblem = buildEmblem(agent, spec.emblemR, agent.cat);
  emblem.position.set(0, spec.emblemY, textZ - 0.03);
  plate.add(emblem);
  root.add(plate);

  face.userData.agent = agent;
  border.userData.agent = agent;
  signHits.push(face, border);

  // stand beside the road at arc length agent.s, then turn to face the rider approaching
  // along the curve (aim at the rider's lane ~24 m back so signs read well in bends)
  const here = roadAt(agent.s), behind = roadAt(agent.s - 24);
  const px = here.x + here.rx * agent.side * agent.lat, pz = here.z + here.rz * agent.side * agent.lat;
  const tx = behind.x + behind.rx * RIDER_X, tz = behind.z + behind.rz * RIDER_X;
  root.position.set(px, 0, pz);
  root.rotation.y = Math.atan2(tx - px, tz - pz);
  agent.root = root; agent.plate = plate;
  agent.center = new THREE.Vector3(px, centerY, pz);
  return root;
}
