// Procedural, simplified 3D rocket models (three.js) with a mission-adaptive exploded view.
// All dimensions are in metres and roughly follow published vehicle dimensions; details are approximations.
import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from './vendor/three/addons/CSS2DRenderer.js';
import { RoomEnvironment } from './vendor/three/addons/RoomEnvironment.js';
import { buildStarshipDetailed } from './starship-detailed.js';
import { starshipVariant } from './starship/variant.js';

// Strap-on boosters for rockets that use the generic model (known configurations only).
// n = count, kind = solid|liquid, lenF = booster length as fraction of core length, rF = radius as fraction of core radius.
export const SIDE_BOOSTERS = [
  { re: /soyuz[- ]?2\.1(?:[ab]\b|(?![a-z0-9]))|soyuz[- ]?fg|soyuz[- ]?u\b|soyuz[- ]?st\b/i, n: 4, kind: 'liquid', lenF: 0.43, rF: 0.55, cone: true, name: 'Strap-on booster (Block B/V/G/D)', desc: 'One of four liquid-fuelled (kerosene/LOX) strap-on boosters, each with an RD-107A engine, that form the first stage around the core. They separate about two minutes after liftoff in the famous "Korolev cross".' },
  { re: /\bH3[- ]?24/i, n: 4, kind: 'solid', lenF: 0.37, rF: 0.48, name: 'SRB-3 solid booster', desc: 'One of four SRB-3 solid rocket boosters. The "4" in H3-24 gives the booster count (H3-22 flies with two, H3-30 with none).' },
  { re: /\bH3[- ]?22/i, n: 2, kind: 'solid', lenF: 0.37, rF: 0.48, name: 'SRB-3 solid booster', desc: 'One of two SRB-3 solid rocket boosters. The second "2" in H3-22 gives the booster count.' },
  { re: /\bLVM[- ]?3\b|GSLV Mk\.? ?III|launch vehicle mark-?3/i, n: 2, kind: 'solid', lenF: 0.58, rF: 0.62, name: 'S200 solid booster', desc: 'One of two S200 solid strap-on boosters (about 200 t of propellant each), which provide most of the thrust at liftoff.' },
  { re: /ariane 62/i, n: 2, kind: 'solid', lenF: 0.36, rF: 0.35, name: 'P120C solid booster', desc: 'One of two P120C solid rocket boosters (the "2" in Ariane 62). The same motor is the first stage of Vega-C.' },
  { re: /ariane 64/i, n: 4, kind: 'solid', lenF: 0.36, rF: 0.35, name: 'P120C solid booster', desc: 'One of four P120C solid rocket boosters (the "4" in Ariane 64).' },
  { re: /GSLV Mk\.? ?II\b|GSLV MkII/i, n: 4, kind: 'liquid', lenF: 0.4, rF: 0.35, name: 'L40H liquid strap-on', desc: 'One of four L40H liquid strap-on boosters, each with a Vikas engine, around the solid core first stage.' },
  { re: /PSLV[- ]?XL/i, n: 6, kind: 'solid', lenF: 0.28, rF: 0.33, name: 'PSOM-XL strap-on', desc: 'One of six PSOM-XL solid strap-on motors (the XL version uses six extended motors).' },
  { re: /PSLV[- ]?QL/i, n: 4, kind: 'solid', lenF: 0.28, rF: 0.33, name: 'PSOM-XL strap-on', desc: 'One of four PSOM-XL solid strap-on motors (QL = four strap-ons).' },
  { re: /PSLV[- ]?DL/i, n: 2, kind: 'solid', lenF: 0.28, rF: 0.33, name: 'PSOM-XL strap-on', desc: 'One of two PSOM-XL solid strap-on motors (DL = two strap-ons).' },
  { re: /long march 5\b|CZ-5\b/i, n: 4, kind: 'liquid', lenF: 0.5, rF: 0.6, name: 'Liquid booster', desc: 'One of four 3.35 m kerosene/LOX boosters.' },
  { re: /long march 5B|CZ-5B/i, n: 4, kind: 'liquid', lenF: 0.5, rF: 0.6, name: 'Liquid booster', desc: 'One of four 3.35 m kerosene/LOX boosters. Long March 5B has no second stage: the core and boosters put the payload into low Earth orbit.' },
  { re: /long march 2F|CZ-2F/i, n: 4, kind: 'liquid', lenF: 0.42, rF: 0.68, name: 'Liquid booster', desc: 'One of four 2.25 m liquid strap-on boosters (hypergolic propellants, one YF-20-series engine each) around the core of the Long March 2F that launches Shenzhou crews.', note: 'Escape tower not drawn: the launch escape tower on top of the Shenzhou fairing is left off this simplified model.' },
  { re: /long march 7A?\b|CZ-7A?\b/i, n: 4, kind: 'liquid', lenF: 0.5, rF: 0.68, name: 'Liquid booster', desc: 'One of four 2.25 m kerosene/LOX boosters, each with one YF-100 engine.' },
  { re: /long march 3B|CZ-3B/i, n: 4, kind: 'liquid', lenF: 0.45, rF: 0.68, name: 'Liquid booster', desc: 'One of four 2.25 m liquid strap-on boosters (hypergolic propellants) around the Long March 3B core.' },
  { re: /long march 3C|CZ-3C/i, n: 2, kind: 'liquid', lenF: 0.45, rF: 0.68, name: 'Liquid booster', desc: 'One of two 2.25 m liquid strap-on boosters (Long March 3C is the two-booster version of 3B).' },
  { re: /long march 6A|CZ-6A/i, n: 4, kind: 'solid', lenF: 0.4, rF: 0.6, name: 'Solid booster', desc: 'One of four 2 m solid rocket boosters around the kerosene/LOX core.' },
  { re: /long march 8A\b|CZ-8A\b/i, n: 2, kind: 'liquid', lenF: 0.45, rF: 0.68, name: 'Liquid booster', desc: 'One of two 2.25 m kerosene/LOX boosters (one YF-100 engine each). Long March 8A keeps the two side boosters of Long March 8 and adds a wider 3.35 m hydrogen upper stage.' },
  { re: /delta iv heavy/i, n: 2, kind: 'liquid', lenF: 0.72, rF: 1, name: 'Common Booster Core (side)', desc: 'One of two side Common Booster Cores, each identical to the centre core and powered by an RS-68A hydrogen engine. Delta IV Heavy retired in 2024.' },
  { re: /angara[- ]?A5/i, n: 4, kind: 'liquid', lenF: 0.55, rF: 1, name: 'URM-1 booster', desc: 'One of four URM-1 modules, the same universal rocket module as the core, each with an RD-191 engine.' },
  { re: /\bSLS\b|space launch system/i, n: 2, kind: 'solid', lenF: 0.6, rF: 0.44, name: 'Five-segment solid booster', desc: 'One of two five-segment solid rocket boosters derived from the Space Shuttle boosters.' },
];
// Rockets that do have side boosters, but the data doesn't say how many (or we don't model them): say so on the model.
const BOOSTERS_NOT_DRAWN = [
  { re: /ariane 6(?![0-9])/i, note: 'Ariane 6 flies with 2 (Ariane 62) or 4 (Ariane 64) solid boosters; the data does not say which, so boosters are not drawn.' },
  { re: /\bH3(?![- ]?[0-9])/i, note: 'H3 flies with 0, 2 or 4 solid boosters depending on the variant; the data does not say which, so boosters are not drawn.' },
  { re: /\bPSLV\b(?![- ]?(XL|QL|DL))/i, note: 'PSLV variants fly with 0, 2, 4 or 6 solid strap-ons; the data does not say which, so boosters are not drawn.' },
  { re: /long march 8(?![0-9A-Z])|CZ-8(?![0-9A-Z])/i, note: 'Long March 8 has flown both with 2 liquid side boosters and core-only (0 boosters); the data does not say which, so boosters are not drawn.' },
  { re: /long march (2C|2D|3A|4[BC]|6(?!A)|11|12A?)\b|CZ-(2C|2D|3A|4[BC]|6(?!A)|11|12A?)\b/i, note: null }, // flown without side boosters
  { re: /soyuz[- ]?2\.1v|kuaizhou-?11|antares|minotaur|pegasus|zenit|proton/i, note: null }, // no strap-ons (Soyuz-2.1v is core-only; Zenit and Proton never had them)
  { re: /long march|CZ-/i, note: 'Some Long March versions carry strap-on boosters; this version is not in our booster table, so any boosters are not drawn.' },
  { re: /soyuz|atlas|GSLV|angara|titan|delta/i, note: 'This rocket family can carry side boosters; this version is not in our booster table, so any boosters are not drawn.' },
];
export function boosterNoteFor(l) {
  if (sideBoostersFor(l)) return null;
  const n = `${l.rocket.full_name || ''} ${l.rocket.name || ''}`;
  const b = BOOSTERS_NOT_DRAWN.find((x) => x.re.test(n));
  return b ? b.note : null;
}
export function sideBoostersFor(l) { const n = `${l.rocket.full_name || ''} ${l.rocket.name || ''}`; return SIDE_BOOSTERS.find((b) => b.re.test(n)) || null; }

