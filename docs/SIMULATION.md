# Simulation Validation

NexusFleet simulation mode is intentionally offline. It models the deployment state machine and ADB/Fastboot command surface without claiming real Meta or ArborXR enrollment.

Validated locally before push:

- one-device deployment
- ADB device listing, model query, install and package listing
- 5,000-device concurrent stress pass
- deterministic failure state support
- GitHub Pages static build import validation

The Next.js interface automatically selects the simulation bridge when Electron's preload API is absent. The same components therefore operate the Electron runtime without duplicating the interface or allowing a browser deployment to access local tooling.
