const demoTracks = [
  { id: 'demo-1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', initials: 'M8', art: 'linear-gradient(135deg,#ff9a8b,#ff6a88)' },
  { id: 'demo-2', title: 'Sweet Disposition', artist: 'The Temper Trap', album: 'Conditions', initials: 'TT', art: 'linear-gradient(135deg,#6dd5ed,#2193b0)' },
  { id: 'demo-3', title: 'Instant Crush', artist: 'Daft Punk · Julian Casablancas', album: 'Random Access Memories', initials: 'DP', art: 'linear-gradient(135deg,#d4fc79,#96e6a1)' },
  { id: 'demo-4', title: 'Electric Feel', artist: 'MGMT', album: 'Oracular Spectacular', initials: 'MG', art: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
  { id: 'demo-5', title: 'Lisztomania', artist: 'Phoenix', album: 'Wolfgang Amadeus Phoenix', initials: 'PX', art: 'linear-gradient(135deg,#f6d365,#fda085)' },
];

const state = { query: '', queue: JSON.parse(localStorage.getItem('music-pocket-queue') || '[]'), history: [], added: new Set(), serverUrl: localStorage.getItem('music-pocket-server') || '', serverToken: localStorage.getItem('music-pocket-token') || '' };
const $ = (id) => document.getElementById(id);
const apiBase = () => state.serverUrl.replace(/\/$/, '');
const apiOptions = (options = {}) => ({ ...options, headers: { ...(options.headers || {}), ...(state.serverToken ? { 'X-API-Key': state.serverToken } : {}) } });

function saveQueue() { localStorage.setItem('music-pocket-queue', JSON.stringify(state.queue)); }
function initials(track) { return (track.initials || track.title.split(/\s+/).slice(0, 2).map((x) => x[0]).join('')).toUpperCase(); }
function showToast(message) { const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600); }

