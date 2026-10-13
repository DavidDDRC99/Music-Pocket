const demoTracks = [
  { id: 'demo-1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', initials: 'M8', art: 'linear-gradient(135deg,#ff9a8b,#ff6a88)' },
  { id: 'demo-2', title: 'Sweet Disposition', artist: 'The Temper Trap', album: 'Conditions', initials: 'TT', art: 'linear-gradient(135deg,#6dd5ed,#2193b0)' },
  { id: 'demo-3', title: 'Instant Crush', artist: 'Daft Punk · Julian Casablancas', album: 'Random Access Memories', initials: 'DP', art: 'linear-gradient(135deg,#d4fc79,#96e6a1)' },
  { id: 'demo-4', title: 'Electric Feel', artist: 'MGMT', album: 'Oracular Spectacular', initials: 'MG', art: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
  { id: 'demo-5', title: 'Lisztomania', artist: 'Phoenix', album: 'Wolfgang Amadeus Phoenix', initials: 'PX', art: 'linear-gradient(135deg,#f6d365,#fda085)' },
];

const privateSite = location.hostname.endsWith('.ts.net') || location.hostname === '127.0.0.1';
const state = { query: '', queue: [], view: 'discover', added: new Set(), sending: new Set(), serverUrl: privateSite ? location.origin : localStorage.getItem('music-pocket-server') || '', serverToken: privateSite ? '' : localStorage.getItem('music-pocket-token') || '' };
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
let previewAudio = null;
let previewTrackId = null;

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
      duration: Math.round((result.trackTimeMillis || 0) / 1000),
      previewUrl: result.previewUrl || '',
      artwork: result.artworkUrl100 || '',
      initials: `${result.artistName?.[0] || ''}${result.trackName?.[0] || ''}`,
    }));
    searchCache.set(key, tracks);
    return tracks;
}

