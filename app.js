/**
 * BD Gallery — app.js
 * API-backed: multipart upload, JWT auth, Cloudinary URLs, video support.
 */

const API = 'http://localhost:5000/api';

/* ================================================================
   AUTH GUARD — redirect to login if no token
   ================================================================ */
const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

function authHeaders() {
  return { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

/* ================================================================
   STATE
   ================================================================ */
const state = {
  photos: [],
  selectedId: null,
  currentAlbum: 'all',
  layout: 'desktop',
  dark: false,
  sortOrder: 'newest',
  filterDateFrom: null,
  filterDateTo: null,
};

/* ================================================================
   GALLERY — core logic
   ================================================================ */
const Gallery = {

  /* ── LOAD FROM BACKEND ── */
  async loadPhotos() {
    try {
      const res = await fetch(`${API}/media`, { headers: authHeaders() });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      state.photos = data.map(m => ({
        id: m._id,
        src: m.type === 'video' ? m.thumbnailUrl : m.url,
        videoUrl: m.type === 'video' ? m.url : null,
        name: m.filename,
        caption: m.filename.replace(/\.[^.]+$/, ''),
        location: '',
        gear: '',
        album: 'all',
        date: m.createdAt,
        dateLabel: new Date(m.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
        featured: false,
        type: m.type,
        size: m.size,
      }));
      if (state.photos.length > 0) state.photos[0].featured = true;
      Gallery.render();
      Gallery.updateStats();
      Gallery.refreshRecent();
      Gallery.loadStorageInfo();
    } catch (err) {
      UI.toast('Failed to load media');
      console.error(err);
    }
  },

  /* ── STORAGE INFO ── */
  async loadStorageInfo() {
    try {
      const res = await fetch(`${API}/media/storage`, { headers: authHeaders() });
      const data = await res.json();
      const usedGB = (data.usedStorage / (1024 ** 3)).toFixed(2);
      const limitGB = (data.storageLimit / (1024 ** 3)).toFixed(0);
      document.getElementById('storage-display').textContent = `${usedGB} GB / ${limitGB} GB`;
    } catch {}
  },

  /* ── UPLOAD FILES ── */
  async handleFiles(files) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) { UI.toast(`Skipped "${file.name}" — unsupported type`); continue; }
      if (isImage && file.size > 10 * 1024 * 1024) { UI.toast(`"${file.name}" exceeds 10MB image limit`); continue; }
      if (isVideo && file.size > 100 * 1024 * 1024) { UI.toast(`"${file.name}" exceeds 100MB video limit`); continue; }

      UI.toast(`Uploading "${file.name}"…`);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`${API}/media/upload`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
        });
        if (res.status === 401) { logout(); return; }
        const media = await res.json();
        if (!res.ok) { UI.toast(media.message || 'Upload failed'); continue; }

        const photo = {
          id: media._id,
          src: media.type === 'video' ? media.thumbnailUrl : media.url,
          videoUrl: media.type === 'video' ? media.url : null,
          name: media.filename,
          caption: document.getElementById('caption-input')?.value.trim() || media.filename.replace(/\.[^.]+$/, ''),
          location: document.getElementById('location-input')?.value.trim() || '',
          gear: document.getElementById('gear-input')?.value.trim() || '',
          album: document.getElementById('album-select')?.value || 'all',
          date: media.createdAt,
          dateLabel: new Date(media.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
          featured: state.photos.length === 0,
          type: media.type,
          size: media.size,
        };

        state.photos.unshift(photo);
        Gallery.render();
        Gallery.updateStats();
        Gallery.addToRecent(photo);
        Gallery.loadStorageInfo();
        UI.toast(`"${photo.caption}" uploaded`);

        if (document.getElementById('caption-input')) document.getElementById('caption-input').value = '';
        if (document.getElementById('location-input')) document.getElementById('location-input').value = '';
        if (document.getElementById('gear-input')) document.getElementById('gear-input').value = '';
      } catch (err) {
        UI.toast(`Upload error: ${err.message}`);
      }
    }
  },

  /* ── DRAG & DROP ── */
  onDragOver(e) {
    e.preventDefault();
    document.getElementById('upload-zone').classList.add('drag-over');
  },
  onDragLeave() {
    document.getElementById('upload-zone').classList.remove('drag-over');
  },
  onDrop(e) {
    e.preventDefault();
    document.getElementById('upload-zone').classList.remove('drag-over');
    Gallery.handleFiles(e.dataTransfer.files);
  },

  /* ── RENDER ── */
  render() {
    const grid       = document.getElementById('main-grid');
    const emptyState = document.getElementById('empty-state');
    const fsWrap     = document.getElementById('fs-wrap');
    const filmstrip  = document.getElementById('filmstrip');

    const photos = Gallery.getFilteredPhotos();

    if (photos.length === 0) {
      emptyState.style.display = '';
      grid.style.display       = 'none';
      fsWrap.style.display     = 'none';
      return;
    }

    emptyState.style.display = 'none';
    grid.style.display       = '';
    fsWrap.style.display     = '';

    grid.innerHTML = photos.map((p, i) => Gallery.cardHTML(p, i)).join('');

    filmstrip.innerHTML = photos.map(p => `
      <div class="thumb ${p.id === state.selectedId ? 'active' : ''}"
           onclick="Gallery.selectPhoto('${p.id}')"
           title="${p.caption}">
        <img src="${p.src}" alt="${p.caption}" loading="lazy" />
        ${p.type === 'video' ? '<div class="video-badge">▶</div>' : ''}
      </div>
    `).join('');
  },

  cardHTML(photo) {
    const isSelected = photo.id === state.selectedId;
    const isFeatured = photo.featured;
    const isVideo    = photo.type === 'video';

    let gearHTML = '';
    if (photo.gear) {
      gearHTML = `
        <div class="card-gear">
          <div class="gear-row"><span class="gear-key">Gear</span>  ${photo.gear}</div>
          ${photo.location ? `<div class="gear-row"><span class="gear-key">Lctn</span>  ${photo.location}</div>` : ''}
          <div class="gear-row"><span class="gear-key">Date</span>  ${photo.dateLabel}</div>
        </div>`;
    }

    const mediaEl = isVideo ? `
      <img src="${photo.src}" alt="${photo.caption}" loading="lazy" class="card-thumb" />
      <video src="${photo.videoUrl}" muted loop preload="none" class="card-video"
             onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0;"></video>
      <div class="video-play-icon">▶</div>
    ` : `<img src="${photo.src}" alt="${photo.caption}" loading="lazy" />`;

    return `
      <div class="card ${isSelected ? 'selected' : ''} ${isFeatured ? 'featured' : ''} ${isVideo ? 'is-video' : ''}"
           id="card-${photo.id}"
           onclick="Gallery.selectPhoto('${photo.id}')"
           ondblclick="Gallery.openLightbox('${photo.id}')">
        ${mediaEl}
        ${isFeatured ? `
          <div class="feat-tag">
            <div class="feat-name">${photo.caption}</div>
            ${photo.location ? `<div class="feat-sub">${photo.location}</div>` : ''}
          </div>
          <div class="feat-badge">Featured</div>
        ` : ''}
        ${gearHTML}
        <div class="card-meta">
          <div class="card-loc">${photo.location || photo.caption}</div>
          <div class="card-date">${photo.dateLabel}${photo.gear ? ' · ' + photo.gear.split('·')[0].trim() : ''}</div>
        </div>
      </div>`;
  },

  /* ── SELECT ── */
  selectPhoto(id) {
    state.selectedId = (state.selectedId === id) ? null : id;
    Gallery.render();
    Gallery.updateStats();
  },

  getSelected() {
    return state.photos.find(p => p.id === state.selectedId) || null;
  },

  /* ── FILTER / SORT ── */
  getFilteredPhotos() {
    let photos = [...state.photos];
    if (state.currentAlbum !== 'all') photos = photos.filter(p => p.album === state.currentAlbum);
    if (state.filterDateFrom) {
      const from = new Date(state.filterDateFrom);
      photos = photos.filter(p => new Date(p.date) >= from);
    }
    if (state.filterDateTo) {
      const to = new Date(state.filterDateTo);
      to.setHours(23,59,59,999);
      photos = photos.filter(p => new Date(p.date) <= to);
    }
    if (state.sortOrder === 'newest') photos.sort((a, b) => new Date(b.date) - new Date(a.date));
    else if (state.sortOrder === 'oldest') photos.sort((a, b) => new Date(a.date) - new Date(b.date));
    else if (state.sortOrder === 'name') photos.sort((a, b) => a.caption.localeCompare(b.caption));
    return photos;
  },

  filterAlbum(album, tabEl) {
    state.currentAlbum = album;
    document.querySelectorAll('.sn-tab').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');
    document.querySelectorAll('.sv-item').forEach(el => {
      el.classList.toggle('active', el.textContent.toLowerCase().trim() === album ||
        (album === 'all' && el.textContent.toLowerCase().trim() === 'all'));
    });
    Gallery.render();
  },

  toggleFilter() { document.getElementById('filter-bar').classList.toggle('open'); },

  applyFilter() {
    state.filterDateFrom = document.getElementById('filter-date-from').value || null;
    state.filterDateTo   = document.getElementById('filter-date-to').value   || null;
    Gallery.render();
  },

  clearFilter() {
    state.filterDateFrom = null;
    state.filterDateTo   = null;
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value   = '';
    Gallery.render();
  },

  toggleSort() {
    const orders = ['newest', 'oldest', 'name'];
    state.sortOrder = orders[(orders.indexOf(state.sortOrder) + 1) % orders.length];
    UI.toast(`Sorted: ${state.sortOrder}`);
    Gallery.render();
  },

  /* ── LAYOUT ── */
  setLayout(v) {
    state.layout = v;
    const grid = document.getElementById('main-grid');
    grid.className = `main ${v}`;
    document.getElementById('lt-desk').classList.toggle('active', v === 'desktop');
    document.getElementById('lt-mob').classList.toggle('active', v === 'mobile');
  },

  cropSelected(ratio) {
    const card = state.selectedId ? document.getElementById(`card-${state.selectedId}`) : null;
    if (card) {
      const ratioMap = { '16:9': '16/9', '1:1': '1/1', '4:5': '4/5', 'free': null };
      card.style.aspectRatio = ratioMap[ratio] || '';
    }
  },

  /* ── SHARE ── */
  shareSelected(dest) {
    const photo = Gallery.getSelected();
    if (!photo) { UI.toast('Select a photo first'); UI.closeAll(); return; }
    const actions = {
      link:      () => { navigator.clipboard?.writeText(photo.src); UI.toast('Link copied to clipboard'); },
      instagram: () => UI.toast(`Opening Instagram with "${photo.caption}"…`),
      download:  () => Gallery.downloadPhoto(photo),
      email:     () => UI.toast(`Opening email with "${photo.caption}"…`),
    };
    (actions[dest] || (() => UI.toast('Sharing…')))();
    UI.closeAll();
  },

  downloadPhoto(photo) {
    const a = document.createElement('a');
    a.href = photo.videoUrl || photo.src;
    a.download = `${photo.caption.replace(/\s+/g, '_')}`;
    a.target = '_blank';
    a.click();
    UI.toast(`Downloading "${photo.caption}"`);
  },

  /* ── LIGHTBOX ── */
  openLightbox(id) {
    const photo = state.photos.find(p => p.id === id);
    if (!photo) return;
    state.selectedId = id;

    const lbImg = document.getElementById('lb-img');
    const lbVid = document.getElementById('lb-video');

    if (photo.type === 'video' && photo.videoUrl) {
      if (lbImg) lbImg.style.display = 'none';
      if (lbVid) {
        lbVid.src = photo.videoUrl;
        lbVid.style.display = '';
        lbVid.play();
      }
    } else {
      if (lbVid) { lbVid.pause(); lbVid.style.display = 'none'; }
      if (lbImg) { lbImg.src = photo.src; lbImg.alt = photo.caption; lbImg.style.display = ''; }
    }

    document.getElementById('lb-meta').textContent =
      [photo.caption, photo.location, photo.gear, photo.dateLabel].filter(Boolean).join(' · ');

    document.getElementById('lightbox').classList.add('open');
    Gallery.render();
  },

  closeLightbox(e) {
    if (e && e.target !== document.getElementById('lightbox') &&
        !e.target.classList.contains('lb-close') &&
        !e.target.closest('.lb-close')) return;
    const lbVid = document.getElementById('lb-video');
    if (lbVid) lbVid.pause();
    document.getElementById('lightbox').classList.remove('open');
  },

  lightboxCrop()     { const p = Gallery.getSelected(); if (p) Gallery.cropSelected('16:9'); },
  lightboxDownload() { const p = Gallery.getSelected(); if (p) Gallery.downloadPhoto(p); },
  lightboxShare()    { const p = Gallery.getSelected(); if (p) Gallery.shareSelected('link'); },

  /* ── DELETE ── */
  async deleteSelected() {
    const photo = Gallery.getSelected();
    if (!photo) { UI.toast('Select a photo first'); return; }
    if (!confirm(`Delete "${photo.caption}"?`)) return;

    try {
      const res = await fetch(`${API}/media/${photo.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { UI.toast('Delete failed'); return; }

      state.photos = state.photos.filter(p => p.id !== photo.id);
      state.selectedId = null;
      if (photo.featured && state.photos.length > 0) state.photos[0].featured = true;

      const lbVid = document.getElementById('lb-video');
      if (lbVid) lbVid.pause();
      document.getElementById('lightbox').classList.remove('open');
      Gallery.render();
      Gallery.updateStats();
      Gallery.refreshRecent();
      Gallery.loadStorageInfo();
      UI.toast(`"${photo.caption}" deleted`);
    } catch (err) {
      UI.toast('Delete error');
    }
  },

  /* ── STATS ── */
  updateStats() {
    const total    = state.photos.length;
    const albums   = new Set(state.photos.map(p => p.album)).size;
    const selected = Gallery.getSelected();
    document.getElementById('photo-count-display').textContent = total;
    document.getElementById('stat-total').textContent    = total;
    document.getElementById('stat-albums').textContent   = albums || 0;
    document.getElementById('stat-selected').textContent = selected ? selected.caption : 'None';
  },

  /* ── RECENT UPLOADS ── */
  addToRecent(photo) {
    const grid  = document.getElementById('recent-grid');
    const empty = grid.querySelector('.recent-empty');
    if (empty) empty.remove();
    const thumbs = grid.querySelectorAll('.r-thumb');
    if (thumbs.length >= 6) thumbs[0].remove();
    const div = document.createElement('div');
    div.className = 'r-thumb';
    div.title = photo.caption;
    div.onclick = () => Gallery.openLightbox(photo.id);
    div.innerHTML = `<img src="${photo.src}" alt="${photo.caption}" loading="lazy" />`;
    grid.appendChild(div);
  },

  refreshRecent() {
    const grid = document.getElementById('recent-grid');
    grid.innerHTML = '';
    const recent = [...state.photos].slice(0, 6);
    if (recent.length === 0) { grid.innerHTML = '<div class="recent-empty">No uploads yet</div>'; return; }
    recent.forEach(p => Gallery.addToRecent(p));
  },
};

/* ================================================================
   UI
   ================================================================ */
const UI = {
  toggleDark(e) {
    if (e) e.stopPropagation();
    state.dark = !state.dark;
    document.body.classList.toggle('dark', state.dark);
    document.getElementById('icon-moon').style.display = state.dark ? 'none' : '';
    document.getElementById('icon-sun').style.display  = state.dark ? ''     : 'none';
  },

  toast(msg, duration = 2400) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
  },

  togglePop(id, e) {
    if (e) e.stopPropagation();
    const el  = document.getElementById(id);
    const was = el.classList.contains('open');
    UI.closeAll();
    if (!was) el.classList.add('open');
  },

  closeAll(e) {
    if (e && (e.target.closest('.pw') || e.target.closest('.pop'))) return;
    document.querySelectorAll('.pop').forEach(p => p.classList.remove('open'));
  },
};

/* ================================================================
   KEYBOARD SHORTCUTS
   ================================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('lightbox').classList.contains('open')) {
      const lbVid = document.getElementById('lb-video');
      if (lbVid) lbVid.pause();
      document.getElementById('lightbox').classList.remove('open');
    } else {
      state.selectedId = null;
      Gallery.render();
      Gallery.updateStats();
    }
    UI.closeAll();
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') &&
      !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
    Gallery.deleteSelected();
  }

  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
      !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
    const photos = Gallery.getFilteredPhotos();
    if (!photos.length) return;
    const idx  = photos.findIndex(p => p.id === state.selectedId);
    const next = e.key === 'ArrowRight'
      ? photos[(idx + 1) % photos.length]
      : photos[(idx - 1 + photos.length) % photos.length];
    state.selectedId = next.id;
    Gallery.render();
    Gallery.updateStats();
    if (document.getElementById('lightbox').classList.contains('open')) Gallery.openLightbox(next.id);
  }

  if (e.key === 'd' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
    UI.toggleDark();
  }
});

/* ================================================================
   GLOBAL DRAG & DROP
   ================================================================ */
document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('drag-over');
});
document.body.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !document.getElementById('upload-zone').contains(e.relatedTarget)) {
    document.getElementById('upload-zone').classList.remove('drag-over');
  }
});
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  Gallery.handleFiles(e.dataTransfer.files);
});

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  Gallery.loadPhotos();
  Gallery.updateStats();
});
