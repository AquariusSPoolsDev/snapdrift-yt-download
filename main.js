const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

console.log("Electron Version:", process.versions.electron);

/**
 * BINARY PATHS
 * These look for the .exe files in the root folder during development
 * and in the 'resources' folder after the app is packaged.
 */
const YTDLP_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'yt-dlp.exe')
    : path.join(__dirname, 'bin', 'yt-dlp.exe');

const FFMPEG_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : path.join(__dirname, 'bin', 'ffmpeg.exe');


const activeProcesses = new Map();

ipcMain.handle('read-clipboard', () => {
    return clipboard.readText();
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 850,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true // Electron 40 recommends explicitly enabling this
        },
    });

    // Check if binaries exist on startup to prevent the ENOENT crash
    if (!fs.existsSync(YTDLP_PATH)) {
        dialog.showErrorBox("Missing Component", `yt-dlp.exe was not found at: ${YTDLP_PATH}`);
    }

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// --- HANDLERS ---

// 1. Folder Selection
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

// 2. Metadata Fetching
ipcMain.handle('fetch-metadata', async (event, url) => {
    return new Promise((resolve, reject) => {
        const child = spawn(YTDLP_PATH, ['-j', '--no-playlist', url], { windowsHide: true });
        let out = '';
        let err = '';

        child.stdout.on('data', (d) => { out += d.toString(); });
        child.stderr.on('data', (d) => { err += d.toString(); });

        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const meta = JSON.parse(out.split(/\r?\n/).find(Boolean));
                    resolve(meta); // Adjusted to match your renderer.js expectation
                } catch (e) {
                    reject({ error: 'Parse error', details: e.message });
                }
            } else {
                reject({ error: 'yt-dlp error', details: err });
            }
        });
    });
});

// 3. Download Logic with ffmpeg support
ipcMain.handle('start-download', async (event, { url, formatTag, outputFilename, savePath }) => {
    const downloadId = Date.now().toString();

    // Resolve path: Custom folder > Downloads folder
    const baseDir = savePath || app.getPath('downloads');
    const outPath = path.join(baseDir, outputFilename);

    let formatArg = (formatTag === 'audio')
        ? ['-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3']
        : ['-f', `bestvideo[height<=${formatTag}]+bestaudio/best`, '--merge-output-format', 'mp4'];

    // Critical: Pass --ffmpeg-location so 1080p merges correctly
    const args = [
        ...formatArg,
        '--ffmpeg-location', FFMPEG_PATH,
        '--newline',
        '--no-playlist',
        '-o', outPath,
        url
    ];

    try {
        const child = spawn(YTDLP_PATH, args, { windowsHide: true });
        activeProcesses.set(downloadId, child);

        // Capture standard output (progress)
        child.stdout.on('data', (d) => {
            event.sender.send('yt-output', { id: downloadId, text: d.toString() });
        });

        // NEW: Capture error output (reasons for stopping)
        child.stderr.on('data', (d) => {
            const errorText = d.toString();
            console.error(`YT-DLP Error: ${errorText}`);
            // Send error text to UI so we can see WHY it stopped
            event.sender.send('yt-output', { id: downloadId, text: `ERROR: ${errorText}` });
        });

        child.on('close', (code) => {
            activeProcesses.delete(downloadId);
            event.sender.send('download-finished', {
                id: downloadId,
                success: code === 0,
                exitCode: code // Send the code (0 is good, 1+ is bad)
            });
        });

        return { success: true, id: downloadId };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 4. Cancel Process
ipcMain.handle('cancel-download', async (event, downloadId) => {
    const child = activeProcesses.get(downloadId);
    if (child) {
        try {
            if (process.platform === 'win32') {
                exec(`taskkill /PID ${child.pid} /T /F`);
            } else {
                child.kill('SIGKILL');
            }
            activeProcesses.delete(downloadId);
            return { canceled: true };
        } catch (e) {
            return { canceled: false, error: e.message };
        }
    }
    return { canceled: false };
});