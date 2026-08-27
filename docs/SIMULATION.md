# Simulation Validation

NexusFleet has two explicitly simulated runtimes. GitHub Pages uses the lightweight in-browser fleet engine. Electron starts a supervised Quest Device Twin child process and reaches it through the same typed device-operation contract used by the real ADB adapter.

The Twin models NexusFleet's ADB-facing behavior, device state, timing and failures. It does not emulate Android, Meta's Quest runtime, physical USB or actual ArborXR/HMS enrollment.

## Twin architecture

- A deterministic virtual clock and seeded scenario engine.
- A bounded device state machine supporting up to 5,000 devices.
- Typed virtual ADB operations; arbitrary shell commands are rejected.
- A bounded, sanitized trace recorder and deterministic trace replayer.
- A fault injector for connection, install, application and provider failures.
- A loopback-only JSON Lines process protocol.
- Crash supervision with at most three automatic restarts and mutation-log restoration.
- A six-tool MCP stdio gateway using the official MCP SDK.

The initial scenario catalog contains 30 unique cases in `scenarios/quest/scenarios.json`. It covers USB authorization, RSA rejection, cable flaps, ADB offline/restarts, slow boot, recovery/Fastboot, Wi-Fi instability, install errors, app failures, storage pressure, serial changes, multi-device storms and ArborXR/HMS adapter-contract failures.

## Validation tiers

| Tier | What it proves |
| --- | --- |
| Quest Device Twin | Deterministic control flow, concurrency and failure recovery |
| Android Emulator | Optional generic APK install and lifecycle smoke tests |
| Physical Quest | USB, authorization dialogs and Meta runtime behavior |
| ArborXR/HMS pilot | Real managed enrollment and provider behavior |

Run `npm run twin:test` for focused Twin tests or `npm test` for the complete suite. Run `npm run twin:mcp` to expose `quest_sim_start`, `quest_sim_load_scenario`, `quest_sim_inject_fault`, `quest_sim_step`, `quest_sim_inspect`, and `quest_sim_stop` over MCP stdio.

The Next.js interface selects the browser simulation bridge when Electron's preload API is absent. A public Pages deployment therefore cannot access local tooling or devices.
