// ===== map.js (Leaflet + CartoDB Dark Matter) =====

let map = null;
let selectedLat = null;
let selectedLng = null;
let tempMarker  = null;
let arcsLayer   = L.layerGroup();

export function initMap() {
    map = L.map('map', {
        center: [20, 70],
        zoom: 3,
        minZoom: 2,
        maxZoom: 18,
        maxBounds: [[-90, -180], [90, 180]],
        maxBoundsViscosity: 1.0,
        worldCopyJump: false,
        zoomControl: true,
        attributionControl: false
    });

    // ESRI World Street Map — English labels, streets from zoom 6, free & no API key
    // Note: ESRI uses {z}/{y}/{x} tile order (not the standard {z}/{x}/{y})
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        noWrap: true,
        bounds: [[-90, -180], [90, 180]]
    }).addTo(map);

    map.on('click', onMapClick);
    arcsLayer.addTo(map);
    return map;
}

function onMapClick(e) {
    selectedLat = parseFloat(e.latlng.lat.toFixed(4));
    selectedLng = parseFloat(e.latlng.lng.toFixed(4));

    document.getElementById('coord-text').textContent =
        `LAT: ${selectedLat}  LNG: ${selectedLng}`;

    const locDisplay = document.getElementById('location-display');
    const locText    = document.getElementById('location-text');
    locDisplay.classList.remove('hidden');
    locText.textContent = 'LOCATING...';
    window.selectedCountry = 'Unknown';

    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${selectedLat}&lon=${selectedLng}&zoom=3&addressdetails=1&accept-language=en`)
        .then(r => r.json())
        .then(data => {
            const country     = data.address?.country ?? `${selectedLat}°, ${selectedLng}°`;
            const countryCode = (data.address?.country_code ?? '').toUpperCase(); // e.g. "VN"
            locText.textContent       = country.toUpperCase();
            window.selectedCountry     = country;
            window.selectedCountryCode = countryCode; // ISO 3166-1 alpha-2
        })
        .catch(() => { locText.textContent = `${selectedLat}°, ${selectedLng}°`; });

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([selectedLat, selectedLng], {
        icon: createPinIcon('#ffffff', 'rgba(255,255,255,0.5)')
    }).addTo(map);
}

function createPinIcon(color = '#C0FF38', glowColor = 'rgba(192,255,56,0.4)', isNew = false) {
    return L.divIcon({
        className: '',
        html: `<div class="${isNew ? 'pulse-icon pin-new' : 'pulse-icon'}" style="
            width:14px;height:14px;
            background:${color};
            border-radius:50%;
            border:2px solid rgba(255,255,255,0.8);
            box-shadow:0 0 12px ${glowColor};
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
}

export function addMemberPin(member, isNew = false) {
    if (!map) return null;

    const marker = L.marker([member.lat, member.lng], {
        icon: createPinIcon('#C0FF38', 'rgba(192,255,56,0.4)', isNew)
    }).addTo(map);

    const name       = escHtml(member.name?.toUpperCase() || '');
    const loc        = escHtml(member.country || member.city || '');
    const contactHTML = member.contact
        ? `<div class="popup-contact">${escHtml(member.contact)}</div>` : '';

    marker.bindPopup(`
        <div class="popup-name">${name}</div>
        <div class="popup-city">◎ ${loc}</div>
        ${contactHTML}
    `, { maxWidth: 200 });

    // Flash effect fades after 3s
    if (isNew) {
        setTimeout(() => {
            marker.setIcon(createPinIcon('#C0FF38', 'rgba(192,255,56,0.4)', false));
        }, 3000);
    }

    return marker;
}

export function flyToMember(member) {
    if (!map) return;
    map.flyTo([member.lat, member.lng], 6, { duration: 1.2 });
    const marker = window.pinMarkers?.[member.id];
    if (marker) setTimeout(() => marker.openPopup(), 1300);
}

export function clearTempMarker() {
    if (tempMarker && map) { map.removeLayer(tempMarker); tempMarker = null; }
}

export function getSelectedCoords() {
    return { lat: selectedLat, lng: selectedLng };
}

export function resetCoords() {
    selectedLat = null;
    selectedLng = null;
    document.getElementById('coord-text').textContent = 'LAT: —  LNG: —';
    document.getElementById('location-display').classList.add('hidden');
    clearTempMarker();
}

export function locateMe() {
    if (!map) return;
    map.locate({ setView: true, maxZoom: 10 });
    map.once('locationfound', e => onMapClick(e));
    map.once('locationerror', () => window.showToast?.('CANNOT ACCESS LOCATION'));
}

// Hub-and-spoke arcs: centroid → each member
export function drawArcs(members) {
    if (!map) return;
    arcsLayer.clearLayers();
    if (members.length < 2) return;

    const centLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const centLng = members.reduce((s, m) => s + m.lng, 0) / members.length;

    members.forEach(m => {
        const dx = m.lng - centLng;
        const dy = m.lat - centLat;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.01) return;

        const midLat = (centLat + m.lat) / 2;
        const midLng = (centLng + m.lng) / 2;
        const curveStr = len * 0.18;

        const ctrl = {
            lat: midLat + (dx / len) * curveStr,
            lng: midLng + (-dy / len) * curveStr
        };

        const latlngs = [];
        for (let t = 0; t <= 1; t += 0.04) {
            latlngs.push([
                (1 - t) * (1 - t) * centLat + 2 * (1 - t) * t * ctrl.lat + t * t * m.lat,
                (1 - t) * (1 - t) * centLng + 2 * (1 - t) * t * ctrl.lng + t * t * m.lng
            ]);
        }

        arcsLayer.addLayer(L.polyline(latlngs, {
            color: '#C0FF38',
            weight: 1,
            opacity: 0.2
        }));
    });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
