// Shared interactive deep-dive viewer (Falcon 9, Apollo / Saturn V, …).
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const skinCycle = ['Solid', 'Cutaway', 'X-ray'];

export function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.55, ...extra });
}

export function startDive(spec) {
  const canvas = $('#c');
  if (!canvas) throw new Error('Missing #c canvas');
  const mobile = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || innerWidth < 700;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: false,
      powerPreference: mobile ? 'low-power' : 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (e) {
    window.__showNoGL && window.__showNoGL(e.message || String(e));
    throw e;
  }
  if (!renderer.getContext()) {
    const err = new Error('No WebGL'); err.name = 'NoWebGL';
    window.__showNoGL && window.__showNoGL(err.message);
    throw err;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  const fogFar = spec.fogFar || 260;
  scene.fog = new THREE.Fog(0x05070d, fogFar * 0.45, fogFar);

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  } catch (e) {
    scene.environment = null;
  }

  scene.add(new THREE.HemisphereLight(0x9cb6ff, 0x1a1208, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e5, 1.4); key.position.set(18, 28, 16); scene.add(key);
  const fill = new THREE.DirectionalLight(0x6ea8ff, 0.32); fill.position.set(-20, 8, -12); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.25, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = spec.minDistance || 8;
  controls.maxDistance = spec.maxDistance || 200;
  controls.maxPolarAngle = Math.PI * 0.92;
  const lookY = spec.lookY || 28;
  controls.target.set(0, lookY, 0);
  const cam = spec.cam || [28, 36, 52];
  camera.position.set(cam[0], cam[1], cam[2]);

  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const root = new THREE.Group(); scene.add(root);
  const parts = [];
  const labelsEl = $('#labels');
  const flows = [];
  const plumes = [];

  const api = {
    THREE, mat, root, parts, flows, plumes, clip,
    cyl(rTop, rBot, h, seg = 24) { return new THREE.CylinderGeometry(rTop, rBot, h, seg); },
    sphere(r, w = 20, h = 14) { return new THREE.SphereGeometry(r, w, h); },
    cone(r, h, seg = 20) { return new THREE.ConeGeometry(r, h, seg); },
    mesh(geo, material, y = 0) { const m = new THREE.Mesh(geo, material); m.position.y = y; return m; },
    group() { return new THREE.Group(); },
    addPart(p) {
      const g = p.group || new THREE.Group();
      if (p.mesh && p.mesh !== g) g.add(p.mesh);
      if (p.y) g.position.y = p.y;
      if (p.x) g.position.x = p.x;
      root.add(g);
      const rec = { ...p, group: g, home: g.position.clone() };
      parts.push(rec);
      return rec;
    },
    addFlow(from, to, color, n = 8) { flows.push({ from, to, color, n: Math.min(n, mobile ? 6 : 12) }); },
    addPlume(mesh) { plumes.push(mesh); mesh.visible = false; },
  };

  try { spec.build(api); } catch (e) {
    window.__showNoGL && window.__showNoGL((e && e.message) || String(e));
    throw e;
  }

  const stackId = spec.stages[0].id;
  let stage = stackId;
  let skin = 0;
  let showLabels = true, showFlow = false, showPlume = false, explode = 0;
  const layerOn = Object.fromEntries((spec.layers || []).map((l) => [l.id, l.on !== false]));

  function partVisible(p) {
    if (p.cutawayOnly && skin === 0) return false;
    if (p.layer && layerOn[p.layer] === false) return false;
    if (p.hideOnStack && stage === stackId) return false;
    if (stage === stackId || p.always) return true;
    const stages = p.stages || (p.stage ? [p.stage] : [stackId]);
    return stages.includes(stage);
  }

  function applySkin() {
    parts.forEach((p) => {
      p.group.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m.userData) return;
          if (!m.userData._base) m.userData._base = { op: m.opacity, dw: m.depthWrite, tr: m.transparent };
          try {
            if (skin === 0) {
              m.clippingPlanes = []; m.transparent = m.userData._base.tr; m.opacity = m.userData._base.op; m.depthWrite = m.userData._base.dw;
            } else if (skin === 1) {
              m.clippingPlanes = [clip]; m.clipShadows = true; m.transparent = m.userData._base.tr; m.opacity = m.userData._base.op; m.depthWrite = m.userData._base.dw;
            } else {
              m.clippingPlanes = []; m.transparent = true; m.opacity = Math.min(0.22, m.userData._base.op || 1); m.depthWrite = false;
            }
          } catch (e) { /* ignore material that cannot clip */ }
        });
      });
    });
    const skinLbl = $('#bSkin b');
    if (skinLbl) skinLbl.textContent = skinCycle[skin];
    const skinBtn = $('#bSkin');
    if (skinBtn) skinBtn.classList.toggle('on', skin > 0);
    applyLayers();
  }

  function applyLayers() {
    parts.forEach((p) => { p.group.visible = partVisible(p); });
  }

  function applyExplode() {
    parts.forEach((p) => {
      const d = p.explode || [0, 0, 0];
      p.group.position.set(p.home.x + d[0] * explode, p.home.y + d[1] * explode, p.home.z + d[2] * explode);
    });
  }

  function frameStage() {
    const vis = parts.filter((p) => p.group.visible && !p.cutawayOnly);
    if (!vis.length) return;
    const box = new THREE.Box3();
    vis.forEach((p) => {
      try { box.expandByObject(p.group); } catch (e) { /* skip broken bounds */ }
    });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    if (![c.x, c.y, c.z, s.x, s.y, s.z].every(Number.isFinite)) return;
    const r = Math.max(s.x, s.y, s.z, 4) * 0.7 + 8;
    controls.target.set(c.x, c.y, c.z);
    camera.position.set(c.x + r * 0.85, c.y + r * 0.22, c.z + r * 1.15);
    controls.update();
  }

  function resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const p = $('#panel');
    document.documentElement.style.setProperty('--ph', (p ? p.offsetHeight : 180) + 'px');
  }
  addEventListener('resize', resize); resize();

  const labelEls = new Map();
  function syncLabels() {
    if (!labelsEl) return;
    const keep = new Set();
    if (showLabels) {
      const w = innerWidth, h = innerHeight;
      parts.forEach((p) => {
        if (!p.label || !p.group.visible) return;
        const v = new THREE.Vector3(0, p.labelY || 0, 0);
        p.group.localToWorld(v);
        v.project(camera);
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z > 1) return;
        const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
        if (x < 8 || x > w - 8 || y < 40 || y > h - 120) return;
        keep.add(p);
        let el = labelEls.get(p);
        if (!el) {
          el = document.createElement('button');
          el.className = 'lbl';
          el.type = 'button';
          const span = document.createElement('span');
          span.textContent = p.label;
          el.appendChild(span);
          el.addEventListener('click', () => openCard(p));
          labelsEl.appendChild(el);
          labelEls.set(p, el);
        }
        el.className = 'lbl ' + (x > w * 0.55 ? 'l' : 'r');
        el.style.left = Math.round(x) + 'px';
        el.style.top = Math.round(y) + 'px';
      });
    }
    for (const [p, el] of labelEls) {
      if (!keep.has(p)) { el.remove(); labelEls.delete(p); }
    }
  }

  function openCard(p) {
    const tag = $('#cTag'), title = $('#cTitle'), desc = $('#cDesc'), specs = $('#cSpecs'), note = $('#cNote'), card = $('#card');
    if (!card) return;
    if (tag) tag.textContent = p.tag || p.stage || '';
    if (title) title.textContent = p.name || p.label || '';
    if (desc) desc.textContent = p.desc || '';
    if (specs) {
      specs.innerHTML = '';
      (p.specs || []).forEach(([k, v]) => {
        const d = document.createElement('div');
        const s = document.createElement('span'); s.textContent = k;
        const b = document.createElement('b'); b.textContent = v;
        d.append(s, b); specs.appendChild(d);
      });
    }
    if (note) note.textContent = p.note || 'Simplified approximation · unofficial fan/learning project.';
    const act = $('#cAct'); if (act) act.innerHTML = '';
    card.classList.add('show');
  }
  const cClose = $('#cClose');
  if (cClose) cClose.onclick = () => $('#card') && $('#card').classList.remove('show');

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(root.children, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    const found = parts.find((p) => {
      let n = obj;
      while (n) { if (n === p.group) return true; n = n.parent; }
      return false;
    });
    if (found) openCard(found);
  });

  const flowDots = [];
  const flowGeo = new THREE.SphereGeometry(0.12, 6, 5);
  function rebuildFlow() {
    flowDots.forEach((d) => scene.remove(d));
    flowDots.length = 0;
    if (!showFlow) return;
    flows.forEach((f) => {
      for (let i = 0; i < f.n; i++) {
        const m = new THREE.Mesh(flowGeo, new THREE.MeshBasicMaterial({ color: f.color }));
        m.userData.flow = f; m.userData.k = i / f.n;
        scene.add(m); flowDots.push(m);
      }
    });
  }

  const seg = $('#seg');
  if (seg) {
    seg.innerHTML = spec.stages.map((s) => `<button type="button" data-stage="${s.id}">${s.label}</button>`).join('');
    seg.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      setStage(b.dataset.stage, b.dataset.stage === stage);
    };
  }
  function setStage(id, announce) {
    stage = id;
    if (seg) [...seg.children].forEach((b) => b.classList.toggle('on', b.dataset.stage === id));
    applyLayers(); frameStage();
    const info = announce && spec.stageInfo && spec.stageInfo[id];
    if (info) openCard(info);
  }

  const bSkin = $('#bSkin'); if (bSkin) bSkin.onclick = () => { skin = (skin + 1) % 3; applySkin(); };
  const bFlow = $('#bFlow'); if (bFlow) bFlow.onclick = () => { showFlow = !showFlow; bFlow.classList.toggle('on', showFlow); const lg = $('#legend'); if (lg) lg.classList.toggle('show', showFlow); rebuildFlow(); };
  const bPlume = $('#bPlume'); if (bPlume) bPlume.onclick = () => { showPlume = !showPlume; bPlume.classList.toggle('on', showPlume); plumes.forEach((p) => { p.visible = showPlume; }); };
  const bLabels = $('#bLabels');
  if (bLabels) {
    bLabels.onclick = () => { showLabels = !showLabels; bLabels.classList.toggle('on', showLabels); syncLabels(); };
    bLabels.classList.add('on');
  }
  const bParts = $('#bParts'); if (bParts) bParts.onclick = () => $('#sheet') && $('#sheet').classList.toggle('show');
  const sheetClose = $('#sheetClose'); if (sheetClose) sheetClose.onclick = () => $('#sheet') && $('#sheet').classList.remove('show');
  const chips = $('#sheet .chips');
  if (chips) {
    chips.innerHTML = (spec.layers || []).map((l) => `<button type="button" class="chip${layerOn[l.id] === false ? '' : ' on'}" data-layer="${l.id}">${l.label}</button>`).join('');
    chips.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      layerOn[b.dataset.layer] = !layerOn[b.dataset.layer];
      b.classList.toggle('on', layerOn[b.dataset.layer]);
      applyLayers();
    };
  }
  const slider = $('#explode');
  if (slider) slider.oninput = () => { explode = slider.value / 100; const ev = $('#exVal'); if (ev) ev.textContent = slider.value + '%'; applyExplode(); };
  const help = $('#help'); if (help) help.onclick = () => $('#helpBox') && $('#helpBox').classList.add('show');
  const helpBox = $('#helpBox'); if (helpBox) helpBox.onclick = (e) => { if (e.target.id === 'helpBox') helpBox.classList.remove('show'); };
  const hintClose = $('#hintClose'); if (hintClose) hintClose.onclick = () => $('#hint') && $('#hint').classList.add('hide');
  const tag = $('#blockTag span');
  if (tag && spec.modelTag) tag.textContent = spec.modelTag;
  const blockTag = $('#blockTag'); if (blockTag) blockTag.onclick = () => spec.modelCard && openCard(spec.modelCard);

  const legend = $('#legend');
  if (legend) legend.innerHTML = (spec.legend || []).map((x) => `<span><i class="${x.cls}"></i>${x.label}</span>`).join('');

  applySkin(); applyLayers(); setStage(stackId, false);

  const clock = new THREE.Clock();
  let frames = 0;
  function tick() {
    requestAnimationFrame(tick);
    try {
      const t = clock.getElapsedTime();
      controls.update();
      if (skin === 1) {
        const w = new THREE.Vector3(); camera.getWorldDirection(w);
        clip.normal.set(-w.z, 0, w.x);
        if (clip.normal.lengthSq() < 0.01) clip.normal.set(-1, 0, 0);
        else clip.normal.normalize();
      }
      flowDots.forEach((d) => {
        const f = d.userData.flow; const k = (d.userData.k + t * 0.15) % 1;
        d.position.lerpVectors(f.from, f.to, k);
      });
      if (showPlume) plumes.forEach((p, i) => { p.scale.y = 1 + Math.sin(t * 9 + i) * 0.08; });
      renderer.render(scene, camera);
      if ((++frames % (mobile ? 5 : 3)) === 0) syncLabels();
    } catch (e) {
      if (!tick._shown) {
        tick._shown = true;
        window.__showNoGL && window.__showNoGL((e && e.message) || String(e));
      }
    }
  }
  tick();
}
