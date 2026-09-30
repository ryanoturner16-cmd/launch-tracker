function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}
const noGL = (d) => (window.__showNoGL ? window.__showNoGL(d) : (document.body.textContent = '3D view unavailable: WebGL is not supported in this browser.'));
const file = document.documentElement.dataset.dive || 'falcon9';
if (!webglAvailable()) noGL('This browser did not provide a WebGL context.');
else import('./' + file + '.js').catch((e) => {
  if (e && e.name === 'NoWebGL') return;
  noGL((e && e.message) || String(e));
});