function setConnectionStatus(label, detail = '', online = true) {
  $('connectionStatus').innerHTML = `<span class="status-dot"${online ? '' : ' style="background:#efb35b;box-shadow:0 0 0 4px rgba(239,179,91,.14),0 0 14px rgba(239,179,91,.45)"'}></span><span>${escapeHtml(label)}</span>${detail ? `<span class="status-detail">${escapeHtml(detail)}</span>` : ''}`;
}
function setOffline(label = 'Mode demo · configura el servei Windows') { setConnectionStatus(label, '', false); }
function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.removeAttribute('src');
    previewAudio.load();
  }
  previewAudio = null;
  previewTrackId = null;
  document.querySelectorAll('.preview-button.is-playing').forEach((button) => {
    button.classList.remove('is-playing');
    button.textContent = '▶';
    button.setAttribute('aria-pressed', 'false');
  });
}
function togglePreview(track) {
  if (!track.previewUrl) { showToast('Aquesta versió no té previsualització disponible.'); return; }
  if (previewAudio && previewTrackId === track.id) {
    if (previewAudio.paused) previewAudio.play().catch(() => showToast('No s’ha pogut reproduir la previsualització.'));
    else previewAudio.pause();
    document.querySelector(`[data-preview-track="${CSS.escape(track.id)}"]`)?.classList.toggle('is-playing', !previewAudio.paused);
    document.querySelector(`[data-preview-track="${CSS.escape(track.id)}"]`).textContent = previewAudio.paused ? '▶' : 'Ⅱ';
    document.querySelector(`[data-preview-track="${CSS.escape(track.id)}"]`).setAttribute('aria-pressed', String(!previewAudio.paused));
    return;
  }
  stopPreview();
  previewAudio = new Audio(track.previewUrl);
  previewAudio.preload = 'none';
  previewTrackId = track.id;
  previewAudio.addEventListener('ended', stopPreview, { once: true });
  previewAudio.addEventListener('error', () => { stopPreview(); showToast('No s’ha pogut carregar la previsualització.'); }, { once: true });
  previewAudio.play().then(() => {
    const button = document.querySelector(`[data-preview-track="${CSS.escape(track.id)}"]`);
    if (button) { button.classList.add('is-playing'); button.textContent = 'Ⅱ'; button.setAttribute('aria-pressed', 'true'); }
  }).catch(() => { stopPreview(); showToast('No s’ha pogut reproduir la previsualització.'); });
}
function renderResults(tracks) {
  stopPreview();
  const results = $('results');
  results.replaceChildren();
  for (const track of tracks) {
    const added = state.added.has(track.id);
    const card = document.createElement('article'); card.className = 'track-card';
    const art = document.createElement('div'); art.className = 'art';
    if (track.artwork) { art.style.backgroundImage = `url("${track.artwork}")`; art.classList.add('has-image'); }
    const artInitials = document.createElement('span'); artInitials.textContent = initials(track); art.appendChild(artInitials);
    const preview = document.createElement('button'); preview.className = 'preview-button'; preview.type = 'button'; preview.textContent = '▶'; preview.dataset.previewTrack = track.id; preview.disabled = !track.previewUrl; preview.setAttribute('aria-label', track.previewUrl ? `Escolta una previsualització de ${track.title}` : 'Previsualització no disponible'); preview.setAttribute('aria-pressed', 'false');
    preview.addEventListener('click', () => togglePreview(track)); art.appendChild(preview);
    const meta = document.createElement('div'); meta.className = 'track-meta';
    const title = document.createElement('div'); title.className = 'track-title'; title.textContent = track.title;
    const artist = document.createElement('div'); artist.className = 'track-artist'; artist.textContent = track.artist;
    const subline = document.createElement('div'); subline.className = 'track-subline';
    const album = document.createElement('span'); album.className = 'track-album'; album.textContent = track.album || 'Àlbum desconegut';
    const duration = document.createElement('span'); duration.className = 'track-duration'; duration.textContent = formatDuration(track.duration);
    subline.append(album, duration); meta.append(title, artist, subline);
    const add = document.createElement('button'); add.className = `add-button ${added ? 'added' : ''}`; add.type = 'button'; add.textContent = added ? '✓' : '+'; add.dataset.track = encodeURIComponent(JSON.stringify(track)); add.setAttribute('aria-label', added ? 'Afegida' : `Afegeix ${track.title}`); add.addEventListener('click', () => enqueue(track));
    card.append(art, meta, add); results.appendChild(card);
  }
  $('emptyState').hidden = tracks.length !== 0;
}
let selectedPlaylist = { id: '', name: '' };
let pendingTrack = null;
async function choosePlaylist(track) {
  pendingTrack = track;
  selectedPlaylist = { id: '', name: '' };
  $('playlistTrackName').textContent = `${track.title} · ${track.artist}`;
  const options = $('playlistOptions');
  options.replaceChildren();
  const library = document.createElement('label'); library.className = 'playlist-option selected';
  library.innerHTML = '<input type="radio" name="playlist" value=""><span><strong>Només biblioteca</strong><small>No afegir a cap playlist</small></span>';
  options.appendChild(library);
  try {
    const result = await api('/api/playlists');
    for (const playlist of result.items || []) {
      const option = document.createElement('label'); option.className = 'playlist-option';
      option.innerHTML = `<input type="radio" name="playlist" value="${escapeHtml(playlist.id)}"><span><strong>${escapeHtml(playlist.name)}</strong><small>${playlist.songCount || 0} cançons</small></span>`;
      options.appendChild(option);
    }
  } catch (error) {
    const note = document.createElement('p'); note.className = 'field-help'; note.textContent = 'No s’han pogut carregar les playlists. La cançó encara es pot afegir només a la biblioteca.'; options.appendChild(note);
  }
  options.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
    options.querySelectorAll('.playlist-option').forEach((item) => item.classList.toggle('selected', item.contains(input) || item.querySelector('input')?.checked));
    const playlist = [...options.querySelectorAll('input')].find((item) => item.checked);
    selectedPlaylist = playlist?.value ? { id: playlist.value, name: playlist.closest('.playlist-option').querySelector('strong').textContent } : { id: '', name: '' };
  }));
  options.querySelector('input').checked = true;
  $('playlistDialog').showModal();
  return new Promise((resolve) => {
    $('playlistForm').onsubmit = (event) => { if (event.submitter?.value !== 'default') { resolve(null); return; } resolve({ ...pendingTrack, playlistId: selectedPlaylist.id, playlistName: selectedPlaylist.name }); };
    $('playlistDialog').addEventListener('close', () => resolve(null), { once: true });
  });
}
const completed = (job) => ['done', 'duplicate', 'error', 'cancelled'].includes(job.status);
function statusIcon(status) { return ({ done: '✓', duplicate: '✓', error: '×', cancelled: '×', processing: '…', queued: '•', waiting: '•' })[status] || '•'; }
async function removeJob(job) {
  try { await api(`/api/imports/${job.id}/remove`, {method:'POST'}); await syncQueue(); showToast('Eliminada de l’historial'); }
  catch (error) { showToast(error.message); }
}
function renderQueue() {
  $('queueCount').textContent = state.queue.filter((item) => !completed(item)).length;
  const jobs = state.view === 'history' ? state.queue.filter(completed) : state.view === 'queue' ? state.queue.filter((job) => !completed(job)) : state.queue.slice(0, 4);
  $('queueList').replaceChildren();
  if (!jobs.length) {
    const p = document.createElement('p'); p.className = 'field-help';
    p.textContent = !state.serverUrl ? 'Connecta el servei de casa per veure les importacions.' : state.view === 'history' ? 'Les importacions completades apareixeran aquí.' : 'La cua està buida. Cerca una cançó i prem +.';
    $('queueList').appendChild(p);
  }
  for (const job of jobs) {
    const row = document.createElement('article'); row.className = `import-card import-${job.status}`;
    const header = document.createElement('div'); header.className = 'import-header';
    const title = document.createElement('strong'); title.textContent = job.track.title;
    const badge = document.createElement('span'); badge.className = `status-badge ${job.status}`; badge.textContent = `${statusIcon(job.status)} ${statusLabel(job.status)}`;
    header.append(title, badge);
    const artist = document.createElement('p'); artist.className = 'track-artist'; artist.textContent = job.track.artist;
    const phase = document.createElement('p'); phase.className = 'import-phase'; phase.textContent = job.phase || statusLabel(job.status);
    const progress = document.createElement('progress'); progress.max = 100; progress.value = job.progress || 0; progress.setAttribute('aria-label', `Progrés de ${job.track.title}`);
    const message = document.createElement('p'); message.className = 'field-help'; message.textContent = job.message || '';
    row.append(header, artist, phase, progress, message);
    const actions = document.createElement('div'); actions.className = 'import-actions';
    const action = ['error','cancelled','waiting'].includes(job.status) ? 'retry' : job.status === 'queued' ? 'cancel' : '';
    if (action) {
      const button = document.createElement('button'); button.className = 'secondary-button'; button.textContent = action === 'retry' ? 'Reintenta' : 'Cancel·la';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await api(`/api/imports/${job.id}/${action}`, {method:'POST'}); await syncQueue(); }
        catch (error) { showToast(error.message); button.disabled = false; }
      }); actions.appendChild(button);
    }
    if (job.status !== 'processing') {
      const remove = document.createElement('button'); remove.className = 'remove-button'; remove.textContent = '×'; remove.title = 'Elimina'; remove.setAttribute('aria-label', `Elimina ${job.track.title}`); remove.addEventListener('click', () => removeJob(job)); actions.appendChild(remove);
    }
    if (actions.children.length) row.appendChild(actions);
    $('queueList').appendChild(row);
  }
}
function statusLabel(status) { return ({ queued: 'En cua', processing: 'Processant', waiting: 'En espera', done: 'Importada', duplicate: 'Ja la tens', error: 'Error', cancelled: 'Cancel·lada' })[status] || 'Pendent'; }
function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }

