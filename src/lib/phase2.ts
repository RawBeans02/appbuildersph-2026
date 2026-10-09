// Phase 2 (the owner's call, Fri ~8:15 PM) is built behind one build flag:
// VITE_PHASE2=1 turns it on; unset, the app is the offline core and phase 2
// is hidden. Never on the offline demo path.
export const PHASE2: boolean = ['1', 'true'].includes(String(import.meta.env.VITE_PHASE2 ?? '').toLowerCase())
