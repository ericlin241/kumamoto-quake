// Global Application State
const state = {
    // Pre-load from window.KUMAMOTO_QUAKE_DATA if loaded via script tag (file:// fallback)
    allEvents: window.KUMAMOTO_QUAKE_DATA || [],
    filteredEvents: [],
    selectedEventId: null,
    map: null,
    markers: {},
    charts: {
        timeline: null,
        distribution: null
    },
    currentScope: 'kumamoto-epicenter' // Default scope
};

// Shindo Intensity Map Info (Japanese Version)
const SHINDO_CONFIG = {
    '1': { label: '震度1', rank: 1, color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' },
    '2': { label: '震度2', rank: 2, color: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
    '3': { label: '震度3', rank: 3, color: '#84cc16', glow: 'rgba(132, 204, 22, 0.4)' },
    '4': { label: '震度4', rank: 4, color: '#eab308', glow: 'rgba(234, 179, 8, 0.4)' },
    '5-': { label: '震度5弱', rank: 5, color: '#f97316', glow: 'rgba(249, 115, 22, 0.4)' },
    '5弱': { label: '震度5弱', rank: 5, color: '#f97316', glow: 'rgba(249, 115, 22, 0.4)' },
    '5+': { label: '震度5強', rank: 6, color: '#ea580c', glow: 'rgba(234, 88, 12, 0.4)' },
    '5強': { label: '震度5強', rank: 6, color: '#ea580c', glow: 'rgba(234, 88, 12, 0.4)' },
    '6-': { label: '震度6弱', rank: 7, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
    '6弱': { label: '震度6弱', rank: 7, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
    '6+': { label: '震度6強', rank: 8, color: '#b91c1c', glow: 'rgba(185, 28, 28, 0.4)' },
    '6強': { label: '震度6強', rank: 8, color: '#b91c1c', glow: 'rgba(185, 28, 28, 0.4)' },
    '7': { label: '震度7', rank: 9, color: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' }
};

// Shindo helper to retrieve numeric rank for comparisons
function getShindoRank(shindoStr) {
    if (!shindoStr) return 0;
    return SHINDO_CONFIG[shindoStr] ? SHINDO_CONFIG[shindoStr].rank : 0;
}

// Coordinate parsing function: converts JMA "cod" string (e.g., "+32.7+130.7-10000/") to numbers
function parseCoordinates(codStr) {
    if (!codStr) return null;
    const match = codStr.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+)\/$/);
    if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const depthMeters = parseFloat(match[3]);
        const depthKm = Math.abs(depthMeters) / 1000;
        return { lat, lon, depthKm };
    }
    return null;
}

// Time Formatting Helper (e.g. "2026-07-29T10:30:00+09:00" -> "2026-07-29 10:30:00")
function formatTime(isoStr) {
    if (!isoStr) return '--';
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return isoStr;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Initialize Leaflet Map (with try-catch safety)
function initMap() {
    try {
        if (typeof L === 'undefined') {
            console.warn('Leaflet is not loaded. Map rendering skipped.');
            document.getElementById('map').innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); background: #111827; padding: 2rem; text-align: center;">
                    <div>
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: var(--accent-yellow); margin-bottom: 1rem;"></i>
                        <p>地図ライブラリ (Leaflet) の読み込みに失敗しました。</p>
                        <p style="font-size: 0.8rem; margin-top: 0.5rem;">ブラウザの接続状況、またはオフライン環境の制約を確認してください。</p>
                    </div>
                </div>
            `;
            return;
        }

        // Center map around Kumamoto (lat: 32.78, lon: 130.73)
        state.map = L.map('map', {
            zoomControl: true,
            attributionControl: false
        }).setView([32.78, 130.73], 9);

        // Add CartoDB Dark Matter tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(state.map);

        // Custom scale control
        L.control.scale({ position: 'bottomleft', imperial: false }).addTo(state.map);
    } catch (e) {
        console.error('Error initializing map:', e);
    }
}

// Initialize Chart.js Instances (with try-catch safety)
function initCharts() {
    try {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js is not loaded. Analytics charts skipped.');
            return;
        }

        const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
        const ctxDistribution = document.getElementById('distributionChart').getContext('2d');

        // Chart 1: Magnitude vs. Time Scatter Plot
        state.charts.timeline = new Chart(ctxTimeline, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'マグニチュード (M)',
                    data: [],
                    backgroundColor: [],
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    pointRadius: [],
                    pointHoverRadius: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const event = context.raw.event;
                                return [
                                    `日時: ${formatTime(event.at)}`,
                                    `震央: ${event.en_anm || event.anm}`,
                                    `規模: M${event.mag}`,
                                    `最大震度: ${event.maxi || 'なし'}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: '時系列順 (右側が最新)', color: '#9ca3af' },
                        ticks: { display: false }, // Simple sequence plot
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        title: { display: true, text: 'マグニチュード (M)', color: '#9ca3af' },
                        min: 1.0,
                        max: 8.0,
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });

        // Chart 2: Regional bar count
        state.charts.distribution = new Chart(ctxDistribution, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: '発生回数 (回)',
                    data: [],
                    backgroundColor: 'rgba(6, 182, 212, 0.7)',
                    borderColor: '#06b6d4',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af', font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: '発生回数 (回)', color: '#9ca3af' },
                        beginAtZero: true,
                        ticks: { color: '#9ca3af', stepSize: 1 },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error initializing charts:', e);
    }
}

// Translate Wolfx JMA API event structure to match JMA's own schema
function translateWolfxEvent(key, wolfxEvent) {
    // Convert time_full (JST, e.g. "2026/07/29 11:37:00") to standard ISO-like timezone string
    const jstTime = wolfxEvent.time_full ? wolfxEvent.time_full.replace(/\//g, '-') + '+09:00' : new Date().toISOString();
    
    // Convert depth string (e.g. "10km" -> -10000 meters, "ごく浅い" -> 0 meters, etc.)
    let depthNum = parseFloat(wolfxEvent.depth);
    if (isNaN(depthNum)) depthNum = 0; // fallback for "ごく浅い" or other non-numeric depths
    const depthMeters = -(depthNum * 1000);
    
    // Format JMA coordinates code (e.g. "+32.4+130.5-10000/")
    const lat = parseFloat(wolfxEvent.latitude);
    const lon = parseFloat(wolfxEvent.longitude);
    let cod = '';
    
    if (!isNaN(lat) && !isNaN(lon)) {
        const latSign = lat >= 0 ? '+' : '';
        const lonSign = lon >= 0 ? '+' : '';
        cod = `${latSign}${lat.toFixed(1)}${lonSign}${lon.toFixed(1)}${depthMeters.toFixed(0)}/`;
    }
    
    const anm = wolfxEvent.location || '';
    let en_anm = anm;
    if (anm.includes('熊本県熊本地方')) en_anm = 'Kumamoto Region, Kumamoto Prefecture';
    else if (anm.includes('熊本県天草・芦北地方')) en_anm = 'Amakusa and Ashikita Region, Kumamoto Prefecture';
    else if (anm.includes('熊本県阿蘇地方')) en_anm = 'Aso Region, Kumamoto Prefecture';

    let maxi = wolfxEvent.shindo || '';
    if (maxi === '5弱') maxi = '5-';
    if (maxi === '5強') maxi = '5+';
    if (maxi === '6弱') maxi = '6-';
    if (maxi === '6強') maxi = '6+';

    // Estimate prefecture code (43 = Kumamoto) if epicenter is in Kumamoto
    const intensityPref = anm.includes('熊本') ? [{ code: '43', maxi: maxi, city: [] }] : [];

    return {
        ctt: wolfxEvent.EventID,
        eid: wolfxEvent.EventID,
        rdt: jstTime,
        ttl: wolfxEvent.Title || '震源・震度情報',
        ift: '発表',
        ser: '1',
        at: jstTime,
        anm: anm,
        acd: '',
        cod: cod,
        mag: wolfxEvent.magnitude || '',
        maxi: maxi,
        int: intensityPref,
        en_ttl: 'Earthquake and Seismic Intensity Information',
        en_anm: en_anm
    };
}

// Fetch Earthquake Data from server API proxy with double-fallback URL checking
async function loadData(background = false) {
    const statusDot = document.getElementById('status-dot');
    const syncText = document.getElementById('sync-text');
    const refreshIcon = document.getElementById('refresh-icon');

    statusDot.classList.add('syncing');
    syncText.textContent = '気象庁の最新地震データを同期しています...';
    refreshIcon.classList.add('spin');

    // Double-fallback URL list: tries local server first, then live Wolfx JMA API (CORS enabled), then static cached JSON file
    const isLocalFile = window.location.protocol === 'file:';
    const urls = isLocalFile 
        ? ['quake_cache.json', '/api/quake', 'https://api.wolfx.jp/jma_eqlist.json'] 
        : ['/api/quake', 'https://api.wolfx.jp/jma_eqlist.json', 'quake_cache.json'];

    let success = false;
    let lastError = null;

    for (const url of urls) {
        try {
            console.log(`Attempting to fetch data from: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const fetchedData = await response.json();
            
            let eventList = [];
            if (url.includes('wolfx.jp')) {
                // Wolfx JMA list is an object of objects {"No1": {...}, "No2": {...}}
                // We convert it to a sorted array matching our schema
                eventList = Object.values(fetchedData).map((item, idx) => translateWolfxEvent(idx, item));
            } else {
                eventList = fetchedData;
            }

            if (Array.isArray(eventList) && eventList.length > 0) {
                state.allEvents = eventList;
                success = true;
                const sourceLabel = url.includes('wolfx') ? '気象庁連携API (リアルタイム)' : url;
                syncText.textContent = `更新完了 (データ元: ${sourceLabel}, 総データ数: ${state.allEvents.length} 件)`;
                console.log(`Loaded ${state.allEvents.length} events from ${url}`);
                break;
            }
        } catch (err) {
            console.warn(`Fetch from ${url} failed:`, err.message);
            lastError = err;
        }
    }

    statusDot.classList.remove('syncing');

    if (success) {
        applyFilters();
    } else {
        console.error('All fetch attempts failed:', lastError);
        // If we already have statically loaded data, do not crash the UI with a connection error
        if (state.allEvents && state.allEvents.length > 0) {
            syncText.textContent = '同期失敗、キャッシュデータを使用しています';
            console.warn('Sync failed, using pre-loaded cache data');
        } else {
            syncText.textContent = '同期失敗、データソースに接続できません';
            document.getElementById('event-feed').innerHTML = `
                <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block;"></i>
                    データ読み込みに失敗しました。接続を確認してください。
                    <p style="font-size: 0.75rem; margin-top: 0.5rem; color: var(--text-muted);">
                        エラー詳細: ${lastError ? lastError.message : 'Unknown Network Error'}
                    </p>
                </div>
            `;
        }
    }
    refreshIcon.classList.remove('spin');
}

// Apply Filters to data based on user input state
function applyFilters() {
    const minShindoVal = document.getElementById('shindo-filter').value;
    const minShindoRank = getShindoRank(minShindoVal);
    const searchQuery = document.getElementById('search-filter').value.toLowerCase().trim();

    state.filteredEvents = state.allEvents.filter(item => {
        // 1. Geographic / Scope Filter
        if (state.currentScope === 'kumamoto-epicenter') {
            // Epicenter is in Kumamoto
            const inKumamoto = (item.en_anm && item.en_anm.includes('Kumamoto')) || 
                               (item.anm && item.anm.includes('熊本'));
            if (!inKumamoto) return false;
        } else if (state.currentScope === 'kumamoto-felt') {
            // Felt in Kumamoto (prefecture code is 43)
            const feltInKumamoto = item.int && item.int.some(pref => pref.code === '43');
            if (!feltInKumamoto) return false;
        }
        // If scope is 'japan-all', we display all earthquakes (no scope filter)

        // 3. Shindo Intensity Filter
        const shindoRank = getShindoRank(item.maxi);
        if (shindoRank < minShindoRank) return false;

        // 4. Keyword Search Filter
        if (searchQuery) {
            const locZh = item.anm ? item.anm.toLowerCase() : '';
            const locEn = item.en_anm ? item.en_anm.toLowerCase() : '';
            if (!locZh.includes(searchQuery) && !locEn.includes(searchQuery)) {
                return false;
            }
        }

        return true;
    });

    renderUI();
}

// Render All UI Elements (KPIs, Map, Feed, Charts, Table)
function renderUI() {
    renderKPIs();
    renderMap();
    renderFeed();
    renderCharts();
    renderTable();
}

// Render KPI cards
function renderKPIs() {
    const count = state.filteredEvents.length;
    document.getElementById('kpi-count').textContent = count;
    document.getElementById('kpi-count-sub').textContent = `条件合致: ${count} 件`;

    // Calculate Max Mag and Max Shindo
    let maxMagEvent = null;
    let maxShindoEvent = null;
    let totalDepth = 0;
    let depthCount = 0;

    state.filteredEvents.forEach(item => {
        // Magnitude
        const mag = parseFloat(item.mag);
        if (!isNaN(mag)) {
            if (!maxMagEvent || mag > parseFloat(maxMagEvent.mag)) {
                maxMagEvent = item;
            }
        }

        // Shindo
        const rank = getShindoRank(item.maxi);
        if (rank > 0) {
            if (!maxShindoEvent || rank > getShindoRank(maxShindoEvent.maxi)) {
                maxShindoEvent = item;
            }
        }

        // Depth
        const coords = parseCoordinates(item.cod);
        if (coords && coords.depthKm !== null && coords.depthKm >= 0) {
            totalDepth += coords.depthKm;
            depthCount++;
        }
    });

    // Render Max Magnitude
    if (maxMagEvent) {
        document.getElementById('kpi-max-mag').innerHTML = `${maxMagEvent.mag}<span>M</span>`;
        const loc = maxMagEvent.en_anm || maxMagEvent.anm;
        const timeStr = formatTime(maxMagEvent.at).split(' ')[0];
        document.getElementById('kpi-max-mag-loc').textContent = `${timeStr} @ ${loc.replace(', Kumamoto Prefecture', '')}`;
    } else {
        document.getElementById('kpi-max-mag').innerHTML = `--<span>M</span>`;
        document.getElementById('kpi-max-mag-loc').textContent = '該当データなし';
    }

    // Render Max Shindo
    if (maxShindoEvent) {
        const shindoVal = maxShindoEvent.maxi;
        const shindoColor = SHINDO_CONFIG[shindoVal] ? SHINDO_CONFIG[shindoVal].color : 'var(--text-secondary)';
        document.getElementById('kpi-max-shindo').innerHTML = `<span style="color: ${shindoColor}">${shindoVal}</span>`;
        const loc = maxShindoEvent.en_anm || maxShindoEvent.anm;
        const timeStr = formatTime(maxShindoEvent.at).split(' ')[1].substring(0, 5); // Just HH:mm
        document.getElementById('kpi-max-shindo-time').textContent = `${timeStr} @ ${loc.replace(', Kumamoto Prefecture', '')}`;
    } else {
        document.getElementById('kpi-max-shindo').innerHTML = `--`;
        document.getElementById('kpi-max-shindo-time').textContent = '該当データなし';
    }

    // Render Avg Depth
    if (depthCount > 0) {
        const avg = (totalDepth / depthCount).toFixed(1);
        document.getElementById('kpi-avg-depth').innerHTML = `${avg}<span>km</span>`;
        document.getElementById('kpi-avg-depth-sub').textContent = `震源決定数: ${depthCount} 件`;
    } else {
        document.getElementById('kpi-avg-depth').innerHTML = `--<span>km</span>`;
        document.getElementById('kpi-avg-depth-sub').textContent = '深さデータなし';
    }
}

// Render markers on Leaflet Map
function renderMap() {
    if (!state.map) return; // Skip if map failed to load

    // Clear existing markers
    for (const key in state.markers) {
        state.map.removeLayer(state.markers[key]);
    }
    state.markers = {};

    const markerGroup = [];

    state.filteredEvents.forEach(item => {
        const coords = parseCoordinates(item.cod);
        if (!coords) return; // Skip if no coordinate data
        if (coords.lat === 0 && coords.lon === 0) return; // Skip invalid [0, 0] coordinates

        const mag = parseFloat(item.mag) || 2.0;
        
        // Calculate circle style
        const shindo = item.maxi;
        const config = SHINDO_CONFIG[shindo] || { color: '#6b7280', glow: 'rgba(107, 114, 128, 0.2)' };
        
        // Circle Radius based on Magnitude: M3 is small, M6+ is very large
        const radius = Math.max(3, (mag - 1) * 4); 

        // Create leaflet circle marker
        const marker = L.circleMarker([coords.lat, coords.lon], {
            radius: radius,
            fillColor: config.color,
            fillOpacity: 0.6,
            color: '#ffffff',
            weight: 0.8,
            shadowColor: config.color,
            shadowBlur: 8
        }).addTo(state.map);

        // Map popup details (Japanese version)
        const popupContent = `
            <div class="leaflet-popup-quake-title">${item.anm || item.en_anm}</div>
            <div class="leaflet-popup-quake-row">
                <span class="label">発生日時:</span>
                <span class="val">${formatTime(item.at)}</span>
            </div>
            <div class="leaflet-popup-quake-row">
                <span class="label">規模:</span>
                <span class="val" style="color: var(--accent-cyan); font-weight: 800;">M ${item.mag || 'なし'}</span>
            </div>
            <div class="leaflet-popup-quake-row">
                <span class="label">最大震度:</span>
                <span class="val" style="color: ${config.color}; font-weight: 800;">${item.maxi || 'なし'}</span>
            </div>
            <div class="leaflet-popup-quake-row">
                <span class="label">深さ:</span>
                <span class="val">${coords.depthKm !== null ? coords.depthKm + ' km' : 'なし'}</span>
            </div>
            <div class="leaflet-popup-quake-row">
                <span class="label">震源位置:</span>
                <span class="val" style="font-size: 0.75rem;">${coords.lat.toFixed(2)}°N, ${coords.lon.toFixed(2)}°E</span>
            </div>
        `;
        
        marker.bindPopup(popupContent, { closeButton: false });
        
        // Zoom/highlight on click
        marker.on('click', () => {
            selectEvent(item.eid, false, 'map');
        });

        state.markers[item.eid] = marker;
        markerGroup.push([coords.lat, coords.lon]);
    });

    // Auto fit bounds to match the markers, but only if we have active markers
    if (markerGroup.length > 0) {
        state.map.fitBounds(L.latLngBounds(markerGroup), { padding: [40, 40], maxZoom: 11 });
    } else {
        // Reset to default Kumamoto view
        state.map.setView([32.78, 130.73], 9);
    }
}

// Render recent events feed
function renderFeed() {
    const feedList = document.getElementById('event-feed');
    document.getElementById('feed-count').textContent = `${state.filteredEvents.length} 件`;
    
    if (state.filteredEvents.length === 0) {
        feedList.innerHTML = `
            <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
                <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block;"></i>
                条件に合致する地震はありません
            </div>
        `;
        return;
    }

    // Show all filtered events to present the complete JMA dataset
    const itemsToShow = state.filteredEvents;

    feedList.innerHTML = itemsToShow.map(item => {
        const isSelected = item.eid === state.selectedEventId ? 'active' : '';
        const shindo = item.maxi;
        const config = SHINDO_CONFIG[shindo] || { color: 'var(--text-muted)', label: 'なし' };
        const mag = item.mag || 'なし';
        const coords = parseCoordinates(item.cod);
        const depth = coords ? `${coords.depthKm} km` : 'なし';

        return `
            <div class="event-item ${isSelected}" data-eid="${item.eid}" onclick="selectEvent('${item.eid}', true, 'feed')">
                <div class="event-meta">
                    <span class="event-time">${formatTime(item.at)}</span>
                    <div class="event-badges">
                        <span class="badge badge-mag">M ${mag}</span>
                        ${shindo ? `<span class="badge badge-shindo" style="background-color: ${config.color}">${shindo}</span>` : ''}
                    </div>
                </div>
                <div class="event-location">${item.anm || item.en_anm}</div>
                <div class="event-details">
                    <span>深さ: ${depth}</span>
                    <span>ID: ${item.eid.substring(4, 12)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Render Data Charts
function renderCharts() {
    if (!state.charts.timeline || !state.charts.distribution) return; // Skip if charts failed to load

    // 1. Prepare timeline chart data (chronological sequence)
    // Reverse events for chronological timeline (oldest to newest)
    const chronoEvents = [...state.filteredEvents].reverse();
    
    const timelineData = chronoEvents.map((item, index) => {
        const mag = parseFloat(item.mag);
        return {
            x: index,
            y: isNaN(mag) ? null : mag,
            event: item
        };
    }).filter(d => d.y !== null);

    // Map point colors and radius based on magnitude/intensity
    const pointColors = timelineData.map(d => {
        const shindo = d.event.maxi;
        return SHINDO_CONFIG[shindo] ? SHINDO_CONFIG[shindo].color : 'rgba(6, 182, 212, 0.6)';
    });

    const pointRadii = timelineData.map(d => {
        return Math.max(3, (d.y - 1) * 2.5);
    });

    state.charts.timeline.data.datasets[0].data = timelineData;
    state.charts.timeline.data.datasets[0].backgroundColor = pointColors;
    state.charts.timeline.data.datasets[0].pointRadius = pointRadii;
    state.charts.timeline.data.datasets[0].pointHoverRadius = pointRadii.map(r => r + 2);
    state.charts.timeline.update();

    // 2. Prepare Regional distribution chart data
    // Let's count events by hypocenter (epicenter location)
    const countsByRegion = {};
    state.filteredEvents.forEach(item => {
        const region = item.anm || item.en_anm || '不明';
        // Clean up name for shorter chart labels
        const cleanRegion = region.replace('熊本県', '').replace('地方', '').trim();
        countsByRegion[cleanRegion] = (countsByRegion[cleanRegion] || 0) + 1;
    });

    // Sort by count descending, keep top 10
    const sortedRegions = Object.entries(countsByRegion)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    state.charts.distribution.data.labels = sortedRegions.map(r => r[0]);
    state.charts.distribution.data.datasets[0].data = sortedRegions.map(r => r[1]);
    state.charts.distribution.update();
}

// Render Data Table
function renderTable() {
    const tableBody = document.getElementById('table-body');
    
    if (state.filteredEvents.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="color: var(--text-muted); padding: 3rem;">
                    地震データはありません
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = state.filteredEvents.map(item => {
        const coords = parseCoordinates(item.cod);
        const shindo = item.maxi;
        const config = SHINDO_CONFIG[shindo] || { color: 'transparent', label: 'なし' };
        const isSelected = item.eid === state.selectedEventId ? 'selected' : '';

        return `
            <tr class="${isSelected}" data-eid="${item.eid}" onclick="selectEvent('${item.eid}', true, 'table')">
                <td style="font-weight: 500;">${formatTime(item.at)}</td>
                <td style="font-weight: 600;">${item.anm || item.en_anm}</td>
                <td class="text-center" style="font-family: 'Orbitron', sans-serif; font-weight: 700; color: var(--accent-cyan);">M ${item.mag || '--'}</td>
                <td class="text-center">
                    ${shindo ? `<span style="background-color: ${config.color}; color: #fff; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 700; font-family: 'Orbitron', sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${shindo}</span>` : '--'}
                </td>
                <td class="text-center" style="font-family: 'Orbitron', sans-serif;">${coords ? coords.depthKm + ' km' : '--'}</td>
                <td style="color: var(--text-secondary); font-family: monospace; font-size: 0.8rem;">
                    ${coords ? `${coords.lat.toFixed(3)}°N, ${coords.lon.toFixed(3)}°E` : '--'}
                </td>
                <td class="text-center">
                    <button style="background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.2); color: var(--accent-cyan); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;">
                        <i class="fa-solid fa-crosshairs"></i> 表示
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Select/Focus an earthquake event on the map & list
function selectEvent(eid, flyToMap = false, source = null) {
    state.selectedEventId = eid;

    // Highlight row in table
    document.querySelectorAll('table.quake-table tbody tr').forEach(row => {
        if (row.getAttribute('data-eid') === eid) {
            row.classList.add('selected');
            // Scroll to it in table wrapper if not visible, ONLY if triggered from table interaction itself
            if (source === 'table') {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            row.classList.remove('selected');
        }
    });

    // Highlight item in feed
    document.querySelectorAll('.event-item').forEach(item => {
        if (item.getAttribute('data-eid') === eid) {
            item.classList.add('active');
            // Scroll to it in feed container, ONLY if triggered from map/elsewhere (if clicked in feed, it's already visible)
            if (source !== 'feed') {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            item.classList.remove('active');
        }
    });

    // Map actions
    if (state.map) {
        const marker = state.markers[eid];
        if (marker) {
            marker.openPopup();
            if (flyToMap) {
                const event = state.allEvents.find(e => e.eid === eid);
                const coords = parseCoordinates(event.cod);
                if (coords) {
                    state.map.flyTo([coords.lat, coords.lon], 11, { duration: 1.5 });
                }
            }
        }
    }
}

// Export Filtered Data to CSV
function exportCSV() {
    if (state.filteredEvents.length === 0) {
        alert('エクスポートするデータがありません！');
        return;
    }

    const headers = ['発生日時 (Time)', '震央地名 (Hypocenter)', 'マグニチュード (M)', '最大震度', '深さ (km)', '北緯', '東経', 'イベントID'];
    
    const rows = state.filteredEvents.map(item => {
        const coords = parseCoordinates(item.cod);
        return [
            formatTime(item.at),
            `"${(item.anm || item.en_anm).replace(/"/g, '""')}"`,
            item.mag || '',
            item.maxi || '',
            coords ? coords.depthKm : '',
            coords ? coords.lat.toFixed(5) : '',
            coords ? coords.lon.toFixed(5) : '',
            item.eid
        ];
    });

    const csvContent = "\ufeff" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    
    const timeStamp = new Date().toISOString().substring(0, 10);
    link.setAttribute("download", `kumamoto_quake_data_${state.currentScope}_${timeStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Bind Event Listeners
function bindEvents() {
    // Refresh / Live Sync button
    document.getElementById('refresh-btn').addEventListener('click', loadData);

    // Filters
    
    document.getElementById('shindo-filter').addEventListener('change', applyFilters);
    document.getElementById('search-filter').addEventListener('input', applyFilters);

    // Scope button selectors
    const scopeButtons = {
        'kumamoto-epicenter': document.getElementById('scope-epi'),
        'kumamoto-felt': document.getElementById('scope-felt'),
        'japan-all': document.getElementById('scope-all')
    };

    Object.entries(scopeButtons).forEach(([scopeKey, button]) => {
        if (button) {
            button.addEventListener('click', () => {
                // Remove active classes
                Object.values(scopeButtons).forEach(btn => {
                    if (btn) btn.classList.remove('active');
                });
                // Add active to current
                button.classList.add('active');
                // Update state & filter
                state.currentScope = scopeKey;
                applyFilters();
            });
        }
    });

    // CSV Export button
    document.getElementById('btn-export').addEventListener('click', exportCSV);
}

// App Initialization
window.addEventListener('DOMContentLoaded', async () => {
    initMap();
    initCharts();
    bindEvents();

    // If we have statically pre-loaded data, render it immediately to avoid blank screen/loading hang
    if (state.allEvents && state.allEvents.length > 0) {
        console.log(`Pre-rendering ${state.allEvents.length} events from static cache script`);
        applyFilters();
        // Sync in the background silently
        await loadData(true);
    } else {
        // Otherwise, fetch normally and show full loading error if it fails
        await loadData(false);
    }

    // Live auto-refresh: Automatically poll for new earthquake data every 60 seconds
    setInterval(async () => {
        console.log('Performing live background auto-refresh...');
        await loadData(true);
    }, 60000);
});
