// ===== app.js =====

import { initMap, addMemberPin, flyToMember, getSelectedCoords, clearTempMarker, resetCoords, locateMe, drawArcs } from './map.js';
import { saveCheckin, listenCheckins } from './firebase.js';
import { showIDCard, closeCard, downloadCard } from './card.js';

// Persistent device ID — used to identify this browser across sessions
function getDeviceId() {
    let id = localStorage.getItem('raiku_device_id');
    if (!id) {
        id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('raiku_device_id', id);
    }
    return id;
}

document.addEventListener('DOMContentLoaded', () => {
    initCursor();
    initMap();
    startListening();
    setupMobileMenu();
    typeMapHint('[ CLICK ON MAP TO SELECT YOUR LOCATION ]', 38);
    if (localStorage.getItem('raiku_profile')) {
        document.getElementById('view-card-btn')?.classList.remove('hidden');
    }
});

// ── Terminal typing effect ──────────────────────────────────────────
function typeMapHint(text, speed = 40) {
    const el = document.getElementById('map-hint-text');
    if (!el) return;
    el.textContent = '';
    el.classList.add('typing-active');

    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'terminal-cursor';
    cursor.textContent = '_';
    el.appendChild(cursor);

    const timer = setInterval(() => {
        if (i < text.length) {
            el.insertBefore(document.createTextNode(text[i]), cursor);
            i++;
        } else {
            clearInterval(timer);
            // Keep blinking cursor at end
        }
    }, speed);
}

function startListening() {
    const renderedPins = new Set();
    window.allPins = [];
    window.pinMarkers = {};

    listenCheckins((pins) => {
        // TOTAL ACTIVE = only check-ins from the last 24 hours
        const cutoff = Date.now() - 86400000;
        const recent = pins.filter(p => {
            if (!p.createdAt) return true;
            const ts = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
            return ts.getTime() > cutoff;
        });
        document.getElementById('online-count').textContent = `TOTAL ACTIVE: ${recent.length}`;

        window.allPins = pins;

        pins.forEach((member) => {
            if (!renderedPins.has(member.id)) {
                const isNew = renderedPins.size > 0; // not the initial batch
                const marker = addMemberPin(member, isNew);
                if (marker) window.pinMarkers[member.id] = marker;
                renderedPins.add(member.id);
            }
        });

        renderMembersList(pins.slice(0, 15));
        renderStats(pins);
        drawArcs(pins);
    });
}

// ── Time ago helper ────────────────────────────────────────────────
function timeAgo(createdAt) {
    if (!createdAt) return '';
    const ts = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diff = Date.now() - ts.getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
}

// ── Animated counter ───────────────────────────────────────────────
function animateCount(el, to) {
    const from = parseInt(el.textContent) || 0;
    if (from === to || el.textContent === '—') { el.textContent = to; return; }
    const steps = 20;
    const inc = (to - from) / steps;
    let step = 0, cur = from;
    const t = setInterval(() => {
        step++; cur += inc;
        el.textContent = Math.round(cur);
        if (step >= steps) { el.textContent = to; clearInterval(t); }
    }, 600 / steps);
}

// ── Network stats ──────────────────────────────────────────────────
function renderStats(pins) {
    const cutoff = Date.now() - 86400000;
    const active24 = pins.filter(p => {
        if (!p.createdAt) return true;
        const ts = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
        return ts.getTime() > cutoff;
    });
    const countries = new Set(pins.map(p => p.country).filter(Boolean));

    animateCount(document.getElementById('stat-nodes'),     pins.length);
    animateCount(document.getElementById('stat-countries'), countries.size);
    animateCount(document.getElementById('stat-active24'),  active24.length);
}

