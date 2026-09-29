/* =====================================================================
   PART 1 — timeline data, spacing along the road, procedural stroke font
   ===================================================================== */

// name, date (~ = estimate), category, what the date marks
const AGENTS = [
  ['ASTRBOT', '2022-12-08', 'selfhost', 'Repo created'],
  ['LINDY', '2023-03-21', 'hosted', 'Assistant revealed with waitlist'],
  ['AGENT ZERO', '2024-06-10', 'selfhost', 'First commit'],
  ['MANUS', '2025-03-06', 'hosted', 'Invite-only preview announced'],
  ['POKE', '2025-09-08', 'hosted', 'Public launch with seed round'],
  ['OPENCLAW', '2025-11-24', 'selfhost', 'Repo created (as warelay)'],
  ['LETTA', '2025-12-16', 'hosted', 'Letta Code announced'],
  ['VIOLA', '~2026-01-08', 'device', 'Estimate from terms date'],
  ['CLAUDE COWORK', '2026-01-12', 'hosted', 'Research preview'],
  ['BLOCKIT', '2026-01-22', 'hosted', 'Emerged from stealth'],
  ['NEBULA', '2026-01-25', 'hosted', 'First public announcement'],
  ['LAZZY', '~2026-01-28', 'device', 'Estimate from privacy policy date'],
  ['MOLTWORKER', '2026-01-29', 'stack', 'Cloudflare blog post'],
  ['NANOCLAW', '2026-01-31', 'selfhost', 'Repo created'],
  ['NANOBOT', '2026-02-01', 'selfhost', 'Repo created and launched'],
  ['MICROCLAW', '2026-02-07', 'selfhost', 'First commit'],
  ['MIMICLAW', '2026-02-07', 'hardware', 'First public post'],
  ['PICOCLAW', '2026-02-09', 'selfhost', 'Launch and v0.0.1'],
  ['TINYAGI', '2026-02-09', 'selfhost', 'First commit as TinyClaw'],
  ['BABYCLAW', '2026-02-09', 'selfhost', 'First commit'],
  ['HAPPYCAPY', '2026-02-11', 'hosted', 'Product Hunt launch'],
  ['IRONCLAW', '2026-02-12', 'selfhost', 'First release v0.1.0'],
  ['MOLTIS', '2026-02-12', 'selfhost', 'Launch announced'],
  ['ZEROCLAW', '2026-02-13', 'selfhost', 'Repo created'],
  ['ZEPTOCLAW', '2026-02-13', 'selfhost', 'Launch'],
  ['MAJORDOMO', '2026-02-15', 'hosted', 'iOS App Store v1.0'],
  ['HERMITCLAW', '2026-02-15', 'selfhost', 'Initial release'],
  ['LOBU', '2026-02-15', 'selfhost', 'Renamed to Lobu'],
  ['DROIDCLAW', '2026-02-15', 'hardware', 'Announcement'],
  ['NULLCLAW', '2026-02-17', 'selfhost', 'First commit'],
  ['EASYCLAW', '2026-02-17', 'device', 'First commit'],
  ['ZCLAW', '2026-02-21', 'hardware', 'Show HN and first tag'],
  ['HERMES AGENT', '2026-02-25', 'selfhost', 'Announcement and public release'],
  ['OPENFANG', '2026-02-26', 'selfhost', 'First commit and v0.1.0'],
  ['QWENPAW', '2026-02-27', 'selfhost', 'First public release (as CoPaw)'],
  ['PERPLEXITY PERSONAL COMPUTER', '2026-03-11', 'device', 'Mac announced with waitlist'],
  ['NVIDIA NEMOCLAW', '2026-03-16', 'stack', 'Announced at GTC'],
  ['TRUSTCLAW', '2026-05-05', 'selfhost', 'Open-source repo first commit'],
  ['GEMINI SPARK', '2026-05-19', 'hosted', 'Announced at Google I/O'],
  ['MICROSOFT SCOUT', '2026-06-02', 'device', 'Announced at Build (private preview)'],
  ['CHATGPT WORK', '2026-07-09', 'hosted', 'Staged release'],
  ['GROK BOT', '2026-08-11', 'hosted', 'Beta launch'],
  ['FO', '2026-08-25', 'new', 'Alpha, invite-only'],
  ['AKO', '2026-08-26', 'hosted', 'Public launch announcement'],
  ['INSTINCT', '2026-08-26', 'hosted', 'Public announcement, invite-only beta'],
  ['FAMBOT', '2026-09-01', 'new', 'Free public beta'],
  ['CATCH', '2026-09-02', 'new', 'Emerged from stealth'],
  ['META MUSE', '2026-09-08', 'hosted', 'US launch on web, iOS, Android'],
  ['OPENMUSE', '2026-09-11', 'new', 'Show HN, early preview'],
  ['SAI', '2026-09-16', 'new', 'General availability'],
  ['RENE', '2026-09-16', 'new', 'Multiplayer launch announced'],
  ['HAVEN', '2026-09-17', 'new', 'Public launch from private beta'],
  ['RABBIT OS3', '2026-09-22', 'new', 'General release'],
];

