// ===== card.js =====

function generateMemberID() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return `WM-${code.slice(0, 4)}-${code.slice(4)}`;
}

// Convert ISO 3166-1 alpha-2 code to flag emoji (no API call needed)
// e.g. "VN" → "🇻🇳", "US" → "🇺🇸"
function getFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '';
    const upper = countryCode.toUpperCase();
    // Regional indicator symbols: A = 0x1F1E6, Z = 0x1F1FF
    return Array.from(upper).map(c =>
        String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
    ).join('');
}

export function showIDCard(data) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const idEl = document.getElementById('card-id');
    if (idEl.textContent === '—') {
        idEl.textContent = generateMemberID();
    }

    document.getElementById('card-name').textContent = data.name.toUpperCase();

    const countryDisplay = (data.country || data.city).toUpperCase();
    const locEl = document.getElementById('card-location');

    // Use ISO code to get emoji flag instantly — no API call needed
    const flag = getFlag(data.countryCode || '');
    locEl.textContent = flag ? `${flag} ${countryDisplay}` : `📍 ${countryDisplay}`;

    const dateEl = document.getElementById('card-date');
    if (dateEl.textContent === '—') {
        dateEl.textContent = dateStr;
    }

    if (data.contact) {
        if (data.contact.includes('#')) {
            document.getElementById('card-discord').textContent = data.contact;
        } else {
            document.getElementById('card-x').textContent = data.contact;
        }
    }

    document.getElementById('card-overlay').classList.remove('hidden');
    initTilt(document.getElementById('card-overlay'), document.getElementById('id-card'));
}

window.handleAvatar = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        document.getElementById('card-avatar').src = e.target.result;
        document.getElementById('card-avatar').style.display = 'block';
        document.getElementById('avatar-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
};

let tiltInit = false;
function initTilt(overlay, card) {
    if (tiltInit) return;
    tiltInit = true;

    overlay.addEventListener('mousemove', (e) => {
        const rect = overlay.getBoundingClientRect();
        const rotateX = (((e.clientY - rect.top)  / rect.height) - 0.5) * -20;
        const rotateY = (((e.clientX - rect.left) / rect.width)  - 0.5) *  20;
        card.style.transform = `perspective(1000px) scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    overlay.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.5s ease';
        card.style.transform = 'perspective(1000px) scale(1) rotateX(0deg) rotateY(0deg)';
    });

    overlay.addEventListener('mouseenter', () => {
        card.style.transition = 'none';
    });
}

export function closeCard() {
    document.getElementById('card-overlay').classList.add('hidden');
}

export async function downloadCard() {
    const cardEl = document.getElementById('id-card');
    const btn = document.getElementById('btn-download');

    btn.textContent = 'SAVING...';
    btn.disabled = true;

    // ── Step 1: collect all contenteditable fields, strip the attribute ──
    // This is the only reliable way to kill the ::after '_' cursor in html2canvas
    const editables = cardEl.querySelectorAll('[contenteditable]');
    editables.forEach(el => el.removeAttribute('contenteditable'));

    // ── Step 2: hide the action buttons bar + close button in header ──
    const actionsBar  = cardEl.querySelector('.card-actions');
    const closeBtn    = cardEl.querySelector('.card-close');
    const prevActions = actionsBar ? actionsBar.style.display : null;
    const prevClose   = closeBtn   ? closeBtn.style.display   : null;
    if (actionsBar) actionsBar.style.display = 'none';
    if (closeBtn)   closeBtn.style.display   = 'none';

    // ── Step 3: replace CSS-gradient barcode with real <canvas> ──
    // html2canvas cannot reliably render repeating-linear-gradient with CSS vars,
    // so we draw the exact same stripe pattern onto a real canvas element.
    const barcodeWrap  = cardEl.querySelector('.card-barcode');
    const barcodeInner = cardEl.querySelector('.barcode-inner');
    let barcodeCanvas  = null;
    if (barcodeWrap && barcodeInner) {
        const W = barcodeWrap.offsetWidth || 360;
        const H = barcodeWrap.offsetHeight || 30;
        barcodeCanvas = document.createElement('canvas');
        barcodeCanvas.width  = W * 2;   // 2× for sharpness
        barcodeCanvas.height = H * 2;
        barcodeCanvas.style.cssText = `width:${W}px;height:${H}px;display:block;`;
        const ctx = barcodeCanvas.getContext('2d');
        // Stripe pattern matching CSS: #d6ff70 2px | gap 2px | #C0FF38 1px | gap 4px  (repeat 9px)
        const stripes = [
            { color: '#d6ff70', w: 4  },   // 2px × scale2
            { color: null,      w: 4  },
            { color: '#C0FF38', w: 2  },   // 1px × scale2
            { color: null,      w: 8  },   // 4px × scale2
        ];
        let x = 0;
        while (x < barcodeCanvas.width) {
            for (const seg of stripes) {
                if (seg.color) {
                    ctx.fillStyle = seg.color;
                    ctx.fillRect(x, 0, seg.w, barcodeCanvas.height);
                }
                x += seg.w;
            }
        }
        // Swap out the inner div
        barcodeInner.style.display = 'none';
        barcodeWrap.appendChild(barcodeCanvas);
    }

    // ── Step 4: hide custom cursor elements ──
    const cursorArrow = document.getElementById('cursor-arrow');
    if (cursorArrow) cursorArrow.style.display = 'none';
    const trailDots = document.querySelectorAll('.cursor-trail');
    trailDots.forEach(el => el.style.display = 'none');

    // Wait two frames for DOM to repaint cleanly
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
        if (!window.html2canvas) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        }

        const canvas = await html2canvas(cardEl, {
            backgroundColor: '#05080d',
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            onclone: (doc) => {
                const s = doc.createElement('style');
                s.textContent = `
                    [contenteditable]::after { display:none!important; content:none!important; }
                    .card-actions { display:none!important; }
                    .card-close   { display:none!important; }
                `;
                doc.head.appendChild(s);
            }
        });

        const link = document.createElement('a');
        const name = document.getElementById('card-name').textContent.trim().toLowerCase().replace(/\s+/g, '-') || 'member';
        link.download = `worldmap-card-${name}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        window.showToast('CARD SAVED ✓');
    } catch (err) {
        console.error(err);
        window.showToast('DOWNLOAD FAILED');
    } finally {
        // ── Restore everything ──
        editables.forEach(el => el.setAttribute('contenteditable', 'true'));
        if (actionsBar)  actionsBar.style.display  = prevActions ?? '';
        if (closeBtn)    closeBtn.style.display    = prevClose   ?? '';
        if (barcodeCanvas) barcodeCanvas.remove();
        if (barcodeInner)  barcodeInner.style.display = '';
        if (cursorArrow) cursorArrow.style.display = '';
        trailDots.forEach(el => el.style.display = '');

        btn.textContent = 'DOWNLOAD ↓';
        btn.disabled = false;
    }
}


function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}
