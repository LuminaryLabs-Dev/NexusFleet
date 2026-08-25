# Simulation Validation

NexusFleet simulation mode is intentionally offline. It models the deployment state machine and ADB/Fastboot command surface without claiming real Meta or ArborXR enrollment.

Validated locally before push:

- one-device deployment
- ADB device listing, model query, install and package listing
- 5,000-device concurrent stress pass
- deterministic failure state support
- GitHub Pages static build import validation