const CATEGORY = {
  hosted:   { label: 'Hosted service',        shape: 'rect',     face: 0x0b7a4b, edge: 0xffffff, ink: 0xffffff },
  device:   { label: 'Device assistant',      shape: 'circle',   face: 0x1456b8, edge: 0xffffff, ink: 0xffffff },
  selfhost: { label: 'Self-operated gateway', shape: 'diamond',  face: 0xf7c600, edge: 0x111111, ink: 0x111111 },
  stack:    { label: 'Operator stack',        shape: 'hexagon',  face: 0xf06a00, edge: 0x111111, ink: 0x111111 },
  hardware: { label: 'Specialized device',    shape: 'pentagon', face: 0xb9e000, edge: 0x111111, ink: 0x111111 },
  new:      { label: 'Newest launch',         shape: 'octagon',  face: 0xc8102e, edge: 0xffffff, ink: 0xffffff },
};

const DAY_MS = 86400000;
function parseDate(str) {
  const clean = str.replace('~', '');
  const [y, m, d] = clean.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;     // days since epoch
}
AGENTS.forEach((a, i) => {
  a.idx = i;
  a.name = a[0]; a.dateStr = a[1]; a.cat = a[2]; a.note = a[3];
  a.days = parseDate(a[1]);
  a.est = a[1].startsWith('~');
});
AGENTS.sort((p, q) => p.days - q.days || p.idx - q.idx);

/* ---- spacing along the road -------------------------------------------------------
   Real launch dates are wildly uneven (20 launches in one February fortnight, then 447 days
   of nothing), so a strictly proportional road would either bunch signs together or leave
   long empty stretches. The gap to the next sign therefore grows with the time gap but
   saturates:  gap = GMIN + (GMAX - GMIN) * (1 - exp(-days / TAU)).
   Order is always exact, bigger date gaps always mean bigger road gaps.                ---- */
const SPACING = { GMIN: 10.5, GMAX: 26, TAU: 25 };
const SIGN_SCALE = 1.5;
(function layoutSigns() {
  let s = 0;
  AGENTS.forEach((a, i) => {
    if (i > 0) {
      const dd = a.days - AGENTS[i - 1].days;
      s += SPACING.GMIN + (SPACING.GMAX - SPACING.GMIN) * (1 - Math.exp(-dd / SPACING.TAU));
    }
    a.s = s;
    a.side = i % 2 === 0 ? 1 : -1;                    // alternate right / left of the road
    a.lat = 6.0 + ((i * 7) % 5) * 0.3;                // 6.0 - 7.2 m from the centre line
    a.scale = SIGN_SCALE;
  });
})();