// ── Build member list items via DOM API ────────────────────────────
function createMemberItem(m, index) {
    const item = document.createElement('div');
    item.className = 'member-item';
    item.addEventListener('click', () => flyToMember(m));

    // Rank badge
    const rank = document.createElement('div');
    rank.className = 'member-rank';
    rank.textContent = `#${String(m._index + 1).padStart(2, '0')}`;

    const dot = document.createElement('div');
    dot.className = 'member-dot';

    const info = document.createElement('div');
    info.className = 'member-info';

    // Name + streak
    const nameRow = document.createElement('div');
    nameRow.className = 'member-name';
    nameRow.textContent = m.name.toUpperCase();

    if (m.streak && m.streak > 1) {
        const badge = document.createElement('span');
        badge.className = 'streak-badge';
        badge.textContent = `⚡${m.streak}`;
        nameRow.appendChild(badge);
    }

    // Location · time ago
    const metaRow = document.createElement('div');
    metaRow.className = 'member-meta';

    const locSpan = document.createElement('span');
    locSpan.className = 'member-loc';
    locSpan.textContent = `◎ ${m.country || m.city}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'member-time';
    timeSpan.textContent = timeAgo(m.createdAt);

    metaRow.appendChild(locSpan);
    if (timeSpan.textContent) metaRow.appendChild(timeSpan);

    info.appendChild(nameRow);
    info.appendChild(metaRow);
    item.appendChild(rank);
    item.appendChild(dot);
    item.appendChild(info);
    return item;
}

function renderMembersList(members) {
    const list = document.getElementById('members-list');
    list.innerHTML = '';

    if (members.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'loading-text';
        empty.textContent = 'BE THE FIRST!';
        list.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    members.forEach((m, i) => {
        m._index = i;
        frag.appendChild(createMemberItem(m));
    });
    list.appendChild(frag);
}

window.handleCheckin = async function () {
    const name = document.getElementById('input-name').value.trim();
    const city = document.getElementById('input-city').value.trim();
    const contact = document.getElementById('input-contact').value.trim();
    const coords = getSelectedCoords();

    if (!name) { showToast('ENTER YOUR NAME FIRST'); return; }
    if (!city) { showToast('ENTER YOUR CITY FIRST'); return; }
    if (!coords.lat) { showToast('CLICK ON THE MAP OR LOCATE FIRST'); return; }

    const btn = document.getElementById('checkin-btn');
    btn.textContent = '[ SAVING... ]';
    btn.disabled = true;

    const country = window.selectedCountry || city;
    const deviceId = getDeviceId();

    let streak = parseInt(localStorage.getItem('raiku_streak')) || 0;
    const lastActive = localStorage.getItem('raiku_last_active');
    const today = new Date().toDateString();
    if (lastActive !== today) {
        streak += 1;
        localStorage.setItem('raiku_streak', streak);
        localStorage.setItem('raiku_last_active', today);
    }

    const profile = { name, city, contact, country, countryCode: window.selectedCountryCode || '' };
    localStorage.setItem('raiku_profile', JSON.stringify(profile));
    document.getElementById('view-card-btn').classList.remove('hidden');

    try {
        showIDCard({ name, city, contact, country, countryCode: window.selectedCountryCode || '' });

        saveCheckin({ name, city, contact, country, lat: coords.lat, lng: coords.lng, streak, deviceId })
            .catch(err => console.error('Firebase save error:', err));

        clearTempMarker();
        document.getElementById('input-name').value = '';
        document.getElementById('input-city').value = '';
        document.getElementById('input-contact').value = '';
        resetCoords();
    } catch (err) {
        showToast('ERROR OCCURRED');
        console.error(err);
    } finally {
        btn.textContent = '[ ACTIVE → ]';
        btn.disabled = false;
    }
};

window.viewMyCard = function () {
    const profile = JSON.parse(localStorage.getItem('raiku_profile'));
    if (profile) showIDCard(profile);
    else showToast('PLEASE ACTIVE FIRST');
};

window.handleSearch = function () {
    const term = document.getElementById('input-search').value.toLowerCase();
    if (!window.allPins) return;
    if (!term) {
        renderMembersList(window.allPins.slice(0, 15));
        return;
    }
    const filtered = window.allPins.filter(m =>
        m.name.toLowerCase().includes(term) ||
        m.city.toLowerCase().includes(term) ||
        (m.country && m.country.toLowerCase().includes(term))
    );
    renderMembersList(filtered.slice(0, 15));
};

window.locateMe = locateMe;

window.showToast = function (msg, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
};

window.closeCard = closeCard;
window.downloadCard = downloadCard;

window.shareToX = function () {
    const country = window.selectedCountry || 'EARTH';
    const text = encodeURIComponent(`I just activated a new node in ${country.toUpperCase()} on the Raiku World!\n\nJoin the grid: https://raikuworldmap.vercel.app/`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
};

