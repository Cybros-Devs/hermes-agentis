# Blueprint Harness (`tools/blueprint/`)

Reproducible visual capture, frame-delta measurement, and before/after comparison harness for Hermes Duet character animations.

## Commands

```sh
# Capture baseline frames and contact sheets before edits
npx tsx tools/blueprint/capture-character.ts --label before

# Capture after animation improvements and compute before/after diff metrics
npx tsx tools/blueprint/capture-character.ts --label after --baseline blueprint-out/data/report-before.json
```

Outputs are written to `blueprint-out/` (gitignored):
- `blueprint-out/ui/<label>/`: raw 2x PNG frames (`432x396`) and contact sheets (`sheet_*.png`)
- `blueprint-out/data/report-<label>.json`: deterministic hashes, bounding/clipping checks, frame-to-frame deltas, and render timings