/* date <-> distance along the road (piecewise linear between signs, clamped at the ends) */
function dateAtS(s) {
  const A = AGENTS;
  if (s <= A[0].s) return A[0].days;
  for (let i = 1; i < A.length; i++) {
    if (s <= A[i].s) {
      const p = A[i - 1], q = A[i];
      const u = q.s === p.s ? 1 : (s - p.s) / (q.s - p.s);
      return p.days + (q.days - p.days) * u;
    }
  }
  return A[A.length - 1].days;
}
function fmtDays(d) {
  const dt = new Date(Math.round(d) * DAY_MS);
  return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
}

/* =====================================================================
   Stroke font — every glyph is a set of polylines on a 4 x 6 grid.
   Text geometry is built as thin extruded prisms merged into ONE mesh.
   (No canvas, no SVG, no font files.)
   ===================================================================== */
const GLYPHS = {
  'A': [4, [[[0,0],[2,6],[4,0]], [[0.67,2],[3.33,2]]]],
  'B': [4, [[[0,0],[0,6],[2.8,6],[3.6,5.2],[3.6,4],[2.8,3.2],[0,3.2]], [[2.8,3.2],[3.8,2.4],[3.8,0.8],[3,0],[0,0]]]],
  'C': [4, [[[4,1],[3,0],[1,0],[0,1],[0,5],[1,6],[3,6],[4,5]]]],
  'D': [4, [[[0,0],[0,6],[2.6,6],[4,4.6],[4,1.4],[2.6,0],[0,0]]]],
  'E': [4, [[[4,0],[0,0],[0,6],[4,6]], [[0,3],[3,3]]]],
  'F': [4, [[[0,0],[0,6],[4,6]], [[0,3],[3,3]]]],
  'G': [4, [[[4,5],[3,6],[1,6],[0,5],[0,1],[1,0],[3,0],[4,1],[4,3],[2.2,3]]]],
  'H': [4, [[[0,0],[0,6]], [[4,0],[4,6]], [[0,3],[4,3]]]],
  'I': [2, [[[1,0],[1,6]]]],
  'J': [4, [[[3.5,6],[3.5,1],[2.5,0],[1,0],[0,1]]]],
  'K': [4, [[[0,0],[0,6]], [[4,6],[0,2.5]], [[1.3,3.7],[4,0]]]],
  'L': [4, [[[0,6],[0,0],[4,0]]]],
  'M': [4, [[[0,0],[0,6],[2,3],[4,6],[4,0]]]],
  'N': [4, [[[0,0],[0,6],[4,0],[4,6]]]],
  'O': [4, [[[1,0],[0,1],[0,5],[1,6],[3,6],[4,5],[4,1],[3,0],[1,0]]]],
  'P': [4, [[[0,0],[0,6],[3,6],[4,5],[4,3.9],[3,2.9],[0,2.9]]]],
  'Q': [4, [[[1,0],[0,1],[0,5],[1,6],[3,6],[4,5],[4,1],[3,0],[1,0]], [[2.4,1.4],[4.2,-0.4]]]],
  'R': [4, [[[0,0],[0,6],[3,6],[4,5],[4,3.9],[3,2.9],[0,2.9]], [[1.8,2.9],[4,0]]]],
  'S': [4, [[[4,5],[3,6],[1,6],[0,5],[0,4],[1,3],[3,3],[4,2],[4,1],[3,0],[1,0],[0,1]]]],
  'T': [4, [[[0,6],[4,6]], [[2,6],[2,0]]]],
  'U': [4, [[[0,6],[0,1],[1,0],[3,0],[4,1],[4,6]]]],
  'V': [4, [[[0,6],[2,0],[4,6]]]],
  'W': [4, [[[0,6],[1,0],[2,4],[3,0],[4,6]]]],
  'X': [4, [[[0,0],[4,6]], [[0,6],[4,0]]]],
  'Y': [4, [[[0,6],[2,3]], [[4,6],[2,3]], [[2,3],[2,0]]]],
  'Z': [4, [[[0,6],[4,6],[0,0],[4,0]]]],
  '0': [3.4, [[[0.9,0],[0,1],[0,5],[0.9,6],[2.5,6],[3.4,5],[3.4,1],[2.5,0],[0.9,0]]]],
  '1': [3, [[[0.4,4.8],[1.6,6],[1.6,0]]]],
  '2': [4, [[[0,5],[1,6],[3,6],[4,5],[4,4],[0,0],[4,0]]]],
  '3': [4, [[[0,5],[1,6],[3,6],[4,5],[4,4],[3,3.1],[1.6,3.1]], [[3,3.1],[4,2.2],[4,1],[3,0],[1,0],[0,1]]]],
  '4': [4, [[[3,0],[3,6],[0,2],[4,2]]]],
  '5': [4, [[[4,6],[0.4,6],[0,3.4],[2.6,3.7],[4,2.7],[4,1],[3,0],[1,0],[0,1]]]],
  '6': [4, [[[3.6,5.6],[2.8,6],[1,6],[0,5],[0,1],[1,0],[3,0],[4,1],[4,2.4],[3,3.3],[1,3.3],[0,2.6]]]],
  '7': [4, [[[0,6],[4,6],[1.5,0]]]],
  '8': [4, [[[1,3],[0,4],[0,5],[1,6],[3,6],[4,5],[4,4],[3,3],[1,3],[0,2],[0,1],[1,0],[3,0],[4,1],[4,2],[3,3]]]],
  '9': [4, [[[0.4,0.4],[1.2,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,3.6],[1,2.7],[3,2.7],[4,3.4]]]],
  '-': [3.4, [[[0.2,3],[3.2,3]]]],
  '.': [1, [[[0.5,0],[0.5,0.05]]]],
  '~': [4, [[[0,2.4],[1,3.6],[2,2.4],[3,3.6],[4,2.4]]]],
  '/': [3.4, [[[0,0],[3.4,6]]]],
  ' ': [3, []],
};
const GLYPH_GAP = 1.5;