async function searchTracks(query) {
  if (!query) return demoTracks;
  if (state.serverUrl) {
    try {
      const response = await fetch(`${apiBase()}/api/search?q=${encodeURIComponent(query)}`, apiOptions());
      if (response.ok) {
        const tracks = await response.json();
        $('modeBadge').textContent = 'SERVIDOR';
        return tracks;
      }
    } catch (_) { setOffline('Servidor no disponible · cercant al catàleg públic'); }
  }

  // iTunes ofereix una cerca pública de cançons sense requerir Spotify Premium ni una clau API.
  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25&country=ES`);
    if (!response.ok) throw new Error('iTunes search failed');
    const payload = await response.json();
    const tracks = payload.results.map((result) => ({
      id: `itunes-${result.trackId}`,
      title: result.trackName,
      artist: result.artistName,
      album: result.collectionName || 'Àlbum desconegut',
      url: result.trackViewUrl || '',
      source: 'itunes',
      art: result.artworkUrl100 ? result.artworkUrl100.replace('100x100', '300x300') : '',
      initials: `${result.artistName?.[0] || ''}${result.trackName?.[0] || ''}`,
    }));
    $('modeBadge').textContent = 'CATÀLEG PÚBLIC';
    return tracks;
  } catch (_) {
    $('modeBadge').textContent = 'MODE DEMO';
    return demoTracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query.toLowerCase()));
  }
}

function setOffline(label = 'Mode demo · configura el servei Windows') { $('connectionStatus').innerHTML = `<span class="status-dot" style="background:#d99727;box-shadow:0 0 0 4px #fff0d2"></span><span>${label}</span>`; $('modeBadge').textContent = 'MODE DEMO'; }
function renderResults(tracks) {
  $('results').innerHTML = tracks.map((track) => { const added = state.added.has(track.id); return `<article class="track-card"><div class="art" style="--art:${track.art || 'linear-gradient(135deg,#8b9cf5,#374cb8)'}">${initials(track)}</div><div class="track-meta"><div class="track-title">${escapeHtml(track.title)}</div><div class="track-artist">${escapeHtml(track.artist)}</div><div class="track-album">${escapeHtml(track.album || 'Àlbum desconegut')}</div></div><button class="add-button ${added ? 'added' : ''}" data-track="${encodeURIComponent(JSON.stringify(track))}" aria-label="${added ? 'Afegida' : 'Afegeix'}">${added ? '✓' : '+'}</button></article>`; }).join('');
  $('emptyState').hidden = tracks.length !== 0;
  document.querySelectorAll('.add-button').forEach((button) => button.addEventListener('click', () => enqueue(JSON.parse(decodeURIComponent(button.dataset.track)))));
}
function renderQueue() {
  $('queueCount').textContent = state.queue.filter((item) => item.status !== 'done').length;
  $('queueList').innerHTML = state.queue.length ? state.queue.slice(-4).reverse().map((item) => `<div class="queue-item"><div class="art" style="--art:${item.art || 'linear-gradient(135deg,#8b9cf5,#374cb8)'}">${initials(item)}</div><div class="track-meta"><div class="track-title">${escapeHtml(item.title)}</div><div class="track-artist">${escapeHtml(item.artist)}</div></div><span class="queue-state ${item.status}">${statusLabel(item.status)}</span></div>`).join('') : '<p class="field-help">La cua està buida. Quan afegeixis una cançó, apareixerà aquí.</p>';
}
function statusLabel(status) { return ({ pending: 'Pendent', processing: 'Processant', done: 'Importada', error: 'Error' })[status] || 'Pendent'; }
function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }

async function enqueue(track) {
  if (state.added.has(track.id)) return;
  const item = { ...track, status: 'pending', addedAt: new Date().toISOString() };
  state.added.add(track.id); state.queue.push(item); saveQueue(); renderResults(await searchTracks(state.query)); renderQueue(); showToast(`${track.title} s’ha afegit a la cua`);
  if (state.serverUrl) {
    try { const response = await fetch(`${apiBase()}/api/imports`, apiOptions({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: track.url || '', source: track.source || 'manual', track }) })); if (!response.ok) throw new Error(); showToast('Enviat al servidor'); } catch (_) { item.status = 'error'; saveQueue(); renderQueue(); showToast('No s’ha pogut contactar amb el servei'); }
  }
}

async function refresh() {
  const tracks = await searchTracks(state.query);
  $('resultsTitle').textContent = state.query ? `${tracks.length} coincidències` : 'Descobreix música';
  renderResults(tracks);
}
let searchTimer;
$('searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim(); $('clearSearch').hidden = !state.query; clearTimeout(searchTimer); searchTimer = setTimeout(refresh, 180); });
$('clearSearch').addEventListener('click', () => { $('searchInput').value = ''; state.query = ''; $('clearSearch').hidden = true; refresh(); });
$('pasteLinkButton').addEventListener('click', async () => { const link = prompt('Enganxa l’enllaç de Spotify'); if (!link) return; const match = link.match(/track\/([A-Za-z0-9]+)/); const track = { id: match ? match[1] : `link-${Date.now()}`, title: 'Cançó des de Spotify', artist: 'Pendent de resoldre', album: 'Enllaç rebut', initials: 'SP', url: link, art: 'linear-gradient(135deg,#1ed760,#0b8f43)' }; await enqueue(track); });
$('settingsButton').addEventListener('click', () => { $('serverUrl').value = state.serverUrl; $('serverToken').value = state.serverToken; $('settingsDialog').showModal(); });
$('settingsForm').addEventListener('submit', (event) => { if (event.submitter?.value !== 'default') return; state.serverUrl = $('serverUrl').value.trim(); state.serverToken = $('serverToken').value.trim(); localStorage.setItem('music-pocket-server', state.serverUrl); localStorage.setItem('music-pocket-token', state.serverToken); state.serverUrl ? showToast('Servei Windows configurat') : showToast('Mode demo activat'); if (!state.serverUrl) setOffline(); refresh(); });
$('viewQueueButton').addEventListener('click', () => showToast('La vista completa de cua arribarà en el següent increment'));
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); if (tab.dataset.view !== 'discover') showToast(`${tab.dataset.view === 'queue' ? 'Cua' : 'Historial'}: pròximament`); }));

if (!state.serverUrl) setOffline();
refresh();
renderQueue();

