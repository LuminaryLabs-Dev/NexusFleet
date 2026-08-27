# Changelog

## Unreleased

- Added a supervised, deterministic Quest Device Twin process behind the shared device adapter contract.
- Added virtual time, fault injection, bounded sanitized traces, trace replay and 30 initial failure scenarios.
- Added an official-SDK MCP gateway with six allowlisted simulation tools.
- Routed Electron simulation operations through the Twin while preserving the real local ADB adapter.
- Added crash recovery with state restoration and desktop renderer hydration smoke validation.
- Replaced packaged `file:` loading with a private loopback static server for reliable Next.js hydration.

## 0.2.0

- Replaced the plain browser shell with a statically exported Next.js application.
- Added a bundled Electron desktop boundary with sandboxed, allowlisted IPC.
- Added local ADB discovery and real Quest operation adapters.
- Added APK metadata inspection and application operations.
- Added per-device job queuing, validation and bounded diagnostics.
- Added an optional packaged Python sidecar protocol.
- Preserved GitHub Pages simulation and the existing fleet engine.

## 0.1.0

- Added simulator-first NexusFleet runtime.
- Added asynchronous deployment state machine.
- Added mock ADB and Fastboot command surface.
- Added 5,000-device offline stress validation.
- Added GitHub Pages fleet simulator UI.