// ---------------------------------------------------------------- plan (what to build)
const has = (re, ...s) => s.some((x) => x && re.test(x));

/** Decide rocket model + payload configuration from the launch record. Returns reasons for transparency. */
export function planFor(l) {
  const rn = `${l.rocket.full_name || ''} ${l.rocket.name || ''}`;
  const text = `${l.name || ''} ${(l.mission && l.mission.name) || ''}`;
  const mtype = (l.mission && l.mission.type) || '';
  const sc = (l.rocket.spacecraft_stage || [])[0];
  const payloads = l.rocket.payloads || [];
  const reasons = [];
  let rocket = 'generic';
  if (/falcon heavy/i.test(rn)) rocket = 'falconHeavy';
  else if (/falcon 9/i.test(rn)) rocket = 'falcon9';
  else if (/starship|super heavy/i.test(rn)) rocket = 'starship';
  else if (/electron|haste/i.test(rn)) rocket = 'electron';
  else if (/atlas v/i.test(rn)) rocket = 'atlasV';
  else if (/vulcan/i.test(rn)) rocket = 'vulcan';
  reasons.push(`rocket.configuration = “${(l.rocket.full_name || l.rocket.name || '?').trim()}” → ${rocket === 'generic' ? 'generic model scaled to API length/diameter' : 'custom model'}`);

  let payload = 'satellite';
  const scName = sc ? `${sc.config || ''} ${sc.name || ''}` : '';
  if (rocket === 'starship') {
    if (has(/starlink/i, text)) { payload = 'starlink'; reasons.push('mission name mentions Starlink → satellites in the ship’s payload bay'); }
    else if (payloads.length) { payload = 'satellite'; reasons.push('rocket.payloads lists a payload'); }
    else { payload = 'none'; reasons.push('no payload listed → empty payload bay'); }
  } else if (sc && /dragon/i.test(scName)) {
    payload = (/crew/i.test(scName) || sc.human_rated) ? 'dragonCrew' : 'dragonCargo';
    reasons.push(`rocket.spacecraft_stage = “${sc.name || sc.config}” → Dragon capsule + trunk replace the fairing`);
  } else if ((sc && /starliner|cst-100/i.test(scName)) || /N22/i.test(rn)) {
    payload = 'starliner'; reasons.push('Starliner spacecraft (Atlas V N22) → capsule + service module, no fairing');
  } else if (/cygnus/i.test(text)) {
    payload = 'cygnus'; reasons.push('mission name mentions Cygnus → Cygnus spacecraft inside the fairing');
  } else if (!sc && /^(falcon)/.test(rocket) && /\b(crew-\d+|ax-\d+|axiom|fram2|crs-\d+|spx-\d+|dragon)\b/i.test(text)) {
    payload = /crs|spx|cargo/i.test(text) ? 'dragonCargo' : 'dragonCrew';
    reasons.push('mission name indicates a Dragon flight → Dragon capsule + trunk');
  } else if (sc && /capsule/i.test(sc.config_type || '')) {
    payload = 'capsule'; reasons.push(`rocket.spacecraft_stage = “${sc.name || sc.config}” (capsule) → generic crew/cargo capsule`);
  } else if (has(/starlink/i, text)) {
    payload = 'starlink'; reasons.push('mission name mentions Starlink → flat-packed satellite stack under the fairing');
  } else if (has(/amazon leo|kuiper|oneweb|qianfan|thousand sails|guowang/i, text)) {
    payload = 'constellation'; reasons.push('mission name matches a broadband constellation → stack of satellites');
  } else if (/rideshare/i.test(mtype) || has(/transporter|bandwagon|rideshare/i, text)) {
    payload = 'rideshare'; reasons.push(`mission.type “${mtype || 'rideshare'}” → rideshare dispenser rings with many small satellites`);
  } else if (/government\/top secret/i.test(mtype)) {
    payload = 'classified'; reasons.push('mission.type “Government/Top Secret” → shape unknown, shown as a plain shrouded payload');
  } else if (/planetary|lunar|astrophysics|heliophysics|robotic exploration/i.test(mtype)) {
    payload = 'probe'; reasons.push(`mission.type “${mtype}” → generic science spacecraft`);
  } else if (/test flight/i.test(mtype) && !payloads.length) {
    payload = 'none'; reasons.push('test flight with no payload listed → empty payload adapter');
  } else {
    reasons.push(payloads.length ? `rocket.payloads: ${payloads.map((p) => p.name).join(', ')} → generic satellite` : 'no specific payload details → generic satellite');
  }
  if (rocket === 'electron') reasons.push('Electron → kick stage (Photon/Curie) shown between second stage and payload');
  if (rocket === 'falconHeavy') reasons.push('Falcon Heavy → two side boosters shown');
  let variant = null;
  if (rocket === 'starship') {
    variant = starshipVariant(l);
    reasons.push(variant.v === 3
      ? `rocket.configuration variant “${l.rocket.variant || '?'}” → ${variant.known ? '' : 'version not stated, assuming '}V3: 3 larger grid fins + integrated hot-stage section; rest drawn with Block 2 geometry`
      : 'Block 1/2 Starship → 4 grid fins, separate hot-staging ring');
    reasons.push('On both stages the LOX tank sits below the methane tank');
  }
  const sb = rocket === 'generic' ? sideBoostersFor(l) : null;
  if (sb && sb.note) reasons.push(sb.note);
  if (sb) reasons.push(`known configuration “${(l.rocket.full_name || l.rocket.name).trim()}” → ${sb.n} ${sb.kind} strap-on boosters (${sb.name})`);
  const ILL = { satellite: 'satellite', probe: 'spacecraft', constellation: 'satellite stack', rideshare: 'rideshare stack', classified: 'classified payload', capsule: 'capsule', starlink: 'Starlink stack' };
  const boosterNote = rocket === 'generic' ? boosterNoteFor(l) : null;
  if (boosterNote) reasons.push(boosterNote);
  return { rocket, payload, reasons, payloadName: payloadLabel(l, payload), variant, sideBoosters: sb, boosterNote, modelNote: (sb && sb.note) || null, illustrative: ILL[payload] || null };
}

function payloadLabel(l, kind) {
  const p = (l.rocket.payloads || [])[0];
  const sc = (l.rocket.spacecraft_stage || [])[0];
  if (sc && sc.name && /dragon|starliner|capsule/i.test(kind + (sc.config_type || ''))) return sc.name;
  if (p && p.name) return p.name;
  return (l.mission && l.mission.name) || 'Payload';
}