async function enqueue(track) {
  if (state.added.has(track.id) || state.sending.has(track.id)) return;
  if (!state.serverUrl) { $('settingsButton').click(); showToast('Obre l’adreça privada de Music Pocket amb Tailscale activat.'); return; }
  state.sending.add(track.id);
  try {
    const chosen = await choosePlaylist(track);
    if (!chosen) return;
    await api('/api/imports', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({sourceUrl:chosen.url || '', track:chosen, playlistId:chosen.playlistId, playlistName:chosen.playlistName})});
    showToast('Petició rebuda al servidor');
    await syncQueue();
  } catch (error) { showToast(error.message); }
  finally { state.sending.delete(track.id); }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(apiBase() + path, apiOptions({...options, signal:controller.signal}));
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'Accés denegat. Revisa Tailscale o la clau d’accés.' : body.error || 'El servei no ha acceptat la petició.');
    return body;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('No es pot connectar. Comprova Tailscale i que Windows estigui encès.');
    throw error;
  } finally { clearTimeout(timer); }
}
let synchronizing = false;
async function syncQueue() {
  if (!state.serverUrl || synchronizing) return;
  synchronizing = true;
  try {
    const [health, result] = await Promise.all([api('/api/health'),api('/api/imports')]);
    state.queue = result.items;
    state.added = new Set(state.queue.filter((job) => !['error','cancelled'].includes(job.status)).map((job) => job.track.id));
    setConnectionStatus(health.libraryAvailable ? 'Servidor connectat' : 'Disc del servidor no disponible', health.libraryAvailable ? 'biblioteca accessible' : 'revisa la unitat O', health.libraryAvailable);
    renderQueue();
    if (state.view === 'discover' && currentTracks.length) renderResults(currentTracks);
  } catch (error) { setConnectionStatus('Connexió no disponible', error.message, false); }
  finally { synchronizing = false; }
}
function selectView(view) {
  state.view = view;
  if (view !== 'discover') { ++searchSequence; clearTimeout(searchTimer); }
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  for (const selector of ['.search-panel','.app-shell > .section-heading','#results','#emptyState']) document.querySelector(selector).hidden = view !== 'discover';
  if (view === 'discover') refresh();
  $('queuePreview').querySelector('h2').textContent = view === 'history' ? 'Historial' : 'La teva cua';
  $('viewQueueButton').hidden = view !== 'discover';
  renderQueue();
}

