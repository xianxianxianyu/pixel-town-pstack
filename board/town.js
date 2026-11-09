import { openSessionLink, requestOpenFile, workspacesFromMessage } from './navigation.js';
import { GOAL_PHASES, attentionItems, evidenceRequest, mailboxItems, openFindings, recentLeavers, residentNameplate, sortResidents } from './live-data.js';
import { CHARACTERS, PALETTE, PLAQUES, PROPS, SPRITES, characterLayers, plaqueForWorkflow, rasterize } from './art.js';

(() => {
  'use strict';
  const B = window.PstackBoard;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- World layout: art pixels; one SVG user unit is one art pixel ----------
  // Four equal quadrants (three rooms and the park) sit inside one even, tree-lined margin around
  // a round square whose fountain marks the exact centre. Doors lie on the quadrant axes, so one
  // avenue and two cross streets make the whole road network.
  const WORLD = { w: 472, h: 360 };
  const MARGIN = 12;
  const ROOM = { w: 176, h: 112 };
  const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
  const WEST = MARGIN + ROOM.w / 2, EAST = WORLD.w - WEST;
  const BAND = { top: MARGIN + ROOM.h, bottom: WORLD.h - MARGIN - ROOM.h }; // between the two rows
  const rooms = {
    construction: { name: '工地', purpose: '把新需求盖起来', x: MARGIN, y: MARGIN, door: WEST, floor: 'dirt', wall: 'site', trim: ['B', 'u'], sign: ['B', 'W'] },
    detective: { name: '侦探社', purpose: '找问题、给证据', x: EAST - ROOM.w / 2, y: MARGIN, door: EAST, floor: 'planks', wall: 'study', trim: ['P', 'p'], sign: ['P', 'W'], chimney: 140 },
    clinic: { name: '灭虫急诊站', purpose: '从症状到修复', x: EAST - ROOM.w / 2, y: BAND.bottom, door: EAST, floor: 'clinic', wall: 'clinic', trim: ['R', 'r'], sign: ['R', 'W'], chimney: 158 },
  };
  const PARK = { x: MARGIN, y: BAND.bottom, w: ROOM.w, h: ROOM.h, gate: WEST };
  const north = (room) => room.y < CENTER.y;
  // The study has seven stations (three behind four); the other buildings keep five.
  // Each station is a 39 px-high bay: plaque on top, prop and residents on its floor line.
  const BACK_ROW = [[6, 23, 53, 39], [61, 23, 53, 39], [116, 23, 53, 39]];
  const STATION_LAYOUT = {
    construction: [...BACK_ROW, [6, 65, 108, 39], [116, 65, 53, 39]],
    detective: [...BACK_ROW, [6, 65, 38, 39], [47, 65, 39, 39], [89, 65, 39, 39], [131, 65, 38, 39]],
    clinic: [[6, 23, 80, 39], [89, 23, 80, 39], [6, 65, 80, 39], [89, 65, 39, 39], [131, 65, 38, 39]],
  };
  // The study lays a coloured rug under each station.
  const RUGS = { interrogate: ['P', 'p'], 'blast-radius': ['B', 'u'], eval: ['Y', 'j'], 'create-verification-skill': ['M', 'm'], 'maintain-verification-skill': ['R', 'r'], 'create-formal-verification-skill': ['B', 'i'], 'maintain-formal-verification-skill': ['P', 'm'] };
  const stations = new Map();
  for (const [building, room] of Object.entries(rooms)) {
    const plaques = Object.values(PLAQUES).filter((plaque) => plaque.building === building);
    plaques.forEach((plaque, index) => {
      const [x, y, w, h] = STATION_LAYOUT[building][index];
      stations.set(plaque.id, { plaque, room, x: room.x + x, y: room.y + y, w, h });
    });
  }
  // Residents step out onto the cross street, level with their save-point queue.
  const QUEUE_Y = { north: BAND.top + 26, south: BAND.bottom - 10 };
  const doorInside = (room) => ({ x: room.door, y: north(room) ? room.y + ROOM.h - 10 : room.y + 24 });
  const doorStep = (room) => ({ x: room.door, y: north(room) ? QUEUE_Y.north : QUEUE_Y.south });
  const AVENUE = { y: CENTER.y, half: 7 };
  const PLAZA = { ...CENTER, r: 60 };
  const FOUNTAIN = { ...CENTER, rx: 30, ry: 12 };
  // Crossing the square, residents keep to its south arc, in front of the fountain.
  const ARC = [[-58, 0], [-42, 18], [42, 18], [58, 0]].map(([dx, dy]) => ({ x: CENTER.x + dx, y: CENTER.y + dy }));
  // The avenue owns the east-west axis; the notice board and the mailbox hold the north-south one.
  const NOTICE = { x: CENTER.x - 35, y: 70, w: 74, h: 50 };
  const MAILBOX = { x: CENTER.x - 12, y: 246, w: 30, h: 44 };
  const LAMPS = [[-40, -40], [40, -40], [-40, 40], [40, 40]].map(([dx, dy]) => [CENTER.x + dx, CENTER.y + dy]);
  // The flow: residents arrive along the avenue from beyond the west edge and leave past the east one.
  // The 开 PR / MR post station stands on the avenue's south kerb by the east exit; a 入镇 stone mirrors it in the west.
  const ENTRY = { x: -12, y: AVENUE.y };
  const EXIT = { x: WORLD.w + 12, y: AVENUE.y };
  const GATE = { x: 444, y: 197, w: 23, h: 19, stop: { x: 455, y: AVENUE.y }, pause: 1200 };
  const GATE_LANTERN = { x: 441, y: 201 }; // hangs under the west eave, lit after dark
  const GATE_BUTTON = { x: 434, y: 188, w: 34, h: 30 }; // its 开 PR / MR plate sits on the roof, inside the east edge
  const MILESTONE = { x: 13, y: 191, w: 14, h: 15 };
  // Save points stand on the outer side of each door; queues fill both sides and never reach a road.
  const SAVE_POINTS = {
    construction: { name: '打卡钟', prop: 'punchClock', x: WEST - 24, y: QUEUE_Y.north + 6, queueY: QUEUE_Y.north, sides: [[WEST + 18, 178], [14, WEST - 40]] },
    detective: { name: '卷宗柜', prop: 'caseCabinet', x: EAST + 24, y: QUEUE_Y.north + 6, queueY: QUEUE_Y.north, sides: [[294, EAST - 18], [EAST + 40, 458]] },
    clinic: { name: '病历架', prop: 'medicalRack', x: EAST + 24, y: QUEUE_Y.south + 6, queueY: QUEUE_Y.south, sides: [[294, EAST - 18], [EAST + 40, 438]] },
  };
  const isParked = (s) => s.status === 'paused' || s.status === 'needsYou';
  // Run-mode badges (an active goal, then the trail) stack down the right shoulder, under the status icon
  // beside the head. Above the head is taken: plaque plates in rooms, the wall over the north queues.
  const runModes = (s) => [s.goal?.phase === 'active' && 'goalBadge', s.trail?.on && 'trailBadge'].filter(Boolean);
  const BADGES = { x: 7, y: -16, step: 7 };

  const nodes = new Map();
  const actors = new Map();
  const previous = new Map();
  const eventTimers = new Map();
  const playedEvents = new Set();
  let sessions = [];
  let summary = null;
  let inbox = [];
  let panel = null;
  let quiet = false;
  let mailCount = 0;
  let buildingSignature = '';
  let panelContent = '';
  const embedded = window.parent !== window && new URLSearchParams(location.search).get('embed') === '1';
  let workspaceState = embedded ? 'loading' : 'standalone';
  let workspaces = [];
  let selectedWorkspace = '';
  let modelSettings = { state: 'loading', data: null, assignments: {}, message: '' };

  // ---------- Sprites: palette rows rasterized once onto offscreen canvases ----------
  const sprites = new Map();
  const toCanvas = ({ w, h, data }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    return canvas;
  };
  const flipped = (canvas) => {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, -canvas.width, 0);
    return out;
  };
  function sprite(name) {
    if (!sprites.has(name)) sprites.set(name, toCanvas(rasterize([{ rows: SPRITES[name] }])));
    return sprites.get(name);
  }
  const saveIcon = `<img class="save-icon" src="${sprite('save').toDataURL()}" alt="存档">`;
  // What each run-mode badge means, shown with the badge itself on the resident card.
  const MODES = {
    goalBadge: { name: '目标', meaning: 'DSH 正按 /goal 一轮轮推进', icon: sprite('goalBadge').toDataURL() },
    trailBadge: { name: '记录中', meaning: '每个决定都记进工作日志', icon: sprite('trailBadge').toDataURL() },
  };
  function characterFrame(workflow, pose, flip = false, muted = false) {
    const key = `${workflow}|${pose.arms}|${pose.legs}|${pose.face}|${pose.bob}|${pose.droop}|${flip}|${muted}`;
    if (!sprites.has(key)) {
      if (muted) {
        const source = characterFrame(workflow, pose, flip);
        const canvas = document.createElement('canvas');
        canvas.width = source.width; canvas.height = source.height;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'grayscale(1) opacity(.65)';
        ctx.drawImage(source, 0, 0);
        sprites.set(key, canvas);
      } else if (flip) sprites.set(key, flipped(characterFrame(workflow, pose)));
      else {
        const { layers, map } = characterLayers(workflow, pose);
        sprites.set(key, toCanvas(rasterize(layers, { map })));
      }
    }
    return sprites.get(key);
  }
  function minionFrame(workflow) {
    const key = `minion|${workflow}`;
    if (!sprites.has(key)) sprites.set(key, toCanvas(rasterize([{ rows: CHARACTERS.minion }], { map: CHARACTERS.outfits[workflow].map })));
    return sprites.get(key);
  }
  const propImages = new Map(Object.entries(PROPS).map(([id, rows]) => [id, rasterize([{ rows }])]));

  // ---------- Deterministic noise ----------
  const hash = (x, y, seed = 0) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise(x, y, scale, seed = 0) {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = smooth(fx - ix), ty = smooth(fy - iy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  // ---------- Static painter: world coordinates onto one ImageData ----------
  const RGB = Object.fromEntries(Object.entries(PALETTE).map(([key, hex]) => [key, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]));
  function painter(img, ox, oy) {
    const { width: W, height: H, data } = img;
    const set = (x, y, key, alpha = 1) => {
      x += ox; y += oy;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4, [r, g, b] = RGB[key];
      if (alpha >= 1 || data[i + 3] === 0) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = alpha >= 1 ? 255 : Math.max(data[i + 3], alpha * 255); return; }
      data[i] += (r - data[i]) * alpha; data[i + 1] += (g - data[i + 1]) * alpha; data[i + 2] += (b - data[i + 2]) * alpha;
    };
    const rect = (x, y, w, h, key, alpha) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, key, alpha); };
    const fill = (x, y, w, h, fn) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const key = fn(x + i, y + j, i, j); if (key) set(x + i, y + j, key); } };
    const ellipse = (cx, cy, rx, ry, key, alpha) => {
      for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) set(cx + i, cy + j, key, alpha);
    };
    const blit = (image, x, y) => {
      for (let j = 0; j < image.h; j++) for (let i = 0; i < image.w; i++) {
        const s = (j * image.w + i) * 4;
        if (image.data[s + 3] === 0) continue;
        const bx = x + i + ox, by = y + j + oy;
        if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
        data.set(image.data.subarray(s, s + 4), (by * W + bx) * 4);
      }
    };
    const shadow = (cx, cy, rx, ry) => { ellipse(cx + 1, cy, rx, ry, '0', 0.2); ellipse(cx + 1, cy, Math.max(1, rx - 2), Math.max(1, ry - 1), '0', 0.08); };
    const rows = (rowsList, x, y) => rowsList.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') set(x + i, y + j, row[i]); });
    return { set, rect, fill, ellipse, blit, shadow, rows };
  }

  function grassKey(x, y) {
    const n = noise(x, y, 26, 1);
    const d = (x + y) & 1;
    if (n < 0.3) return '2';
    if (n < 0.33) return d ? '2' : '3';
    if (n > 0.74) return '4';
    if (n > 0.71) return d ? '4' : '3';
    return '3';
  }
  // Roads: grey cobble with a little moss in the joints.
  function cobbleKey(x, y) {
    const row = Math.floor(y / 4), sy = y - row * 4, shift = (row & 1) * 3;
    const col = Math.floor((x + shift) / 6), sx = x + shift - col * 6;
    if (sx === 5 || sy === 3) return hash(x, y, 33) < 0.07 ? '2' : 'b';
    const odd = hash(col, row, 7) < 0.22;
    if (sy === 0 || sx === 0) return odd ? 'c' : 'd';
    return odd ? 'b' : 'c';
  }
  // The square: a grey apron round the basin, then warm stone laid in rings with staggered joints.
  // Darker courses mark the two axes, carrying the avenue and the north-south axis to the fountain.
  function plazaKey(x, y) {
    const dx = x + 0.5 - PLAZA.x, dy = y + 0.5 - PLAZA.y, r = Math.hypot(dx, dy);
    const apron = (dx / (FOUNTAIN.rx + 7)) ** 2 + ((dy - 2) / (FOUNTAIN.ry + 7)) ** 2;
    if (apron <= 1) return apron > 0.8 ? 'b' : cobbleKey(x, y);
    const ring = Math.floor(r / 6), across = r - ring * 6, middle = (ring * 6 + 3) * Math.PI * 2;
    const count = Math.max(8, Math.round(middle / 9));
    const turn = (Math.atan2(dy, dx) / (Math.PI * 2) + 1 + (ring & 1) / count / 2) % 1;
    const stone = Math.floor(turn * count), along = (turn * count - stone) * middle / count;
    if (across < 1 || along < 1) return 'f';
    const onAxis = Math.min(Math.abs(dx), Math.abs(dy)) < 4;
    const seed = hash(stone, ring, 35);
    if (across < 2 || along < 2) return onAxis ? 'g' : seed < 0.25 ? 'g' : 'W';
    if (onAxis) return seed < 0.3 ? 'y' : 'z';
    return seed < 0.08 ? 'z' : seed < 0.28 ? 'W' : 'g';
  }
  // One paved network: the avenue, two cross streets and the round square share darker kerbs.
  // The avenue runs past both world edges, so residents arrive from the west and leave through the east gate.
  const ROADS = [
    [-AVENUE.half, AVENUE.y - AVENUE.half, WORLD.w + AVENUE.half * 2, AVENUE.half * 2],
    [WEST - AVENUE.half, BAND.top, AVENUE.half * 2, BAND.bottom - BAND.top],
    [EAST - AVENUE.half, BAND.top, AVENUE.half * 2, BAND.bottom - BAND.top],
  ];
  const within = ([x, y, w, h], px, py) => px >= x && px < x + w && py >= y && py < y + h;
  const BLOCKS = [...Object.values(rooms).map((room) => [room.x, room.y, ROOM.w, ROOM.h]), [PARK.x, PARK.y, PARK.w, PARK.h]];
  const onPlaza = (x, y) => (x + 0.5 - PLAZA.x) ** 2 + (y + 0.5 - PLAZA.y) ** 2 <= PLAZA.r ** 2;
  const paved = (x, y) => onPlaza(x, y) || ROADS.some((road) => within(road, x, y));
  function paveKey(x, y) {
    if (!paved(x, y)) return null;
    // Kerbs run along grass only; roads meet doors and the park gate without one.
    const open = (dx, dy) => !paved(x + dx, y + dy) && !BLOCKS.some((block) => within(block, x + dx, y + dy));
    if (open(1, 0) || open(-1, 0) || open(0, 1) || open(0, -1)) return 'a';
    if (open(2, 0) || open(-2, 0) || open(0, 2) || open(0, -2) || open(1, 1) || open(-1, 1) || open(1, -1) || open(-1, -1)) return hash(x, y, 31) < 0.25 ? 'c' : 'b';
    return onPlaza(x, y) ? plazaKey(x, y) : cobbleKey(x, y);
  }
  function paintPaving(P) {
    const top = Math.min(BAND.top, PLAZA.y - PLAZA.r) - 1, bottom = Math.max(BAND.bottom, PLAZA.y + PLAZA.r) + 1;
    P.fill(0, top, WORLD.w, bottom - top, paveKey);
  }

  function paintGround(P, area) {
    P.fill(area.x, area.y, area.w, area.h, grassKey);
    // Tufts, flowers and pebbles on a jittered grid.
    for (let gy = Math.floor(area.y / 9); gy * 9 < area.y + area.h; gy++) for (let gx = Math.floor(area.x / 9); gx * 9 < area.x + area.w; gx++) {
      const r = hash(gx, gy, 3), x = gx * 9 + Math.floor(hash(gx, gy, 4) * 6), y = gy * 9 + Math.floor(hash(gx, gy, 5) * 6);
      if (r < 0.16) P.rows(['4.4', '.2'], x, y);
      else if (r < 0.2) P.rows(['.W', 'WjW', '.2'], x, y);
      else if (r < 0.225) P.rows(['.o', 'ojo', '.2'], x, y);
      else if (r < 0.24) P.rows(['.p', 'pWp', '.2'], x, y);
      else if (r < 0.255) P.rows(['.d', 'dcb'], x, y);
    }
  }
  function paintFountain(P) {
    const { x: cx, y: cy, rx, ry } = FOUNTAIN;
    P.shadow(cx + 3, cy + ry + 2, rx + 3, 6);
    // Front wall of the basin, then the rim and water seen from above.
    for (let i = -rx; i <= rx; i++) {
      const top = Math.round(cy + (ry - 1) * Math.sqrt(1 - (i * i) / (rx * rx)));
      for (let j = 0; j < 6; j++) P.set(cx + i, top + j, j === 5 ? '0' : i < -rx / 2 ? 'd' : i > rx * .6 ? 'b' : 'c');
    }
    P.ellipse(cx, cy, rx, ry, '0');
    P.ellipse(cx, cy, rx - 1, ry - 1, 'c');
    P.fill(cx - rx + 1, cy - ry + 1, rx * 2 - 1, ry * 2 - 1, (px, py) => {
      const dx = px - cx, dy = py - cy, e = (dx * dx) / ((rx - 1) ** 2) + (dy * dy) / ((ry - 1) ** 2);
      if (e > 1) return null;
      if (e > .62) return dx + dy * 2 < -9 ? 'd' : dx + dy * 2 > 15 ? 'b' : null;
      return (dx * dx) / ((rx * .75) ** 2) + (dy * dy) / ((ry * .56) ** 2) > 1 ? 'B' : dy < -3 ? 'i' : 'u';
    });
    P.rect(cx - 3, cy - 14, 7, 15, 'c'); P.rect(cx - 3, cy - 14, 2, 15, 'd'); P.rect(cx + 3, cy - 14, 1, 15, 'b');
    P.ellipse(cx, cy - 15, 9, 3, '0'); P.ellipse(cx, cy - 15, 8, 2, 'd');
    P.rect(cx - 6, cy - 14, 13, 1, 'b');
    P.rect(cx, cy - 24, 2, 9, 'i'); P.rect(cx, cy - 26, 2, 2, 'W');
    P.rect(cx - 3, cy - 21, 2, 2, 'i'); P.rect(cx - 5, cy - 18, 2, 2, 'i'); P.rect(cx + 3, cy - 21, 2, 2, 'i'); P.rect(cx + 5, cy - 18, 2, 2, 'i');
  }
  function paintNotice(P) {
    const { x, y } = NOTICE;
    P.shadow(x + 35, y + 43, 36, 3);
    for (const dx of [7, 59]) {
      P.rect(x + dx, y + 28, 5, 15, '0');
      P.rect(x + dx + 1, y + 29, 3, 13, 'x');
      P.rect(x + dx + 1, y + 29, 1, 13, 'z');
    }
    P.rect(x - 1, y - 1, 72, 34, '0');
    P.rect(x, y, 70, 32, 'x'); P.rect(x, y, 70, 2, 'z');
    P.rect(x + 2, y + 2, 66, 28, 'y');
    P.rect(x + 3, y + 3, 64, 26, 'g');
    P.rect(x + 3, y + 3, 64, 1, 'W');
    for (const dx of [1, 68]) { P.set(x + dx, y + 3, '0'); P.set(x + dx, y + 28, '0'); }
  }
  function paintCrown(P, x, cy, r) {
    const blobs = [[0, 0, r], [-r * 0.55, r * 0.25, r * 0.7], [r * 0.55, r * 0.25, r * 0.7], [0, -r * 0.35, r * 0.8]];
    const inCanopy = (px, py) => blobs.some(([bx, by, br]) => (px - x - bx) ** 2 + (py - cy - by) ** 2 <= br * br);
    P.fill(Math.floor(x - r * 1.3) - 2, Math.floor(cy - r * 1.2) - 2, Math.ceil(r * 2.6) + 5, Math.ceil(r * 2.2) + 5, (px, py) => {
      if (!inCanopy(px, py)) return inCanopy(px + 1, py) || inCanopy(px - 1, py) || inCanopy(px, py + 1) || inCanopy(px, py - 1) ? '0' : null;
      const lx = (px - x) / r, ly = (py - cy) / r, light = -lx * 0.55 - ly * 0.85 + (hash(px, py, 9) - 0.5) * 0.35;
      if (light > 0.55) return hash(px, py, 2) < 0.25 ? '5' : '4';
      if (light > 0.05) return '3';
      if (light > -0.55) return '2';
      return '1';
    });
  }
  function paintTree(P, x, y, size = 1) {
    const r = Math.round(11 * size), trunk = Math.round(9 * size);
    P.shadow(x + 3, y, r + 2, Math.max(2, Math.round(r / 3)));
    P.rect(x - 2, y - trunk, 5, trunk, 'x'); P.rect(x - 2, y - trunk, 1, trunk, 'y'); P.rect(x + 2, y - trunk, 1, trunk, 'w');
    P.rect(x - 3, y - trunk, 1, trunk, '0'); P.rect(x + 3, y - trunk, 1, trunk, '0');
    paintCrown(P, x, y - trunk - r + 3, r);
  }
  // A ring of crowns closes the even margin on all four sides, each about 7 px deep.
  // It opens where the avenue leaves the town: the west exit, and the east exit with its gate.
  const EXITS = { west: [AVENUE.y - 17, AVENUE.y + 17], east: [AVENUE.y - 17, GATE.y + GATE.h + 6] };
  function paintForestEdge(P) {
    const crowns = [];
    const depth = (i, seed) => 6 + Math.round(hash(i, seed, 61) * 3);
    const radius = (i, seed) => 10 + Math.round(hash(i, seed, 62) * 3);
    const clear = ([top, bottom], y, r) => y + r < top || y - r * 1.2 > bottom;
    for (let i = 0; i * 15 < WORLD.w + 15; i++) {
      const x = i * 15 + Math.round(hash(i, 0, 63) * 6) - 3, top = radius(i, 1), bottom = radius(i, 2);
      crowns.push([x, depth(i, 1) - top, top], [x + 7, WORLD.h - depth(i, 2) + Math.round(bottom * 1.15), bottom]);
    }
    for (let j = 1; j * 15 < WORLD.h; j++) {
      const y = j * 15 + Math.round(hash(j, 0, 64) * 6) - 3, left = radius(j, 3), right = radius(j, 4);
      if (clear(EXITS.west, y, left)) crowns.push([depth(j, 3) - Math.round(left * 1.25), y, left]);
      if (clear(EXITS.east, y + 7, right)) crowns.push([WORLD.w - depth(j, 4) + Math.round(right * 1.25), y + 7, right]);
    }
    crowns.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r] of crowns) paintCrown(P, x, y, r);
  }
  function paintBush(P, x, y, w = 14) {
    P.shadow(x + 1, y, Math.round(w / 2) + 1, 2);
    const h = Math.round(w * 0.6), cx = x, cy = y - Math.round(h / 2);
    const inBush = (px, py) => ((px - cx) / (w / 2)) ** 2 + ((py - cy) / (h / 2)) ** 2 <= 1 || ((px - cx + w / 4) / (w / 3)) ** 2 + ((py - cy + 2) / (h / 2.2)) ** 2 <= 1;
    P.fill(cx - w, cy - h, w * 2, h * 2, (px, py) => {
      if (!inBush(px, py)) return inBush(px + 1, py) || inBush(px - 1, py) || inBush(px, py + 1) || inBush(px, py - 1) ? '0' : null;
      const light = -(px - cx) / w - (py - cy) / h + (hash(px, py, 11) - 0.5) * 0.4;
      return light > 0.35 ? '4' : light > -0.25 ? '3' : '2';
    });
  }
  function paintFlowerbed(P, x, y, w, h) {
    P.shadow(x + w / 2, y + h, w / 2, 2);
    P.rect(x, y, w, h, '0'); P.rect(x + 1, y + 1, w - 2, h - 2, 'y'); P.rect(x + 1, y + 1, w - 2, 1, 'z'); P.rect(x + 3, y + 3, w - 6, h - 5, 'e'); P.rect(x + 3, y + 3, w - 6, 1, 'w');
    const colors = ['o', 'j', 'p', 'W', 'r'];
    for (let i = 0; (i + 1) * 7 < w - 2; i++) for (let row = 0; row * 5 + 7 < h; row++) {
      const c = colors[(i + row * 2) % 5];
      P.rows(['.' + c, c + 'j' + c, '.2'], x + 4 + i * 7 + row * 3, y + 2 + row * 5);
    }
  }
  function paintSprite(P, name, x, y, shadow = true) {
    const image = rasterize([{ rows: SPRITES[name] }]);
    if (shadow) P.shadow(x + Math.floor(image.w / 2), y + image.h - 1, Math.ceil(image.w / 2), 2);
    P.blit(image, x, y);
    return image;
  }

  // ---------- The park: a lake fed by a rockery waterfall, a fishing pier on the gate axis ----------
  const LAKE = [[98, 306, 64, 29], [46, 298, 30, 22], [146, 312, 22, 18]];
  const lakeDepth = (x, y) => Math.min(...LAKE.map(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
  const inLake = (x, y) => lakeDepth(x, y) <= 1 + (noise(x, y, 7, 71) - 0.5) * 0.36;
  const PIER = { x: PARK.gate, top: 260, end: 302 };
  const FALL = { x: 44, top: 262, bottom: 280 };
  const FISHING = { x: PIER.x - 25, y: PIER.end + 10 }; // where the line meets the water
  const LANTERN = { x: PIER.x + 5, y: PIER.end - 1 }; // post foot at the pier's end; lit after dark
  const lakeSpots = []; // open-water pixels the sprite loop may glint
  function paintLake(P) {
    lakeSpots.length = 0;
    const shore = (x, y) => inLake(x + 1, y) || inLake(x - 1, y) || inLake(x, y + 1) || inLake(x, y - 1);
    P.fill(PARK.x, 264, PARK.w - 8, 82, (x, y) => {
      if (!inLake(x, y)) return shore(x, y) ? '0' : null;
      // The far bank shows its earth face; deep water darkens toward each basin's middle.
      if (!inLake(x, y - 1)) return 'x';
      if (!inLake(x, y - 2)) return hash(x, y, 74) < 0.3 ? 'x' : 'w';
      if (!inLake(x, y - 3)) return 'B';
      if (!inLake(x, y + 1) || !inLake(x - 1, y) || !inLake(x + 1, y)) return 'i';
      lakeSpots.push([x, y]);
      const depth = lakeDepth(x, y);
      if (depth > 0.16 && hash(Math.floor(x / 6), y, 72) < 0.06) return 'i';
      return depth < 0.16 || (depth < 0.42 && (x + y) % 2) ? 'B' : 'u';
    });
  }
  function paintRock(P, cx, cy, rx, ry, seed) {
    const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + (noise(x, y, 3, seed) - 0.5) * 0.45;
    P.fill(cx - rx - 2, cy - ry - 2, rx * 2 + 5, ry * 2 + 5, (x, y) => {
      if (!inside(x, y)) return inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1) ? '0' : null;
      const lx = (x - cx) / rx, ly = (y - cy) / ry;
      if (hash(x >> 1, y >> 1, seed) < 0.06 && Math.abs(lx) < 0.6) return 'a'; // the holes of a garden stone
      if (ly < -0.55 && lx < 0.3 && hash(x, y, seed + 2) < 0.45) return hash(x, y, seed + 3) < 0.5 ? '3' : '4'; // moss
      const light = -lx * 0.6 - ly * 0.5 + (hash(x, y, seed + 1) - 0.5) * 0.3;
      if ((x + seed) % 4 === 0 && light < 0.5) return 'b'; // upright grain
      return light > 0.5 ? 'd' : light > -0.05 ? 'c' : light > -0.55 ? 'b' : 'a';
    });
  }
  // 假山: upright garden stones stacked at the lake's head, a pine on top, a trickle into the water.
  function paintRockery(P) {
    P.shadow(42, 286, 28, 4);
    for (const [cx, cy, rx, ry, seed] of [[22, 276, 7, 11, 83], [33, 266, 8, 18, 81], [54, 272, 7, 12, 82], [64, 285, 6, 6, 85], [25, 288, 9, 5, 84]]) paintRock(P, cx, cy, rx, ry, seed);
    paintSprite(P, 'pine', 26, 236, false);
    P.rect(FALL.x - 2, FALL.top - 2, 5, FALL.bottom - FALL.top + 2, '0');
    P.rect(FALL.x - 1, FALL.top - 1, 3, FALL.bottom - FALL.top + 1, 'i'); P.rect(FALL.x - 1, FALL.top - 1, 1, FALL.bottom - FALL.top + 1, 'W');
    P.rows(['W.W.W.W', '.WiWiW.', 'W.i.i.W'], FALL.x - 3, FALL.bottom - 1);
  }
  function paintReeds(P, x, y, count) {
    for (let i = 0; i < count; i++) {
      const h = 7 + Math.round(hash(x, i, 86) * 6), rx = x + i * 2 - (i & 1);
      P.rect(rx, y - h, 1, h, i % 3 ? '3' : '2');
      if (i % 2 === 0) { P.rect(rx - 1, y - h - 3, 3, 4, '0'); P.rect(rx, y - h - 2, 1, 3, 'x'); }
    }
  }
  function paintLily(P, x, y, bloom) {
    P.ellipse(x, y, 4, 2, '0'); P.ellipse(x, y, 3, 1, '3'); P.rect(x - 2, y - 1, 3, 1, '4'); P.set(x + 2, y, 'u'); P.set(x + 3, y, 'u');
    if (bloom) P.rows(['.W', 'pWp', '.p'], x - 2, y - 3);
  }
  // 钓鱼台: a plank pier on the gate axis, with a stool, a propped rod and a bucket at its end.
  function paintPier(P) {
    const left = PIER.x - 7, w = 14;
    for (const py of [284, 296]) for (const px of [left + 1, left + w - 3]) { P.rect(px - 1, py, 4, 10, '0'); P.rect(px, py, 2, 9, 'w'); }
    P.rect(left - 1, PIER.top, w + 2, PIER.end - PIER.top + 3, '0');
    P.fill(left, PIER.top, w, PIER.end - PIER.top, (px, py, i, j) => i === 0 || i === w - 1 ? 'x' : j % 4 === 3 ? 'w' : j % 4 === 0 ? 'z' : 'y');
    P.rect(left, PIER.end, w, 2, 'w'); P.rect(left, PIER.end, w, 1, 'x');
    const sx = PIER.x - 5, sy = PIER.end - 9; // stool
    P.rect(sx - 1, sy - 1, 9, 4, '0'); P.rect(sx, sy, 7, 2, 'z'); P.rect(sx, sy + 1, 7, 1, 'y');
    P.rect(sx, sy + 3, 1, 3, '0'); P.rect(sx + 6, sy + 3, 1, 3, '0');
    for (let i = 0; i <= 24; i++) P.set(sx + 1 - i, sy - 1 - Math.round(i * 0.42), i < 9 ? 'x' : 'w'); // rod
    P.rect(FISHING.x, sy - 11, 1, FISHING.y - sy + 9, 'd'); // line
    P.rect(FISHING.x - 1, FISHING.y - 2, 3, 2, 'r'); P.set(FISHING.x, FISHING.y - 3, 'W'); // float
    const by = sy - 15; // bucket, up the deck from the lantern
    P.rect(PIER.x + 3, by - 3, 7, 7, '0'); P.rect(PIER.x + 4, by - 2, 5, 5, 'c'); P.rect(PIER.x + 4, by - 2, 5, 1, 'u'); P.rect(PIER.x + 8, by - 1, 1, 4, 'b');
    paintSprite(P, 'lantern', LANTERN.x - 2, LANTERN.y - 12, false);
  }
  // A clipped hedge seen from the south: lit top, darker face.
  function paintHedge(P, x, y, w, h) {
    P.fill(x, y, w, h, (px, py, i, j) => {
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) return '0';
      const n = hash(px, py, 87);
      if (h <= w && j >= h - 3) return j === h - 2 ? '1' : n < 0.4 ? '1' : '2';
      if (j === 1 || i === 1) return n < 0.3 ? '5' : '4';
      if (i >= w - 3) return n < 0.4 ? '2' : '1';
      return n < 0.2 ? '4' : n < 0.32 ? '2' : '3';
    });
  }
  function paintPark(P) {
    const gateLeft = PARK.gate - AVENUE.half, gateRight = PARK.gate + AVENUE.half;
    // Soft gravel from the gate to the pier.
    P.fill(gateLeft, PARK.y, gateRight - gateLeft, PIER.top - PARK.y, (x, y, i) => {
      const n = hash(x, y, 88);
      if (i === 0 || i === gateRight - gateLeft - 1) return n < 0.5 ? 'e' : null;
      return n < 0.12 ? 'e' : n < 0.32 ? 'g' : 'f';
    });
    // A clipped hedge gives the park a room's footprint, open at the gate on the west cross street.
    paintHedge(P, PARK.x, PARK.y, gateLeft - 3 - PARK.x, 7);
    paintHedge(P, gateRight + 3, PARK.y, PARK.x + PARK.w - gateRight - 3, 7);
    paintHedge(P, PARK.x + PARK.w - 7, PARK.y, 7, PARK.h);
    for (const px of [gateLeft - 4, gateRight]) { P.rect(px - 1, PARK.y - 6, 6, 15, '0'); P.rect(px, PARK.y - 5, 4, 13, 'c'); P.rect(px, PARK.y - 5, 1, 13, 'd'); P.rect(px + 3, PARK.y - 5, 1, 13, 'b'); P.rect(px - 1, PARK.y - 8, 6, 3, '0'); P.rect(px, PARK.y - 7, 4, 1, 'd'); }
    paintLake(P);
    paintRockery(P);
    for (const [x, y, count] of [[15, 312, 5], [72, 292, 3], [156, 300, 6], [118, 334, 4], [166, 326, 3]]) paintReeds(P, x, y, count);
    for (const [x, y, bloom] of [[64, 326, true], [124, 318, false], [34, 306, false], [148, 312, true], [88, 330, false], [136, 300, false]]) paintLily(P, x, y, bloom);
    paintPier(P);
    paintSprite(P, 'bench', 113, 251);
    paintFlowerbed(P, 140, 252, 34, 13);
    // Wildflowers along the shore and the hedge.
    const blooms = [['.o', 'ojo', '.2'], ['.p', 'pWp', '.2'], ['.W', 'WjW', '.2'], ['.j', 'joj', '.2']];
    [[70, 258], [80, 264], [120, 270], [129, 274], [152, 280], [163, 272], [118, 340], [134, 343], [58, 341], [24, 336], [150, 268], [86, 252]]
      .forEach(([x, y], index) => P.rows(blooms[index % blooms.length], x, y));
  }

  // Back walls, floors, caps and doors per building material.
  const litWindows = []; // window panes the sprite pass lights after dark
  function paintWall(P, room) {
    const x = room.x + 4, y = room.y + 4, w = ROOM.w - 8, h = 16;
    const kind = room.wall;
    P.fill(x, y, w, h, (px, py, i, j) => {
      if (kind === 'study') {
        if (j >= 9) return j === 9 ? 'z' : j === 15 ? 'w' : (i % 7 === 0 ? 'w' : 'x');
        return (i + (j % 6 < 3 ? 0 : 3)) % 6 === 0 && j % 3 === 1 ? 'p' : 'P';
      }
      if (kind === 'clinic') {
        if (j === 8) return 'r';
        if (j >= 9) return i % 6 === 0 || j === 12 ? 'd' : 'W';
        return 'm';
      }
      if (kind === 'site') {
        if (j >= 14) return ((i + j) >> 1) % 3 === 0 ? '0' : 'j';
        const row = Math.floor(j / 4), shift = (row & 1) * 4;
        return (j % 4 === 3 || (i + shift) % 8 === 7) ? 'b' : j % 4 === 0 ? 'd' : 'c';
      }
      if (j === 14) return 'Y';
      if (j === 15) return 'x';
      return hash(Math.floor((i + j) / 3), j, 13) < 0.08 ? 'c' : 'd';
    });
    // Window glass shows the sky by day and glows after dark; walls cast a soft shadow onto the floor.
    const blocked = [[x, (room.signEnd ?? x + 100) + 4], [x + w - 30, x + w]];
    if (!north(room)) blocked.push([room.door - 14, room.door + 14]);
    for (const wx of [x + 86, x + 112]) {
      if (blocked.some(([a, b]) => wx + 12 > a && wx < b)) continue;
      P.rect(wx, y + 2, 12, 10, '0'); P.rect(wx + 1, y + 3, 10, 8, 'W'); P.rect(wx + 2, y + 4, 8, 6, 'i'); P.rect(wx + 6, y + 4, 4, 6, 'u');
      P.set(wx + 3, y + 5, 'W'); P.set(wx + 4, y + 4, 'W'); P.rect(wx + 1, y + 7, 10, 1, 'W'); P.rect(wx - 1, y + 12, 14, 1, 'z');
      litWindows.push([wx + 2, y + 4]);
    }
    if (kind === 'site') for (const sx of [x + 2, x + 56, x + 112, x + w - 3]) { P.rect(sx, y - 2, 2, h + 2, 'y'); P.rect(sx + 1, y - 2, 1, h + 2, 'x'); }
    if (kind === 'site') { P.rect(x, y + 6, w, 2, 'z'); P.rect(x, y + 8, w, 1, 'x'); }
  }
  function floorKey(kind, px, py, room) {
    const i = px - room.x, j = py - room.y;
    if (kind === 'planks') {
      const row = Math.floor(j / 6), seam = (i + row * 13) % 26;
      if (j % 6 === 5) return 'w';
      if (seam === 0) return 'w';
      if (j % 6 === 0) return 'y';
      return hash(Math.floor((i + row * 13) / 26), row, 21) < 0.3 ? 'w' : 'x';
    }
    if (kind === 'clinic') {
      if (i % 10 === 0 || j % 10 === 0) return 'd';
      return (Math.floor(i / 10) + Math.floor(j / 10)) % 2 ? 'm' : 'W';
    }
    if (kind === 'dirt') {
      const n = noise(px, py, 9, 5), h = hash(px, py, 8);
      if (h < 0.025) return 'e';
      if (h > 0.985) return 'g';
      return n < 0.32 ? ((px + py) & 1 ? 'e' : 'f') : 'f';
    }
    if (i % 12 === 0 || j % 12 === 0) return 'c';
    const odd = (Math.floor(i / 12) + Math.floor(j / 12)) % 2;
    return hash(Math.floor((i + j) / 4), Math.floor(i / 12) + Math.floor(j / 12) * 40, 17) < 0.12 ? 'c' : odd ? 'd' : 'W';
  }
  function paintRoom(P, room) {
    const { x, y } = room, w = ROOM.w, h = ROOM.h, [trimDark, trimLight] = room.trim;
    P.rect(x + 3, y + h, w - 1, 3, '0', 0.22);
    P.rect(x + w, y + 4, 3, h - 1, '0', 0.22);
    P.rect(x, y, w, h, '0');
    P.fill(x + 4, y + 20, w - 8, h - 26, (px, py) => floorKey(room.floor, px, py, room));
    if (room.floor === 'dirt') for (let i = 0; i < w - 8; i++) for (const row of [0, 1]) P.set(x + 4 + i, y + h - 8 + row, ((i + row) >> 1) % 3 === 0 ? '0' : 'j');
    paintWall(P, room);
    P.rect(x + 4, y + 20, w - 8, 2, '0', 0.2);
    P.rect(x + 4, y + 22, 2, h - 28, '0', 0.14);
    // Wall caps in the building colour (top, sides, low front wall); the front wall shows its stone face.
    P.fill(x + 1, y + 1, w - 2, h - 2, (px, py) => {
      const i = px - x, j = py - y;
      if (j >= h - 4) return j === h - 4 ? '0' : i % 9 === 0 ? 'a' : 'b';
      if (!(j < 4 || i < 4 || i >= w - 4 || j >= h - 6)) return null;
      if (j === 3 || i === 3 || i === w - 4 || j === h - 6) return trimDark;
      return trimLight;
    });
    P.rect(x + 4, y + h - 7, w - 8, 1, '0', 0.35);
    // Doors face the square: a gap in the front wall for the north row, a door in the back wall for the south row.
    if (north(room)) {
      P.fill(room.door - 8, y + h - 6, 16, 6, (px, py) => floorKey(room.floor, px, py, room));
      P.rect(room.door - 9, y + h - 6, 1, 6, '0'); P.rect(room.door + 8, y + h - 6, 1, 6, '0');
      P.rect(room.door - 8, y + h - 1, 16, 1, 'x');
      P.rect(room.door - 7, y + h + 1, 14, 4, '0'); P.rect(room.door - 6, y + h + 1, 12, 3, 'r'); P.rect(room.door - 6, y + h + 1, 12, 1, 'o');
    } else {
      P.rect(room.door - 9, y, 18, 20, '0');
      P.rect(room.door - 8, y + 1, 16, 19, 'x'); P.rect(room.door - 8, y + 1, 1, 19, 'z');
      P.rect(room.door - 6, y + 4, 12, 16, 'g'); P.rect(room.door - 6, y + 4, 12, 2, 'f');
      P.rect(room.door - 6, y + 4, 4, 16, 'y'); P.rect(room.door - 5, y + 5, 2, 14, 'z'); P.set(room.door - 3, y + 12, 'j');
      P.rect(room.door - 7, y - 5, 14, 4, '0'); P.rect(room.door - 6, y - 5, 12, 3, 'r'); P.rect(room.door - 6, y - 5, 12, 1, 'o');
    }
    if (room.chimney) paintSprite(P, 'chimney', x + room.chimney, y - 9, false);
    for (const station of stations.values()) {
      if (station.room !== room) continue;
      const image = propImages.get(station.plaque.id);
      const px = station.x + 4, py = station.y + 31 - image.h;
      const rug = RUGS[station.plaque.id];
      if (rug) {
        P.rect(station.x + 2, station.y + 11, station.w - 4, 27, 'w');
        P.rect(station.x + 3, station.y + 12, station.w - 6, 25, rug[0]);
        P.rect(station.x + 5, station.y + 14, station.w - 10, 21, rug[1]);
      }
      P.shadow(px + Math.floor(image.w / 2), py + image.h, Math.ceil(image.w / 2), 2);
      P.blit(image, px, py);
    }
  }
  // 开 PR / MR: a small post station on the avenue's south kerb, a lantern hanging under its west eave.
  function paintGate(P) {
    const { x, y, w, h } = GATE;
    P.shadow(x + w / 2 + 2, y + h, w / 2 + 3, 3);
    P.rect(x, y + 4, w, h - 3, '0'); P.rect(x + 1, y + 5, w - 2, h - 5, 'y');
    for (let i = 3; i < w - 1; i += 4) P.rect(x + i, y + 5, 1, h - 5, 'x');
    P.rect(x + 1, y + h - 2, w - 2, 2, 'x');
    P.rect(x + 3, y + 7, 10, 8, '0'); P.rect(x + 4, y + 8, 8, 6, 'i'); P.rect(x + 8, y + 8, 4, 6, 'u'); P.set(x + 5, y + 9, 'W'); P.set(x + 6, y + 8, 'W');
    litWindows.push([x + 4, y + 8]);
    P.rect(x + 14, y + 8, 7, h - 7, '0'); P.rect(x + 15, y + 9, 5, h - 8, 'x'); P.rect(x + 15, y + 9, 1, h - 8, 'w'); P.set(x + 19, y + 13, 'j');
    P.rect(x - 3, y, w + 5, 5, '0'); P.rect(x - 2, y + 1, w + 3, 3, 'r'); P.rect(x - 2, y + 1, w + 3, 1, 'o');
    for (let i = 1; i < w + 3; i += 3) P.set(x - 2 + i, y + 3, 'R');
    const { x: lx, y: ly } = GATE_LANTERN;
    P.rect(lx + 1, y + 4, 1, ly - y - 4, '0');
    P.rows(['0b0', 'bgb', 'bWb', 'bgb', '0b0'], lx, ly);
  }
  // 入镇: a rounded milestone on the west kerb, its two characters set in the overlay.
  function paintMilestone(P) {
    const { x, y, w, h } = MILESTONE;
    P.shadow(x + w / 2 + 1, y + h, w / 2 + 2, 2);
    const spans = [[2, w - 4], [1, w - 2], ...Array.from({ length: h - 2 }, () => [0, w])];
    P.rect(x + 2, y - 1, w - 4, 1, '0'); P.rect(x, y + h, w, 1, '0');
    spans.forEach(([dx, length], j) => P.rect(x + dx - 1, y + j, length + 2, 1, '0'));
    spans.forEach(([dx, length], j) => { for (let i = 0; i < length; i++) P.set(x + dx + i, y + j, j < 2 || i < 2 ? 'd' : i >= length - 2 ? 'b' : 'c'); });
    P.rows(['3.4..3...4.3.', '23432.3243.23'], x, y + h - 1);
  }
  function paintBackground(img) {
    const P = painter(img, 0, 0);
    litWindows.length = 0;
    paintGround(P, { x: 0, y: 0, w: WORLD.w, h: WORLD.h });
    paintPark(P);
    paintPaving(P);
    paintForestEdge(P);
    paintFountain(P);
    for (const room of Object.values(rooms)) paintRoom(P, room);
    paintGate(P);
    paintMilestone(P);
    for (const dx of [-30, 30]) paintSprite(P, 'planter', CENTER.x + dx - 6, MAILBOX.y + 24); // flank the mailbox
    paintSprite(P, 'mailbox', MAILBOX.x, MAILBOX.y);
    paintNotice(P);
    for (const [lx, ly] of LAMPS) paintSprite(P, 'lamp', lx - 4, ly - 20);
    paintBush(P, 30, 226, 14);
    const trees = [[CENTER.x - 27, 56, 1], [CENTER.x + 27, 56, 1], [CENTER.x - 27, 334, 1], [CENTER.x + 27, 334, 1], [168, 344, 0.9]];
    trees.sort((a, b) => a[1] - b[1]);
    for (const [tx, ty, size] of trees) paintTree(P, tx, ty, size);
  }
  // ---------- After dark: a light map multiplied over the stage, plus glowing lamps and windows ----------
  // Unlit ground keeps the night tint; lit places climb to warm near-white in five flat levels,
  // each handing over to the next through a short ordered-dither edge.
  const NIGHT_LEVELS = ['#646eac', '#8a89b9', '#b8aac0', '#e4d0c6', '#fff3dc'].map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // A pool holds `level` out to `flat` of its radius, then fades linearly to its rim.
  const pool = (x, y, cx, cy, rx, ry, level, flat = 0.5) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return d >= 1 ? 0 : level * Math.min(1, (1 - d) / (1 - flat));
  };
  function paintLightMap(img) {
    const lightAt = (x, y) => {
      // Rooms are lit evenly, with one dimmer step on their outer wall.
      for (const room of Object.values(rooms)) if (within([room.x, room.y, ROOM.w, ROOM.h], x, y)) {
        return Math.min(x - room.x, room.x + ROOM.w - 1 - x, y - room.y, room.y + ROOM.h - 1 - y) < 2 ? 0.75 : 1;
      }
      let light = 0;
      // Doorways spill light over the doorstep; the frontage, where residents queue, stays softly lit.
      for (const room of Object.values(rooms)) {
        const sill = north(room) ? room.y + ROOM.h : room.y;
        light = Math.max(light, pool(x, y, room.door, sill, 112, 58, 0.5, 0.45), pool(x, y, room.door, sill + (north(room) ? 4 : -4), 20, 11, 0.75, 0.3));
      }
      // The square is the brightest place outdoors: lit to its rim, brightest by its lamps and fountain.
      const r = Math.hypot(x + 0.5 - PLAZA.x, y + 0.5 - PLAZA.y);
      if (r < PLAZA.r + 12) light = Math.max(light, r <= PLAZA.r ? 0.75 : 0.75 * (PLAZA.r + 12 - r) / 12);
      if (r <= PLAZA.r) {
        for (const [lx, ly] of LAMPS) light = Math.max(light, pool(x, y, lx, ly - 4, 27, 23, 1, 0.45));
        if (((x + 0.5 - FOUNTAIN.x) / (FOUNTAIN.rx + 7)) ** 2 + ((y + 0.5 - FOUNTAIN.y - 2) / (FOUNTAIN.ry + 7)) ** 2 <= 1) light = 1;
      }
      light = Math.max(light, pool(x, y, CENTER.x, NOTICE.y + 22, 50, 36, 0.75), pool(x, y, CENTER.x, MAILBOX.y + 22, 40, 32, 0.75));
      light = Math.max(light, pool(x, y, GATE.x + GATE.w / 2 - 4, GATE.y + 8, 30, 22, 0.75, 0.4));
      return Math.max(light, pool(x, y, LANTERN.x, LANTERN.y - 2, 38, 24, 0.5, 0.3));
    };
    const { data } = img;
    for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
      const t = lightAt(x, y) * 4, level = Math.floor(t), edge = Math.min(1, Math.max(0, (t - level - 0.3) / 0.4));
      const [r, g, b] = NIGHT_LEVELS[Math.min(4, level + (edge * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))];
      const i = (y * WORLD.w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  // Emissive sprites, rasterized once: drawn over pools the light map keeps near white, so they outshine day.
  function haloCanvas(radius) {
    const rows = Math.floor(radius / 1.25), w = radius * 2 + 1, h = rows * 2 + 1, data = new Uint8ClampedArray(w * h * 4);
    for (let j = -rows; j <= rows; j++) for (let i = -radius; i <= radius; i++) {
      const d = Math.hypot(i, j * 1.25) / radius, alpha = d > 1 ? 0 : d < 0.35 ? 0.5 : d < 0.65 ? 0.28 : (i + j) & 1 ? 0.14 : 0;
      if (alpha) data.set([...RGB[d < 0.65 ? 'j' : 'Y'], alpha * 255], ((j + rows) * w + i + radius) * 4);
    }
    return toCanvas({ w, h, data });
  }
  let glowSprites = null;
  const emissive = () => glowSprites ??= {
    halo: haloCanvas(16), lanternHalo: haloCanvas(9),
    lamp: toCanvas(rasterize([{ rows: SPRITES.lampLit }], { outline: false })),
    window: toCanvas(rasterize([{ rows: SPRITES.windowLit }], { outline: false })),
    lantern: toCanvas(rasterize([{ rows: SPRITES.lanternLit }], { outline: false })),
  };

  // ---------- Fixed stage: resize changes only its transform and compact presentation ----------
  const scene = document.querySelector('.town-scene');
  const stage = $('town-stage');
  const bgCanvas = $('town-ground'), spriteCanvas = $('town-sprites'), glowCanvas = $('town-glow');
  const spriteCtx = spriteCanvas.getContext('2d');
  const FRAME = 6; // Art pixels outside each edge; matches the CSS wooden border.
  stage.style.width = `${WORLD.w}px`;
  stage.style.height = `${WORLD.h}px`;
  $('town').setAttribute('viewBox', `0 0 ${WORLD.w} ${WORLD.h}`);
  for (const canvas of [bgCanvas, spriteCanvas, glowCanvas]) {
    canvas.width = WORLD.w;
    canvas.height = WORLD.h;
  }
  for (const [id, point, inset] of [['map-mailbox', MAILBOX, 4], ['map-notice', NOTICE, 2], ['map-gate', GATE_BUTTON, 0]]) {
    const button = $(id);
    button.style.left = `${point.x - inset}px`;
    button.style.top = `${point.y - inset}px`;
    button.style.width = `${point.w}px`;
    button.style.height = `${point.h}px`;
  }
  function layout() {
    const box = scene.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = devicePixelRatio || 1;
    const gutter = Math.min(12, box.width * .02, box.height * .02);
    const fit = Math.min(5, (box.width - gutter * 2) / (WORLD.w + FRAME * 2), (box.height - gutter * 2) / (WORLD.h + FRAME * 2));
    const integer = Math.floor(fit * dpr) / dpr;
    const scale = integer >= fit * .88 ? integer : fit;
    const x = Math.round((box.left + (box.width - WORLD.w * scale) / 2) * dpr) / dpr - box.left;
    const y = Math.round((box.top + (box.height - WORLD.h * scale) / 2) * dpr) / dpr - box.top;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle('compact', scale * 5.5 < 11);
  }
  let layoutRequest = 0;
  function scheduleLayout() {
    if (!layoutRequest) layoutRequest = requestAnimationFrame(() => { layoutRequest = 0; layout(); });
  }
  // The tint changes with daylight; neither static bitmap depends on it.
  function paintStatic() {
    const image = new ImageData(WORLD.w, WORLD.h);
    paintBackground(image);
    bgCanvas.getContext('2d').putImageData(image, 0, 0);
    paintLightMap(image);
    glowCanvas.getContext('2d').putImageData(image, 0, 0);
  }

  // ---------- Time of day from the local clock ----------
  function updateDaylight() {
    const hour = new Date().getHours();
    scene.dataset.time = hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night';
  }
  updateDaylight();
  setInterval(updateDaylight, 60000);

  // ---------- Overlay: signs, plaques and stations (SVG text stays crisp and focusable) ----------
  function plate(text, cls, attrs = '') {
    return `<g class="plate ${cls}" ${attrs}><rect class="plate-edge"/><rect class="plate-face"/><rect class="plate-light"/><text>${text}</text></g>`;
  }
  // Fit plates to their text: x is the anchor, data-align picks left/centre/right.
  function fitPlates(root) {
    for (const g of root.querySelectorAll('.plate')) {
      const text = g.querySelector('text');
      const height = Number(g.dataset.h || 9), pad = Number(g.dataset.pad || 3);
      const width = Math.ceil(text.getComputedTextLength()) + pad * 2;
      const align = g.dataset.align || 'center';
      const x = Math.round(Number(g.dataset.x) - (align === 'center' ? width / 2 : align === 'right' ? width : 0));
      g.setAttribute('transform', `translate(${x},${g.dataset.y})`);
      const [edge, face, light] = g.querySelectorAll('rect');
      edge.setAttribute('width', width); edge.setAttribute('height', height);
      face.setAttribute('x', 1); face.setAttribute('y', 1); face.setAttribute('width', width - 2); face.setAttribute('height', height - 2);
      light.setAttribute('x', 1); light.setAttribute('y', 1); light.setAttribute('width', width - 2); light.setAttribute('height', 1);
      text.setAttribute('x', width / 2);
      text.setAttribute('y', height - Math.round((height - 5.5) / 2) - 1);
    }
  }
  function renderBuildings() {
    if (buildingSignature) return;
    buildingSignature = 'catalog';
    $('scenery').innerHTML = `<text class="milestone-text" x="${MILESTONE.x + MILESTONE.w / 2}" y="${MILESTONE.y + 9}">入镇</text>`;
    for (const [building, r] of Object.entries(rooms)) {
      const point = SAVE_POINTS[building];
      const button = document.createElement('button');
      button.id = `save-${building}`;
      button.className = 'map-object save-point';
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'town-popover');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = `${saveIcon}<img class="save-prop" src="${sprite(point.prop).toDataURL()}" alt=""><span class="map-object-label">${point.name}</span>`;
      button.style.left = `${point.x - 15}px`;
      button.style.top = `${point.y - 28}px`;
      button.addEventListener('click', () => openPanel({ kind: 'save', id: building }));
      $('save-points').append(button);
      const group = document.createElementNS(NS, 'g');
      group.dataset.building = building;
      group.style.setProperty('--sign', PALETTE[r.sign[0]]);
      group.style.setProperty('--sign-text', PALETTE[r.sign[1]]);
      group.innerHTML = plate(escape(r.name), 'room-sign', `data-x="${r.x + 8}" data-y="${r.y + 5}" data-align="left" data-h="12" data-pad="4"`)
        + plate(escape(r.purpose), 'room-workflow', `data-x="${r.x + 60}" data-y="${r.y + 6}" data-align="left" data-h="10"`)
        + `<g class="room-population-wrap">${plate('0 人', 'room-population', `id="population-${building}" data-x="${r.x + ROOM.w - 8}" data-y="${r.y + 6}" data-align="right" data-h="10"`)}</g>`;
      for (const [id, c] of stations) {
        if (c.plaque.building !== building) continue;
        const station = document.createElementNS(NS, 'g');
        station.setAttribute('class', 'station');
        station.id = `plaque-${id}`;
        station.dataset.plaque = id;
        station.setAttribute('transform', `translate(${c.x},${c.y})`);
        station.setAttribute('tabindex', '0');
        station.setAttribute('role', 'button');
        station.setAttribute('aria-haspopup', 'dialog');
        station.setAttribute('aria-controls', 'town-popover');
        station.setAttribute('aria-expanded', 'false');
        station.setAttribute('aria-label', `${r.name}：${c.plaque.name}，查看用途和居民`);
        station.innerHTML = `<rect class="station-hit" width="${c.w}" height="${c.h}"/><path class="station-bracket" d="M1 15v-3h4M${c.w - 5} 12h4v3M${c.w - 1} ${c.h - 4}v3h-4M5 ${c.h - 1}H1v-3"/>${plate(escape(c.plaque.name), 'station-plate', `data-x="${c.w < 80 ? c.w / 2 : 24}" data-y="0" data-h="10"`)}${id === 'prototype' ? '<text x="28" y="16" class="prop-caption">A/B</text>' : ''}`;
        const show = () => openPanel({ kind: 'plaque', id });
        station.addEventListener('click', show);
        station.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
        group.append(station);
      }
      $('buildings').append(group);
    }
    fitPlates($('buildings'));
    for (const group of $('buildings').children) {
      const r = rooms[group.dataset.building], sign = group.querySelector('.room-sign'), sub = group.querySelector('.room-workflow');
      // A back-wall door splits the facade: the purpose plate moves to the door's far side.
      let subX = r.x + 8 + Math.ceil(sign.getBBox().width) + 3;
      if (!north(r) && subX < r.door + 11 && subX + Math.ceil(sub.getBBox().width) > r.door - 11) subX = r.door + 12;
      sub.dataset.x = subX;
      fitPlates(group);
      r.signEnd = Number(sub.dataset.x) + Math.ceil(sub.getBBox().width);
    }
    paintStatic();
  }
  let infoTrigger = null;
  function showInfo(title, content) {
    infoTrigger = panel ? panelTrigger() : document.activeElement;
    closePanel(false);
    $('info-title').textContent = title;
    $('info-content').innerHTML = content;
    if (!$('info').open) $('info').showModal();
  }
  $('close-info').addEventListener('click', () => $('info').close());
  $('info').addEventListener('close', () => infoTrigger?.focus({ preventScroll: true }));
  // A click on a modal's backdrop lands on the dialog element itself, outside its box.
  const onBackdrop = (dialog, close) => dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) close();
  });
  onBackdrop($('info'), () => $('info').close());
  const showHelp = () => showInfo('小镇使用说明', `
    <p>建筑是一类工作，木牌是一份 pstack 工作流，小人是 DSH 会话。</p>
    <p>小镇固定为 472 × 360 像素，缩放和调整窗口时会完整放进木框，不会裁切。小窗口下名牌只显示编号和状态；点击后仍可在原字号面板中查看完整信息。</p>
    <ul class="help-list">
      <li>点木牌，了解它适合做什么、查看居民。主机提供对应工作流时，可以选工作区、新开会话并填好命令，补上任务描述后再发送；旧主机未接入的木牌会明确提示。</li>
      <li>工地有分析需求、出原型、分期计划、实现功能、重构；侦探社后排是代码审查、爆炸半径、eval，前排是验证工具、验证巡检、形式化验证、形式化巡检；灭虫急诊站有现场取证、分析抓包、修 bug、性能问题、持续调优。居民站在对应木牌旁；未匹配的工作流列在告示牌的「其他会话」。形式化验证建立可重跑的性质检查，形式化巡检让检查跟上代码变化；共享的状态图工具没有单独木牌。</li>
      <li>小镇是一条流水线：新会话的小人从左边的「入镇」石沿大路走进来，到自己的木牌前干活；完工后从右边出镇。开了 PR（GitHub）或 MR（GitLab）、或只留了本地提交的小人带着信封，在右口的「开 PR / MR」关口停一下再走；只读的任务直接离开。打开页面时不会重放：已在镇上的直接就位，已完工的只出现在「最近离开」里。</li>
      <li>点「开 PR / MR」关口也能开工：选工作区、新开会话并填好 /pstack-opening-a-pr，补一句要整理和交付的改动（分支或路径）再发送；它把改动整理成提交并开 PR / MR。旧主机没有提供这项时只给出可复制的命令。</li>
      <li>想让一个会话自己跑到目标达成，在 DSH 输入框里用 <code>/goal &lt;目标&gt;</code>：DSH 会一轮轮接着做，直到目标完成、受阻或用完轮次；小镇只负责显示，不替你开始或停止。目标进行中的小人右肩挂一面小红旗（目标），记着工作日志的挂一本账本（记录中）；两枚徽章静止地排在头侧状态图标下方。居民卡的「自主运行」写着目标、进行中 / 已暂停 / 受阻 / 已完成、第几轮 / 共几轮和受阻原因。</li>
      <li>每栋楼门边都有存档点：工地打卡钟、侦探社卷宗柜、急诊站病历架。已存档的小人坐下等你（⏸）；待回答的小人站着举牌，有存档时加软盘徽章。断了没存档的小人留在木牌旁，变灰并标 ⚡。</li>
      <li>存档只写仓库外的续接笔记，不提交、不 stash、不修改代码。点存档点查看等候居民、等你什么、时间和可复制的笔记路径；也可以用 /pstack-pause 主动存档停下。</li>
      <li>小镇每 1.5 秒读取 DSH，后台暂停。居民卡保留阶段轨迹、token 用量与交接来源。阶段只报告进度，不设门槛、不阻拦。小助手只表示数量。</li>
      <li>记了工作日志的会话，居民卡会列出每个决定、结果和证据；改错的行划掉并指向更正它的行。点 call 证据可以在卡片里查看那次调用的参数和输出；卡片底部是核对发现和交叉审查（reviewed by 哪个模型，标记或 No flags）。</li>
      <li>收件箱分组显示待回答的问题与只读选项、需要你注意（这轮结束后仍有核对问题或审查标记，或自主运行受阻）、存档等你和断了要处理的会话。「去回答」「去看看」只打开对应会话，不代答或唤醒。</li>
      <li>告示牌显示概况、设置、镇上的居民列表和「最近离开」：最近 20 个完工的会话，标出 PR、MR、本地提交或完成，有链接时可在新标签页打开 PR/MR。点关口也能看到同一份名单。「设置 → 模型分工」可以给干活的子 agent、审查方、eval 候选和评审分配 DSH 中启用的模型，留空使用默认；保存后新会话生效。主模型仍由你在 DSH 输入框为会话选择，插件不改。</li>
      <li>Tab 选中木牌、小人、存档点、收件箱、关口和告示牌，Enter 打开；Esc、点外面或关闭按钮收起面板。Esc 把焦点还给打开它的地图对象。笔记路径可点击全选，或用键盘选中复制。</li>
      <li>独立页面会在新标签页打开 DSH，并用同源本地存储恢复会话选择。天色跟随本机时间；安静模式和系统「减少动态效果」关闭循环动作和行走，进出镇改为直接出现和消失。</li>
    </ul>
    <h3>致谢</h3>
    <p>pstack 方法论来自 Cursor 官方插件仓库 <a href="https://github.com/cursor/plugins/tree/main/pstack" target="_blank" rel="noopener noreferrer">cursor/plugins 中的 pstack</a>，作者是 <a href="https://x.com/poteto" target="_blank" rel="noopener noreferrer">Lauren Tan（poteto）</a>，采用 MIT 许可，© 2026 Lauren Tan。</p>
    <p>像素小镇 / Pixel Town（pixel-town-pstack）是非官方社区插件，将 pstack playbook 改写为 DSH skills，小镇负责可视化工作进度。DSH 由 DeepSeek 开发，采用 MIT 许可。</p>
    <p>源码：<a href="https://github.com/xianxianxianyu/pixel-town-pstack" target="_blank" rel="noopener noreferrer">https://github.com/xianxianxianyu/pixel-town-pstack</a>（AGPL-3.0）</p>`);
  function toggleQuiet() {
    quiet = !quiet;
    document.body.classList.toggle('quiet', quiet);
    animate();
    refreshPanel();
  }

  // ---------- Residents ----------
  // Work stays at its plaque; saved and waiting residents gather beside the door.
  // Stable ids keep seats predictable when polling replaces the snapshot.
  function residentTargets(all) {
    const targets = new Map();
    for (const [id, station] of stations) {
      const occupants = all.filter((s) => s.plaque.id === id && !isParked(s)).sort((a, b) => a.id.localeCompare(b.id));
      // A crowded plaque lets residents stand in front of its prop instead of overlapping nameplates.
      const beside = station.x + (station.w >= 80 ? 32 : 25);
      const left = (station.x + station.w - beside - 2) / Math.max(1, occupants.length) >= 20 ? beside : station.x + 3;
      const width = (station.x + station.w - left - 2) / Math.max(1, occupants.length);
      occupants.forEach((s, index) => targets.set(s.id, {
        x: Math.round(left + width * (index + 0.5)), y: station.y + 31,
        outside: false, labelLeft: left + width * index, labelWidth: Math.max(16, width - 1),
        helpers: width >= 36 ? Math.min(s.subagents.length, 1) : 0,
      }));
    }
    for (const [building, point] of Object.entries(SAVE_POINTS)) {
      const occupants = all.filter((s) => s.plaque.building === building && isParked(s)).sort((a, b) => a.id.localeCompare(b.id));
      const split = Math.ceil(occupants.length / 2);
      occupants.forEach((s, index) => {
        const side = index < split ? 0 : 1;
        const slot = side ? index - split : index;
        const count = side ? occupants.length - split : split;
        const [left, right] = point.sides[side], width = (right - left) / count;
        targets.set(s.id, {
          x: Math.round(left + width * (slot + .5)), y: point.queueY, outside: true,
          labelLeft: left + width * slot, labelWidth: width - 2, helpers: 0,
        });
      });
    }
    return targets;
  }
  // Paths stay on floors, doors and roads: the cross street to the avenue, and round the fountain.
  // Along the avenue, residents keep to the square's south arc whenever the walk crosses it.
  function avenue(fromX, toX) {
    const crosses = Math.min(fromX, toX) < ARC[0].x && Math.max(fromX, toX) > ARC[3].x;
    return [{ x: fromX, y: AVENUE.y }, ...(crosses ? (fromX < toX ? ARC : [...ARC].reverse()) : []), { x: toX, y: AVENUE.y }];
  }
  const outOf = (room, from) => [...(from.outside ? [] : [doorInside(room)]), doorStep(room)];
  const into = (room, to) => [doorStep(room), ...(to.outside ? [] : [doorInside(room)]), to];
  const tidy = (points) => points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  function route(fromRoom, from, toRoom, to) {
    if (fromRoom === toRoom && Boolean(from.outside) === Boolean(to.outside)) return tidy([from, to]);
    return tidy([from, ...outOf(fromRoom, from), ...(fromRoom === toRoom ? [] : avenue(fromRoom.door, toRoom.door)), ...into(toRoom, to)]);
  }
  // Newcomers come in from the west edge; leavers go out east, stopping at the gate when they deliver.
  const arrival = (room, to) => tidy([ENTRY, ...avenue(ENTRY.x, room.door), ...into(room, to)]);
  const departure = (room, from, gate) => tidy([from, ...outOf(room, from), ...avenue(room.door, gate ? GATE.stop.x : EXIT.x)]);
  function walk(actor, points, speed, delay = 0) {
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total || !motion()) { actor.path = null; return; }
    actor.path = { points, lengths, total, start: performance.now() + delay, duration: Math.min(6000, Math.max(1200, total / speed * 1000)) };
  }
  function makeResident(s) {
    const el = document.createElementNS(NS, 'g');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-haspopup', 'dialog');
    el.setAttribute('aria-controls', 'town-popover');
    el.setAttribute('aria-expanded', 'false');
    el.dataset.session = s.id;
    el.innerHTML = `<rect class="resident-anchor" x="-9" y="-25" width="18" height="26"/><path class="selection" d="M-10 -22v-4h4M6 -26h4v4M10 -2v4h-4M-6 2h-4v-4"/><g class="nameplate"><rect class="nameplate-edge" y="1" height="9"/><rect class="nameplate-bg" y="2" height="7"/><rect class="nameplate-dot" y="4" width="3" height="3"/><text class="nameplate-text" y="8"><tspan class="nameplate-number"></tspan><tspan class="nameplate-glyph" dx="1.5"></tspan><tspan class="nameplate-title" dx="1.5"></tspan></text><text class="nameplate-compact" x="0" y="8"></text></g><g class="event-bubble"><path class="bubble-bg"/><text y="-30"></text></g>`;
    el.addEventListener('click', () => openPanel({ kind: 'resident', id: s.id }));
    el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPanel({ kind: 'resident', id: s.id }); } });
    $('residents').append(el);
    return el;
  }
  function fitNameplate(actor, title) {
    const el = actor.el, text = el.querySelector('.nameplate-text');
    const titleNode = el.querySelector('.nameplate-title');
    const letters = [...title];
    titleNode.textContent = title;
    const compact = actor.target.labelWidth < 28, padding = compact ? 4 : 11;
    el.querySelector('.nameplate-dot').style.display = compact ? 'none' : '';
    while (letters.length && text.getComputedTextLength() + padding > actor.target.labelWidth) {
      letters.pop();
      titleNode.textContent = letters.length ? letters.join('') + '…' : '';
    }
    // Too narrow even for number and glyph: the number wins; the card still shows the status.
    if (text.getComputedTextLength() + padding > actor.target.labelWidth) el.querySelector('.nameplate-glyph').textContent = '';
    const width = Math.ceil(text.getComputedTextLength()) + padding;
    actor.plate = { left: -Math.round(width / 2), width };
    el.querySelector('.nameplate-edge').setAttribute('x', actor.plate.left);
    el.querySelector('.nameplate-edge').setAttribute('width', width);
    el.querySelector('.nameplate-bg').setAttribute('x', actor.plate.left + 1);
    el.querySelector('.nameplate-bg').setAttribute('width', width - 2);
    el.querySelector('.nameplate-dot').setAttribute('x', actor.plate.left + 3);
    text.setAttribute('x', actor.plate.left + (compact ? 2 : 8));
    placeNameplate(actor);
  }
  function placeNameplate(actor) {
    if (!actor.plate) return;
    const x = actor.drawn?.x ?? actor.target.x, { left, width } = actor.plate;
    const labelX = actor.path
      ? Math.max(1, Math.min(x + left, WORLD.w - width - 1))
      : actor.target.labelLeft + Math.floor((actor.target.labelWidth - width) / 2);
    actor.el.querySelector('.nameplate').setAttribute('transform', `translate(${labelX - x - left},0)`);
  }
  const sessionLink = (s, label) => `<a class="session-link" href="/" target="_blank" rel="noopener" data-open-session="${escape(s.id)}">${label}</a>`;
  // Only an embedding DSH can open the file beside its conversation; older hosts report no chart.
  const chartLink = (s) => s.canvas && embedded ? `<button type="button" class="chart-link" data-open-file="${escape(s.canvas.path)}" title="${escape(s.canvas.path)}">最新图表 · ${escape(s.canvas.name)}</button>` : '';
  function playEvent(el, s) {
    clearTimeout(eventTimers.get(s.id));
    el.classList.remove(...[...el.classList].filter((name) => name.startsWith('event-')));
    const text = el.querySelector('.event-bubble text');
    text.textContent = s.event.text;
    const width = Math.ceil(text.getComputedTextLength()) + 8, left = -Math.round(width / 2);
    text.setAttribute('x', 0);
    el.querySelector('.bubble-bg').setAttribute('d', `M${left} -38h${width}v11h${-width / 2 + 3}v1h-1v1h-1v1h-1v-3h${-width / 2}z`);
    const actor = actors.get(s.id);
    if (actor) actor.event = { kind: s.event.kind, start: performance.now() };
    requestAnimationFrame(() => {
      el.classList.add('event-playing', `event-${s.event.kind}`);
      const timer = setTimeout(() => { el.classList.remove('event-playing', `event-${s.event.kind}`); eventTimers.delete(s.id); }, 3700);
      eventTimers.set(s.id, timer);
    });
    animate();
  }

  // ---------- Sprite layer: one rAF loop, at most 12 frames a second ----------
  const stageMotions = {
    intake: 'ink', capture: 'record', reduce: 'sift', hypothesize: 'cross', prove: 'spring', report: 'stamp',
    reproduce: 'spring', bisect: 'cut', 'plan-fix': 'crumple', red: 'thumb', fix: 'spark', verify: 'confetti',
    interrogate: 'thump', pr: 'parcel', restate: 'echo', survey: 'map', sketch: 'compare', checkpoint: 'check',
    build: 'lift', scope: 'echo', explore: 'map', explain: 'compare', reply: 'stamp', baseline: 'record', remeasure: 'confetti',
    load: 'record', transform: 'sift', narrow: 'cut', attribute: 'map', confirm: 'compare',
    read: 'ink', keyfact: 'check', beyond: 'map', rate: 'cross',
    pin: 'check', shape: 'compare', subtract: 'cut', move: 'lift', worth: 'thumb',
  };
  const motion = () => !quiet && !reduced.matches;
  const FRAME_MS = 1000 / 12;
  let frameRequest = 0, lastFrame = 0;
  function animate() {
    if (motion() && !document.hidden) {
      if (!frameRequest) frameRequest = requestAnimationFrame(tick);
      return;
    }
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    for (const animation of $('mail-badge').getAnimations()) animation.cancel();
    drawFrame(performance.now());
  }
  function tick(now) {
    frameRequest = 0;
    if (!motion() || document.hidden) return;
    frameRequest = requestAnimationFrame(tick);
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    drawFrame(now);
  }
  document.addEventListener('visibilitychange', animate);
  reduced.addEventListener('change', animate);
  // Lamps and windows follow the time of day even while the loop is stopped.
  new MutationObserver(animate).observe(scene, { attributeFilter: ['data-time'] });

  // One-shot event choreography: offsets and pose overrides per elapsed ms.
  const eventMoves = {
    'hypothesis-refuted': (t) => t < 1000 && { dx: [0, -1, 1, -1, 1, 0][Math.floor(t / 170)] ?? 0, face: 'worried' },
    'test-red': (t) => t < 1000 && { dy: t < 600 ? -3 : 0, arms: 'cheer', face: 'smile' },
    'verify-failed': (t) => t < 800 && { dx: [-2, 2, -2, 2, 0][Math.floor(t / 160)] ?? 0, face: 'worried' },
    'subagent-done': (t) => t < 1300 && { minion: Math.round(Math.sin((t / 1300) * Math.PI) * 10) },
    compacting: (t) => t < 1500 && { dy: 1, face: 'closed', droop: 1 },
    objection: (t) => t < 1200 && { dy: t < 700 ? -4 : 0, arms: 'wave1' },
    rollback: (t) => t < 1200 && { dx: -Math.round(Math.sin((t / 1200) * Math.PI) * 8) },
    answered: (t) => t < 1200 && { dy: t < 500 ? -3 : 0, arms: 'cheer', face: 'smile' },
    poked: (t) => t < 1400 && { dy: t < 500 ? -5 : 0, face: 'open' },
  };
  const poses = {
    working: (f) => ({ arms: f % 2 ? 'work2' : 'work1', legs: 'stand', face: 'open', bob: f % 2, droop: 0 }),
    needsYou: () => ({ arms: 'watch', legs: 'stand', face: 'open', bob: 0, droop: 0 }),
    paused: () => ({ arms: 'down', legs: 'seated', face: 'open', bob: 0, droop: 0 }),
    interrupted: () => ({ arms: 'down', legs: 'stand', face: 'worried', bob: 0, droop: 1 }),
    idle: (f) => ({ arms: 'down', legs: 'stand', face: 'closed', bob: f % 2, droop: 1 }),
    finished: () => ({ arms: 'cheer', legs: 'stand', face: 'smile', bob: 0, droop: 0 }),
  };
  const WALK = ['stepA', 'stand', 'stepB', 'stand'];
  const put = (canvas, x, y) => spriteCtx.drawImage(canvas, Math.round(x), Math.round(y));
  function shadowAt(x, y, w) {
    spriteCtx.fillStyle = 'rgba(36,26,38,.22)';
    spriteCtx.fillRect(Math.round(x - w / 2) + 1, y - 1, w, 2);
    spriteCtx.fillRect(Math.round(x - w / 2) + 2, y - 2, w - 2, 4);
  }
  function drawFrame(now) {
    const live = motion();
    spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
    // After dark the lamp heads, the windows and the pier lantern glow.
    if (scene.dataset.time === 'night' || scene.dataset.time === 'dusk') {
      const glow = emissive();
      for (const [lx, ly] of LAMPS) { put(glow.halo, lx - 16, ly - 28); put(glow.lamp, lx - 3, ly - 19); }
      for (const [wx, wy] of litWindows) put(glow.window, wx, wy);
      put(glow.lanternHalo, LANTERN.x - 9, LANTERN.y - 16); put(glow.lantern, LANTERN.x - 1, LANTERN.y - 11);
      put(glow.lanternHalo, GATE_LANTERN.x - 8, GATE_LANTERN.y - 5); put(glow.lantern, GATE_LANTERN.x, GATE_LANTERN.y);
    }
    // Mailbox flag, fountain shimmer and the park water.
    put(sprite(mailCount > 0 ? 'flagUp' : 'flagDown'), MAILBOX.x + 22, MAILBOX.y - 2);
    if (live) {
      spriteCtx.fillStyle = PALETTE.W;
      for (let i = 0; i < 5; i++) {
        const seed = Math.floor(now / 420) + i * 7, a = hash(seed, i, 41) * Math.PI * 2, r = 7 + hash(seed, i, 42) * FOUNTAIN.rx * .5;
        spriteCtx.fillRect(Math.round(FOUNTAIN.x + Math.cos(a) * r), Math.round(FOUNTAIN.y + 1 + Math.sin(a) * r * 0.35), i % 2 + 1, 1);
      }
      // Glints drift over the lake, the rockery trickle runs, and now and then a fish rises by the line.
      for (let i = 0; i < 7 && lakeSpots.length; i++) {
        const [x, y] = lakeSpots[Math.floor(hash(Math.floor(now / 520), i, 45) * lakeSpots.length)];
        spriteCtx.fillRect(x, y, i % 3 ? 1 : 2, 1);
      }
      for (let i = 0; i < 3; i++) spriteCtx.fillRect(FALL.x + (i & 1), FALL.top + Math.floor(((now / 650 + i / 3) % 1) * (FALL.bottom - FALL.top - 2)), 1, 2);
      const rise = (now % 6400) / 1300;
      if (rise < 1) {
        const r = 1 + rise * 6;
        spriteCtx.globalAlpha = 1 - rise;
        for (let k = 0; k < 18; k++) spriteCtx.fillRect(Math.round(FISHING.x + 8 + Math.cos(k / 18 * Math.PI * 2) * r), Math.round(FISHING.y + 6 + Math.sin(k / 18 * Math.PI * 2) * r * 0.5), 1, 1);
        spriteCtx.globalAlpha = 1;
      }
      for (const room of Object.values(rooms)) if (room.chimney) for (let i = 0; i < 3; i++) {
        const t = ((now / 3600) + i / 3) % 1, size = t < 0.33 ? 'smoke1' : t < 0.7 ? 'smoke2' : 'smoke3';
        spriteCtx.globalAlpha = 0.85 * (1 - t);
        put(sprite(size), room.x + room.chimney + 2 + t * 8 + Math.sin(t * 6 + i) * 1.5, room.y - 14 - t * 26);
      }
      spriteCtx.globalAlpha = 1;
    }
    // Residents, back to front.
    const ordered = [...actors.values()].sort((a, b) => a.pos.y - b.pos.y);
    for (const actor of ordered) {
      const s = actor.session;
      let walking = false;
      if (actor.path) {
        // A delayed walk waits in place, standing, until its start.
        const progress = live ? Math.min(Math.max(0, (now - actor.path.start) / actor.path.duration), 1) : 1;
        let distance = progress * actor.path.total, index = 0;
        while (index < actor.path.lengths.length - 1 && distance > actor.path.lengths[index]) { distance -= actor.path.lengths[index]; index++; }
        const ratio = Math.min(distance / (actor.path.lengths[index] || 1), 1), a = actor.path.points[index], b = actor.path.points[index + 1];
        const x = a.x + (b.x - a.x) * ratio, y = a.y + (b.y - a.y) * ratio;
        if (b.x !== a.x) actor.facing = Math.sign(b.x - a.x);
        actor.pos = { x, y };
        walking = progress < 1 && now >= actor.path.start;
        if (progress >= 1) actor.path = null;
      }
      // A leaver stops at the gate when it delivered, then walks out past the east edge and is gone.
      if (actor.leaving && !actor.path) {
        const { leaving } = actor;
        if (leaving.phase === 'gate' && live) {
          leaving.until ??= now + GATE.pause;
          if (now >= leaving.until) { leaving.phase = 'out'; walk(actor, [GATE.stop, EXIT], 70); actor.target = spot(EXIT, actor); }
        } else { dropResident(s.id); continue; }
      }
      if (!actor.path) actor.arriving = false;
      const flow = actor.leaving ? (actor.path ? 'leaving' : 'gate') : actor.arriving ? 'arriving' : '';
      if ((actor.el.dataset.flow ?? '') !== flow) { if (flow) actor.el.dataset.flow = flow; else delete actor.el.dataset.flow; }
      if (!actor.path) actor.pos = { x: actor.target.x, y: actor.target.y };
      const rx = Math.round(actor.pos.x), ry = Math.round(actor.pos.y);
      if (rx !== actor.drawn?.x || ry !== actor.drawn?.y) {
        actor.el.style.transform = `translate(${rx}px,${ry}px)`;
        actor.drawn = { x: rx, y: ry };
        placeNameplate(actor);
      }
      const waiting = s.status === 'working' && /^等 \d+ 个助手回来$/.test(s.detail);
      const f = live ? Math.floor((now + actor.phase) / (waiting || s.status === 'idle' ? 900 : s.status === 'needsYou' ? 380 : 450)) : 0;
      let pose = walking ? { arms: 'down', legs: WALK[Math.floor(now / 110) % 4], face: 'open', bob: Math.floor(now / 110) % 2, droop: 0 }
        : waiting ? { arms: 'watch', legs: f % 2 ? 'stepA' : 'stand', face: f % 2 ? 'closed' : 'open', bob: 0, droop: 0 } : poses[s.status](f);
      let dx = 0, dy = 0, minionShift = 0;
      const move = live && !isParked(s) && s.status !== 'interrupted' && actor.event && eventMoves[actor.event.kind]?.(now - actor.event.start);
      if (move) { pose = { ...pose, ...(move.arms && { arms: move.arms }), ...(move.face && { face: move.face }), ...(move.droop !== undefined && { droop: move.droop }) }; dx = move.dx ?? 0; dy = move.dy ?? 0; minionShift = move.minion ?? 0; }
      else if (actor.event && live && now - actor.event.start > 2000) actor.event = null;
      const frame = characterFrame(s.plaque.building, pose, walking && actor.facing < 0, s.status === 'interrupted');
      shadowAt(rx, ry, 12);
      if (!walking && s.status === 'paused') put(sprite('chair'), rx - 6, ry - 7);
      put(frame, rx - Math.floor(frame.width / 2) + dx, ry - frame.height + dy);
      // Helpers trail behind their resident.
      s.subagents.slice(0, actor.target.helpers).forEach((_, i) => {
        const m = minionFrame(s.plaque.building);
        const mx = rx - 12 - i * 7 + minionShift, my = ry - (live && (f + i) % 2 ? 1 : 0) + (i % 2) * 2;
        shadowAt(mx + 4, my + (i % 2) * 0, 6);
        put(m, mx, my - m.height);
      });
      if (actor.leaving?.kind) put(sprite('envelope'), rx + 3, ry - 14);
      if (walking) continue;
      const head = { x: rx + dx, y: ry - 24 + dy };
      runModes(s).forEach((name, i) => put(sprite(name), rx + BADGES.x, ry + BADGES.y + i * BADGES.step));
      if (s.status === 'needsYou') {
        put(sprite('questionSign'), rx - 5, ry - 16);
        if (s.checkpoint) put(sprite('save'), head.x + 5, head.y - 3);
      } else if (s.status === 'paused') put(sprite('pause'), head.x + 4, head.y - 1);
      else if (s.status === 'interrupted') put(sprite('lightning'), head.x + 5, head.y - 4);
      else if (s.status === 'idle') { const rise = live ? Math.floor(now / 500) % 4 : 0; put(sprite('zSmall'), head.x + 6, head.y + 1 - rise); put(sprite('zBig'), head.x + 9, head.y - 6 - rise); }
      else if (s.status === 'finished') { const blink = live ? Math.floor(now / 350) % 2 : 0; put(sprite(blink ? 'sparkle' : 'sparkleSmall'), head.x - 11, head.y + 1); put(sprite(blink ? 'sparkleSmall' : 'sparkle'), head.x + 7, head.y - 4); }
      else if (waiting) put(sprite('clock'), head.x + 5, head.y - 7);
      else if (s.status === 'working' && live) {
        const gag = B.currentStage(s).gag || stageMotions[s.stage], cycle = ((now + actor.phase * 7) % 4800) / 4800;
        if (gag && SPRITES[gag] && cycle > 0.62 && cycle < 0.95) {
          const t = (cycle - 0.62) / 0.33;
          const fall = ['sift', 'crumple', 'confetti'].includes(gag) ? Math.round(t * 8) - 3 : ['spring', 'lift'].includes(gag) ? 4 - Math.round(t * 7) : 0;
          const sway = gag === 'compare' ? (Math.floor(t * 6) % 2 ? 1 : -1) : 0;
          const image = sprite(gag);
          put(image, head.x + 6 + sway, head.y - image.height + 2 + fall);
        }
      }
    }
    if (live) {
      // Ambient: a bird now and then, two butterflies by the flowers and pond, drifting cloud shadows.
      const birdCycle = (now % 28000) / 28000;
      if (birdCycle < 0.32) {
        const t = birdCycle / 0.32, bx = -10 + t * (WORLD.w + 20), by = 20 + Math.sin(t * 9) * 4 + (Math.floor(now / 28000) % 3) * 30;
        put(sprite(Math.floor(now / 160) % 2 ? 'bird1' : 'bird2'), bx, by);
      }
      for (const [cx, cy, seed] of [[154, 262, 1], [CENTER.x, MAILBOX.y + 50, 2]]) {
        const t = now / 1000 + seed * 10;
        put(sprite(Math.floor(now / 140 + seed) % 2 ? 'butterfly1' : 'butterfly2'), cx + Math.round(Math.sin(t * 0.7) * 14), cy + Math.round(Math.sin(t * 1.3) * 5));
      }
      spriteCtx.fillStyle = 'rgba(36,26,38,.07)';
      for (const [speed, y, w, h, seed] of [[5, 28, 70, 22, 0], [3.4, 198, 90, 26, 1]]) {
        const span = WORLD.w + w * 2, x = ((now / 1000) * speed + seed * span * 0.5) % span - w;
        for (let j = 0; j < h; j++) {
          const half = Math.round(Math.sqrt(1 - ((j - h / 2) / (h / 2)) ** 2) * w / 2);
          spriteCtx.fillRect(Math.round(x + w / 2 - half), y + j, half * 2, 1);
        }
      }
    }
  }

  // ---------- Panels ----------
  const statusPill = (s) => `<span class="status-pill ${s.status}" style="--status-color:${B.STATUS[s.status].color}">${B.STATUS[s.status].glyph} · ${B.STATUS[s.status].label}</span>`;
  const context = (s) => s.inTown ? `${B.workflow(s.workflow).name} · ${B.currentStage(s).name}` : '其他会话';
  // Finished sessions have left town: they leave the map and the resident lists for 最近离开.
  const onMap = (s) => s.inTown && s.status !== 'finished';
  const residentNumber = (id) => sessions.filter(onMap).findIndex((s) => s.id === id) + 1;
  const DELIVERY = { pr: 'PR', mr: 'MR', local: '本地提交' };
  function leaverList(list) {
    if (!list.length) return '<p class="empty-mail">还没有居民离开</p>';
    return `<ul class="leaver-list">${list.map((s) => {
      const kind = s.delivery?.kind, url = kind !== 'local' && s.delivery?.url?.startsWith('https://') ? s.delivery.url : null, at = s.finishedAt ?? s.lastEventAt;
      return `<li class="leaver"><span class="leaver-kind ${DELIVERY[kind] ? kind : 'done'}">${DELIVERY[kind] ?? '完成'}</span><span class="leaver-main"><strong>${escape(s.title)}</strong><span class="notice-meta">${escape(context(s))}${at ? ` · ${escape(checkpointTime(at))}` : ''}</span>${url ? `<a class="leaver-link" href="${escape(url)}" target="_blank" rel="noopener">${escape(url.slice(8))}</a>` : ''}</span>${sessionLink(s, '去看看')}</li>`;
    }).join('')}</ul>`;
  }
  const wan = (tokens) => `${(tokens / 10000).toFixed(1)} 万`;
  const statsMarkup = () => `<span><strong>${summary.residents}</strong> 位居民</span><span><strong>${summary.busy}</strong> 在忙</span>${summary.tokens === null ? '' : `<span>累计 <strong>${wan(summary.tokens)}</strong> token</span>`}`;
  const connectionDetail = () => B.connection.status === 'live' ? '已连接 DSH · 每 1.5 秒更新' : B.connection.status === 'error' ? '连不上 DSH（未登录或服务已停）· 保留上次读取' : '正在连接 DSH';
  function costLine(cost) {
    return `本会话 ${wan(cost.tokens)} token · ${cost.steps} 步 · 上下文峰值 ${wan(cost.maxContext)}${cost.children ? `（含 ${cost.children} 个子 agent）` : ''}`;
  }
  const checkpointTime = (at) => new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  function checkpointCard(s) {
    if (s.status === 'interrupted' && s.interruption) {
      return `<section class="checkpoint-card interruption-card"><strong>⚡ 断了，没存档</strong><p>${escape(s.interruption.kind)} · ${escape(checkpointTime(s.interruption.at))}</p><p>继续前先补存档。未提交的代码保留原样。</p></section>`;
    }
    if (!s.checkpoint) return '';
    const checkpoint = s.checkpoint;
    return `<section class="checkpoint-card"><strong>${saveIcon} 已存档</strong><dl class="panel-meta"><dt>等你</dt><dd>${escape(checkpoint.waitingFor)}</dd><dt>存档时间</dt><dd>${escape(checkpointTime(checkpoint.at))}</dd></dl>${checkpoint.path ? `<label class="resume-label">续接笔记 · 选中可复制<textarea class="resume-path" data-note="${escape(s.id)}" readonly rows="2" aria-label="续接笔记路径">${escape(checkpoint.path)}</textarea></label>` : '<p class="checkpoint-missing">没有续接笔记路径</p>'}</section>`;
  }
  // ---------- Decision trail: rows with evidence pointers, the mechanical audit and the cross-model review ----------
  const FINDINGS = { 'no-evidence': '缺证据', 'claim-contradicts': '结论和证据对不上', 'unlogged-pivot': '转向没记', 'unlogged-change': '改动没记', superseded: '已更正' };
  const clockTime = (at) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const stageName = (workflow, stage) => B.workflow(workflow)?.stages.find((candidate) => candidate.id === stage)?.name ?? stage ?? '';
  const rowRefs = (rows) => rows.length ? `<span class="trail-refs">${rows.map((n) => `#${n}`).join(' ')}</span>` : '';
  // One inline viewer at a time, keyed by row and explicit pointer kind as well as ref.
  let evidence = null; // { session, row, key, label, url, state: 'loading' | 'ready' | 'missing' | 'failed', data }
  function evidenceChip(s, row, { kind, ref }) {
    if (kind === 'call' || kind === 'invocation') {
      const { key, label } = evidenceRequest(s.id, row.n, { kind, ref });
      return `<button type="button" class="evidence-chip ${kind}" data-evidence="${escape(key)}" data-evidence-row="${row.n}" data-evidence-kind="${kind}" data-evidence-ref="${escape(ref)}" aria-expanded="${evidence?.session === s.id && evidence.key === key}" title="${escape(label)}">${kind}:${escape(ref.length > 12 ? `…${ref.slice(-10)}` : ref)}</button>`;
    }
    if (kind === 'url' && ref.startsWith('https://')) return `<a class="evidence-chip url" href="${escape(ref)}" target="_blank" rel="noopener" title="${escape(ref)}">${escape(ref.slice(8))}</a>`;
    return `<span class="evidence-chip" title="${escape(`${kind}:${ref}`)}">${escape(kind)}:${escape(kind === 'commit' ? ref.slice(0, 7) : ref)}</span>`;
  }
  function evidenceViewer() {
    const { label, state, data } = evidence;
    const args = typeof data?.args === 'string' ? data.args : JSON.stringify(data?.args ?? null, null, 2);
    const body = state === 'loading' ? '<p class="evidence-note">正在读取…</p>'
      : state === 'missing' ? '<p class="evidence-note">找不到这次调用的记录：主机不提供证据，或会话已不在当前 DSH 里。</p>'
      : state === 'failed' ? '<p class="evidence-note">读取失败，稍后再试。</p>'
      : `<p class="evidence-label">参数</p><pre class="evidence-pre">${escape(args)}</pre><p class="evidence-label">输出</p><pre class="evidence-pre">${escape(data.output ?? '')}</pre>`;
    return `<section class="evidence-viewer" data-viewer="${escape(evidence.key)}" tabindex="-1" aria-label="${escape(`证据 ${label}`)}"><header><code>${escape(state === 'ready' ? `${label} · ${data.name}` : label)}</code>${state === 'ready' && data.isError ? '<span class="evidence-error">出错</span>' : ''}<button type="button" class="evidence-close" data-action="evidence-close" aria-label="收起证据">×</button></header>${body}</section>`;
  }
  function trailCard(s) {
    const { trail } = s;
    if (!trail) return '';
    const rows = trail.rows.map((row) => `<li class="trail-row${row.supersededBy ? ' superseded' : ''}">
      <div class="trail-row-head"><b>#${row.n}</b><span>${escape(stageName(row.workflow, row.stage))}</span><time>${escape(clockTime(row.at))}</time>${row.result ? `<span class="trail-result">${escape(row.result)}</span>` : ''}</div>
      <p class="trail-decision">${escape(row.decision)}</p>${row.why ? `<p class="trail-why">${escape(row.why)}</p>` : ''}
      ${row.evidence.length ? `<div class="evidence-chips">${row.evidence.map((item) => evidenceChip(s, row, item)).join('')}</div>` : ''}
      ${row.supersedes ? `<p class="trail-link">更正 #${row.supersedes}</p>` : ''}${row.supersededBy ? `<p class="trail-link">已被 #${row.supersededBy} 更正</p>` : ''}
      ${evidence?.session === s.id && evidence.row === row.n ? evidenceViewer() : ''}</li>`).join('');
    const open = openFindings(trail), fixed = trail.audit?.findings.filter((finding) => finding.kind === 'superseded') ?? [];
    const audit = !trail.audit ? '<p class="trail-pending">还没核对</p>'
      : `<p class="trail-meta">${escape(clockTime(trail.audit.at))} 核对 · ${open.length ? `${open.length} 条待处理` : '没有待处理的问题'}</p>${open.length + fixed.length ? `<ul class="trail-findings">${[...open, ...fixed].map((finding) => `<li class="${finding.kind === 'superseded' ? 'info' : ''}"><b>${escape(FINDINGS[finding.kind] ?? finding.kind)}</b>${rowRefs(finding.rows)}${finding.stage ? `<span class="trail-refs">${escape(stageName(s.workflow, finding.stage))}</span>` : ''} ${escape(finding.detail)}</li>`).join('')}</ul>` : ''}`;
    const review = !trail.review ? '<p class="trail-pending">还没交叉审查</p>'
      : `<p class="reviewed-by">reviewed by ${escape(trail.review.model)}</p>${trail.review.flags.length ? `<ul class="trail-flags">${trail.review.flags.map((flag) => `<li>${rowRefs(flag.rows)} ${escape(flag.text)}</li>`).join('')}</ul>` : '<p class="no-flags">No flags</p>'}`;
    return `<section class="work-log" aria-label="工作日志"><h3>工作日志 <span class="trail-state">${trail.on ? '记录中' : '未开启'} · ${trail.rows.length} 行</span></h3>
      ${rows ? `<ol class="trail-rows">${rows}</ol>` : '<p class="trail-pending">还没有记录</p>'}
      <div class="trail-checks"><section><h4>核对</h4>${audit}</section><section><h4>交叉审查</h4>${review}</section></div></section>`;
  }
  // DSH's own /goal keeps a session running toward an objective; the town only reports it.
  const goalBlocked = (goal) => goal.blockedReason ? `<p class="goal-blocked"><b>受阻</b> ${escape(goal.blockedReason.message)}</p>` : '';
  const modeLegend = (s) => {
    const modes = runModes(s);
    return modes.length ? `<ul class="mode-legend" aria-label="小人身上的徽章">${modes.map((mode) => `<li><img class="mode-icon" src="${MODES[mode].icon}" alt=""><b>${MODES[mode].name}</b>${MODES[mode].meaning}</li>`).join('')}</ul>` : '';
  };
  function goalCard(s) {
    const { goal } = s;
    if (!goal) return '';
    const objective = [...goal.objective];
    return `<section class="goal-card ${goal.phase}" aria-label="自主运行"><h3>自主运行 <span class="goal-phase">${GOAL_PHASES[goal.phase]}</span></h3>
      <p class="goal-objective">${escape(objective.slice(0, 140).join('') + (objective.length > 140 ? '…' : ''))}</p>
      <p class="goal-rounds">第 ${goal.rounds}${goal.maxRounds ? ` / ${goal.maxRounds}` : ''} 轮</p>${goalBlocked(goal)}</section>`;
  }
  // The inbox letter repeats only what still needs the user: open findings, review flags and a blocked goal.
  function attentionNote(s) {
    const review = s.trail?.review;
    return `${s.goal?.phase === 'blocked' ? `<p class="goal-objective"><b>自主运行受阻</b> ${escape(s.goal.blockedReason?.message ?? s.goal.objective)}</p>` : ''}<ul class="trail-findings">${openFindings(s.trail).map((finding) => `<li><b>${escape(FINDINGS[finding.kind] ?? finding.kind)}</b>${rowRefs(finding.rows)} ${escape(finding.detail)}</li>`).join('')}${review?.flags.map((flag) => `<li><b>审查标记</b>${rowRefs(flag.rows)} ${escape(flag.text)}</li>`).join('') ?? ''}</ul>${review?.flags.length ? `<p class="reviewed-by">reviewed by ${escape(review.model)}</p>` : ''}`;
  }
  function letterBody(kind, item) {
    if (kind === 'needsYou') return `<p>${escape(item.question)}</p>${item.options.length ? `<ul class="letter-options">${item.options.map((option) => `<li>${escape(option)}</li>`).join('')}</ul>` : ''}`;
    if (kind === 'attention') return attentionNote(item);
    return checkpointCard(item) || '<p class="checkpoint-missing">主机未提供记录，请到会话里查看。</p>';
  }
  const viewerElement = () => $('popover-content').querySelector('[data-viewer]');
  async function toggleEvidence(sessionId, row, pointer) {
    const descriptor = evidenceRequest(sessionId, row, pointer);
    if (evidence?.session === sessionId && evidence.key === descriptor.key) { closeEvidence(); return; }
    const request = evidence = { session: sessionId, row, ...descriptor, state: 'loading', data: null };
    refreshPanel();
    viewerElement()?.focus();
    try {
      const response = await fetch(request.url, { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) { request.data = await response.json(); request.state = 'ready'; }
      else request.state = response.status === 404 ? 'missing' : 'failed';
    } catch {
      request.state = 'failed';
    }
    if (evidence === request) refreshPanel();
  }
  function closeEvidence() {
    const { key } = evidence;
    evidence = null;
    refreshPanel();
    [...$('popover-content').querySelectorAll('[data-evidence]')].find((chip) => chip.dataset.evidence === key)?.focus({ preventScroll: true });
  }
  function residentCard(s) {
    const wf = B.workflow(s.workflow), stage = B.currentStage(s);
    const trailLabels = { done: '已完成', active: '当前', pending: '未开始', skipped: '已跳过' };
    const rollbackVisits = new Map();
    for (const entry of s.history) {
      if (entry.workflow === s.workflow && entry.kind === 'rollback') rollbackVisits.set(entry.stage, (rollbackVisits.get(entry.stage) ?? 0) + 1);
    }
    const from = s.handoffFrom;
    const fromWorkflow = from && B.workflow(from.workflow);
    const fromStage = fromWorkflow?.stages.find((candidate) => candidate.id === from.stage);
    const peak = Math.max(0, ...(s.cost?.byStage ?? []).map((entry) => entry.tokens));
    // Top: who and where (left), how it runs (right); below, full width: progress, tokens, then the work log.
    const side = `${goalCard(s)}${checkpointCard(s)}${modeLegend(s)}`;
    return `<div class="card-top${side ? ' split' : ''}"><div class="card-main"><h3>${escape(s.title)}</h3><p class="repo">${escape(s.repo)}</p><p>${statusPill(s)}</p>
      <p class="resident-workflow">${escape(wf.name)} · ${escape(stage.name)} <b>${B.stageIndex(s) + 1}/${wf.stages.length}</b></p>
      ${s.cost ? `<p class="cost-line">${escape(costLine(s.cost))}</p>` : ''}
      ${s.skill ? `<p><span class="skill">${escape(s.skill)}</span></p>` : ''}
      <dl class="panel-meta"><dt>正在做</dt><dd>${escape(s.detail)}</dd><dt>下一步</dt><dd>${escape(B.nextStep(s))}</dd><dt>本站时长</dt><dd>${B.minutesIn(s)} 分钟</dd><dt>助手</dt><dd>${s.subagents.length} 个<span class="muted"> · 仅提供数量</span></dd>
      ${from ? `<dt>交接来源</dt><dd class="handoff-note">${escape(fromWorkflow?.name ?? from.workflow)} · ${escape(fromStage?.name ?? from.stage)}</dd>` : ''}</dl></div>
      ${side ? `<div class="card-side">${side}</div>` : ''}</div>
      <section class="card-progress" aria-label="进度"><ol class="stage-trail" aria-label="工作流进度">${wf.stages.map((candidate, index) => {
        const state = B.stageState(s, candidate.id);
        const current = candidate.id === s.stage;
        const rollbacks = rollbackVisits.get(candidate.id) ?? 0;
        const label = `${trailLabels[state]}${rollbacks ? ` · 回退 ${rollbacks} 次` : ''}`;
        return `<li class="${state}${rollbacks ? ' rollback' : ''}"${current ? ' aria-current="step"' : ''} aria-label="${escape(`${index + 1} ${candidate.name}：${label}`)}" title="${escape(`${candidate.name} · ${label}`)}"><span class="trail-dot" aria-hidden="true">${state === 'done' ? '✓' : state === 'skipped' ? '−' : index + 1}</span>${current || state === 'skipped' || rollbacks ? `<span class="trail-name">${escape(candidate.name)}${state === 'skipped' ? '（跳过）' : ''}</span>` : ''}${rollbacks ? `<span class="trail-rollback" aria-hidden="true">↶${rollbacks}</span>` : ''}</li>`;
      }).join('')}</ol>
      ${s.rollbackCount ? `<p class="trail-note">累计回退 ${s.rollbackCount} 次</p>` : ''}
      ${s.cost ? `<div class="token-breakdown" aria-label="各阶段 token 用量">${s.cost.byStage.map((entry) => {
        const flow = B.workflow(entry.workflow);
        const name = flow?.stages.find((candidate) => candidate.id === entry.stage)?.name ?? (entry.stage === 'pre' ? '进入工作流前' : entry.stage);
        const label = entry.workflow && entry.workflow !== wf.id ? `${flow?.name ?? entry.workflow} · ${name}` : name;
        const isPeak = peak > 0 && entry.tokens === peak;
        return `<div class="token-stage${isPeak ? ' peak' : ''}"><span class="token-stage-name">${escape(label)}${isPeak ? '<b>最多</b>' : ''}</span><span class="token-bar" aria-hidden="true"><i style="width:${peak ? entry.tokens / peak * 100 : 0}%"></i></span><span class="token-stage-value">${wan(entry.tokens)}<small>${entry.steps} 步</small></span></div>`;
      }).join('')}</div><p class="trail-note">每一步都要重读全部上下文：步数 × 上下文 ≈ token</p>` : ''}</section>
      ${trailCard(s)}<div class="panel-actions">${chartLink(s)}${sessionLink(s, '去看看')}</div>`;
  }
  function noticeList(list, other = false) {
    return `<ul class="notice-list">${sortResidents(list).map((s) => {
      const contents = `<span class="status-dot" style="--status-color:${B.STATUS[s.status].color}" aria-hidden="true"></span><span><strong>${other ? '' : `${String(residentNumber(s.id)).padStart(2, '0')} · `}${escape(s.title)}</strong><span class="notice-meta">${escape(context(s))} · ${B.STATUS[s.status].glyph} ${B.STATUS[s.status].label}${other ? ' · 去看看' : ''}</span></span>`;
      return `<li>${other ? `<a class="notice-entry" href="/" target="_blank" rel="noopener" data-open-session="${escape(s.id)}">${contents}</a>` : `<button class="notice-entry" type="button" data-resident="${escape(s.id)}">${contents}</button>`}</li>`;
    }).join('')}</ul>`;
  }
  function panelTrigger() {
    if (panel?.kind === 'plaque') return $(`plaque-${panel.id}`);
    if (panel?.kind === 'save') return $(`save-${panel.id}`);
    if (panel?.kind === 'gate') return $('map-gate');
    return panel?.kind === 'resident' ? nodes.get(panel.id) ?? $('map-notice') : $(panel?.kind === 'mailbox' ? 'map-mailbox' : 'map-notice');
  }
  function updateSelection() {
    for (const [id, sprite] of nodes) {
      const selected = panel?.kind === 'resident' && panel.id === id;
      sprite.classList.toggle('selected', selected);
      sprite.setAttribute('aria-expanded', String(selected));
    }
    for (const station of document.querySelectorAll('.station')) {
      const selected = panel?.kind === 'plaque' && panel.id === station.dataset.plaque;
      station.classList.toggle('selected', selected);
      station.setAttribute('aria-expanded', String(selected));
    }
    $('map-mailbox').setAttribute('aria-expanded', String(panel?.kind === 'mailbox'));
    $('map-gate').setAttribute('aria-expanded', String(panel?.kind === 'gate'));
    $('map-notice').setAttribute('aria-expanded', String(panel?.kind === 'notice' || panel?.kind === 'models'));
    for (const building of Object.keys(SAVE_POINTS)) $(`save-${building}`)?.setAttribute('aria-expanded', String(panel?.kind === 'save' && panel.id === building));
  }
  function closePanel(restoreFocus = true) {
    if (!panel) return;
    const trigger = panelTrigger();
    panel = null;
    evidence = null;
    if ($('town-popover').open) $('town-popover').close();
    updateSelection();
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  const runnableWorkflow = (plaqueId) => B.WORKFLOWS.find((workflow) => workflow.available && plaqueForWorkflow(workflow.id)?.id === plaqueId && typeof workflow.skill === 'string' && workflow.skill.trim());
  function plaqueActions(plaque) {
    const workflow = runnableWorkflow(plaque.id);
    if (!workflow) return '<p class="plaque-hint">还没接入 DSH，暂时不能从这里开工。</p>';
    return startControls(workflow.skill, true, '会打开该工作区的新会话并填好命令，补上任务描述后再发送。');
  }
  // Plaques and the gate share one start form; only a host-advertised skill can be posted to the parent.
  // One row: workspace, the command (click selects it) and the start button; the hint sits underneath.
  function startControls(skill, runnable, hint) {
    const command = `<label class="plaque-command"><span class="visually-hidden">开工命令</span><input data-control="command" readonly value="/${escape(skill)}" aria-label="开工命令" title="点击全选"></label>`;
    if (!runnable || workspaceState !== 'ready') return `<div class="plaque-start"><div class="start-row">${command}</div><p class="plaque-hint">在 DSH 对话框里粘贴这条命令开工。${workspaceState === 'unavailable' ? '<br>重启 DSH 后可以从这里一键开工。' : ''}</p></div>`;
    return `<div class="plaque-start"><div class="start-row"><label class="visually-hidden" for="plaque-workspace">工作区</label>
      <select id="plaque-workspace" data-control="workspace" title="${escape(workspaces.find((workspace) => workspace.id === selectedWorkspace)?.path ?? '')}">
        <option value="">最近使用的工作区</option>${workspaces.map((workspace) => `<option value="${escape(workspace.id)}" title="${escape(workspace.path)}"${workspace.id === selectedWorkspace ? ' selected' : ''}>${escape(workspace.title)}</option>`).join('')}
      </select>${command}<button type="button" class="primary" data-action="start-session">新开会话</button></div>
      <p class="plaque-hint">${hint}</p></div>`;
  }
  // Older hosts do not advertise the delivery skill: the gate still shows its command to paste.
  const GATE_COMMAND = 'pstack-opening-a-pr';
  // Role definitions and route catalogs come only from the host; drafts stay local until PUT succeeds.
  const modelRouteLabel = (route) => `${route.provider}/${route.model}`;
  const modelEditable = () => modelSettings.state === 'ready' && modelSettings.data.selection.available && modelSettings.data.selection.enabled;
  async function loadModelSettings() {
    if (modelSettings.state === 'saving') return;
    const pending = { state: 'loading', data: null, assignments: {}, message: '' };
    modelSettings = pending;
    refreshPanel();
    try {
      const response = await fetch('../models', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (modelSettings !== pending) return;
      if (response.status === 404) {
        modelSettings = { ...pending, state: 'old-host', message: '重启 DSH 后可用' };
      } else {
        if (!response.ok) throw new Error(`读取模型分工失败（HTTP ${response.status}）`);
        const data = await response.json();
        if (modelSettings !== pending) return;
        modelSettings = { state: 'ready', data, assignments: structuredClone(data.assignments), message: '', error: false };
      }
    } catch (error) {
      if (modelSettings !== pending) return;
      modelSettings = { ...pending, state: 'error', message: error.message || '读取模型分工失败，请重试' };
    }
    refreshPanel();
  }
  async function saveModelSettings() {
    if (!modelEditable()) return;
    const pending = { ...modelSettings, state: 'saving', message: '正在保存…', error: false };
    modelSettings = pending;
    refreshPanel();
    try {
      const response = await fetch('../models', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: pending.assignments }), signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) {
        modelSettings = { ...pending, state: 'old-host', message: '重启 DSH 后可用' };
      } else {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || `保存失败（HTTP ${response.status}）`);
        modelSettings = { state: 'ready', data, assignments: structuredClone(data.assignments), message: '已保存，新会话生效', error: false };
      }
    } catch (error) {
      modelSettings = { ...pending, state: 'ready', message: error.message || '保存失败，请重试', error: true };
    }
    refreshPanel();
  }
  function modelSettingsCard() {
    const { state, data, assignments, message, error } = modelSettings;
    const intro = '<p class="model-main-note">主模型 = 你在 DSH 输入框为会话选的模型，插件不改</p>';
    if (state === 'loading') return `${intro}<p role="status">正在读取模型分工…</p>`;
    if (state === 'old-host') return `${intro}<p role="status">${message}</p>`;
    if (state === 'error') return `${intro}<p class="model-error" role="alert">${escape(message)}</p><button type="button" data-action="models-reload">重新读取</button>`;
    const { selection, roles } = data;
    const editable = modelEditable();
    const disabled = editable ? '' : ' disabled';
    const guidance = !selection.available ? '当前 DSH 未挂载子智能体模型选择服务；重启或升级 DSH 后可用。'
      : !selection.enabled ? '在 DSH 左栏 插件 → 子智能体 → 模型选择 打开并勾选可用模型；新会话生效'
      : !selection.allowedModels.length ? '还没有可用模型。在 DSH 左栏 插件 → 子智能体 → 模型选择 勾选可用模型；新会话生效'
      : 'DSH 模型选择已开启；这里的分工保存后，新会话生效。';
    return `${intro}<p class="model-selection-status">${escape(guidance)}</p>
      ${data.error ? `<p class="model-error" role="alert">${escape(data.error)}</p>` : ''}
      <p>每个角色留空使用默认模型。更改 DSH 可用模型后，关闭并重新打开本面板读取。</p>
      <div class="model-roles">${roles.map((role) => {
        const routes = assignments[role.id];
        return `<fieldset class="model-role" data-model-role="${escape(role.id)}"><legend>${escape(role.name)}</legend>
          <p class="model-role-use">${escape(role.usedBy)} · 最多 ${role.maxRoutes} 个</p>
          ${routes.length ? routes.map((route, index) => {
            const selected = selection.allowedModels.findIndex((candidate) => candidate.provider === route.provider && candidate.model === route.model);
            const levels = selection.allowedModels[selected]?.reasoningEfforts ?? [];
            const control = `${role.id}-${index}`;
            return `<div class="model-route" data-model-index="${index}">
              <label for="model-${escape(control)}">模型 ${index + 1}</label>
              <select id="model-${escape(control)}" data-control="model-${escape(control)}" data-model-select${disabled}>
                ${selected < 0 ? `<option value="-1" selected>${escape(modelRouteLabel(route))}（不在可用列表）</option>` : ''}
                ${selection.allowedModels.map((candidate, value) => `<option value="${value}"${value === selected ? ' selected' : ''}>${escape(modelRouteLabel(candidate))}</option>`).join('')}
              </select>
              ${levels.length ? `<label for="reasoning-${escape(control)}">推理强度（可选）</label><select id="reasoning-${escape(control)}" data-control="reasoning-${escape(control)}" data-model-reasoning${disabled}>
                <option value=""${!route.reasoning_effort ? ' selected' : ''}>默认</option>
                ${route.reasoning_effort && !levels.includes(route.reasoning_effort) ? `<option value="${escape(route.reasoning_effort)}" selected>${escape(route.reasoning_effort)}（不在可用列表）</option>` : ''}
                ${levels.map((level) => `<option value="${escape(level)}"${level === route.reasoning_effort ? ' selected' : ''}>${escape(level)}</option>`).join('')}
              </select>` : ''}
              <button type="button" data-action="model-remove" data-control="model-remove-${escape(control)}" aria-label="移除${escape(role.name)}的模型 ${index + 1}"${disabled}>移除</button>
            </div>`;
          }).join('') : '<p class="model-default">使用默认模型</p>'}
          <button type="button" data-action="model-add" data-control="model-add-${escape(role.id)}"${!editable || routes.length >= role.maxRoutes || !selection.allowedModels.length ? ' disabled' : ''}>添加模型</button>
        </fieldset>`;
      }).join('')}</div>
      <div class="panel-actions"><button type="button" class="model-save" data-action="models-save"${disabled}>${state === 'saving' ? '保存中…' : '保存'}</button><button type="button" data-action="models-back">返回告示牌</button></div>
      <p id="model-save-status" class="${error ? 'model-error' : 'model-save-status'}" role="${error ? 'alert' : 'status'}" aria-live="polite" aria-atomic="true">${escape(message)}</p>`;
  }
  function refreshPanel() {
    if (!panel) return;
    let title, content, chip = '', accent = 'wood';
    if (panel.kind === 'plaque') {
      const plaque = PLAQUES[panel.id];
      const occupants = sortResidents(sessions.filter((s) => onMap(s) && s.plaque.id === plaque.id));
      chip = rooms[plaque.building].name; accent = plaque.building;
      title = plaque.name;
      content = `<p class="plaque-summary">${escape(plaque.summary)}</p>${plaqueActions(plaque)}
        <h3>在这里的居民 · ${occupants.length}</h3>${occupants.length ? `<div class="card-grid">${occupants.map((s) => `<article class="plaque-resident"><strong>${escape(s.title)}</strong><p>${escape(B.currentStage(s).name)} <b>${B.stageIndex(s) + 1}/${B.workflow(s.workflow).stages.length}</b> · ${statusPill(s)}</p><div class="panel-actions"><button type="button" data-resident="${escape(s.id)}">居民卡</button>${sessionLink(s, '去看看')}</div></article>`).join('')}</div>` : '<p class="empty-mail">此刻没有居民在这里</p>'}
        `;
    } else if (panel.kind === 'save') {
      const point = SAVE_POINTS[panel.id];
      const parked = sortResidents(sessions.filter((s) => s.inTown && s.plaque.building === panel.id && isParked(s)));
      chip = rooms[panel.id].name; accent = panel.id;
      title = `${point.name} · ${parked.length}`;
      content = `<p class="save-intro">${saveIcon} 存档只写续接笔记，不提交、不 stash、不改代码。</p>${parked.length ? `<div class="card-grid">${parked.map((s) => `<article class="parked-resident"><h3>${escape(s.title)}</h3>${statusPill(s)}${checkpointCard(s) || `<p class="checkpoint-missing">尚未存档 · 等你${escape(s.needs?.question ?? '到会话里看看')}</p>`}<div class="panel-actions"><button type="button" data-resident="${escape(s.id)}">居民卡</button>${sessionLink(s, '去看看')}</div></article>`).join('')}</div>` : '<p class="empty-mail">这里还没有等候的居民。<br>存档后的小人会来这里等你。</p>'}`;
    } else if (panel.kind === 'resident') {
      const s = sessions.find((session) => session.id === panel.id && session.inTown);
      if (!s) { closePanel(); return; }
      chip = rooms[s.plaque.building].name; accent = s.plaque.building;
      title = `居民卡 · ${String(residentNumber(s.id)).padStart(2, '0')}`;
      content = residentCard(s);
    } else if (panel.kind === 'mailbox') {
      title = `收件箱 · ${mailCount}`;
      content = mailCount ? inbox.filter((group) => group.items.length).map((group) => `<section class="inbox-group" data-inbox="${group.kind}"><h3>${group.title} · ${group.items.length}</h3><div class="card-grid">${group.items.map((item) => `<article class="letter"><h4 class="letter-title">${escape(item.title)}</h4><div class="letter-context">${escape(group.kind === 'needsYou' ? item.context : context(item))}</div>${letterBody(group.kind, item)}<div class="answer-options">${group.kind === 'attention' && item.inTown ? `<button type="button" data-resident="${escape(item.id)}">居民卡</button>` : ''}${sessionLink(item, group.kind === 'needsYou' ? '去回答' : '去看看')}</div></article>`).join('')}</div></section>`).join('') : '<p class="empty-mail">目前没有待回答的问题</p>';
    } else if (panel.kind === 'gate') {
      const leavers = recentLeavers(sessions);
      chip = '出镇关口'; accent = 'gate';
      title = '开 PR / MR';
      content = `<p class="plaque-summary">做完的工作从这里出镇。需要交付代码时，居民按 pstack-opening-a-pr 把改动整理成小而有序的提交，GitHub 仓库开 PR，GitLab 仓库开 MR，没有远端或命令行工具时只留本地提交；开好就贴出链接并停下，不会接着盯 CI。只读的任务不经过这道关口，直接离开。</p>${startControls(B.deliverySkill ?? GATE_COMMAND, Boolean(B.deliverySkill), '会打开该工作区的新会话并填好命令；补一句要整理和交付的改动（分支或路径），再发送。')}<h3>最近离开 · ${leavers.length}</h3>${leaverList(leavers)}`;
    } else if (panel.kind === 'models') {
      title = '模型分工';
      content = modelSettingsCard();
    } else {
      const residents = sessions.filter(onMap), others = sessions.filter((s) => !s.inTown && s.status !== 'finished'), leavers = recentLeavers(sessions);
      title = '告示牌';
      content = `<div class="notice-top"><section class="notice-group"><h3>概况</h3><div class="overview-stats">${statsMarkup()}</div><p class="connection-detail ${B.connection.status}">${escape(connectionDetail())}${B.connection.status === 'error' ? ' <button type="button" data-action="retry">重试</button>' : ''}</p></section><section class="notice-group"><h3>设置</h3><div class="settings-actions"><button id="quiet" type="button" data-action="quiet" aria-pressed="${quiet}">安静模式 · ${quiet ? '已开启' : '已关闭'}</button><button type="button" data-action="models">模型分工</button><button type="button" data-action="help">小镇使用说明</button></div></section></div><section class="notice-group"><h3>居民 · ${residents.length}</h3>${residents.length ? noticeList(residents) : '<p class="empty-mail">还没有会话在跑</p>'}</section>${others.length ? `<section class="notice-group"><h3>其他会话 · ${others.length}</h3>${noticeList(others, true)}</section>` : ''}<section class="notice-group"><h3>最近离开 · ${leavers.length}</h3>${leaverList(leavers)}</section>`;
    }
    const dialog = $('town-popover');
    dialog.dataset.accent = accent;
    $('popover-chip').textContent = chip;
    $('popover-chip').hidden = !chip;
    $('popover-title').textContent = title;
    if (content !== panelContent) {
      const body = $('popover-content'), active = document.activeElement;
      const focusAttribute = body.contains(active) ? ['data-open-session', 'data-open-file', 'data-resident', 'data-control', 'data-action', 'data-note', 'data-evidence', 'data-viewer'].find((attribute) => active.hasAttribute(attribute)) : null;
      const focusKey = focusAttribute && active.getAttribute(focusAttribute);
      const selection = active.matches('.resume-path, .plaque-command input') ? [active.selectionStart, active.selectionEnd] : null;
      const scrollTop = body.scrollTop;
      body.innerHTML = content;
      panelContent = content;
      if (focusKey) {
        const replacement = [...body.querySelectorAll(`[${focusAttribute}]`)].find((element) => element.getAttribute(focusAttribute) === focusKey);
        (replacement && !replacement.disabled ? replacement : $('close-popover')).focus({ preventScroll: true });
        if (replacement && selection) replacement.setSelectionRange(...selection);
      }
      body.scrollTop = scrollTop;
    }
  }
  // Every panel is one modal dialog: opening another panel from inside swaps its content, never stacks.
  function openPanel(next) {
    panel = next;
    panelContent = '';
    evidence = null;
    const dialog = $('town-popover');
    dialog.dataset.kind = next.kind;
    $('popover-content').scrollTop = 0;
    updateSelection();
    refreshPanel();
    if (!dialog.open) dialog.showModal();
    $('close-popover').focus({ preventScroll: true });
  }

  // ---------- Live render ----------
  // The first live snapshot is placed as it is: nobody walks in, and sessions already finished are not drawn.
  // Later, a newly seen resident walks in from the west and a resident seen turning finished walks out east.
  let primed = false;
  function dropResident(id) {
    nodes.get(id)?.remove();
    clearTimeout(eventTimers.get(id));
    eventTimers.delete(id);
    nodes.delete(id);
    actors.delete(id);
    previous.delete(id);
  }
  // A stop on the road keeps the resident's nameplate width, centred on the resident.
  const spot = (point, actor) => ({ x: point.x, y: point.y, outside: true, helpers: 0, labelWidth: actor.target.labelWidth, labelLeft: point.x - actor.target.labelWidth / 2 });
  // Leavers set off one after another, so a poll that finishes several does not pile them up at the gate.
  function leave(actor, s) {
    const kind = s.delivery?.kind ?? null, queued = [...actors.values()].filter((other) => other.leaving).length;
    actor.session = s;
    actor.leaving = { kind, phase: kind ? 'gate' : 'out', until: null };
    walk(actor, departure(rooms[s.plaque.building], { ...actor.pos, outside: actor.target.outside }, Boolean(kind)), 70, queued * 900);
    if (!actor.path) { dropResident(s.id); return; }
    actor.target = spot(kind ? GATE.stop : EXIT, actor);
    actor.el.setAttribute('class', 'resident finished');
    // A leaver no longer holds a resident number; its plate reads 完 and its title.
    const plate = residentNameplate(s, 0);
    actor.el.querySelector('.nameplate-number').textContent = '';
    actor.el.querySelector('.nameplate-glyph').textContent = plate.glyph;
    actor.el.querySelector('.nameplate-compact').textContent = plate.glyph;
    actor.el.querySelector('.nameplate-dot').setAttribute('fill', plate.color);
    delete actor.el.dataset.nameplate;
    fitNameplate(actor, plate.title);
    if (kind) actor.el.dataset.delivery = kind;
  }
  function render(snapshot) {
    sessions = snapshot.map((s) => {
      const plaque = plaqueForWorkflow(s.workflow);
      return { ...s, plaque, inTown: Boolean(plaque && B.currentStage(s)) };
    });
    renderBuildings();
    const residents = sessions.filter(onMap);
    const live = B.connection.status === 'live';
    $('connection-banner').hidden = B.connection.status !== 'error';
    $('empty-state').hidden = sessions.length > 0 || B.connection.status === 'error';
    $('empty-state').textContent = live ? '还没有会话在跑' : '正在读取会话';
    summary = {
      residents: residents.length,
      busy: sessions.filter((s) => s.status === 'working').length,
      tokens: sessions.some((s) => s.cost) ? (typeof B.totalCost === 'function' ? B.totalCost().tokens : sessions.reduce((total, s) => total + (s.cost?.tokens ?? 0), 0)) : null,
    };
    $('notice-stats').innerHTML = statsMarkup();
    $('map-notice').dataset.connection = B.connection.status;
    $('notice-status').textContent = B.connection.status === 'error' ? '连不上' : live ? '' : '连接中';
    $('map-notice').setAttribute('aria-label', `告示牌：${summary.residents} 位居民，${summary.busy} 在忙${summary.tokens === null ? '' : `，累计 ${wan(summary.tokens)} token`}，${connectionDetail()}，打开设置与居民列表`);
    inbox = [
      { kind: 'needsYou', title: '待回答', items: mailboxItems(sessions, B.WORKFLOWS) },
      { kind: 'attention', title: '需要你注意', items: attentionItems(sessions) },
      { kind: 'paused', title: '存档等你', items: sessions.filter((s) => s.status === 'paused') },
      { kind: 'interrupted', title: '断了要处理', items: sessions.filter((s) => s.status === 'interrupted') },
    ];
    const count = inbox.reduce((total, group) => total + group.items.length, 0);
    $('map-mailbox').setAttribute('aria-label', `收件箱：${count} 项待处理`);
    $('map-mailbox').classList.toggle('has-mail', count > 0);
    $('mail-badge').hidden = count === 0;
    $('mail-badge').textContent = count;
    if (count > mailCount && motion()) {
      for (const animation of $('mail-badge').getAnimations()) animation.cancel();
      $('mail-badge').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)', offset: 0.45 }, { transform: 'translateY(0)' }], { duration: 480, easing: 'ease-out' });
    }
    mailCount = count;
    for (const building of Object.keys(rooms)) {
      const population = $('population-' + building);
      const label = `${residents.filter((s) => s.plaque.building === building).length} 人`;
      if (population.querySelector('text').textContent !== label) { population.querySelector('text').textContent = label; fitPlates(population.parentNode); }
      const parked = residents.filter((s) => s.plaque.building === building && isParked(s)).length;
      $(`save-${building}`).setAttribute('aria-label', `${rooms[building].name}：${SAVE_POINTS[building].name}，${parked} 位居民等候，查看存档`);
    }
    const residentIds = new Set(residents.map((s) => s.id));
    for (const [id, actor] of actors) {
      if (residentIds.has(id)) continue;
      const s = sessions.find((session) => session.id === id);
      if (actor.leaving) { if (s) actor.session = s; }
      else if (primed && s?.inTown && s.status === 'finished' && motion()) leave(actor, s);
      else dropResident(id);
    }
    const active = new Set();
    const targets = residentTargets(residents);
    residents.forEach((s, index) => {
      let el = nodes.get(s.id);
      const old = previous.get(s.id);
      if (!el) { el = makeResident(s); nodes.set(s.id, el); }
      const goal = targets.get(s.id);
      let actor = actors.get(s.id);
      if (!actor) {
        // A newcomer's button takes its seat now (or at the west edge when it walks in); its sprite follows on the next frame.
        const arriving = primed && motion();
        const start = arriving ? { x: ENTRY.x, y: ENTRY.y } : { x: goal.x, y: goal.y };
        actor = { el, session: s, target: goal, pos: { ...start }, drawn: { ...start }, facing: 1, path: null, event: null, arriving, leaving: null, phase: Math.floor(hash(index, s.id.length, 51) * 4800) };
        el.style.transform = `translate(${start.x}px,${start.y}px)`;
        actors.set(s.id, actor);
        if (arriving) walk(actor, arrival(rooms[s.plaque.building], goal), 70);
      } else {
        actor.session = s;
        if (actor.leaving) {
          // Resumed on its way out: turn back along the avenue to its new place.
          actor.leaving = null;
          delete el.dataset.delivery;
          walk(actor, tidy([{ ...actor.pos }, ...avenue(actor.pos.x, rooms[s.plaque.building].door), ...into(rooms[s.plaque.building], goal)]), 70);
        } else if (goal.x !== actor.target.x || goal.y !== actor.target.y) {
          const fromRoom = rooms[plaqueForWorkflow(old.workflow).building], toRoom = rooms[s.plaque.building];
          const start = { ...actor.pos, outside: actor.target.outside };
          walk(actor, route(fromRoom, start, toRoom, goal), fromRoom === toRoom ? 32 : 70);
        }
        actor.target = goal;
      }
      active.add(s.plaque.id);
      const classes = [...el.classList].filter((c) => c.startsWith('event-'));
      el.setAttribute('class', `resident ${s.status} ${classes.join(' ')}${panel?.kind === 'resident' && panel.id === s.id ? ' selected' : ''}`);
      const modes = runModes(s).map((name) => name.replace('Badge', '')).join(' ');
      if ((el.dataset.badges ?? '') !== modes) { if (modes) el.dataset.badges = modes; else delete el.dataset.badges; }
      el.setAttribute('aria-label', `${index + 1}，${s.title}，${B.STATUS[s.status].label}，${B.currentStage(s).name}，查看居民卡`);
      const nameplate = residentNameplate(s, index + 1);
      const key = `${nameplate.number}|${nameplate.glyph}|${nameplate.title}|${goal.labelWidth}|${goal.labelLeft}`;
      if (el.dataset.nameplate !== key) {
        el.querySelector('.nameplate-number').textContent = nameplate.number;
        el.querySelector('.nameplate-title').textContent = nameplate.title;
        el.querySelector('.nameplate-glyph').textContent = nameplate.glyph;
        el.querySelector('.nameplate-compact').textContent = `${nameplate.number} ${nameplate.glyph}`;
        el.dataset.nameplate = key;
        fitNameplate(actor, nameplate.title);
      }
      el.querySelector('.nameplate-dot').setAttribute('fill', nameplate.color);
      const eventKey = s.event ? JSON.stringify([s.id, s.event.id]) : null;
      if (eventKey && !playedEvents.has(eventKey)) {
        playedEvents.add(eventKey);
        playEvent(el, s);
      }
      previous.set(s.id, { stage: s.stage, workflow: s.workflow });
    });
    for (const station of document.querySelectorAll('.station')) station.classList.toggle('active', active.has(station.dataset.plaque));
    if (live) primed = true;
    updateSelection();
    refreshPanel();
    animate();
  }
  $('map-mailbox').addEventListener('click', () => openPanel({ kind: 'mailbox' }));
  $('map-notice').addEventListener('click', () => openPanel({ kind: 'notice' }));
  $('map-gate').addEventListener('click', () => openPanel({ kind: 'gate' }));
  $('close-popover').addEventListener('click', () => closePanel());
  $('popover-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-resident]');
    if (button) openPanel({ kind: 'resident', id: button.dataset.resident });
    const chip = event.target.closest('[data-evidence]');
    if (chip && panel?.kind === 'resident') void toggleEvidence(panel.id, Number(chip.dataset.evidenceRow), { kind: chip.dataset.evidenceKind, ref: chip.dataset.evidenceRef });
    const file = event.target.closest('[data-open-file]');
    if (file && panel?.kind === 'resident') requestOpenFile(panel.id, file.dataset.openFile);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'quiet') toggleQuiet();
    else if (action === 'help') showHelp();
    else if (action === 'evidence-close') closeEvidence();
    else if (action === 'retry') B.retry();
    else if (action === 'models') { openPanel({ kind: 'models' }); void loadModelSettings(); }
    else if (action === 'models-reload') void loadModelSettings();
    else if (action === 'models-save') void saveModelSettings();
    else if (action === 'models-back') {
      openPanel({ kind: 'notice' });
      $('popover-content').querySelector('[data-action="models"]').focus({ preventScroll: true });
    } else if ((action === 'model-add' || action === 'model-remove') && modelEditable()) {
      const roleId = event.target.closest('[data-model-role]').dataset.modelRole;
      const role = modelSettings.data.roles.find((item) => item.id === roleId);
      const routes = modelSettings.assignments[roleId];
      let focus;
      if (action === 'model-add') {
        const allowed = modelSettings.data.selection.allowedModels;
        if (routes.length >= role.maxRoutes || !allowed.length) return;
        const route = allowed.find((candidate) => !routes.some((item) => item.provider === candidate.provider && item.model === candidate.model)) ?? allowed[0];
        routes.push({ provider: route.provider, model: route.model });
        focus = `model-${roleId}-${routes.length - 1}`;
      } else {
        routes.splice(Number(event.target.closest('[data-model-index]').dataset.modelIndex), 1);
        focus = `model-add-${roleId}`;
      }
      modelSettings.message = '尚未保存';
      modelSettings.error = false;
      refreshPanel();
      $('popover-content').querySelector(`[data-control="${focus}"]`).focus({ preventScroll: true });
    }
    else if (action === 'start-session' && workspaceState === 'ready') {
      const skill = panel?.kind === 'plaque' ? runnableWorkflow(panel.id)?.skill : panel?.kind === 'gate' ? B.deliverySkill : null;
      if (skill) window.parent.postMessage({ type: 'pixel-town-pstack/start-session', skill, ...(selectedWorkspace ? { workspaceId: selectedWorkspace } : {}) }, location.origin);
    }
    if (event.target.matches('.resume-path, .plaque-command input')) event.target.select();
  });
  $('popover-content').addEventListener('change', (event) => {
    if (event.target.id === 'plaque-workspace') {
      // Render the choice now, so a later poll finds nothing to replace under a pending click.
      selectedWorkspace = event.target.value;
      refreshPanel();
    } else if (event.target.matches('[data-model-select], [data-model-reasoning]') && modelEditable()) {
      const roleId = event.target.closest('[data-model-role]').dataset.modelRole;
      const index = Number(event.target.closest('[data-model-index]').dataset.modelIndex);
      if (event.target.hasAttribute('data-model-select')) {
        const route = modelSettings.data.selection.allowedModels[Number(event.target.value)];
        if (!route) return;
        modelSettings.assignments[roleId][index] = { provider: route.provider, model: route.model };
      } else {
        const route = modelSettings.assignments[roleId][index];
        if (event.target.value) route.reasoning_effort = event.target.value;
        else delete route.reasoning_effort;
      }
      modelSettings.message = '尚未保存';
      modelSettings.error = false;
      refreshPanel();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // The inline evidence viewer closes first, handing focus back to its chip; the next Escape closes the card.
    if (evidence) { event.preventDefault(); closeEvidence(); }
    else if (panel) { event.preventDefault(); closePanel(); }
  });
  onBackdrop($('town-popover'), () => closePanel());
  // Closed by the browser rather than by closePanel: settle the selection and focus the same way.
  $('town-popover').addEventListener('close', () => { if (!$('town-popover').open) closePanel(); });
  new ResizeObserver(scheduleLayout).observe(scene);
  addEventListener('resize', scheduleLayout);
  // Moving between screens changes the pixel ratio without resizing anything.
  const watchPixelRatio = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { scheduleLayout(); watchPixelRatio(); }, { once: true });
  watchPixelRatio();
  const openSession = (event) => {
    const link = event.target.closest('a[data-open-session]');
    if (!link || (event.type === 'auxclick' && event.button !== 1)) return;
    try { openSessionLink(link.dataset.openSession, event); }
    catch {
      event.preventDefault();
      showInfo('无法选择 DSH 会话', '<p>请从 DSH 侧栏打开像素小镇，或允许本站使用本地存储后重试。</p>');
    }
  };
  document.addEventListener('click', openSession);
  document.addEventListener('auxclick', openSession);
  $('retry').addEventListener('click', () => B.retry());
  if (embedded) {
    const timeout = setTimeout(() => {
      workspaceState = 'unavailable';
      refreshPanel();
    }, 1500);
    addEventListener('message', (event) => {
      const items = workspacesFromMessage(event, window.parent, location.origin);
      if (items === undefined) return;
      clearTimeout(timeout);
      workspaces = items;
      workspaceState = 'ready';
      if (!workspaces.some((workspace) => workspace.id === selectedWorkspace)) selectedWorkspace = '';
      refreshPanel();
    });
    window.parent.postMessage({ type: 'pixel-town-pstack/workspaces' }, location.origin);
  }
  layout();
  B.subscribe(render);
  B.start();
  addEventListener('pagehide', () => B.stop());
  addEventListener('pageshow', () => B.start());
})();