// ---------------------------------------------------------------- materials & geometry helpers
const M = {
  white: () => mat(0xf1f1ee, 0.5, 0.05),
  offwhite: () => mat(0xdcdcd6, 0.55, 0.05),
  black: () => mat(0x1c1c20, 0.55, 0.15),
  carbon: () => mat(0x232328, 0.38, 0.25),
  steel: () => { const m = mat(0xc9cdd3, 0.3, 0.85); m.map = stripeTex(); return m; },
  darkSteel: () => mat(0x5a5e66, 0.4, 0.8),
  engine: () => mat(0x72767e, 0.35, 0.85, THREE.DoubleSide),
  nozzle: () => mat(0x2c2c31, 0.45, 0.6, THREE.DoubleSide),
  orange: () => mat(0xd4793b, 0.8, 0.0),
  salmon: () => mat(0xd99a6c, 0.8, 0.0),
  gold: () => mat(0xd6a93a, 0.3, 0.9),
  solar: () => mat(0x1d2c5c, 0.25, 0.5),
  grey: () => mat(0x8d9098, 0.5, 0.3),
  tile: () => mat(0x121215, 0.8, 0.05, THREE.DoubleSide),
  fairing: () => mat(0xf3f3f0, 0.5, 0.05, THREE.DoubleSide),
  fairingBlack: () => mat(0x202024, 0.4, 0.2, THREE.DoubleSide),
};
function mat(color, roughness, metalness, side = THREE.FrontSide) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side });
}
let _stripe;
function stripeTex() {
  if (_stripe) return _stripe;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, 64); g.fillStyle = '#b9bcc2'; g.fillRect(0, 0, 4, 3);
  _stripe = new THREE.CanvasTexture(c); _stripe.wrapS = _stripe.wrapT = THREE.RepeatWrapping; _stripe.repeat.set(1, 30); _stripe.colorSpace = THREE.SRGBColorSpace;
  return _stripe;
}
// cylinder/frustum with base at y0
function cyl(rb, rt, h, material, y0 = 0, seg = 48, open = false, thetaStart = 0, thetaLength = Math.PI * 2) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, thetaStart, thetaLength); g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, material); m.position.y = y0; return m;
}
function box(w, h, d, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); return m; }
// ogive/fairing profile (base radius r0 -> R over boatH, cylinder cylH, rounded nose noseH)
function noseProfile(r0, R, boatH, cylH, noseH, tipFrac = 0.06) {
  const pts = [new THREE.Vector2(r0, 0)];
  if (boatH > 0) pts.push(new THREE.Vector2(R, boatH));
  if (cylH > 0) pts.push(new THREE.Vector2(R, boatH + cylH));
  const n = 20;
  for (let i = 1; i <= n; i++) { const u = i / n; let r = R * Math.pow(1 - u * u, 0.55); if (i < n) r = Math.max(r, R * tipFrac); else r = 0.0001; pts.push(new THREE.Vector2(r, boatH + cylH + u * noseH)); }
  return pts;
}
function lathe(points, material, y0 = 0, phiStart = 0, phiLength = Math.PI * 2, seg = 48) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(points, seg, phiStart, phiLength), material); m.position.y = y0; return m;
}
function bell(r, h, material, x, y, z) { // nozzle hanging down from y (top) to y-h
  const m = cyl(r, r * 0.38, h, material, 0, 24, true); m.position.set(x, y - h, z); return m;
}
// (a pair of boosters is placed side by side as seen from the default view direction (1, 0.22, 1.25), not front/back)
function ringPositions(n, rad, phase = 0) { const a = []; for (let i = 0; i < n; i++) { const t = phase + (i / n) * Math.PI * 2; a.push([Math.cos(t) * rad, Math.sin(t) * rad]); } return a; }

// ---------------------------------------------------------------- part bookkeeping
class Builder {
  constructor() { this.parts = []; }
  part(id, name, desc, { level = 0, side = [0, 0, 0], labelSide, label = true, short, labelFrac = 0.5 } = {}) {
    const g = new THREE.Group(); g.userData.partId = id;
    const p = { id, name, desc, group: g, level, side: new THREE.Vector3(...side), labelAt: null, labelSide, label, short: short || name, labelFrac };
    this.parts.push(p); return p;
  }
  add(p, ...meshes) { for (const m of meshes) { m.traverse((o) => { if (o.isMesh) o.userData.partId = p.id; }); p.group.add(m); } return meshes[0]; }
}

