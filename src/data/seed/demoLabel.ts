import type { StockLot } from '../db/types'

// The synthetic doxycycline box the presenter scans in the demo's stock step.
// Its label is printed in docs/demo/label-doxy-24A.png (made by
// scripts/demo-label/make_label.py): "Doxycycline 100 mg capsules",
// "LOT: DEMO-LOT-24A", "EXP: 11/2026", marked "DEMO · NOT A REAL MEDICINE ·
// SAMPLE DATA". The OCR reads drug, strength, lot and expiry; the health worker
// types the quantity. With the seed's DEMO-LOT-25B (10 capsules) that makes
// 40 capsules on hand, 30 of them expiring within 6 weeks on the demo days
// (Oct 9 and 10, 2026). The expiry is printed, so unlike the seed it does not
// move with today.
export const DEMO_SCAN_LABEL: Readonly<Pick<StockLot, 'drug' | 'strength' | 'lot' | 'expiry' | 'quantity' | 'unit'>> = {
  drug: 'Doxycycline',
  strength: '100 mg',
  unit: 'capsule',
  lot: 'DEMO-LOT-24A',
  quantity: 30,
  expiry: '2026-11',
}
