# NexusFleet

NexusFleet is a local-first Meta Quest fleet simulator and desktop operations app.

The same Next.js interface runs in two environments:

- GitHub Pages uses the deterministic simulator and never writes to hardware.
- Electron uses a secure preload bridge and Node services for local ADB operations or the supervised Quest Device Twin.

No external production web server is required. The desktop app serves its bundled static Next.js export on a private loopback listener so the exported application hydrates correctly.

## Current capabilities

- Browser simulation plus a separate, supervised Quest Device Twin process for Electron.
- Deterministic virtual time, seeded scenarios, bounded traces and fault injection.
- Thirty initial scenarios covering authorization, disconnects, restarts, Wi-Fi, install, launch, storage, serial and provider failures.
- A small MCP gateway with six allowlisted simulation tools.
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
npm run twin:test
npm run typecheck
npm run build:web
npm run dev:desktop
```

## Quest Device Twin and MCP

The Twin reproduces the ADB behavior NexusFleet relies on; it is not a complete Quest OS emulator. It supports only typed, allowlisted operations and has no arbitrary shell command interface. Start the standalone MCP gateway with:

```bash
npm run twin:mcp
```

Its tools are `quest_sim_start`, `quest_sim_load_scenario`, `quest_sim_inject_fault`, `quest_sim_step`, `quest_sim_inspect`, and `quest_sim_stop`. The gateway starts its own supervised Twin by default. To control an already-running desktop Twin, set `NEXUSFLEET_TWIN_ENDPOINT` to the loopback endpoint reported by the desktop runtime.

Scenario definitions live in `scenarios/quest/scenarios.json`. Runs are deterministic for the same seed, inputs and virtual-time steps. Traces are bounded and redact credential- and path-like fields before export.

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

The Twin validates orchestration and recovery. A physical Quest remains required for USB behavior, headset authorization dialogs and Meta runtime proof; an ArborXR/HMS pilot remains required for managed-enrollment proof.
