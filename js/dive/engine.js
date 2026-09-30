// Shared interactive deep-dive viewer (Falcon 9, Apollo / Saturn V, …).
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const skinCycle = ['Solid', 'Cutaway', 'X-ray'];

export function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.22, roughness: 0.55, ...extra });
}

export function startDive(spec) {
  const canvas = $('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) { const e = new Error('No WebGL'); e.name = 'NoWebGL'; window.__showNoGL && window.__showNoGL(e.message); throw e; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  const fogFar = spec.fogFar || 260;
  scene.fog = new THREE.Fog(0x05070d, fogFar * 0.4, fogFar);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0x9cb6ff, 0x1a1208, 0.7));
  const key = new THREE.DirectionalLight(0xfff4e5, 1.35); key.position.set(18, 28, 16); scene.add(key);
  const fill = new THREE.DirectionalLight(0x6ea8ff, 0.35); fill.position.set(-20, 8, -12); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 500);
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
    cyl(rTop, rBot, h, seg = 28) { return new THREE.CylinderGeometry(rTop, rBot, h, seg); },
    sphere(r, w = 24, h = 16) { return new THREE.SphereGeometry(r, w, h); },
    cone(r, h, seg = 20) { return new THREE.ConeGeometry(r, h, seg); },
    mesh(geo, material, y = 0) { const m = new THREE.Mesh(geo, material); m.position.y = y; return m; },
    group() { return new THREE.Group(); },
    addPart(p) {
      const g = p.group || new THREE.Group();
      if (p.mesh) g.add(p.mesh);
      if (p.y) g.position.y = p.y;
      if (p.x) g.position.x = p.x;
      root.add(g);
      const rec = { ...p, group: g, home: g.position.clone() };
      parts.push(rec);
      return rec;
    },
    addFlow(from, to, color, n = 10) { flows.push({ from, to, color, n, t: Math.random() }); },
    addPlume(mesh) { plumes.push(mesh); mesh.visible = false; },
  };

  spec.build(api);

  const stackId = spec.stages[0].id;
  let stage = stackId;
  let skin = 0;
  let showLabels = true, showFlow = false, showPlume = false, explode = 0;
  const layerOn = Object.fromEntries((spec.layers || []).map((l) => [l.id, l.on !== false]));

  function partVisible(p) {
    if (p.layer && layerOn[p.layer] === false) return false;
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
          if (!m.userData._base) m.userData._base = { op: m.opacity, dw: m.depthWrite, tr: m.transparent };
          if (skin === 0) {
            m.clippingPlanes = []; m.transparent = m.userData._base.tr; m.opacity = m.userData._base.op; m.depthWrite = m.userData._base.dw;
          } else if (skin === 1) {
            m.clippingPlanes = [clip]; m.clipShadows = true; m.transparent = m.userData._base.tr; m.opacity = m.userData._base.op; m.depthWrite = m.userData._base.dw;
          } else {
            m.clippingPlanes = []; m.transparent = true; m.opacity = Math.min(0.22, m.userData._base.op || 1); m.depthWrite = false;
          }
        });
      });
    });
    $('#bSkin b').textContent = skinCycle[skin];
    $('#bSkin').classList.toggle('on', skin > 0);
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
    const vis = parts.filter((p) => p.group.visible);
    if (!vis.length) return;
    const box = new THREE.Box3();
    vis.forEach((p) => box.expandByObject(p.group));
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.7 + 8;
    controls.target.lerp(c, 0.55);
    const pos = c.clone().add(new THREE.Vector3(r * 0.85, r * 0.25, r * 1.15));
    camera.position.lerp(pos, 0.45);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    const p = $('#panel');
    document.documentElement.style.setProperty('--ph', (p ? p.offsetHeight : 180) + 'px');
  }
  addEventListener('resize', resize); resize();

  function syncLabels() {
    labelsEl.innerHTML = '';
    if (!showLabels) return;
    const w = innerWidth, h = innerHeight;
    parts.forEach((p) => {
      if (!p.label || !p.group.visible) return;
      const v = new THREE.Vector3(0, p.labelY || 0, 0);
      p.group.localToWorld(v);
      v.project(camera);
      if (v.z > 1) return;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (x < 8 || x > w - 8 || y < 40 || y > h - 120) return;
      const el = document.createElement('button');
      el.className = 'lbl ' + (x > w * 0.55 ? 'l' : 'r');
      el.type = 'button';
      el.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = p.label;
      el.appendChild(span);
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      el.addEventListener('click', () => openCard(p));
      labelsEl.appendChild(el);
    });
  }

  function openCard(p) {
    $('#cTag').textContent = p.tag || (p.stage || '');
    $('#cTitle').textContent = p.name || p.label || '';
    $('#cDesc').textContent = p.desc || '';
    const specs = $('#cSpecs'); specs.innerHTML = '';
    (p.specs || []).forEach(([k, v]) => {
      const d = document.createElement('div');
      const s = document.createElement('span'); s.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      d.append(s, b); specs.appendChild(d);
    });
    $('#cNote').textContent = p.note || 'Simplified approximation · unofficial fan/learning project.';
    $('#cAct').innerHTML = '';
    $('#card').classList.add('show');
  }
  $('#cClose').onclick = () => $('#card').classList.remove('show');

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
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
  const flowGeo = new THREE.SphereGeometry(0.12, 8, 6);
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

  $('#seg').innerHTML = spec.stages.map((s) => `<button type="button" data-stage="${s.id}">${s.label}</button>`).join('');
  function setStage(id, announce) {
    stage = id;
    [...$('#seg').children].forEach((b) => b.classList.toggle('on', b.dataset.stage === id));
    applyLayers(); frameStage();
    const info = announce && spec.stageInfo && spec.stageInfo[id];
    if (info) openCard(info);
  }
  $('#seg').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setStage(b.dataset.stage, b.dataset.stage === stage);
  };

  $('#bSkin').onclick = () => { skin = (skin + 1) % 3; applySkin(); };
  $('#bFlow').onclick = () => { showFlow = !showFlow; $('#bFlow').classList.toggle('on', showFlow); $('#legend').classList.toggle('show', showFlow); rebuildFlow(); };
  $('#bPlume').onclick = () => { showPlume = !showPlume; $('#bPlume').classList.toggle('on', showPlume); plumes.forEach((p) => { p.visible = showPlume; }); };
  $('#bLabels').onclick = () => { showLabels = !showLabels; $('#bLabels').classList.toggle('on', showLabels); syncLabels(); };
  $('#bLabels').classList.add('on');
  $('#bParts').onclick = () => $('#sheet').classList.toggle('show');
  $('#sheetClose').onclick = () => $('#sheet').classList.remove('show');
  const chips = $('#sheet .chips');
  chips.innerHTML = (spec.layers || []).map((l) => `<button type="button" class="chip${layerOn[l.id] === false ? '' : ' on'}" data-layer="${l.id}">${l.label}</button>`).join('');
  chips.onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    layerOn[b.dataset.layer] = !layerOn[b.dataset.layer];
    b.classList.toggle('on', layerOn[b.dataset.layer]);
    applyLayers();
  };
  const slider = $('#explode');
  slider.oninput = () => { explode = slider.value / 100; $('#exVal').textContent = slider.value + '%'; applyExplode(); };
  $('#help').onclick = () => $('#helpBox').classList.add('show');
  $('#helpBox').onclick = (e) => { if (e.target.id === 'helpBox') $('#helpBox').classList.remove('show'); };
  $('#hintClose').onclick = () => $('#hint').classList.add('hide');
  const tag = $('#blockTag span');
  if (tag && spec.modelTag) tag.textContent = spec.modelTag;
  $('#blockTag').onclick = () => spec.modelCard && openCard(spec.modelCard);

  const legend = $('#legend');
  legend.innerHTML = (spec.legend || []).map((x) => `<span><i class="${x.cls}"></i>${x.label}</span>`).join('');

  applySkin(); applyLayers(); setStage(stackId, false);

  const clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    controls.update();
    if (skin === 1) {
      const w = new THREE.Vector3(); camera.getWorldDirection(w);
      clip.normal.set(-w.z, 0, w.x).normalize();
      if (clip.normal.lengthSq() < 0.01) clip.normal.set(-1, 0, 0);
    }
    flowDots.forEach((d) => {
      const f = d.userData.flow; const k = (d.userData.k + t * 0.15) % 1;
      d.position.lerpVectors(f.from, f.to, k);
    });
    plumes.forEach((p, i) => { if (p.visible) p.scale.y = 1 + Math.sin(t * 9 + i) * 0.08; });
    renderer.render(scene, camera);
    if ((tick._n = (tick._n || 0) + 1) % 3 === 0) syncLabels();
  }
  tick();
}
