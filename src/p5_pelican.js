/* =====================================================================
   PART 5 — the pelican (built in bike-local space, posed every frame with IK)
   ===================================================================== */
const PM = {
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true }),
  whiteFlat: new THREE.MeshStandardMaterial({ color: 0xf8f4ea, roughness: 0.88 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xeee6d4, roughness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24262d, roughness: 0.7, metalness: 0.05 }),
  bill: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, vertexColors: true }),
  pouch: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, vertexColors: true }),
  leg: new THREE.MeshStandardMaterial({ color: 0xf28c28, roughness: 0.55 }),
  legDark: new THREE.MeshStandardMaterial({ color: 0xd4661a, roughness: 0.6 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xfffbe8, roughness: 0.25 }),
  eyeRing: new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.4 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15 }),
  glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

const PEL = {
  bodyRest: new V3(-0.10, 1.16, 0), pitch: 0.38,
  hipLocal: new V3(-0.02, -0.16, 0.115),
  shoulderLocal: new V3(0.10, 0.10, 0.215),
  neckBaseLocal: new V3(0.29, 0.10, 0),
  headRest: new V3(0.34, 1.58, 0),
  thigh: 0.43, shin: 0.46, upperArm: 0.42, foreArm: 0.42,
};

/* ---- loft: an elliptical tube along a planar centre-line, rebuilt cheaply on demand ---- */
class Loft {
  constructor(rings, sides, material, colorFn) {
    this.rings = rings; this.sides = sides;
    const n = rings * (sides + 1);
    this.pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3), idx = [];
    for (let i = 0; i < rings; i++) {
      const c = colorFn(i / (rings - 1));
      for (let j = 0; j <= sides; j++) { const k = (i * (sides + 1) + j) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
    }
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this._c = new V3(); this._c2 = new V3(); this._t = new V3(); this._u = new V3(); this._s = new V3(0, 0, 1);
  }
  update(centerFn, wFn, hFn) {
    const { rings, sides, pos, _c, _c2, _t, _u, _s } = this;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      centerFn(t, _c);
      centerFn(Math.min(1, t + 0.02), _c2); centerFn(Math.max(0, t - 0.02), _t);
      _t.subVectors(_c2, _t).normalize();
      _u.crossVectors(_s, _t).normalize();
      const w = wFn(t), h = hFn(t);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2, ca = Math.cos(a) * w, sa = Math.sin(a) * h, k = (i * (sides + 1) + j) * 3;
        pos[k] = _c.x + _s.x * ca + _u.x * sa; pos[k + 1] = _c.y + _s.y * ca + _u.y * sa; pos[k + 2] = _c.z + _s.z * ca + _u.z * sa;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

/* ---- two-bone IK in 3D with a pole vector for the joint direction ---- */
const _ikd = new V3(), _ikp = new V3();
function solveIK(root, target, l1, l2, pole, outMid, outEnd) {
  _ikd.subVectors(target, root);
  const rawLen = Math.max(_ikd.length(), 1e-5);
  const dist = clamp(rawLen, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _ikd.divideScalar(rawLen);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  _ikp.copy(pole).addScaledVector(_ikd, -pole.dot(_ikd)).normalize();
  outMid.copy(root).addScaledVector(_ikd, a).addScaledVector(_ikp, h);
  outEnd.copy(root).addScaledVector(_ikd, dist);
}

/* ---- shared unit shapes ---- */
const TAPER = new THREE.CylinderGeometry(1, 0.66, 1, 14);
const X_AXIS = new V3(1, 0, 0);
const FEATHER_G = new THREE.SphereGeometry(1, 10, 8).translate(0, 1, 0);      // base at origin, extends +Y (length 2)

function tinted(geo, fn) {                                                      // per-vertex colour by position/normal
  const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
function webbedFootGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.03, -0.02); s.lineTo(0.05, -0.055); s.lineTo(0.17, -0.078); s.lineTo(0.115, -0.03);
  s.lineTo(0.205, 0.0); s.lineTo(0.115, 0.03); s.lineTo(0.17, 0.078); s.lineTo(0.05, 0.055); s.lineTo(-0.03, 0.02); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function buildPelican() {
  const grp = new THREE.Group();
  bike.rig.add(grp);
  const add = (parent, mesh, cast = true) => { mesh.castShadow = cast; parent.add(mesh); return mesh; };

  /* ---------- torso ---------- */
  const body = new THREE.Group(); grp.add(body);
  const bodyGeo = tinted(new THREE.SphereGeometry(1, 40, 28), (c, x, y, z, nx, ny) => {
    const k = smooth(-0.6, 0.35, ny); c.setRGB(lerp(0.93, 1.0, k), lerp(0.89, 1.0, k), lerp(0.80, 0.98, k));
  });
  const torso = add(body, new THREE.Mesh(bodyGeo, PM.white)); torso.scale.set(0.42, 0.225, 0.235);
  const chestGeo = tinted(new THREE.SphereGeometry(1, 28, 20), (c, x, y, z, nx, ny) => { const k = smooth(-0.6, 0.4, ny); c.setRGB(lerp(0.94, 1, k), lerp(0.9, 1, k), lerp(0.82, 0.98, k)); });
  const chest = add(body, new THREE.Mesh(chestGeo, PM.white)); chest.position.set(0.2, -0.035, 0); chest.scale.set(0.22, 0.205, 0.215);
  const rump = add(body, new THREE.Mesh(chestGeo, PM.white)); rump.position.set(-0.29, 0.005, 0); rump.scale.set(0.19, 0.15, 0.165);

  // tail fan
  const tail = new THREE.Group(); tail.position.set(-0.40, 0.03, 0); body.add(tail);
  const tailFeathers = [];
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(FEATHER_G, k % 2 ? PM.whiteFlat : PM.cream);
    const spread = (k - 3) * 0.16;
    f.userData = { spread, len: 0.21 - Math.abs(k - 3) * 0.012 };
    f.castShadow = true; tail.add(f); tailFeathers.push(f);
  }

  /* ---------- neck (dynamic loft) ---------- */
  const neck = new Loft(24, 14, PM.white, (t) => new THREE.Color().setRGB(1 - 0.05 * (1 - t), 1 - 0.06 * (1 - t), 0.98 - 0.08 * (1 - t)));
  grp.add(neck.mesh);

  /* ---------- head + bill + pouch (rigid group, pouch deforms) ---------- */
  const head = new THREE.Group(); grp.add(head);
  const skull = add(head, new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), PM.whiteFlat)); skull.scale.set(0.118, 0.098, 0.096);
  const brow = add(head, new THREE.Mesh(UNIT_SPHERE, PM.whiteFlat)); brow.position.set(0.05, 0.03, 0); brow.scale.set(0.06, 0.045, 0.08);
  const crest = add(head, new THREE.Mesh(FEATHER_G, PM.whiteFlat)); crest.position.set(-0.075, 0.04, 0); crest.scale.set(0.012, 0.055, 0.03); crest.rotation.z = 1.9;

