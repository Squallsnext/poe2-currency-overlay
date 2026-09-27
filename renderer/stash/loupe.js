'use strict';
// the magnifier window: draws what the OCR panel sends (renderer/stash/networth-ui.js)
const rows = document.getElementById('rows');
document.getElementById('close').onclick = () => window.loupeApi.close();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.loupeApi.close(); });
window.loupeApi.onData((d) => {
  document.getElementById('title').textContent = d.title || 'Lupe';
  document.getElementById('close').title = d.closeTitle || '';
  rows.textContent = '';
  for (const im of d.imgs || []) {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = im.label || '';
    const img = document.createElement('img'); img.src = im.src;
    row.appendChild(lab); row.appendChild(img); rows.appendChild(row);
  }
  if (d.note) { const n = document.createElement('div'); n.id = 'note'; n.textContent = d.note; rows.appendChild(n); }
});