// ---------------------------------------------------------------- payloads (placed inside fairing volume)
// Region: y0..y0+maxH, radius maxR. Adds one or more parts. Returns nothing.
function buildPayload(B, kind, name, y0, maxR, maxH, level, extra = {}) {
  const nm = name || 'Payload';
  if (kind === 'none') {
    const p = B.part('payload', 'Payload adapter', 'Payload adapter. The API lists no payload for this flight, so none is drawn.', { level, ...extra });
    B.add(p, cyl(maxR * 0.7, maxR * 0.45, maxH * 0.08, M.grey(), y0)); return;
  }
  const p = B.part('payload', payloadTitle(kind, nm), payloadDesc(kind, nm), { level, short: payloadShort(kind), labelSide: -1, labelFrac: 0.35, ...extra });
  const adH = Math.min(0.6, maxH * 0.06);
  B.add(p, cyl(maxR * 0.62, maxR * 0.4, adH, M.grey(), y0)); // payload adapter
  const y = y0 + adH, H = maxH - adH;
  if (kind === 'starlink') {
    const n = Math.max(6, Math.min(24, Math.round(H / (maxR * 0.16))));
    const pitch = H / n, w = maxR * 1.45, d = maxR * 0.78;
    for (let i = 0; i < n; i++) {
      const sat = box(w, pitch * 0.8, d, i % 2 ? M.offwhite() : M.grey(), 0, y + pitch * (i + 0.5), 0);
      const panel = box(w * 0.98, pitch * 0.12, d * 0.98, M.solar(), 0, y + pitch * (i + 0.5) + pitch * 0.42, 0);
      B.add(p, sat, panel);
    }
    B.add(p, box(0.12 * maxR, H, 0.12 * maxR, M.darkSteel(), w / 2, y + H / 2, d / 2), box(0.12 * maxR, H, 0.12 * maxR, M.darkSteel(), -w / 2, y + H / 2, -d / 2));
  } else if (kind === 'constellation') {
    B.add(p, cyl(maxR * 0.18, maxR * 0.18, H, M.darkSteel(), y));
    const rows = Math.max(3, Math.round(H / (maxR * 0.5))), pitch = H / rows;
    for (let r = 0; r < rows; r++) for (const [x, z] of ringPositions(4, maxR * 0.55, Math.PI / 4)) {
      const s = box(maxR * 0.55, pitch * 0.85, maxR * 0.4, r % 2 ? M.gold() : M.offwhite(), x, y + pitch * (r + 0.5), z);
      s.lookAt(0, s.position.y, 0); B.add(p, s);
    }
  } else if (kind === 'rideshare') {
    const rings = 3, pitch = H / rings;
    for (let r = 0; r < rings; r++) {
      const yy = y + r * pitch;
      B.add(p, cyl(maxR * 0.5, maxR * 0.5, pitch * 0.55, M.darkSteel(), yy, 32));
      ringPositions(6, maxR * 0.62, r * 0.4).forEach(([x, z], i) => {
        const s = box(maxR * (0.22 + (i % 3) * 0.06), pitch * (0.3 + (i % 2) * 0.15), maxR * 0.22, [M.gold, M.offwhite, M.solar][i % 3](), x, yy + pitch * 0.3, z);
        s.lookAt(0, s.position.y, 0); B.add(p, s);
      });
      B.add(p, cyl(maxR * 0.45, maxR * 0.45, pitch * 0.12, M.grey(), yy + pitch * 0.55));
      B.add(p, box(maxR * 0.4, pitch * 0.3, maxR * 0.4, M.gold(), 0, yy + pitch * 0.82, 0));
    }
  } else if (kind === 'cygnus') {
    const r = maxR * 0.72;
    B.add(p, cyl(r, r, H * 0.25, M.gold(), y), cyl(r, r, H * 0.55, M.offwhite(), y + H * 0.25), cyl(r, r * 0.5, H * 0.12, M.grey(), y + H * 0.8));
    B.add(p, cyl(r * 0.5, r * 0.5, H * 0.3, M.solar(), y + H * 0.02).rotateZ(0), cyl(r * 0.25, r * 0.25, H * 0.3, M.solar(), y + H * 0.02));
  } else if (kind === 'classified') {
    B.add(p, lathe(noseProfile(maxR * 0.7, maxR * 0.7, 0, H * 0.6, H * 0.35, 0.3), M.grey(), y));
  } else if (kind === 'probe') {
    const r = maxR * 0.55;
    B.add(p, box(r * 1.4, H * 0.4, r * 1.4, M.gold(), 0, y + H * 0.2, 0));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(maxR * 0.8, 32, 12, 0, Math.PI * 2, 0, 0.6), M.white()); dish.material.side = THREE.DoubleSide;
    dish.rotation.x = Math.PI; dish.position.y = y + H * 0.4 + maxR * 0.8 * 1.0; B.add(p, dish);
    B.add(p, box(r * 0.25, H * 0.35, r * 1.3, M.solar(), r * 0.85, y + H * 0.22, 0), box(r * 0.25, H * 0.35, r * 1.3, M.solar(), -r * 0.85, y + H * 0.22, 0));
  } else { // generic satellite
    const r = maxR * 0.62, bh = Math.min(H * 0.6, maxR * 2.2);
    B.add(p, box(r * 1.3, bh, r * 1.3, M.gold(), 0, y + bh / 2, 0));
    B.add(p, box(r * 0.12, bh * 0.95, r * 1.2, M.solar(), r * 0.78, y + bh / 2, 0), box(r * 0.12, bh * 0.95, r * 1.2, M.solar(), -r * 0.78, y + bh / 2, 0));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 24, 8, 0, Math.PI * 2, 0, 0.9), M.white()); dish.material.side = THREE.DoubleSide;
    dish.position.y = y + bh + r * 0.1; dish.rotation.x = Math.PI; dish.position.y += r * 0.6; B.add(p, dish);
  }
}
function payloadShort(kind) {
  return ({ starlink: 'Starlink satellites', constellation: 'Satellite stack', rideshare: 'Rideshare stack', cygnus: 'Cygnus', classified: 'Classified payload', probe: 'Spacecraft', satellite: 'Payload' })[kind] || 'Payload';
}
function payloadTitle(kind, nm) {
  return ({ starlink: 'Starlink satellites', constellation: `Satellite stack: ${nm}`, rideshare: `Rideshare stack: ${nm}`, cygnus: 'Cygnus spacecraft',
    classified: `Classified payload: ${nm}`, probe: `Spacecraft: ${nm}`, satellite: `Payload: ${nm}` })[kind] || `Payload: ${nm}`;
}
function payloadDesc(kind, nm) {
  return ({
    starlink: `Starlink broadband satellites (${nm}). They are flat-packed and stacked for launch, then released together in orbit. The number drawn is illustrative, not the real count.`,
    constellation: `${nm}: a batch of broadband constellation satellites stacked around a dispenser. Arrangement and count are illustrative.`,
    rideshare: `${nm}: many small satellites from different customers mounted on stacked dispenser rings. Layout is illustrative.`,
    cygnus: `Cygnus: Northrop Grumman's uncrewed cargo spacecraft for the space station. It carries a pressurised cargo module plus a service module with round, fan-like solar arrays.`,
    classified: `${nm}: the payload is classified, so its real shape isn't public. A plain placeholder is shown.`,
    probe: `${nm}: a generic spacecraft placeholder. The real spacecraft's shape is not modelled.`,
    satellite: `${nm}: a generic satellite placeholder (box bus, folded solar arrays, antenna). The real spacecraft's shape is not modelled.`,
  })[kind] || nm;
}

// Fairing halves + payload inside. Returns top y.
function fairingAndPayload(B, o) {
  const { y0, r0, R, boatH, cylH, noseH, level, kind, name, material = M.fairing, desc } = o;
  const pts = noseProfile(r0, R, boatH, cylH, noseH);
  const dx = R * 2.5, lift = (boatH + cylH + noseH) * 0.55;
  const fdesc = desc || `Payload fairing (${(R * 2).toFixed(1)} m wide). A two-piece shell that protects the payload from air pressure and heating during ascent, then splits apart once the rocket is above most of the atmosphere.`;
  const a = B.part('fairingA', 'Fairing half', fdesc, { level, side: [dx, lift, 0], labelSide: 1, short: 'Fairing halves' });
  B.add(a, lathe(pts, material(), y0, 0, Math.PI));
  const b = B.part('fairingB', 'Fairing half', fdesc, { level, side: [-dx, lift, 0], labelSide: -1, label: false });
  B.add(b, lathe(pts, material(), y0, Math.PI, Math.PI));
  a.labelAt = new THREE.Vector3(R, y0 + boatH + cylH * 0.6, 0); b.labelAt = new THREE.Vector3(-R, y0 + boatH + cylH * 0.6, 0);
  if (!o.skipPayload) buildPayload(B, kind, name, y0 + boatH * 0.6, R * 0.85, cylH + noseH * 0.3, level);
  return y0 + boatH + cylH + noseH;
}

// Dragon capsule + trunk. Returns top y.
function dragon(B, y0, level, crew, name) {
  const R = 1.85;
  const trunk = B.part('trunk', 'Dragon trunk', 'Trunk: unpressurised section under the capsule with body-mounted solar cells and radiators. It can carry unpressurised cargo and is jettisoned before re-entry.', { level });
  B.add(trunk, cyl(R, R, 3.7, M.white(), y0), cyl(R + 0.03, R + 0.03, 3.1, M.solar(), y0 + 0.3, 48, true, -Math.PI / 2, Math.PI));
  if (crew) for (const [x, z] of ringPositions(4, R, Math.PI / 4)) { const f = box(0.08, 1.4, 0.9, M.white(), x * 1.15, y0 + 0.8, z * 1.15); f.lookAt(0, f.position.y, 0); B.add(trunk, f); }
  const cap = B.part('capsule', crew ? 'Crew Dragon capsule' : 'Cargo Dragon capsule',
    crew ? `${name ? name + ': ' : ''}Crew Dragon, the pressurised capsule that carries the astronauts. SuperDraco engines in its sides can pull it away from the rocket in an emergency, and it returns to a splashdown under parachutes.`
         : `${name ? name + ': ' : ''}Cargo Dragon, the uncrewed version that delivers supplies and experiments to the space station and brings science back to Earth by splashdown.`, { level: level + 1 });
  const c0 = y0 + 3.7;
  B.add(cap, cyl(1.95, 1.95, 0.25, M.black(), c0), cyl(1.95, 1.05, 2.7, M.white(), c0 + 0.25), cyl(1.05, 0.35, 0.95, M.white(), c0 + 2.95));
  if (crew) for (const [x, z] of ringPositions(4, 1.62, Math.PI / 4)) { const s = box(0.5, 0.9, 0.2, M.black(), x, c0 + 1.0, z); s.lookAt(0, s.position.y, 0); B.add(cap, s); }
  for (const [x, z] of ringPositions(crew ? 4 : 0, 1.3, 0)) { const w = box(0.28, 0.28, 0.05, M.black(), x, c0 + 1.9, z); w.lookAt(0, w.position.y, 0); B.add(cap, w); }
  return c0 + 3.9;
}