  const billCenter = (t, o) => o.set(0.07 + t * 0.52, -0.012 - 0.03 * t - 0.06 * t * t * t, 0);
  const billW = (t) => 0.052 * Math.pow(1 - t, 0.75) + 0.005;
  const billH = (t) => 0.031 * (1 - 0.55 * t) * (t > 0.9 ? 1 - (t - 0.9) * 4 : 1) + 0.004;
  const bill = new Loft(28, 16, PM.bill, (t) => {
    const c1 = new THREE.Color(0xf6c04a), c2 = new THREE.Color(0xf29a2e), c3 = new THREE.Color(0xd2541f);
    return t < 0.7 ? c1.lerp(c2, t / 0.7) : c2.lerp(c3, Math.pow((t - 0.7) / 0.3, 1.5));
  });
  bill.update(billCenter, billW, billH); head.add(bill.mesh);
  const nail = add(head, new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 8), PM.legDark));
  nail.position.set(0.07 + 0.52 + 0.006, -0.012 - 0.03 - 0.06 - 0.012, 0); nail.rotation.z = Math.PI + 0.75;

  const pouch = new Loft(28, 16, PM.pouch, (t) => new THREE.Color(0xf6b592).lerp(new THREE.Color(0xf8ccb0), Math.sin(t * Math.PI) * 0.7));
  const pouchState = { sag: 1 };
  const pouchCenter = (t, o) => {
    const sag = 0.078 * Math.sin(Math.PI * Math.pow(t, 0.85)) * pouchState.sag * (1 - 0.25 * t);
    return o.set(0.065 + t * 0.515, -0.02 - 0.03 * t - 0.06 * t * t * t - 0.02 * (1 - t) - sag * 0.9, 0);
  };
  const pouchW = (t) => (0.042 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.006) * (1 - 0.25 * t);
  const pouchH = (t) => 0.016 + 0.062 * Math.sin(Math.PI * Math.pow(t, 0.85)) * pouchState.sag * (1 - 0.3 * t);
  head.add(pouch.mesh);

  const eyes = [];
  [1, -1].forEach((side) => {
    const e = new THREE.Group(); e.position.set(0.046, 0.024, side * 0.066);
    const ring = new THREE.Mesh(UNIT_SPHERE, PM.eyeRing); ring.scale.set(0.03, 0.03, 0.02); e.add(ring);
    const ball = new THREE.Mesh(UNIT_SPHERE, PM.eyeWhite); ball.position.z = side * 0.008; ball.scale.set(0.022, 0.022, 0.016); e.add(ball);
    const pup = new THREE.Mesh(UNIT_SPHERE, PM.pupil); pup.position.set(0.006, -0.002, side * 0.019); pup.scale.set(0.0125, 0.0125, 0.008); e.add(pup);
    const gl = new THREE.Mesh(UNIT_SPHERE, PM.glint); gl.position.set(0.011, 0.006, side * 0.024); gl.scale.setScalar(0.0038); e.add(gl);
    head.add(e); eyes.push(e);
  });

  /* ---------- legs: feathered thigh, orange tarsus, webbed foot on the pedal ---------- */
  const footGeo = webbedFootGeometry();
  const legs = [1, -1].map((side) => {
    const thigh = add(grp, new THREE.Mesh(TAPER, PM.whiteFlat));
    const knee = add(grp, new THREE.Mesh(UNIT_SPHERE, PM.whiteFlat)); knee.scale.setScalar(0.058);
    const shinM = add(grp, new THREE.Mesh(UNIT_CYL, PM.leg));
    const ankle = add(grp, new THREE.Mesh(UNIT_SPHERE, PM.leg)); ankle.scale.setScalar(0.027);
    const foot = new THREE.Group(); grp.add(foot);
    const web = new THREE.Mesh(footGeo, PM.leg); web.castShadow = true; foot.add(web);
    [-0.06, 0, 0.06].forEach((zz, i) => {
      const toe = new THREE.Mesh(UNIT_CYL, PM.legDark); toe.castShadow = true;
      place(toe, v3(0.0, 0.014, 0), v3(i === 1 ? 0.2 : 0.165, 0.014, zz * 1.2), 0.0065); foot.add(toe);
    });
    return { side, thigh, knee, shinM, ankle, foot, mid: new V3(), end: new V3(), hip: new V3(), pedal: new V3(), target: new V3() };
  });

  /* ---------- wings as arms holding the hoods, with trailing feathers ---------- */
  const wings = [1, -1].map((side) => {
    const upper = add(grp, new THREE.Mesh(TAPER, PM.whiteFlat));
    const elbow = add(grp, new THREE.Mesh(UNIT_SPHERE, PM.whiteFlat)); elbow.scale.setScalar(0.052);
    const fore = add(grp, new THREE.Mesh(TAPER, PM.whiteFlat));
    const mitt = add(grp, new THREE.Mesh(UNIT_SPHERE, PM.dark)); mitt.scale.set(0.06, 0.042, 0.05);
    const feathers = [];
    for (let k = 0; k < 10; k++) {                                  // coverts (white, overlapping)
      const f = new THREE.Mesh(FEATHER_G, k % 2 ? PM.whiteFlat : PM.cream);
      f.userData = { u: 0.05 + k * 0.10, len: 0.16 + 0.014 * k, w: 0.075, th: 0.009, dirY: -0.20 - 0.02 * k, ph: k * 0.7, dark: false };
      f.castShadow = true; grp.add(f); feathers.push(f);
    }
    for (let k = 0; k < 11; k++) {                                  // flight feathers (black, long)
      const f = new THREE.Mesh(FEATHER_G, PM.dark);
      f.userData = { u: 0.34 + k * 0.066, len: 0.28 + 0.013 * k, w: 0.05, th: 0.008, dirY: -0.05 - 0.10 * (k / 10), ph: k * 0.9 + 2, dark: true };
      f.castShadow = true; grp.add(f); feathers.push(f);
    }
    const mass = add(grp, new THREE.Mesh(UNIT_SPHERE, PM.whiteFlat)); mass.scale.set(0.15, 0.095, 0.095);
    return { side, upper, elbow, fore, mitt, mass, feathers, sh: new V3(), el: new V3(), wr: new V3(), target: new V3() };
  });

  return { grp, body, torso, neck, head, bill, pouch, pouchCenter, pouchW, pouchH, pouchState, eyes, legs, wings, tail, tailFeathers, crest };
}
const pelican = buildPelican();

