# Release checklist

Run from the system folder with the design-system skill's scripts. Every line must be green before
the system is approved or a round/PR built on it is posted.

- [ ] `build-tokens.mjs .` - exit 0, build/ regenerated
- [ ] `check-system.mjs .` - exit 0: every role in every mode, no literal without a source, components through roles only
- [ ] `contrast.mjs .` - exit 0 in every mode and brand, glass over its worst backdrop point
- [ ] `specimen.mjs .` - regenerated, looked at in every mode and brand
- [ ] `visual-compare.mjs` - specimen components next to reference/ screens, looked at
- [ ] `specimen/APPROVED.md` exists (who, when, their words)