// ---------------------------------------------------------------- rockets
function falconCore(B, id, name, desc, xOff, level, side, nose) {
  const R = 1.83;
  const p = B.part(id, name, desc, { level, side, labelSide: side[0] < 0 ? -1 : 1 });
  B.add(p, cyl(R, R, 39.3, M.white(), 1.2));
  B.add(p, cyl(R + 0.02, R + 0.02, 1.2, M.black(), 0.4)); // octaweb skirt
  for (const [x, z] of [[0, 0], ...ringPositions(8, 1.25)]) B.add(p, bell(0.42, 1.1, M.engine(), x, 1.2, z));
  for (const [x, z] of ringPositions(4, R + 0.12, Math.PI / 4)) { const leg = box(0.35, 9.5, 0.25, M.black(), x, 5.6, z); leg.lookAt(0, leg.position.y, 0); B.add(p, leg); }
  if (nose) { // FH side booster nose cone + grid fins
    B.add(p, lathe(noseProfile(R, R, 0, 1.2, 4.6, 0.1), M.white(), 40.5));
    for (const [x, z] of ringPositions(4, R + 0.6, 0)) { const f = box(1.2, 1.2, 0.18, M.grey(), x, 41.2, z); f.lookAt(0, f.position.y, 0); f.rotateY(Math.PI / 2); B.add(p, f); }
  }
  p.group.position.x = xOff;
  p.labelAt = new THREE.Vector3((side[0] < 0 ? -1 : 1) * R, nose ? 30 : 22, 0);
  if (id === 'core') { p.labelSide = 0; p.labelAt = new THREE.Vector3(0, -1.5, 0); }
  return p;
}
function falconUpper(B, top, plan, levelBase) {
  const R = 1.83;
  const inter = B.part('interstage', 'Interstage', 'Interstage: black carbon-composite section that joins the stages and hides the second-stage engine nozzle. On Falcon it stays with the booster and carries the four titanium grid fins used to steer during landing.', { level: levelBase });
  B.add(inter, cyl(R, R, 5.5, M.black(), top));
  for (const [x, z] of ringPositions(4, R + 0.6, 0)) { const f = box(1.3, 1.3, 0.18, M.grey(), x, top + 4.6, z); f.lookAt(0, f.position.y, 0); f.rotateY(Math.PI / 2); B.add(inter, f); }
  const s2 = B.part('stage2', 'Second stage', 'Second stage: one Merlin Vacuum engine with a large nozzle optimised for space. It carries the payload the rest of the way to orbit and is not recovered.', { level: levelBase + 1 });
  const s2y = top + 5.5;
  B.add(s2, cyl(R, R, 12.5, M.white(), s2y), bell(1.25, 3.6, M.nozzle(), 0, s2y, 0), cyl(0.5, 0.5, 0.6, M.engine(), s2y - 0.6));
  const py = s2y + 12.5;
  if (plan.payload === 'dragonCrew' || plan.payload === 'dragonCargo') return dragon(B, py, levelBase + 2, plan.payload === 'dragonCrew', plan.payloadName);
  return fairingAndPayload(B, { y0: py, r0: 1.86, R: 2.6, boatH: 0.6, cylH: 6.1, noseH: 6.4, level: levelBase + 2, kind: plan.payload, name: plan.payloadName,
    desc: 'Payload fairing half. The 5.2 m-wide composite fairing protects the payload through the atmosphere, then splits in two a few minutes after launch. SpaceX recovers and reuses the halves.' });
}
function buildFalcon9(B, plan) {
  falconCore(B, 'booster', 'First stage (booster)', 'First stage: nine Merlin 1D engines burning RP-1 kerosene and liquid oxygen. After separation it can flip around and land on a drone ship or a landing zone, using grid fins to steer and four legs to land.', 0, 0, [0, 0, 0], false);
  const top = falconUpper(B, 40.5, plan, 1);
  return { height: top, name: 'Falcon 9' };
}
function buildFalconHeavy(B, plan) {
  falconCore(B, 'core', 'Center core', 'Center core: a strengthened Falcon 9-style first stage with nine Merlin engines. It throttles down early to save propellant and burns longer than the side boosters.', 0, 0, [0, -2, 0], false);
  const d = 3.9;
  falconCore(B, 'sideL', 'Side booster', 'Side booster: essentially a Falcon 9 first stage with a nose cone. The two side boosters separate first and usually fly back to land at the launch site.', -d, 0, [-9, -2, 0], true);
  falconCore(B, 'sideR', 'Side booster', 'Side booster: essentially a Falcon 9 first stage with a nose cone. The two side boosters separate first and usually fly back to land at the launch site.', d, 0, [9, -2, 0], true);
  const top = falconUpper(B, 40.5, plan, 1);
  return { height: top, name: 'Falcon Heavy' };
}
function buildElectron(B, plan) {
  const R = 0.6;
  const s1 = B.part('booster', 'First stage', 'First stage: carbon-composite body with nine Rutherford engines, whose propellant pumps are driven by battery-powered electric motors. Rocket Lab has recovered some first stages after splashdown.', { level: 0 });
  B.add(s1, cyl(R, R, 11.9, M.carbon(), 0.3));
  for (const [x, z] of [[0, 0], ...ringPositions(8, 0.4)]) B.add(s1, bell(0.11, 0.35, M.engine(), x, 0.35, z));
  const it = B.part('interstage', 'Interstage', 'Interstage: joins the first and second stages. It is left behind with the first stage at separation.', { level: 1 });
  B.add(it, cyl(R, R, 1.0, M.black(), 12.2));
  const s2 = B.part('stage2', 'Second stage', 'Second stage: a single vacuum-optimised Rutherford engine that carries the kick stage and payload to orbit.', { level: 2 });
  B.add(s2, cyl(R, R, 2.4, M.carbon(), 13.2), bell(0.3, 0.8, M.nozzle(), 0, 13.2, 0));
  const k = B.part('kick', 'Kick stage (Photon/Curie)', 'Kick stage: a small third stage with a Curie engine. It circularises the orbit and can drop satellites into different orbits before de-orbiting itself.', { level: 3 });
  B.add(k, cyl(0.52, 0.52, 0.35, M.gold(), 15.65), bell(0.1, 0.18, M.engine(), 0, 15.65, 0));
  const top = fairingAndPayload(B, { y0: 15.6, r0: R, R: 0.6, boatH: 0.0, cylH: 1.1, noseH: 1.3, level: 4, kind: plan.payload, name: plan.payloadName, material: M.fairingBlack, skipPayload: true,
    desc: 'Carbon-composite payload fairing (1.2 m wide). It splits in two once the rocket is above most of the atmosphere.' });
  buildPayload(B, plan.payload, plan.payloadName, 16.05, 0.48, 1.35, 4);
  return { height: top, name: 'Electron' };
}
function parseAtlas(full) {
  const m = /atlas v\s*(n|\d)(\d)(\d)/i.exec(full || '');
  if (!m) return { fairing: 5, srb: 5, n22: false, guessed: true };
  return { fairing: m[1].toLowerCase() === 'n' ? 0 : Number(m[1]), srb: Number(m[2]), n22: m[1].toLowerCase() === 'n', guessed: false };
}
function srbs(B, n, coreR, r, len, y0, material, id, name, desc) {
  const pos = ringPositions(n, coreR + r + 0.05, Math.PI / 2 + 0.3);
  pos.forEach(([x, z], i) => {
    const p = B.part(`${id}${i}`, n > 1 ? `${name} ×${n}` : name, desc, { level: 0, side: [x * 1.6, -1, z * 1.6], label: i === 0, labelSide: x < 0 ? -1 : 1 });
    B.add(p, cyl(r, r, len, material(), y0), lathe(noseProfile(r, r, 0, 0, r * 3.2, 0.1), material(), y0 + len), bell(r * 0.7, 1.2, M.nozzle(), 0, y0, 0));
    p.group.position.set(x, 0, z); p.labelAt = new THREE.Vector3((x < 0 ? -1 : 1) * r, y0 + len * 0.5, 0);
  });
}
function buildAtlasV(B, plan, l) {
  const cfg = parseAtlas(l.rocket.full_name || l.rocket.name);
  if (plan.payload === 'starliner') cfg.n22 = true;
  const R = 1.905;
  const ccb = B.part('booster', 'Common Core Booster', 'Common Core Booster: the first stage, powered by one RD-180 engine (two nozzles) burning kerosene and liquid oxygen.', { level: 0 });
  B.add(ccb, cyl(R, R, 31.5, M.salmon(), 1.0), cyl(R, R, 1.0, M.white(), 1.0));
  for (const x of [-0.6, 0.6]) B.add(ccb, bell(0.55, 1.6, M.engine(), x, 1.3, 0));
  if (cfg.srb) srbs(B, cfg.srb, R, 0.8, 17, 1.2, M.white, 'srb', 'Solid rocket booster (GEM 63)', 'Strap-on solid rocket booster. Current Atlas V flights use Northrop Grumman GEM 63 boosters (earlier flights used Aerojet AJ-60A). Atlas V can fly with zero to five of them; the middle digit of the variant number (e.g. 551) gives the count. They burn for roughly the first 90 seconds and are then dropped.');
  const Rc = 1.525;
  if (cfg.fairing === 5) {
    const c = B.part('centaur', 'Centaur upper stage', 'Centaur upper stage: burns liquid hydrogen and liquid oxygen with an RL10 engine and can restart several times. On the 500-series it sits inside the 5.4 m fairing.', { level: 1 });
    B.add(c, cyl(Rc, Rc, 12.7, M.grey(), 33.4), bell(0.6, 1.6, M.nozzle(), 0, 33.4, 0), cyl(R, Rc, 1.0, M.white(), 32.5));
    const top = fairingAndPayload(B, { y0: 32.5, r0: R, R: 2.7, boatH: 1.2, cylH: 14.5, noseH: 7.0, level: 2, kind: plan.payload, name: plan.payloadName, skipPayload: true,
      desc: '5.4 m payload fairing half. On the Atlas V 500-series the fairing encloses both the Centaur upper stage and the payload.' });
    buildPayload(B, plan.payload, plan.payloadName, 46.4, 2.2, 7.5, 2);
    return { height: top, name: l.rocket.full_name || 'Atlas V', notes: cfg.guessed ? ['Atlas V variant not given in the data; drawn as a 551 (5 m fairing, 5 boosters) as an assumption.'] : [] };
  }
  const isa = B.part('interstage', 'Interstage adapter', 'Centaur interstage adapter: connects the Common Core Booster to the narrower Centaur stage.', { level: 1 });
  B.add(isa, cyl(R, R, 3.0, M.white(), 32.5));
  const c = B.part('centaur', 'Centaur upper stage', `Centaur upper stage: burns liquid hydrogen and liquid oxygen with ${cfg.n22 ? 'two RL10 engines' : 'an RL10 engine'} and can restart several times.`, { level: 2 });
  B.add(c, cyl(Rc, Rc, 12.7, M.grey(), 35.5), bell(0.55, 1.5, M.nozzle(), 0, 35.5, 0));
  if (cfg.n22) {
    const lva = B.part('lva', 'Launch vehicle adapter', 'Launch vehicle adapter with an aeroskirt that smooths airflow between the Centaur and the Starliner spacecraft.', { level: 3 });
    B.add(lva, cyl(Rc, 2.3, 1.6, M.white(), 48.2));
    const sm = B.part('sm', 'Starliner service module', 'Starliner service module: holds the abort engines, thrusters, power and radiators. It is discarded before re-entry.', { level: 4 });
    B.add(sm, cyl(2.28, 2.28, 1.9, M.white(), 49.8), cyl(2.3, 2.3, 0.3, M.black(), 49.8));
    const cm = B.part('capsule', `Starliner crew module${plan.payloadName ? ': ' + plan.payloadName : ''}`, 'Starliner crew module: reusable capsule that lands on land under parachutes and airbags.', { level: 5, short: 'Starliner crew module' });
    B.add(cm, cyl(2.28, 1.3, 2.4, M.offwhite(), 51.7), cyl(1.3, 0.9, 0.4, M.grey(), 54.1));
    return { height: 54.5, name: 'Atlas V N22' };
  }
  const top = fairingAndPayload(B, { y0: 48.2, r0: Rc, R: 2.1, boatH: 1.0, cylH: 6.0, noseH: 4.5, level: 3, kind: plan.payload, name: plan.payloadName,
    desc: '4 m payload fairing half. On the Atlas V 400-series the Centaur is exposed and the fairing encloses only the payload.' });
  return { height: top, name: l.rocket.full_name || 'Atlas V' };
}
function buildVulcan(B, plan, l) {
  const m = /V?C(\d)([SL])/i.exec(`${l.rocket.full_name} ${l.rocket.name}`);
  const nSrb = m ? Number(m[1]) : 2, long = m ? m[2].toUpperCase() === 'L' : false;
  const R = 2.7;
  const bst = B.part('booster', 'Vulcan booster', 'Vulcan first stage: 5.4 m wide, powered by two Blue Origin BE-4 engines burning liquefied natural gas (methane) and liquid oxygen.', { level: 0 });
  B.add(bst, cyl(R, R, 32.3, M.orange(), 1.0), cyl(R + 0.02, R + 0.02, 1.0, M.white(), 1.0));
  for (const x of [-1.1, 1.1]) B.add(bst, bell(0.8, 2.0, M.engine(), x, 1.5, 0));
  if (nSrb) srbs(B, nSrb, R, 0.81, 20.5, 1.5, M.offwhite, 'srb', 'GEM 63XL solid booster', 'Northrop Grumman GEM 63XL strap-on solid rocket booster. The digit in the Vulcan variant name (VC2S, VC4L, VC6L…) gives how many are attached.');
  const it = B.part('interstage', 'Interstage', 'Interstage: connects the booster to the Centaur V upper stage and covers its engines.', { level: 1 });
  B.add(it, cyl(R, R, 2.5, M.white(), 33.3));
  const c = B.part('centaur', 'Centaur V upper stage', 'Centaur V: a 5.4 m-wide upper stage with two RL10 engines burning liquid hydrogen and liquid oxygen. It can make long, multi-burn missions.', { level: 2 });
  B.add(c, cyl(R, R, 11.6, M.offwhite(), 35.8), ...[-0.9, 0.9].map((x) => bell(0.55, 1.8, M.nozzle(), x, 35.8, 0)));
  const fl = long ? 21.3 : 15.5;
  const top = fairingAndPayload(B, { y0: 47.4, r0: R, R: 2.7, boatH: 0, cylH: fl - 6.5, noseH: 6.5, level: 3, kind: plan.payload, name: plan.payloadName,
    desc: `5.4 m payload fairing half, ${long ? 'long (~21 m)' : 'standard (~15.5 m)'} version, as given by the “${long ? 'L' : 'S'}” in the variant name.` });
  return { height: top, name: m ? `Vulcan VC${nSrb}${long ? 'L' : 'S'}` : 'Vulcan Centaur', notes: m ? [] : ['Vulcan variant (booster count / fairing length) not given in the data; drawn as VC2S as an assumption.'] };
}
function buildGeneric(B, plan, l) {
  const L = Number(l.rocket.length) > 3 ? Number(l.rocket.length) : 50;
  const R = (Number(l.rocket.diameter) > 0.3 ? Number(l.rocket.diameter) : 3.5) / 2;
  const s1h = L * 0.58, ith = L * 0.04, s2h = L * 0.17;
  const s1 = B.part('booster', plan.sideBoosters ? 'Core stage' : 'First stage', `${plan.sideBoosters ? 'Core stage' : 'First stage'} (generic). This rocket has no custom model; its overall length and diameter come from the API record${plan.sideBoosters ? ', and the strap-on booster count from its known configuration' : ''}.`, { level: 0 });
  B.add(s1, cyl(R, R, s1h - R * 0.3, M.white(), R * 0.3), cyl(R * 0.9, R * 0.9, R * 0.3, M.darkSteel(), 0));
  for (const [x, z] of [[0, 0], ...ringPositions(4, R * 0.55)]) B.add(s1, bell(R * 0.25, R * 0.5, M.engine(), x, R * 0.3, z));
  const sb = plan.sideBoosters;
  if (sb) {
    const r = R * sb.rF, len = L * sb.lenF, ringR = R + r * (sb.cone ? 0.75 : 1) + 0.05;
    ringPositions(sb.n, ringR, sb.n === 2 ? Math.atan2(1.25, 1) + Math.PI / 2 : Math.PI / 2 + Math.PI / sb.n).forEach(([x, z], i) => {
      const p = B.part(`sb${i}`, `${sb.name} ×${sb.n}`, sb.desc, { level: 0, side: [x * 1.9, -1, z * 1.9], label: i === 0, labelSide: x < 0 ? -1 : 1, short: `${sb.n} × ${sb.kind === 'solid' ? 'solid' : 'liquid'} boosters` });
      const mat = sb.kind === 'solid' ? M.offwhite : M.white;
      if (sb.cone) { B.add(p, cyl(r, r * 0.45, len * 0.82, mat(), 0.3), lathe(noseProfile(r * 0.45, r * 0.45, 0, 0, len * 0.18, 0.1), mat(), 0.3 + len * 0.82)); }
      else B.add(p, cyl(r, r, len, mat(), 0.3), lathe(noseProfile(r, r, 0, 0, r * 3.2, 0.1), mat(), 0.3 + len));
      B.add(p, bell(r * 0.7, Math.max(0.6, r * 0.9), M.nozzle(), 0, 0.3, 0));
      p.group.position.set(x, 0, z); p.labelAt = new THREE.Vector3((x < 0 ? -1 : 1) * r, len * 0.5, 0);
    });
  }
  const it = B.part('interstage', 'Interstage', 'Interstage (generic): joins the first and upper stages.', { level: 1 });
  B.add(it, cyl(R, R, ith, M.black(), s1h));
  const s2 = B.part('stage2', 'Upper stage', 'Upper stage (generic): carries the payload the rest of the way to orbit.', { level: 2 });
  const s2y = s1h + ith;
  B.add(s2, cyl(R, R, s2h, M.offwhite(), s2y), bell(R * 0.4, R * 0.8, M.nozzle(), 0, s2y, 0));
  const py = s2y + s2h;
  if (plan.payload === 'capsule') {
    const cp = B.part('capsule', `Capsule: ${plan.payloadName}`, `${plan.payloadName}: the spacecraft listed in the API (drawn as a generic capsule; its real shape is not modelled).`, { level: 3 });
    B.add(cp, cyl(R, R, R * 1.0, M.white(), py), cyl(R, R * 0.45, R * 1.3, M.grey(), py + R));
    return { height: py + R * 2.3, name: `${l.rocket.full_name || l.rocket.name} (generic)` };
  }
  const fr = R * 1.15;
  const top = fairingAndPayload(B, { y0: py, r0: R, R: fr, boatH: fr * 0.2, cylH: Math.max(L - py - fr * 2.4, fr * 1.5), noseH: fr * 2.2, level: 3, kind: plan.payload, name: plan.payloadName });
  return { height: top, name: `${l.rocket.full_name || l.rocket.name} (generic)` };
}
const BUILDERS = { falcon9: buildFalcon9, falconHeavy: buildFalconHeavy, starship: (B, plan) => buildStarshipDetailed(B, plan, buildPayload, plan.variant ? plan.variant.v : 3, plan.variant ? plan.variant.known : false), electron: buildElectron, atlasV: buildAtlasV, vulcan: buildVulcan, generic: buildGeneric };
export const CUSTOM_MODELS = ['Falcon 9', 'Falcon Heavy', 'Starship / Super Heavy (V3 or Block 2, shared geometry with the deep dive)', 'Electron', 'Atlas V (4xx/5xx/N22)', 'Vulcan Centaur (VC0–6, S/L)'];

