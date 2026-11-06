# Benign low-resolution text interpretation validation

Date: 2026-11-06. Classification: deterministic methodology validation, no CTF answer or verifier use.

## Procedure

`validate.py` generated two distinct low-resolution one-line raster examples from installed DejaVu Sans Mono and Lato fonts. Each was downscaled and mildly blurred, then tested with Tesseract 5.5.0 PSM 7 on native and 4× images, using grayscale/R/G/B planes after zero-cutoff autocontrast. Both test strings and expected values are synthetic benign fixture data, preserved in `fixtures/`; `results.json` records every recognition.

## Results

- Sample A: exact text in 8/12 OCR variants; grayscale native and grayscale 4× Lanczos were exact.
- Sample B: exact text in 8/12; grayscale native and grayscale 4× Lanczos were exact. Blue-channel contrast also succeeded in the broader exploratory matrix.
- Negative control with visually confusable `O/0` and `l/1`: 0/12 exact. OCR repeatedly collapsed distinct glyphs.
- Nearest-neighbor enlargement and fixed thresholding were inconsistent or degraded output.

This supports a small candidate-generation aid: preserve the original; inspect grayscale and individual color channels; compare native-size and moderate Lanczos enlargement with single-line OCR; retain disagreements as uncertainty. It does **not** support selecting the most frequent OCR result as truth. Ambiguous glyphs require visual segmentation/context or another independent representation.

## PCAPIN transfer check

The same bounded transforms were run on the already recovered player-side PNG after benign validation. Tesseract produced variant readings but no stable exact transcription. This exposed development artifact remains unsolved; no verifier digest or source answer was used in this transfer check. Exact OCR outputs are retained only in the solver workspace, not this report.

## Reproduction

Run `python3 validate.py` in this directory. Requirements observed: Python 3.14, Pillow 12.2.0, Tesseract 5.5.0, DejaVu Sans Mono and Lato font files at the absolute paths in the script. Fixture SHA-256 values are printed by the script. Results may vary with OCR engine or font package versions.
