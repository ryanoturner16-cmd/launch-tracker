// Entry point: only start the 3D app when WebGL is available, otherwise show a friendly message
// (no raw error box, no uncaught exception).
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}
const noGL = (d) => (window.__showNoGL ? window.__showNoGL(d) : (document.body.textContent = '3D view unavailable: WebGL is not supported in this browser.'));
if (!webglAvailable()) noGL('This browser did not provide a WebGL context.');
else import('./main.js').catch((e) => {
  if (e && e.name === 'NoWebGL') return; // main.js already showed the friendly message
  noGL((e && e.message) || String(e));
});
