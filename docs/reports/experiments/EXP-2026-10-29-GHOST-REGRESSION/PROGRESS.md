# Progress


## 2026-10-29 — Initial artifact triage
- `artifacts/capture.pcap` is 31,272 bytes, SHA-256 `69cba9a6e4057136a72f8de3d6959e04219312b6741fd8db973c1a8b0e210508`; `file` reports generic data and `tshark` rejects it as an unsupported capture.
- Manual little-endian parsing validates a classic PCAP global header except its first magic byte (`c4 c3 b2 a1`, expected `d4 c3 b2 a1` for little-endian microsecond PCAP); records parse cleanly as 504 entries ending exactly at byte 31,272.
- Opened the focused network PCAP reference. Next: repair only a working copy's magic byte, then inspect protocol fields and metadata symmetrically for signal and decoys.