// ── Retro sound system (Web Audio API — no files needed) ───────────
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function playTone(freq, duration, type = 'square', vol = 0.07, startDelay = 0) {
    try {
        const ctx  = getAudioCtx();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
        gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startDelay + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
        osc.start(ctx.currentTime + startDelay);
        osc.stop(ctx.currentTime + startDelay + duration + 0.01);
    } catch (_) {}
}

// Modal open: ascending 3-tone "boot" beep
function playModalOpen() {
    playTone(180, 0.07, 'square',   0.07, 0.00);
    playTone(360, 0.07, 'square',   0.06, 0.08);
    playTone(540, 0.12, 'triangle', 0.05, 0.16);
}

// Link hover: tiny blip (throttled — max 1 per 80ms)
let _lastBlip = 0;
function playHoverBlip() {
    const now = Date.now();
    if (now - _lastBlip < 80) return;
    _lastBlip = now;
    playTone(900, 0.03, 'square', 0.03);
}

// Close: short descending tick
function playModalClose() {
    playTone(400, 0.06, 'square', 0.05, 0.00);
    playTone(220, 0.08, 'square', 0.04, 0.06);
}

// ── Banger articles data ────────────────────────────────────────────
const BANGER_ARTICLES = [
    { url: 'https://x.com/raikucom/status/2056369015811915806', tweetUrl: 'https://x.com/raikucom/status/2056369015811915806', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2053844718673359072', tweetUrl: 'https://x.com/raikucom/status/2053844718673359072', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2048782912716173812', tweetUrl: 'https://x.com/raikucom/status/2048782912716173812', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2051310553558106483', tweetUrl: 'https://x.com/raikucom/status/2051310553558106483', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2046218193148981587', tweetUrl: 'https://x.com/raikucom/status/2046218193148981587', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2043685702882198000', tweetUrl: 'https://x.com/raikucom/status/2043685702882198000', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2038619261606748560', tweetUrl: 'https://x.com/raikucom/status/2038619261606748560', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2036066517394034795', tweetUrl: 'https://x.com/raikucom/status/2036066517394034795', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
    { url: 'https://x.com/raikucom/status/2031024285360251195', tweetUrl: 'https://x.com/raikucom/status/2031024285360251195', title: 'LOADING...', desc: 'Fetching article...', img: '', loaded: false },
];

function buildArticleSlider() {
    const cards = BANGER_ARTICLES.map((a, i) => {
        const imgHtml = a.img
            ? `<div class="bng-img" style="background-image:url('${a.img}')"></div>`
            : a.loaded
                ? `<div class="bng-img bng-img--placeholder"><span class="bng-x-icon">𝕏</span></div>`
                : `<div class="bng-img bng-img--skeleton"></div>`;

        const titleHtml = a.loaded
            ? `<div class="bng-title">${a.title}</div>`
            : `<div class="bng-skeleton-line" style="width:85%;margin-bottom:6px"></div>
               <div class="bng-skeleton-line" style="width:60%"></div>`;

        const descHtml = a.loaded
            ? `<div class="bng-desc">${a.desc}</div>`
            : `<div class="bng-skeleton-line" style="width:100%;margin-top:8px"></div>
               <div class="bng-skeleton-line" style="width:80%;margin-top:5px"></div>`;

        const isActive = i === 0 ? ' bng-card--active' : '';

        return `
        <a class="bng-card${isActive}" href="${a.tweetUrl}" target="_blank" rel="noopener noreferrer" data-index="${i}">
            <div class="bng-win-bar">
                <div class="bng-win-dots">
                    <span class="bng-dot-r"></span>
                    <span class="bng-dot-y"></span>
                    <span class="bng-dot-g"></span>
                </div>
                <span class="bng-win-title">ARTICLE_${String(i + 1).padStart(2, '0')}.md</span>
            </div>
            ${imgHtml}
            <div class="bng-body">
                <div class="bng-author">@raikucom</div>
                ${titleHtml}
                ${descHtml}
                ${a.loaded ? '<div class="bng-read">READ ARTICLE ▸</div>' : ''}
            </div>
        </a>`;
    }).join('');

    return `
    <div class="bng-wrap">
        <div class="bng-header">
            <span class="bng-label">// BANGER ARTICLE</span>
            <div class="bng-nav">
                <button class="bng-btn" id="bng-prev" onclick="slideArticle(-1)">◀</button>
                <span class="bng-counter" id="bng-counter">1 / ${BANGER_ARTICLES.length}</span>
                <button class="bng-btn" id="bng-next" onclick="slideArticle(1)">▶</button>
            </div>
        </div>
        <div class="bng-track-wrap">
            <div class="bng-track" id="bng-track">
                ${cards}
            </div>
        </div>
    </div>`;
}

// ── Microlink API — auto-fetch article metadata ─────────────────────
async function loadArticleData() {
    // Fetch all in parallel via Microlink (free, no API key)
    await Promise.all(BANGER_ARTICLES.map(async (article, i) => {
        if (article.loaded) return;
        try {
            const res  = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(article.url)}&screenshot=false`);
            const json = await res.json();
            if (json.status === 'success') {
                article.title  = json.data.title       || 'Raiku Article';
                article.desc   = json.data.description || 'Read the full article on X.';
                article.img    = json.data.image?.url  || '';
                article.loaded = true;
            } else {
                article.title  = 'Raiku Article';
                article.desc   = 'Read the full article on X.';
                article.loaded = true;
            }
        } catch (_) {
            article.title  = 'Raiku Article';
            article.desc   = 'Read the full article on X.';
            article.loaded = true;
        }
    }));

    // Re-render slider with fetched data
    const body = document.querySelector('.nmd-body');
    if (body && document.getElementById('bng-track')) {
        const curIndex = _bngIndex;
        body.innerHTML = buildArticleSlider();
        _bngIndex = curIndex;
        _applySlide();
        // Re-attach hover blips
        body.querySelectorAll('a').forEach(a => a.addEventListener('mouseenter', playHoverBlip));
    }
}

// ── Slider controls ─────────────────────────────────────────────────
let _bngIndex = 0;

window.slideArticle = function (dir) {
    const total = BANGER_ARTICLES.length;
    _bngIndex = (_bngIndex + dir + total) % total;
    _applySlide();
    playHoverBlip();
};

window.goArticle = function (idx) {
    _bngIndex = idx;
    _applySlide();
    playHoverBlip();
};

function _applySlide() {
    const track   = document.getElementById('bng-track');
    const counter = document.getElementById('bng-counter');
    if (!track) return;

    // Card width = first card's offsetWidth + gap (14px)
    const firstCard = track.querySelector('.bng-card');
    const cardW = firstCard ? firstCard.offsetWidth + 14 : 0;
    // Offset by (index - 1) so active card sits in the center slot
    const offset = Math.max(0, (_bngIndex - 1) * cardW);
    track.style.transform = `translateX(-${offset}px)`;

    // Highlight active card
    track.querySelectorAll('.bng-card').forEach((c, i) => {
        c.classList.toggle('bng-card--active', i === _bngIndex);
    });

    if (counter) counter.textContent = `${_bngIndex + 1} / ${BANGER_ARTICLES.length}`;
}

// ── Nav modal content ──────────────────────────────────────────────
const NAV_CONTENT = {
    'OFFICIAL LINKS': {
        online: true,
        html: `<div class="nmd-platform-grid">
            <a class="nmd-platform-card" href="https://www.raiku.com" target="_blank" rel="noopener noreferrer">
                <span class="nmd-dot"></span>
                <span class="nmd-platform-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                </span>
                <span class="nmd-platform-name">WEBSITE</span>
                <span class="nmd-platform-url">raiku.com</span>
            </a>
            <a class="nmd-platform-card" href="https://x.com/raikucom" target="_blank" rel="noopener noreferrer">
                <span class="nmd-dot"></span>
                <span class="nmd-platform-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                </span>
                <span class="nmd-platform-name">TWITTER / X</span>
                <span class="nmd-platform-url">@raikucom</span>
            </a>
            <a class="nmd-platform-card" href="https://discord.gg/raikucom" target="_blank" rel="noopener noreferrer">
                <span class="nmd-dot"></span>
                <span class="nmd-platform-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.1.123 18.14.149 18.16a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                </span>
                <span class="nmd-platform-name">DISCORD</span>
                <span class="nmd-platform-url">discord.gg/raikucom</span>
            </a>
            <a class="nmd-platform-card" href="https://t.me/raikucom" target="_blank" rel="noopener noreferrer">
                <span class="nmd-dot"></span>
                <span class="nmd-platform-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                </span>
                <span class="nmd-platform-name">TELEGRAM</span>
                <span class="nmd-platform-url">t.me/raikucom</span>
            </a>
            <a class="nmd-platform-card" href="https://linkedin.com/company/raikucom" target="_blank" rel="noopener noreferrer">
                <span class="nmd-dot"></span>
                <span class="nmd-platform-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                </span>
                <span class="nmd-platform-name">LINKEDIN</span>
                <span class="nmd-platform-url">linkedin.com/company/raikucom</span>
            </a>
        </div>`
    },

    'DOCS': {
        online: true,
        html: `<div class="nmd-docs-wrap">
            <div class="nmd-docs-sections">
                <div class="nmd-docs-label">// DOCUMENTATION INDEX</div>

                <a class="nmd-docs-item" href="https://docs.raiku.com/" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Introduction
                </a>

                <div class="nmd-docs-label" style="margin-top:10px;">// OVERVIEW</div>
                <a class="nmd-docs-item" href="https://docs.raiku.com/overview/raiku-products" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Raiku Products
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/overview/just-in-time-jit-transactions" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Just-in-Time (JIT) Transactions
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/overview/ahead-of-time-aot-transactions" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Ahead-of-Time (AOT) Transactions
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/overview/compute-unit-marketplace" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Compute Unit Marketplace
                </a>

                <div class="nmd-docs-label" style="margin-top:10px;">// GUIDES</div>
                <a class="nmd-docs-item" href="https://docs.raiku.com/milestones-and-roadmap" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Milestones &amp; Roadmap
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/builders" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Builders
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/validator-quickstart" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Validator Quickstart
                </a>

                <div class="nmd-docs-label" style="margin-top:10px;">// REFERENCE</div>
                <a class="nmd-docs-item" href="https://docs.raiku.com/features" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Features
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/configuration" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Configuration
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/troubleshooting" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>Troubleshooting
                </a>
                <a class="nmd-docs-item" href="https://docs.raiku.com/faqs" target="_blank" rel="noopener noreferrer">
                    <span class="nmd-arrow">▸</span>FAQs
                </a>
            </div>
            <div class="nmd-docs-panel">
                <div class="nmd-docs-panel-title">◈ RAIKU DOCS</div>
                <div class="nmd-docs-panel-desc">
                    Official documentation covering the Raiku network, infrastructure, and how to get started.
                </div>
                <a class="nmd-docs-btn" href="https://docs.raiku.com/" target="_blank" rel="noopener noreferrer">
                    OPEN DOCS ▸
                </a>
            </div>
        </div>`
    },

    'BANGER ARTICLE': {
        online: true,
        html: buildArticleSlider()
    }
};

window.openNavModal = function (name) {
    document.getElementById('nav-modal-name').textContent = name;

    const content    = NAV_CONTENT[name];
    const body       = document.querySelector('.nmd-body');
    const statusPill = document.querySelector('.nmd-status-pill');

    if (content) {
        body.innerHTML = content.html;
        if (content.online) {
            statusPill.textContent = '● ONLINE';
            statusPill.classList.add('nmd-status-online');
        } else {
            statusPill.textContent = '● OFFLINE';
            statusPill.classList.remove('nmd-status-online');
        }
    } else {
        body.innerHTML = '<span class="nmd-offline-msg">MODULE_NOT_FOUND &nbsp;·&nbsp; PLEASE CHECK BACK LATER</span>';
        statusPill.textContent = '● OFFLINE';
        statusPill.classList.remove('nmd-status-online');
    }

    // Reset article slider index when opening
    _bngIndex = 0;

    // Auto-fetch article data if opening banger article
    if (name === 'BANGER ARTICLE') {
        loadArticleData();
    }

    // Attach hover blip to all links inside the modal body
    body.querySelectorAll('a').forEach(a => {
        a.addEventListener('mouseenter', playHoverBlip);
    });

    const overlay = document.getElementById('nav-modal-overlay');
    const modal   = document.getElementById('nav-modal');
    overlay.classList.remove('hidden');
    modal.classList.remove('nmd-enter');
    void modal.offsetWidth;
    modal.classList.add('nmd-enter');

    playModalOpen();
};

window.closeNavModal = function () {
    playModalClose();
    document.getElementById('nav-modal-overlay').classList.add('hidden');
};

// Keyboard navigation — arrow keys for slider, ESC to close modal
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('nav-modal-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    if (e.key === 'ArrowRight') { slideArticle(1);  e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { slideArticle(-1); e.preventDefault(); }
    if (e.key === 'Escape')     { window.closeNavModal(); }
});

// ── Neon Ring Cursor (native cursor kept) ────────────────────────────────
function initCursor() {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const ring = document.getElementById('cursor-ring');
    if (!ring) return;

    let mx = -200, my = -200;
    let rx = -200, ry = -200;

    function tick() {
        // Ring follows with slight lerp lag for smooth feel
        rx += (mx - rx) * 0.15;
        ry += (my - ry) * 0.15;
        ring.style.left = rx + 'px';
        ring.style.top  = ry + 'px';
        requestAnimationFrame(tick);
    }

    document.addEventListener('mousemove', (e) => {
        mx = e.clientX;
        my = e.clientY;
    });

    // Hover — ring tightens on interactive elements
    const hoverSel = 'a, button, [onclick], .nav-item, .member-item, .bng-card, input, textarea, [contenteditable], label';
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(hoverSel)) document.body.classList.add('cursor-hover');
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest(hoverSel)) document.body.classList.remove('cursor-hover');
    });

    document.addEventListener('mousedown', () => document.body.classList.add('cursor-click'));
    document.addEventListener('mouseup',   () => document.body.classList.remove('cursor-click'));

    document.addEventListener('mouseleave', () => { ring.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { ring.style.opacity = '1'; });

    tick();
}

function setupMobileMenu() {
    const hamburger = document.getElementById('hamburger-btn');
    const mobileNav = document.getElementById('mobile-nav');
    if (!hamburger || !mobileNav) return;

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileNav.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
            mobileNav.classList.add('hidden');
        }
    });
}
