# Offline response loop

Use the existing paper/surface, ink, muted, border, primary and warning tokens;
the existing Button, Field, StateBlock, FlowTopBar, ScreenHeader and BottomSheet.
No new font, icon family or colour system.

Laptop: an approval exposes **Make return QR**; the log exposes the same action.
A sheet identifies the immutable approval/week, lets the officer choose a
recipient, previews only their structured actions, and shows a black-on-white
QR with the existing four-module quiet zone and the municipal fingerprint.
The display stays awake. Empty recipients explain that no action applies.

Phone: **Receive RHU instructions** is reachable from Send and Home. The initial
screen offers camera scan, an image input and pasted QR text. Verification stops
the camera. First trust displays the fingerprint in monospace and requires an
explicit comparison checkbox before Save is enabled. A changed key explains
that pairing must be reset and checked again. Errors never echo untrusted text.

Preview: recipient, reporting week, approving role/time, ordered action list,
and the warning that these are logistics, never doses. Save is a separate
explicit action. Cancel leaves both trust and instructions untouched. Success
links Home; duplicate receipts say already saved, stale receipts cannot replace
the current approval. Home displays the saved instructions with their week and
approval time, including after offline reload. Nothing implies completion or
changes inventory. Sample data remains clearly labelled.

Layout: single column, 20px phone padding, 16px gaps, 48px minimum controls;
bordered surface cards with existing 16px radius; QR max-width 360px. Status
messages use aria-live; errors use role=alert; all fields have explicit labels.
