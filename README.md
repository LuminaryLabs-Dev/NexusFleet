# NexusFleet

NexusFleet is a local-first Meta Quest fleet simulator and desktop operations app.

The same Next.js interface runs in two environments:

- GitHub Pages uses the deterministic simulator and never writes to hardware.
- Electron uses a secure preload bridge and Node services for local ADB operations.

No production web server is required. The desktop app loads a static Next.js export from its own bundle.

## Current capabilities

- Browser and Electron simulation modes.
- Existing asynchronous deployment state machine and 5,000-device stress proof.
- Local ADB discovery with connected, unauthorized, offline, USB and Wi-Fi states.
- APK metadata inspection, install, launch, stop and uninstall operations.
- Bounded logs, device information and screenshot capture.
- Per-device job locks, deduplication, cancellation and retry foundations.
- Sandboxed Electron renderer with an allowlisted IPC bridge.
- Optional packaged Python sidecar using JSON Lines over standard input/output.

ArborXR/HMS integration and physical Quest validation are intentionally still pending.

## Development

```bash
npm install
npm test
npm run sidecar:test
npm run typecheck
npm run build:web
npm run dev:desktop
```

## Desktop packaging

```bash
python3 -m pip install pyinstaller==6.22.2
npm run pack:dir
```

For a self-contained release, stage the licensed Android SDK Platform Tools under `resources/platform-tools/<platform>-<architecture>/` before packaging. During development NexusFleet can report and use an existing verified `adb` installation.

## Local headset proof

1. Enable Developer Mode on the Quest.
2. Connect it by USB and approve debugging inside the headset.
3. Start NexusFleet and select **Local device**.
4. Confirm the device is shown as **Connected**.
5. Choose an APK, install it, then launch it.

Local testing does not require ArborXR or HMS enrollment.