function measureText(str) {
  let w = 0;
  for (const ch of str) { const g = GLYPHS[ch] || GLYPHS[' ']; w += g[0] + GLYPH_GAP; }
  return Math.max(0, w - GLYPH_GAP);
}

/* Builds one BufferGeometry for the string. Origin is the text centre; readable from +Z.
   height = cap height in metres, depth = relief in metres. */
function buildTextGeometry(str, height, depth) {
  const unit = height / 6;
  const stroke = unit * 0.95;
  const total = measureText(str) * unit;
  const pos = [], nor = [];
  const quad = (a, b, c, d, n) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) nor.push(n[0], n[1], n[2]);
  };
  const prism = (x0, y0, x1, y1) => {
    let dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
    const hw = stroke / 2;
    const ax = x0 - dx * hw, ay = y0 - dy * hw, bx = x1 + dx * hw, by = y1 + dy * hw;
    const nx = -dy * hw, ny = dx * hw;
    const P = [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]];
    const z0 = 0, z1 = depth;
    // top face
    quad([P[0][0], P[0][1], z1], [P[3][0], P[3][1], z1], [P[2][0], P[2][1], z1], [P[1][0], P[1][1], z1], [0, 0, 1]);
    // side faces
    for (let i = 0; i < 4; i++) {
      const p = P[i], q = P[(i + 1) % 4];
      const ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey) || 1;
      const n = [-ey / el, ex / el, 0];
      quad([p[0], p[1], z0], [p[0], p[1], z1], [q[0], q[1], z1], [q[0], q[1], z0], n);
    }
  };
  let cursor = -total / 2;
  for (const ch of str) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (const line of g[1]) {
      for (let i = 0; i < line.length - 1; i++) {
        prism(cursor + line[i][0] * unit, (line[i][1] - 3) * unit,
              cursor + line[i + 1][0] * unit, (line[i + 1][1] - 3) * unit);
      }
    }
    cursor += (g[0] + GLYPH_GAP) * unit;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  return { geo, width: total };
}