/* =====================================================================
   Pose the pelican for one instant. st: crankAngle, steer, time, speed (m/s)
   ===================================================================== */
const _bm = new THREE.Matrix4(), _q1 = new Q4(), _q2 = new Q4(), _va = new V3(), _vb = new V3(), _vc = new V3(), _vd = new V3(), _pole = new V3();
const _neckP = [new V3(), new V3(), new V3(), new V3()];
function bezier(p, t, o) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return o.set(p[0].x * a + p[1].x * b + p[2].x * c + p[3].x * d, p[0].y * a + p[1].y * b + p[2].y * c + p[3].y * d, p[0].z * a + p[1].z * b + p[2].z * c + p[3].z * d);
}

function posePelican(st) {
  const P = pelican, th = st.crankAngle, t = st.time;
  const wind = clamp(st.speed / 7.5, 0, 1);

  /* torso: rides the saddle, rocks with each pedal stroke */
  const bob = 0.011 * Math.sin(2 * th + 0.9) * wind, sway = 0.014 * Math.sin(th + 0.4) * wind;
  P.body.position.set(PEL.bodyRest.x, PEL.bodyRest.y + bob, sway);
  P.body.rotation.set(0.05 * Math.sin(th + 0.4) * wind, 0.03 * Math.sin(th + 1.6) * wind, PEL.pitch + 0.018 * Math.sin(2 * th + 0.2) * wind);
  P.body.updateMatrix();
  _bm.copy(P.body.matrix);

  /* head: stabilised (birds do this), so the neck absorbs the torso motion */
  _va.copy(PEL.neckBaseLocal).applyMatrix4(_bm);
  const hx = PEL.headRest.x + 0.004 * Math.sin(2 * th), hy = PEL.headRest.y + 0.004 * Math.sin(2 * th + 1.4) + 0.006 * Math.sin(t * 0.9), hz = 0.006 * Math.sin(th * 0.5 + 0.3);
  P.head.position.set(hx, hy, hz);
  P.head.rotation.z = -0.10 + 0.02 * Math.sin(2 * th + 1.0) - 0.05 * Math.sin(t * 0.7);
  P.head.rotation.y = 0.04 * Math.sin(t * 0.6);
  _neckP[0].set(_va.x - 0.03, _va.y - 0.02, 0);
  _neckP[1].set(_va.x + 0.03, _va.y + 0.15, 0);
  _neckP[2].set(hx - 0.14, hy - 0.05, hz * 0.5);
  _neckP[3].set(hx - 0.045, hy - 0.035, hz);
  P.neck.update((u, o) => bezier(_neckP, u, o),
    (u) => 0.124 - 0.056 * smooth(0, 1, u) + 0.010 * Math.sin(u * Math.PI),
    (u) => 0.124 - 0.056 * smooth(0, 1, u) + 0.010 * Math.sin(u * Math.PI));

  /* pouch wobble + blink + crest flutter */
  P.pouchState.sag = 1 + 0.10 * Math.sin(2 * th + 0.5) * wind + 0.05 * Math.sin(t * 7.0) * wind;
  P.pouch.update(P.pouchCenter, P.pouchW, P.pouchH);
  const bph = t % 3.4, blink = bph < 0.14 ? Math.sin((bph / 0.14) * Math.PI) : 0;
  P.eyes.forEach((e) => { e.scale.y = 1 - 0.9 * blink; });
  P.crest.rotation.z = 1.9 - 0.35 * wind + 0.12 * Math.sin(t * 11);

  /* tail fan */
  P.tailFeathers.forEach((f, i) => {
    const u = f.userData;
    f.rotation.set(0, 0, 0);
    _va.set(-1, 0.12 + 0.04 * Math.sin(t * 9 + i) * wind, u.spread).normalize();
    f.quaternion.setFromUnitVectors(Y_AXIS, _va);
    f.scale.set(0.01, u.len * 0.5, 0.032);
  });

  /* legs: hip on the saddle, foot on the pedal, knee forward and slightly out */
  P.legs.forEach((L) => {
    L.hip.set(PEL.hipLocal.x, PEL.hipLocal.y, PEL.hipLocal.z * L.side).applyMatrix4(_bm);
    pedalPos(L.side, th, L.pedal);
    const ang = th + (L.side > 0 ? 0 : Math.PI);
    L.target.copy(L.pedal).add(_va.set(-0.03, 0.064, 0));
    _pole.set(1, 0.05, 0.18 * L.side);
    solveIK(L.hip, L.target, PEL.thigh, PEL.shin, _pole, L.mid, L.end);
    place(L.thigh, L.mid, L.hip, 0.072);
    L.knee.position.copy(L.mid);
    place(L.shinM, L.mid, L.end, 0.02);
    L.ankle.position.copy(L.end);
    L.foot.position.copy(L.pedal).add(_va.set(-0.045, 0.021, 0));
    L.foot.rotation.set(0, 0, 0.05 - 0.22 * Math.sin(ang));
  });

  /* wings: shoulders on the chest, wing tips wrap the hoods (they follow steering) */
  P.wings.forEach((W) => {
    W.sh.set(PEL.shoulderLocal.x, PEL.shoulderLocal.y, PEL.shoulderLocal.z * W.side).applyMatrix4(_bm);
    gripTarget(W.side, st.steer, W.target);
    _pole.set(-0.25, -0.35, W.side * 1.0);
    solveIK(W.sh, W.target, PEL.upperArm, PEL.foreArm, _pole, W.el, W.wr);
    place(W.upper, W.el, W.sh, 0.072);
    W.mass.position.copy(W.sh).lerp(W.el, 0.16); W.mass.quaternion.setFromUnitVectors(X_AXIS, _va.subVectors(W.el, W.sh).normalize());
    W.elbow.position.copy(W.el);
    place(W.fore, W.wr, W.el, 0.058);
    W.mitt.position.copy(W.wr);

    W.feathers.forEach((f) => {
      const u = f.userData;
      if (u.u < 0.5) _vb.lerpVectors(W.sh, W.el, u.u * 2); else _vb.lerpVectors(W.el, W.wr, (u.u - 0.5) * 2);
      const fl = Math.sin(t * 8 + u.ph) * 0.05 * wind + Math.sin(t * 2.3 + u.ph) * 0.02;
      _vc.set(-1, u.dirY + fl, W.side * 0.08).normalize();
      f.position.copy(_vb);
      f.quaternion.setFromUnitVectors(Y_AXIS, _vc);
      f.scale.set(u.w, u.len * 0.5, u.th);
    });
  });
}
