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

const searchCache = new Map();
let searchSequence = 0;
let currentTracks = [];
let callbackSequence = 0;

// Apple's supported cross-site callback avoids browser CORS restrictions.
function publicSearch(query) {
  return new Promise((resolve, reject) => {
    const callback = `musicPocketSearch${++callbackSequence}`;
    const script = document.createElement('script');
    let settled = false;
    const finish = (error, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      // A late response after timeout must remain harmless.
      window[callback] = () => {};
      setTimeout(() => { delete window[callback]; }, 60000);
      error ? reject(error) : resolve(payload);
    };
    const timer = setTimeout(() => finish(new Error('La cerca ha trigat massa. Torna-ho a provar.')), 12000);
    window[callback] = (payload) => finish(null, payload);
    script.onerror = () => finish(new Error('No s’ha pogut connectar al catàleg. Torna-ho a provar.'));
    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25&country=ES&callback=${callback}`;
    document.head.appendChild(script);
  });
}

async function searchTracks(query) {
    const key = query.toLocaleLowerCase();
    if (searchCache.has(key)) return searchCache.get(key);
    const payload = await publicSearch(query);
    if (!Array.isArray(payload.results)) throw new Error('El catàleg no ha retornat una resposta vàlida.');
    const tracks = payload.results.map((result) => ({
      id: `itunes-${result.trackId}`,
      title: result.trackName,
      artist: result.artistName,
      album: result.collectionName || 'Àlbum desconegut',
      url: result.trackViewUrl || '',
      source: 'itunes',
      initials: `${result.artistName?.[0] || ''}${result.trackName?.[0] || ''}`,
    }));
    searchCache.set(key, tracks);
    return tracks;
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
  state.added.add(track.id); state.queue.push(item); saveQueue(); renderResults(currentTracks); renderQueue(); showToast(`${track.title} s’ha afegit a la cua${state.serverUrl ? '' : ' local'}`);
  if (state.serverUrl) {
    try { const response = await fetch(`${apiBase()}/api/imports`, apiOptions({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: track.url || '', source: track.source || 'manual', track }) })); if (!response.ok) throw new Error(); showToast('Enviat al servidor'); } catch (_) { item.status = 'error'; saveQueue(); renderQueue(); showToast('No s’ha pogut contactar amb el servei'); }
  }
}

async function refresh() {
  const sequence = ++searchSequence;
  const query = state.query;
  currentTracks = [];
  $('results').replaceChildren();
  $('emptyState').hidden = true;
  $('results').setAttribute('aria-busy', 'false');
  $('modeBadge').textContent = 'CERCA DE CANÇONS';
  if (query.length < 2) {
    $('resultsTitle').textContent = 'Escriu el nom d’una cançó o artista';
    return;
  }
  $('resultsTitle').textContent = 'Cercant cançons…';
  $('results').setAttribute('aria-busy', 'true');
  try {
    const tracks = await searchTracks(query);
    if (sequence !== searchSequence || query !== state.query) return;
    currentTracks = tracks;
    $('resultsTitle').textContent = `${tracks.length} coincidències`;
    $('emptyState').querySelector('h3').textContent = 'No s’han trobat cançons';
    $('emptyState').querySelector('p').textContent = 'Prova amb el títol i el nom de l’artista.';
    renderResults(tracks);
  } catch (error) {
    if (sequence !== searchSequence || query !== state.query) return;
    $('resultsTitle').textContent = 'No s’ha pogut completar la cerca';
    $('emptyState').hidden = false;
    $('emptyState').querySelector('h3').textContent = 'Torna-ho a provar';
    $('emptyState').querySelector('p').textContent = error.message;
    const retry = document.createElement('button');
    retry.className = 'primary-button';
    retry.textContent = 'Reintenta la cerca';
    retry.addEventListener('click', refresh);
    $('results').appendChild(retry);
  } finally {
    if (sequence === searchSequence) $('results').setAttribute('aria-busy', 'false');
  }
}
let searchTimer;
$('searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim(); ++searchSequence; $('clearSearch').hidden = !state.query; clearTimeout(searchTimer); $('results').replaceChildren(); $('emptyState').hidden = true; $('resultsTitle').textContent = state.query.length < 2 ? 'Escriu el nom d’una cançó o artista' : 'Cercant cançons…'; searchTimer = setTimeout(refresh, 450); });
$('clearSearch').addEventListener('click', () => { $('searchInput').value = ''; state.query = ''; $('clearSearch').hidden = true; refresh(); });
$('pasteLinkButton').addEventListener('click', async () => { const link = prompt('Enganxa l’enllaç de Spotify'); if (!link) return; const match = link.match(/track\/([A-Za-z0-9]+)/); const track = { id: match ? match[1] : `link-${Date.now()}`, title: 'Cançó des de Spotify', artist: 'Pendent de resoldre', album: 'Enllaç rebut', initials: 'SP', url: link, art: 'linear-gradient(135deg,#1ed760,#0b8f43)' }; await enqueue(track); });
$('settingsButton').addEventListener('click', () => { $('serverUrl').value = state.serverUrl; $('serverToken').value = state.serverToken; $('settingsDialog').showModal(); });
$('settingsForm').addEventListener('submit', (event) => { if (event.submitter?.value !== 'default') return; state.serverUrl = $('serverUrl').value.trim(); state.serverToken = $('serverToken').value.trim(); localStorage.setItem('music-pocket-server', state.serverUrl); localStorage.setItem('music-pocket-token', state.serverToken); state.serverUrl ? showToast('Servei Windows configurat') : showToast('Mode demo activat'); if (!state.serverUrl) setOffline(); refresh(); });
$('viewQueueButton').addEventListener('click', () => showToast('La vista completa de cua arribarà en el següent increment'));
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); if (tab.dataset.view !== 'discover') showToast(`${tab.dataset.view === 'queue' ? 'Cua' : 'Historial'}: pròximament`); }));

if (!state.serverUrl) setOffline('Cerca disponible · importació sense configurar');
refresh();
renderQueue();