async function refresh() {
  const sequence = ++searchSequence;
  const query = state.query;
  currentTracks = [];
  $('results').replaceChildren();
  $('emptyState').hidden = true;
  $('results').setAttribute('aria-busy', 'false');
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
$('searchInput').addEventListener('input', (event) => { stopPreview(); state.query = event.target.value.trim(); ++searchSequence; $('clearSearch').hidden = !state.query; clearTimeout(searchTimer); $('results').replaceChildren(); $('emptyState').hidden = true; $('resultsTitle').textContent = state.query.length < 2 ? 'Escriu el nom d’una cançó o artista' : 'Cercant cançons…'; searchTimer = setTimeout(refresh, 450); });
$('clearSearch').addEventListener('click', () => { stopPreview(); $('searchInput').value = ''; state.query = ''; $('clearSearch').hidden = true; refresh(); });
$('pasteLinkButton').addEventListener('click', async () => { const link = prompt('Enganxa l’enllaç de la cançó de Spotify'); if (!link) return; const match = link.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})(?:\?.*)?$/); if (!match) { showToast('Cal un enllaç de cançó de Spotify.'); return; } await enqueue({id:match[1], title:'Cançó de Spotify', artist:'Pendent de resoldre', source:'spotify', url:link}); });
$('settingsButton').addEventListener('click', () => { $('serverUrl').value = state.serverUrl; $('serverUrl').readOnly = privateSite; $('serverToken').value = state.serverToken; $('serverToken').hidden = privateSite; document.querySelector('label[for="serverToken"]').hidden = privateSite; $('settingsDialog').showModal(); });
$('settingsForm').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'default') return;
  const input = $('serverUrl').value.trim().replace(/\/$/, '');
  if (input && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(input) && input !== location.origin) { event.preventDefault(); showToast('Introdueix l’adreça HTTPS privada de Tailscale.'); return; }
  if (!privateSite && input && !$('serverToken').value.trim()) { location.href = input; return; }
  state.serverUrl = privateSite ? location.origin : input;
  state.serverToken = $('serverToken').value.trim();
  localStorage.setItem('music-pocket-server',state.serverUrl); localStorage.setItem('music-pocket-token',state.serverToken);
  state.queue = []; renderQueue(); syncQueue();
});
$('viewQueueButton').addEventListener('click', () => selectView('queue'));
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => selectView(tab.dataset.view)));

if (!state.serverUrl) setOffline('Cerca disponible · importació sense configurar');
refresh();
renderQueue();
syncQueue();
setInterval(() => { if (!document.hidden) syncQueue(); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncQueue(); });