// ---------------------------------------------------------------- viewer
export function createViewer(container, launch, opts = {}) {
  const { onSelect } = opts;
  const plan = planFor(launch);
  const B = new Builder();
  const info = (BUILDERS[plan.rocket] || buildGeneric)(B, plan, launch);
  const H = info.height;
  const gap = H * (info.gapScale ?? (plan.rocket === 'electron' ? 0.1 : 0.065));

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); // preserveDrawingBuffer: keeps the last frame visible while the loop is idle
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a1a28, 0.35));
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.6); sun.position.set(H * 2, H * 1.1, H * 0.35); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.9); rim.position.set(-H * 1.5, H * 0.4, -H * 0.2); scene.add(rim);

  // starfield
  const sg = new THREE.BufferGeometry(); const sp = [];
  for (let i = 0; i < 900; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(H * (8 + Math.random() * 4)); sp.push(v.x, v.y, v.z); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8 })));

  const model = new THREE.Group(); scene.add(model);
  for (const p of B.parts) {
    if (info.rotateY) p.group.rotation.y = info.rotateY;
    p.base = p.group.position.clone();
    p.explode = p.side.clone().add(new THREE.Vector3(0, p.level * gap, 0));
    model.add(p.group);
    p.group.updateMatrixWorld(true);
    // bounding info for labels (world AABB -> group-local anchor)
    const bb = new THREE.Box3().setFromObject(p.group);
    if (!p.labelAt) {
      const s = p.labelSide ?? (p.level % 2 === 0 ? 1 : -1); p.labelSide = s;
      const w = new THREE.Vector3(s > 0 ? bb.max.x : bb.min.x, bb.min.y + (bb.max.y - bb.min.y) * p.labelFrac, (bb.min.z + bb.max.z) / 2);
      p.labelAt = p.group.worldToLocal(w);
    }
    p.mats = new Set(); p.meshes = [];
    p.group.traverse((o) => { if (o.isMesh) { p.meshes.push(o); for (const m of [].concat(o.material)) if (m.emissive) { p.mats.add(m); m.userData.baseEmissive = m.emissive.getHex(); } } });
    if (p.label) {
      const el = document.createElement('div');
      const ls = p.labelSide ?? 1;
      el.className = 'part-label ' + (ls > 0 ? 'right' : ls < 0 ? 'left' : 'below');
      const sp = document.createElement('span'); sp.textContent = p.short; el.appendChild(sp); el.title = p.name;
      el.addEventListener('pointerup', (e) => { e.stopPropagation(); select(p.id); });
      el.addEventListener('click', (e) => e.stopPropagation());
      const obj = new CSS2DObject(el); obj.position.copy(p.labelAt);
      if (ls > 0) obj.center.set(0, 0.5); else if (ls < 0) obj.center.set(1, 0.5); else obj.center.set(0.5, 0);
      p.group.add(obj); p.labelObj = obj; p.labelEl = el;
    }
  }

  const camera = new THREE.PerspectiveCamera(38, 1, H / 500, H * 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.8;
  controls.minDistance = H * 0.05; controls.maxDistance = H * 6;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.enableZoom = false; // desktop: only Ctrl/⌘ + wheel zooms, so the page scrolls normally over the model

  let t = 0, tTarget = 0, labelsOn = true, selected = null, autoFit = true, fitAnim = null, interactive = false;
  const viewDir = new THREE.Vector3(1, 0.22, 1.25).normalize();

  // ---- scroll-friendly interaction
  // Touch, not interactive: one finger scrolls the page (touch-action: pan-y); two fingers rotate/zoom; taps select parts.
  // Touch, interactive ("Rotate / zoom" pressed): one finger rotates, pinch zooms, page doesn't scroll.
  const cvs = renderer.domElement;
  function setInteractive(on) {
    interactive = on;
    controls.touches = on ? { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    cvs.style.touchAction = on ? 'none' : 'pan-y';
    container.classList.toggle('active', on);
  }
  // Two-finger gestures while not interactive: temporarily stop the page from panning so the model can rotate.
  let touchCount = 0;
  cvs.addEventListener('touchstart', (e) => { touchCount = e.touches.length; if (!interactive && touchCount >= 2) cvs.style.touchAction = 'none'; }, { passive: true });
  cvs.addEventListener('touchend', (e) => { touchCount = e.touches.length; if (!interactive && touchCount === 0) cvs.style.touchAction = 'pan-y'; }, { passive: true });
  const onWheel = (e) => { controls.enableZoom = !!(e.ctrlKey || e.metaKey); if (controls.enableZoom) { autoFit = false; fitAnim = null; requestRender(); } };
  container.addEventListener('wheel', onWheel, { capture: true, passive: true });

  function applyExplode() {
    for (const p of B.parts) {
      p.group.position.copy(p.base).addScaledVector(p.explode, t);
      if (p.labelEl) p.labelEl.style.opacity = labelsOn ? String(Math.min(1, Math.max(0, (t - 0.15) * 2.5))) : '0';
      if (p.labelEl) p.labelEl.style.pointerEvents = labelsOn && t > 0.3 ? 'auto' : 'none';
    }
  }
  function fitTarget() {
    const bb = new THREE.Box3().setFromObject(model); const size = bb.getSize(new THREE.Vector3()); const c = bb.getCenter(new THREE.Vector3());
    const aspect = camera.aspect, vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const wExt = Math.max(size.x, size.z) * (labelsOn && t > 0.2 ? 1.9 : 1.15);
    const dist = Math.max((size.y * 1.12) / 2 / Math.tan(vf / 2), (wExt / 2) / Math.tan(hf / 2)) + Math.max(size.x, size.z) / 2;
    c.y += size.y * 0.02;
    return { c, dist };
  }
  function fit(animate = true) {
    const { c, dist } = fitTarget();
    const toPos = c.clone().addScaledVector(viewDir, dist);
    if (!animate) { controls.target.copy(c); camera.position.copy(toPos); controls.update(); requestRender(); return; }
    fitAnim = { fromT: controls.target.clone(), toT: c, fromP: camera.position.clone(), toP: toPos, k: 0 }; requestRender();
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight || 400;
    renderer.setSize(w, h); labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => { resize(); if (autoFit) fit(false); requestRender(); }); ro.observe(container);

  // selection by tap (distinguish from drags / scrolls)
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(); let down = null;
  cvs.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; if (interactive || e.pointerType === 'mouse') { autoFit = false; fitAnim = null; } requestRender(); });
  cvs.addEventListener('pointercancel', () => { down = null; });
  cvs.addEventListener('pointerup', (e) => {
    if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const dt = performance.now() - down.t; down = null;
    if (moved > 8 || dt > 500) return;
    const r = cvs.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(model.children, true).find((h) => h.object.isMesh && h.object.userData.partId);
    select(hit ? hit.object.userData.partId : null);
  });
  function select(id) {
    selected = id;
    for (const p of B.parts) for (const m of p.mats) m.emissive.setHex(p.id === id ? 0x3a6df0 : m.userData.baseEmissive);
    for (const p of B.parts) if (p.labelEl) p.labelEl.classList.toggle('sel', p.id === id);
    const p = B.parts.find((x) => x.id === id);
    onSelect && onSelect(p ? { id: p.id, name: p.name, desc: p.desc } : null);
    requestRender();
  }

  // ---- render on demand: the loop only runs while something changes; it stops when idle or the tab is hidden
  let raf = 0, last = performance.now(), running = true, frames = 0, ctxLost = false;
  function frame(now) {
    raf = 0; if (!running) return;
    frames++;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let busy = false;
    if (Math.abs(tTarget - t) > 0.0005) {
      busy = true;
      t += (tTarget - t) * Math.min(1, dt * 6); if (Math.abs(tTarget - t) < 0.001) t = tTarget;
      applyExplode(); if (autoFit) { const { c, dist } = fitTarget(); controls.target.lerp(c, 0.2); const want = c.clone().addScaledVector(camera.position.clone().sub(controls.target).normalize(), dist); camera.position.lerp(want, 0.2); }
    }
    if (fitAnim) { busy = true; fitAnim.k = Math.min(1, fitAnim.k + dt * 3); const e = 1 - Math.pow(1 - fitAnim.k, 3); controls.target.lerpVectors(fitAnim.fromT, fitAnim.toT, e); camera.position.lerpVectors(fitAnim.fromP, fitAnim.toP, e); if (fitAnim.k >= 1) fitAnim = null; }
    if (controls.update()) busy = true;
    if (!ctxLost) { renderer.render(scene, camera); labelRenderer.render(scene, camera); declutter(); }
    if (busy) requestRender();
  }
  // Push overlapping labels apart vertically (small screens / exploded view). Runs only on rendered frames.
  function declutter() {
    const els = B.parts.map((p) => p.labelEl).filter((el) => el && el.style.display !== 'none' && el.style.opacity !== '0');
    for (const el of els) { el.style.marginTop = '0px'; el.style.translate = ''; }
    const wr = container.getBoundingClientRect();
    // overlays in the viewer corner (disclaimer, rotate/zoom button) act as fixed obstacles
    const fixed = [...(container.parentElement || container).querySelectorAll('.disclaimer, .interact')].map((el) => ({ el, r: el.getBoundingClientRect(), dy: 0, fixed: true })).filter((b) => b.r.width);
    const boxes = [...fixed, ...els.map((el) => ({ el, r: el.getBoundingClientRect(), dy: 0 })).filter((b) => b.r.width)].sort((a, b) => a.r.top - b.r.top);
    for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
      if (boxes[i].fixed) break;
      const a = boxes[j], b = boxes[i], aTop = a.r.top + a.dy, bTop = b.r.top + b.dy;
      const hOverlap = a.r.left < b.r.right - 2 && b.r.left < a.r.right - 2, vOverlap = bTop < aTop + a.r.height + 2 && aTop < bTop + b.r.height;
      if (hOverlap && vOverlap) b.dy += aTop + a.r.height + 3 - bTop;
    }
    for (const b of boxes) {
      if (b.fixed) continue;
      if (b.dy) b.el.style.marginTop = `${Math.round(b.dy)}px`;
      // keep labels inside the viewer horizontally (narrow phones)
      const dx = b.r.left < wr.left + 3 ? wr.left + 3 - b.r.left : b.r.right > wr.right - 3 ? wr.right - 3 - b.r.right : 0;
      if (dx) b.el.style.translate = `${Math.round(dx)}px 0`;
    }
  }
  function requestRender() { if (!raf && running && !document.hidden && !ctxLost) { last = Math.min(last, performance.now()); raf = requestAnimationFrame(frame); } }
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', requestRender);
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else { last = performance.now(); requestRender(); } };
  document.addEventListener('visibilitychange', onVis);
  cvs.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctxLost = true; cancelAnimationFrame(raf); raf = 0; });
  cvs.addEventListener('webglcontextrestored', () => { ctxLost = false; scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; requestRender(); });

  resize(); applyExplode(); fit(false); setInteractive(!!opts.interactive);
  last = performance.now(); requestRender();

  return {
    plan, info, parts: B.parts.map((p) => ({ id: p.id, name: p.name, desc: p.desc })),
    setExplode(v, immediate = false) { tTarget = Math.max(0, Math.min(1, v)); autoFit = true; if (immediate) { t = tTarget; applyExplode(); fit(false); } requestRender(); },
    getExplode: () => tTarget,
    setLabels(on) { labelsOn = on; applyExplode(); requestRender(); },
    resetView() { autoFit = true; fit(true); },
    setInteractive, isInteractive: () => interactive,
    isIdle: () => raf === 0, frames: () => frames,
    select,
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); document.removeEventListener('visibilitychange', onVis); renderer.dispose(); pmrem.dispose(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) m.dispose && m.dispose(); }); container.innerHTML = ''; },
  };
}
