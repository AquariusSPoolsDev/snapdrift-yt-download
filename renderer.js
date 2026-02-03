// UI ELEMENTS
const urlEl = document.getElementById('url');
const fetchBtn = document.getElementById('fetch');
const fetchStatus = document.getElementById('fetchStatus');
const metaContainer = document.getElementById('metaContainer');
const thumb = document.getElementById('thumb');
const titleEl = document.getElementById('title');
const uploaderEl = document.getElementById('uploader');
const durationEl = document.getElementById('duration');
const downloadBtn = document.getElementById('download');
const filenameEl = document.getElementById('filename');
const downloadsList = document.getElementById('downloadsList');
const progressTemplate = document.getElementById('progressTemplate');
const uploadDateEl = document.getElementById('uploadDate');
const pickLocationBtn = document.getElementById('pickLocation');
const locationPathEl = document.getElementById('locationPath');

let customDownloadPath = null; 
const activeUI = new Map();
let currentMeta = null;

// --- FETCH METADATA ---
fetchBtn.addEventListener('click', async () => {
    const url = urlEl.value.trim();
    if (!url) return;
    fetchStatus.textContent = 'Searching...';

    try {
        const res = await window.api.fetchMetadata(url);
        
        // FIX: Assign res directly to currentMeta
        currentMeta = res;
        
        if (!currentMeta) throw new Error("No metadata returned");

        titleEl.textContent = currentMeta.title || 'Unknown Video';
        uploaderEl.textContent = currentMeta.uploader || '';
        durationEl.textContent = currentMeta.duration ? 
            `Duration: ${Math.round(currentMeta.duration/60)}m ${currentMeta.duration%60}s` : '';
        thumb.src = currentMeta.thumbnail || '';
        
        const rawDate = currentMeta.upload_date;
        uploadDateEl.textContent = rawDate ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}` : '';
        
        metaContainer.classList.remove('d-none');
        fetchStatus.textContent = '';
    } catch (err) {
        fetchStatus.textContent = 'Error fetching video';
        console.error("Metadata fetch failed:", err);
    }
});

// --- PICK FOLDER ---
pickLocationBtn.addEventListener('click', async () => {
    // This calls the select-folder handler in main.js
    const selectedPath = await window.api.selectFolder();
    
    if (selectedPath) {
        customDownloadPath = selectedPath;
        const pathParts = selectedPath.split(/[\\/]/).filter(p => p);
        locationPathEl.textContent = pathParts.length > 2 
            ? `.../${pathParts.slice(-2).join('/')}` 
            : selectedPath;
    }
});

// --- DOWNLOAD LOGIC ---
downloadBtn.addEventListener('click', async () => {
    const url = urlEl.value.trim();
    const fmt = document.querySelector('input[name="fmt"]:checked')?.value;
    if (!url || !fmt) return alert('Select format');

    let outName = filenameEl.value.trim() || currentMeta?.title || 'download';
    outName = outName.replace(/[\\/:"*?<>|]+/g, '') + (fmt === 'audio' ? '.mp3' : '.mp4');

    const clone = progressTemplate.content.cloneNode(true);
    const item = clone.querySelector('.download-item');
    const bar = clone.querySelector('.item-progress');
    const details = clone.querySelector('.item-details');
    const percentText = clone.querySelector('.item-percent');
    const stopBtn = clone.querySelector('.stop-btn');
    const stopIcon = stopBtn.querySelector('i');
    
    clone.querySelector('.item-title').textContent = outName;
    downloadsList.prepend(clone);

    // Pass the customDownloadPath to startDownload
    const res = await window.api.startDownload({ 
        url, 
        formatTag: fmt, 
        outputFilename: outName,
        savePath: customDownloadPath 
    });

    if (res.success) {
        activeUI.set(res.id, { bar, details, item, stopBtn, stopIcon, percentText });
        stopBtn.onclick = () => window.api.cancelDownload(res.id);
    } else {
        details.textContent = 'Failed to start';
    }
});

// --- OUTPUT HANDLERS ---
window.api.onYtOutput(({ id, text }) => {
    const ui = activeUI.get(id);
    if (!ui) return;

    if (text.includes('[Merger]') || text.includes('[ffmpeg]')) {
        ui.bar.classList.add('tertiary-text');
        ui.details.textContent = 'Finalizing...';
        return;
    }

    const m = text.match(/\[download\]\s+([0-9]{1,3}\.?[0-9]*)%/i);
    if (m) {
        const p = parseFloat(m[1]);
        ui.bar.value = p;
        ui.percentText.textContent = p.toFixed(0) + '%';
        ui.details.textContent = 'Downloading...';
    }
});

window.api.onDownloadFinished(({ id, success }) => {
    const ui = activeUI.get(id);
    if (!ui) return;

    
    if (success) {
        ui.bar.value = 100;
        ui.bar.className = 'item-progress primary-text';
        ui.details.textContent = 'Completed';
        ui.stopBtn.className = 'stop-btn circle large no-margin primary';
        ui.stopIcon.textContent = 'delete_forever';
    } else {
        ui.bar.className = 'item-progress error-text';
        ui.details.textContent = 'Stopped (sudden stop)';
        ui.stopIcon.textContent = 'report';
    }

    ui.stopBtn.onclick = () => {
        ui.item.remove();
        activeUI.delete(id);
    };
});

// --- HELPERS ---
document.getElementById('newDownload').addEventListener('click', () => {
    urlEl.value = '';
    filenameEl.value = '';
    metaContainer.classList.add('d-none');
    fetchStatus.textContent = '';
});

urlEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (typeof ui === "function") ui("#contextMenu", e);
});

document.getElementById("pasteOption").addEventListener("click", async () => {
    try {
        // Use the bridge instead of navigator.clipboard
        const text = await window.api.readClipboard(); 
        urlEl.value = text;
        urlEl.focus();
        
        // Close menu if beercss 'ui' function exists
        if (typeof ui === "function") ui("#contextMenu");
    } catch (err) {
        console.error("Paste failed", err);
    }
});