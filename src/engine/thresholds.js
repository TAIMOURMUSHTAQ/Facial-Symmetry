/* All decision thresholds live here so they can be tuned against real patient data.
   Units: ICD = inter-canthal distance (~30-35 mm in adults); ratios are 0..1.
   THESE ARE STARTING ESTIMATES, NOT VALIDATED CUT-OFFS. Calibrate on recorded normal and patient sessions
   before clinical use. */
export const T = {
  validFrameRatio: 0.5,          // below this share of usable frames a step is marked low quality
  noise: 0.025,                  // excursions below this are treated as "no detectable movement"

  // asymmetry of a voluntary movement, 1 - weaker/stronger
  asym: [0.15, 0.30, 0.60],      // mild, moderate, marked

  // minimum normal excursion per side (ICD); both sides below = bilateral reduction
  minExc: { brow: 0.05, eye_gentle: 0.55, eye_tight: 0.65, snarl: 0.025, smile: 0.08, pucker: 0.035, cheek: 0.015, lower_teeth: 0.03 },

  closureComplete: 0.85,         // gentle/tight closure fraction below this = a visible gap remains

  rest: {
    droop: [0.04, 0.08, 0.14],   // mouth-corner height difference
    brow: [0.05, 0.09, 0.15],    // brow height difference
    mrd1Low: 0.075,              // upper lid to iris centre (~2.5 mm): ptosis
    mrd1Diff: [0.035, 0.07, 0.12],
    mrd2Diff: 0.04,              // lower lid raised on one side (reverse ptosis, Horner's)
    mrd1High: 0.2, mrd2High: 0.25, // lid retraction / scleral show
    apWide: [0.15, 0.25, 0.4],   // one eye opening wider than the other (relative)
    face: [0.05, 0.09, 0.15],    // half-face width difference (relative)
    chin: [0.05, 0.09, 0.15]     // chin off midline at rest
  },

  synk: { eyeNarrow: [0.15, 0.25, 0.35], mouthMove: [0.04, 0.07, 0.11] },
  gaze: { minExc: 0.05, limit: [0.6, 0.4, 0.2], headMovedDeg: 8 },
  fatigue: { lidDrop: [0.035, 0.06, 0.1], smileDecline: [0.25, 0.4, 0.6], minReps: 3 },
  blink: { low: 8, high: 35 },   // blinks per minute at rest
  twitch: { events: [2, 4, 7] },
  jaw: { dev: [0.05, 0.09, 0.15], openLow: 0.3 }
};

/** 0 none, 1 mild, 2 moderate, 3 marked */
export const grade3 = (v, [a, b, c]) => (v >= c ? 3 : v >= b ? 2 : v >= a ? 1 : 0);
export const SEV = ["None", "Mild", "Moderate", "Marked"];
