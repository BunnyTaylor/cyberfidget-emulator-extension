# CyberFidget Emulator

A VS Code extension that emulates the [CyberFidget](https://github.com/BunnyTaylor/cyberfidget-bunny) hardware — a 128x64 OLED handheld with six buttons and an analog slider — directly in the sidebar.

Build any app from your CyberFidget firmware repository to WebAssembly and run it without flashing the device.

## Features

- 128x64 OLED display rendered to a pixel-accurate canvas
- Six on-screen buttons with keyboard shortcuts (Q/E, A/D, Z/C)
- Analog slider input
- One-click WASM build of any app from the firmware's `CMakeLists.txt`
- Live build console with auto-reload on success

## Requirements

This extension only emulates apps — you need a CyberFidget firmware checkout to build from.

- A clone of the [CyberFidget firmware repo](https://github.com/BunnyTaylor/cyberfidget-bunny) (or any compatible firmware with a `wasm/` directory)
- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) installed and available on your `PATH`
- CMake 3.10+

## Usage

1. Open the **CyberFidget Emulator** panel from the activity bar.
2. Click **Change** and select your firmware folder (the repo root, not the `wasm/` subdirectory).
3. Pick an app from the dropdown and click **▶ Build**.
4. On success, the emulator loads automatically. Use the on-screen buttons or keyboard shortcuts to interact.

### Controls

| Button       | Key |
|--------------|-----|
| Top-Left     | Q   |
| Top-Right    | E   |
| Mid-Left     | A   |
| Mid-Right    | D   |
| Bot-Left     | Z   |
| Bot-Right    | C   |

The slider beneath the screen maps to the device's analog input (0–4095). You can also snap the slider to ten preset positions with the number row: **1** is fully left, **0** is fully right, and **2–9** step evenly between.

## Troubleshooting

**Build fails with "emcc: command not found"** — Make sure you've sourced the Emscripten environment. Either run `source /path/to/emsdk/emsdk_env.sh` before launching VS Code, or add the Emscripten paths to your shell profile.

**No apps in the dropdown** — The extension scans `wasm/CMakeLists.txt` for `WASM_APP STREQUAL "<name>"` blocks. Make sure your firmware checkout is up to date and the file exists.

## License

[MIT](LICENSE)
