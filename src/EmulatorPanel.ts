import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { spawn } from 'child_process';

const FIRMWARE_PATH_KEY = 'cyberfidget.firmwarePath';

export class EmulatorViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'cyberfidget.emulatorView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        this._refresh(webviewView);
        webviewView.webview.onDidReceiveMessage(
            msg => this._handleMessage(msg, webviewView),
            undefined,
            this._context.subscriptions
        );
    }

    private _refresh(webviewView: vscode.WebviewView) {
        const firmwarePath = this._context.globalState.get<string>(FIRMWARE_PATH_KEY);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: firmwarePath
                ? [vscode.Uri.file(path.join(firmwarePath, 'wasm', 'build'))]
                : [],
        };
        webviewView.webview.html = this._buildHtml(webviewView.webview, firmwarePath);
    }

    private _discoverApps(firmwarePath: string): string[] {
        const cmakePath = path.join(firmwarePath, 'wasm', 'CMakeLists.txt');
        try {
            const content = fs.readFileSync(cmakePath, 'utf8');
            return [...content.matchAll(/WASM_APP STREQUAL "([^"]+)"/g)]
                .map(m => m[1])
                .filter(app => app !== 'Custom');
        } catch {
            return [];
        }
    }

    private async _handleMessage(msg: any, view: vscode.WebviewView) {
        if (msg.command === 'selectFolder') {
            const result = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: 'Select CyberFidget Firmware Folder',
            });
            if (result?.[0]) {
                await this._context.globalState.update(FIRMWARE_PATH_KEY, result[0].fsPath);
                this._refresh(view);
            }
        } else if (msg.command === 'build') {
            const firmwarePath = this._context.globalState.get<string>(FIRMWARE_PATH_KEY);
            if (firmwarePath && msg.app) {
                this._runBuild(firmwarePath, msg.app, view);
            }
        }
    }

    private _runBuild(firmwarePath: string, appName: string, view: vscode.WebviewView) {
        const wasmDir = path.join(firmwarePath, 'wasm');
        const buildScript = path.join(wasmDir, 'build.sh');

        view.webview.postMessage({ command: 'buildStart' });

        const proc = spawn('bash', [
            '--login', '-c',
            `chmod +x "${buildScript}" && "${buildScript}" "${appName}"`,
        ], { cwd: wasmDir });

        proc.stdout.on('data', (d: Buffer) =>
            view.webview.postMessage({ command: 'buildLine', text: d.toString() }));
        proc.stderr.on('data', (d: Buffer) =>
            view.webview.postMessage({ command: 'buildLine', text: d.toString(), isErr: true }));
        proc.on('close', (code: number) => {
            view.webview.postMessage({ command: 'buildDone', success: code === 0 });
            if (code === 0) {
                // Short pause so user sees the success output, then reload the emulator
                setTimeout(() => this._refresh(view), 1200);
            }
        });
    }

    private _buildHtml(webview: vscode.Webview, firmwarePath: string | undefined): string {
        const nonce = crypto.randomBytes(16).toString('hex');
        const csp = webview.cspSource;

        const apps = firmwarePath ? this._discoverApps(firmwarePath) : [];
        const hasBuild = firmwarePath
            ? fs.existsSync(path.join(firmwarePath, 'wasm', 'build', 'cyberfidget.js'))
            : false;

        let wasmJsUri = '';
        let wasmWasmUri = '';
        if (firmwarePath && hasBuild) {
            const buildDir = vscode.Uri.file(path.join(firmwarePath, 'wasm', 'build'));
            wasmJsUri  = webview.asWebviewUri(vscode.Uri.joinPath(buildDir, 'cyberfidget.js')).toString();
            wasmWasmUri = webview.asWebviewUri(vscode.Uri.joinPath(buildDir, 'cyberfidget.wasm')).toString();
        }

        const shortPath = firmwarePath
            ? (firmwarePath.length > 32 ? '…' + firmwarePath.slice(-31) : firmwarePath)
            : '';

        const appOptions = apps.map(a => `<option value="${a}">${a}</option>`).join('');
        const wasmScriptTag = hasBuild
            ? `<script nonce="${nonce}" src="${wasmJsUri}"></script>`
            : '';

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'nonce-${nonce}' 'wasm-unsafe-eval';
               style-src 'nonce-${nonce}';
               connect-src ${csp};">
<style nonce="${nonce}">
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #0e0e0e;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #666;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 8px;
}
.bar {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #141414;
    border: 1px solid #222;
    border-radius: 4px;
    padding: 6px 8px;
}
.bar .label { color: #444; flex-shrink: 0; }
.bar .value { color: #777; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .value.none { color: #333; font-style: italic; }
btn-sm, .btn-sm {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 3px;
    color: #888;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 3px 8px;
    flex-shrink: 0;
}
.btn-sm:hover { background: #252525; color: #aaa; }
.btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-build {
    background: #1a2e1a;
    border: 1px solid #2a4a2a;
    border-radius: 3px;
    color: #5a9a5a;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 3px 10px;
    flex-shrink: 0;
}
.btn-build:hover { background: #1e3a1e; }
.btn-build:disabled { opacity: 0.4; cursor: not-allowed; }
select {
    flex: 1;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 3px;
    color: #888;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 3px 4px;
    min-width: 0;
}
select:disabled { opacity: 0.4; }
#screen-bezel {
    background: #000;
    border: 2px solid #1e1e1e;
    border-radius: 3px;
    padding: 3px;
}
canvas {
    display: block;
    width: 100%;
    aspect-ratio: 2 / 1;
    image-rendering: pixelated;
    background: #050505;
}
.btn-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
}
.device-btn {
    padding: 7px 4px;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-bottom: 2px solid #0a0a0a;
    border-radius: 4px;
    color: #555;
    font-size: 10px;
    font-family: 'Courier New', monospace;
    cursor: pointer;
    user-select: none;
    text-align: center;
}
.device-btn:hover { background: #1a1a1a; }
.device-btn.pressed {
    background: #252525;
    border-bottom-width: 1px;
    transform: translateY(1px);
    color: #aaa;
}
#slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #333;
}
input[type=range] { flex: 1; accent-color: #333; }
#status { color: #2a2a2a; font-size: 10px; text-align: center; }
#build-console {
    background: #080808;
    border: 1px solid #181818;
    border-radius: 3px;
    padding: 5px 6px;
    max-height: 120px;
    overflow-y: auto;
    font-size: 10px;
    color: #444;
    white-space: pre-wrap;
    word-break: break-all;
    display: none;
}
#build-console.visible { display: block; }
#build-console .err { color: #883333; }
#build-console .ok  { color: #336633; }
#no-build {
    text-align: center;
    color: #333;
    padding: 20px 0;
    font-size: 10px;
    line-height: 1.8;
}
</style>
</head>
<body>

<!-- Folder bar -->
<div class="bar">
    <span class="label">fw:</span>
    <span class="value ${firmwarePath ? '' : 'none'}">${shortPath || 'not set'}</span>
    <button class="btn-sm" id="btn-folder">📁 Change</button>
</div>

<!-- Build bar -->
<div class="bar">
    <select id="app-select" ${apps.length === 0 ? 'disabled' : ''}>
        ${apps.length === 0
            ? '<option value="">— no firmware —</option>'
            : appOptions}
    </select>
    <button class="btn-build" id="btn-build" ${apps.length === 0 ? 'disabled' : ''}>▶ Build</button>
</div>

<!-- Build console -->
<div id="build-console"></div>

<!-- Emulator -->
${hasBuild ? `
<div id="screen-bezel">
    <canvas id="screen" width="128" height="64"></canvas>
</div>
<div class="btn-grid">
    <button class="device-btn" id="btn0">Top-Left [Q]</button>
    <button class="device-btn" id="btn1">Top-Right [E]</button>
    <button class="device-btn" id="btn2">Mid-Left [A]</button>
    <button class="device-btn" id="btn3">Mid-Right [D]</button>
    <button class="device-btn" id="btn4">Bot-Left [Z]</button>
    <button class="device-btn" id="btn5">Bot-Right [C]</button>
</div>
<div id="slider-row">
    <span>Slider</span>
    <input type="range" id="slider" min="0" max="4095" value="2048">
</div>
<div id="status">Loading…</div>
` : `<div id="no-build">Select a firmware folder<br>pick an app and click ▶ Build</div>`}

${wasmScriptTag}
<script nonce="${nonce}">
(function () {
    const vsc = acquireVsCodeApi();

    // ---- Folder / build controls ----
    document.getElementById('btn-folder').addEventListener('click', function () {
        vsc.postMessage({ command: 'selectFolder' });
    });

    const buildBtn = document.getElementById('btn-build');
    const appSelect = document.getElementById('app-select');
    const buildCon = document.getElementById('build-console');

    function addLine(text, cls) {
        if (!buildCon) return;
        buildCon.classList.add('visible');
        const el = document.createElement('span');
        if (cls) el.className = cls;
        el.textContent = text;
        buildCon.appendChild(el);
        buildCon.scrollTop = buildCon.scrollHeight;
    }

    if (buildBtn) {
        buildBtn.addEventListener('click', function () {
            const app = appSelect ? appSelect.value : '';
            if (!app) return;
            vsc.postMessage({ command: 'build', app });
        });
    }

    window.addEventListener('message', function (ev) {
        const msg = ev.data;
        if (msg.command === 'buildStart') {
            if (buildCon) { buildCon.innerHTML = ''; buildCon.classList.add('visible'); }
            if (buildBtn) buildBtn.disabled = true;
            addLine('Building ' + (appSelect ? appSelect.value : '') + '…\\n', 'ok');
        } else if (msg.command === 'buildLine') {
            addLine(msg.text, msg.isErr ? 'err' : null);
        } else if (msg.command === 'buildDone') {
            if (buildBtn) buildBtn.disabled = false;
            addLine(msg.success ? '\\n✓ Build succeeded — reloading emulator…\\n' : '\\n✗ Build failed.\\n',
                    msg.success ? 'ok' : 'err');
        }
    });

    // ---- Emulator ----
    ${hasBuild ? `
    const W = 128, H = 64;
    const canvas = document.getElementById('screen');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const status = document.getElementById('status');
    const wasmUrl = '${wasmWasmUri}';

    function renderFrame(buf) {
        if (!ctx) return;
        const img = ctx.createImageData(W, H);
        const d = img.data;
        for (let i = 0; i < W * H; i++) {
            const on = buf[i];
            d[i*4]   = on ? 220 : 5;
            d[i*4+1] = on ? 220 : 5;
            d[i*4+2] = on ? 220 : 8;
            d[i*4+3] = 255;
        }
        ctx.putImageData(img, 0, 0);
    }

    window.onerror = function(msg, src, line) { addLine('ERROR: ' + msg + ':' + line, 'err'); };

    CyberFidgetModule({
        locateFile: function(f) { return f.endsWith('.wasm') ? wasmUrl : f; },
        instantiateWasm: function(imports, cb) {
            fetch(wasmUrl, { cache: 'no-cache' })
                .then(function(r) { return r.arrayBuffer(); })
                .then(function(b) { return WebAssembly.instantiate(b, imports); })
                .then(function(r) { cb(r.instance, r.module); })
                .catch(function(e) { addLine('WASM error: ' + e.message, 'err'); });
            return {};
        },
        onFrameReady: renderFrame,
        print:    function(s) { addLine(s); },
        printErr: function(s) { addLine(s, 'err'); },
    }).then(function(mod) {
        if (status) status.textContent = 'Running  —  Q/E  A/D  Z/C  —  1-0 slider';

        function press(i)   { mod._wasm_button_press(i); }
        function release(i) { mod._wasm_button_release(i); }

        const keyMap = { q:0, e:1, a:2, d:3, z:4, c:5 };
        const sliderKeys = '1234567890';
        const held = new Set();

        document.addEventListener('keydown', function(ev) {
            const i = keyMap[ev.key.toLowerCase()];
            if (i !== undefined && !held.has(i)) {
                held.add(i);
                press(i);
                document.getElementById('btn' + i) && document.getElementById('btn' + i).classList.add('pressed');
                return;
            }
            const sliderIdx = sliderKeys.indexOf(ev.key);
            if (sliderIdx !== -1) {
                const value = Math.round(sliderIdx * 4095 / 9);
                const sliderEl = document.getElementById('slider');
                if (sliderEl) sliderEl.value = value;
                mod._wasm_set_slider(value);
            }
        });
        document.addEventListener('keyup', function(ev) {
            const i = keyMap[ev.key.toLowerCase()];
            if (i !== undefined) {
                held.delete(i);
                release(i);
                document.getElementById('btn' + i) && document.getElementById('btn' + i).classList.remove('pressed');
            }
        });

        for (let i = 0; i < 6; i++) {
            (function(idx) {
                const btn = document.getElementById('btn' + idx);
                if (!btn) return;
                btn.addEventListener('mousedown',  function() { press(idx); btn.classList.add('pressed'); });
                btn.addEventListener('mouseup',    function() { release(idx); btn.classList.remove('pressed'); });
                btn.addEventListener('mouseleave', function() { release(idx); btn.classList.remove('pressed'); });
            })(i);
        }

        document.getElementById('slider') && document.getElementById('slider').addEventListener('input', function(ev) {
            mod._wasm_set_slider(parseInt(ev.target.value));
        });
    }).catch(function(e) {
        if (status) status.textContent = 'Error loading WASM';
        addLine('Error: ' + e.message, 'err');
    });
    ` : ''}
})();
</script>
</body>
</html>`;
    }
}
