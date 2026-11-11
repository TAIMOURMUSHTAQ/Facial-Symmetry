/* The guided examination. Each step tells the clinician what to say, what to watch for, and how the
   camera turns a frame into a per-side excursion ([right, left], patient's sides, ICD units, bigger = more movement).

   kind:
     rest     still, relaxed face; reference for every other step
     move     voluntary movement, measured as change from rest
     gaze     eye movement with the head still
     sustain  long hold (fatigue)
     repeat   repeated movement (fatigue)
     observe  passive observation (twitching, blink rate)
     rate     the camera cannot measure it; the clinician rates what they see (a frame can still be captured) */

const pos = v => Math.max(0, v);

export const GROUPS = [
  { id: "baseline", name: "Baseline" },
  { id: "facial", name: "Facial movements" },
  { id: "eyes", name: "Eyes and gaze" },
  { id: "fatigue", name: "Fatigue and involuntary movement" },
  { id: "oral", name: "Jaw, tongue and palate" }
];

export const STEPS = [
  {
    id: "rest", group: "baseline", kind: "rest", dur: 5, required: true,
    title: "Resting face",
    say: "Relax your face completely and look straight at the camera.",
    watch: "Mouth corner droop, flattened nasolabial fold, eyelid height, eye opening width, brow height, swelling or contour differences."
  },
  {
    id: "brow", group: "facial", kind: "move", dur: 4, branch: "temporal", region: "forehead", sunny: "Brow lift",
    title: "Raise eyebrows",
    say: "Raise both eyebrows as high as you can, as if you are surprised.",
    watch: "Forehead wrinkles on both sides. If the forehead moves on both sides but the mouth is weak, think of a central (upper motor neuron) cause.",
    delta: (m, r) => [pos(m.browR - r.browR), pos(m.browL - r.browL)]
  },
  {
    id: "eye_gentle", group: "facial", kind: "move", dur: 4, branch: "zygomatic", region: "eyes", sunny: "Gentle eye closure",
    title: "Close eyes gently",
    say: "Close your eyes gently, as if you are falling asleep.",
    watch: "Any gap between the lids (lagophthalmos), and the eye rolling up behind an open lid (Bell's phenomenon).",
    delta: (m, r) => [pos(1 - m.apR / r.apR), pos(1 - m.apL / r.apL)]
  },
  {
    id: "eye_tight", group: "facial", kind: "move", dur: 4, branch: "zygomatic", region: "eyes",
    title: "Squeeze eyes shut",
    say: "Squeeze your eyes shut as tightly as you can.",
    watch: "Eyelashes buried equally on both sides. Mouth corner pulling up on one side during closure suggests synkinesis.",
    delta: (m, r) => [pos(1 - m.apR / r.apR), pos(1 - m.apL / r.apL)]
  },
  {
    id: "snarl", group: "facial", kind: "move", dur: 4, branch: "buccal", region: "midface", sunny: "Snarl",
    title: "Wrinkle nose",
    say: "Wrinkle your nose and lift your upper lip, like a snarl.",
    watch: "Lift of the nostril and upper lip on each side.",
    delta: (m, r) => [pos(((r.alaR - m.alaR) + (r.ulR - m.ulR)) / 2), pos(((r.alaL - m.alaL) + (r.ulL - m.ulL)) / 2)]
  },
  {
    id: "smile", group: "facial", kind: "move", dur: 4, branch: "buccal", region: "mouth", sunny: "Open mouth smile",
    title: "Big smile",
    say: "Give me a big smile showing your teeth.",
    watch: "Corner lift and nasolabial fold on each side. One eye narrowing during the smile suggests synkinesis.",
    delta: (m, r) => [Math.hypot(pos(m.mcxR - r.mcxR), pos(r.mcyR - m.mcyR)), Math.hypot(pos(m.mcxL - r.mcxL), pos(r.mcyL - m.mcyL))]
  },
  {
    id: "pucker", group: "facial", kind: "move", dur: 4, branch: "buccal", region: "mouth", sunny: "Lip pucker",
    title: "Pucker lips",
    say: "Pucker your lips as if to whistle or give a kiss.",
    watch: "Both corners moving towards the middle equally; lips drifting to the strong side.",
    delta: (m, r) => [pos(r.mcxR - m.mcxR), pos(r.mcxL - m.mcxL)]
  },
  {
    id: "cheek", group: "facial", kind: "move", dur: 4, branch: "buccal", region: "cheeks", lowReliability: true,
    title: "Puff cheeks",
    say: "Fill your cheeks with air and hold it in.",
    watch: "Air escaping from one corner of the mouth; press gently on each cheek to test the lip seal.",
    delta: (m, r) => [pos(r.chzR - m.chzR), pos(r.chzL - m.chzL)],
    rating: [{ key: "airLeak", label: "Air leak from the mouth", options: [["none", "No leak"], ["R", "Leaks on patient's right"], ["L", "Leaks on patient's left"], ["both", "Cannot hold air"]] }]
  },
  {
    id: "lower_teeth", group: "facial", kind: "move", dur: 4, branch: "marginal", region: "mouth",
    title: "Show bottom teeth",
    say: "Pull your lower lip down to show your bottom teeth.",
    watch: "Lower lip depression on each side (marginal mandibular branch).",
    delta: (m, r) => [pos(m.llR - r.llR), pos(m.llL - r.llL)]
  },
  {
    id: "gaze_left", group: "eyes", kind: "gaze", dur: 3, dir: "left", region: "gaze",
    title: "Look to their left",
    say: "Keep your head still and look to your left (follow my finger).",
    watch: "Left eye moving out (abduction, CN VI) and right eye moving in (adduction, CN III). Ask about double vision."
  },
  {
    id: "gaze_right", group: "eyes", kind: "gaze", dur: 3, dir: "right", region: "gaze",
    title: "Look to their right",
    say: "Keep your head still and look to your right.",
    watch: "Right eye moving out (CN VI) and left eye moving in (CN III)."
  },
  {
    id: "gaze_up", group: "eyes", kind: "gaze", dur: 3, dir: "up", region: "gaze",
    title: "Look up",
    say: "Keep your head still and look up.",
    watch: "Both eyes elevating equally (CN III). Lids should follow the eyes up."
  },
  {
    id: "gaze_down", group: "eyes", kind: "gaze", dur: 3, dir: "down", region: "gaze",
    title: "Look down",
    say: "Keep your head still and look down.",
    watch: "Both eyes depressing equally (CN III and CN IV)."
  },
  {
    id: "upgaze_hold", group: "fatigue", kind: "sustain", dur: 30, region: "eyes",
    title: "Hold upward gaze (fatigue test)",
    say: "Keep your head still and keep looking up at the ceiling. Hold it there.",
    watch: "An eyelid slowly drooping during the hold (fatigable ptosis) suggests myasthenia gravis. Ask about double vision appearing."
  },
  {
    id: "smile_repeat", group: "fatigue", kind: "repeat", dur: 12, region: "mouth",
    title: "Repeated smiles (fatigue test)",
    say: "Smile big, then relax. Keep repeating until I say stop.",
    watch: "Smiles getting weaker with repetition (fatigable weakness).",
    delta: (m, r) => [Math.hypot(pos(m.mcxR - r.mcxR), pos(r.mcyR - m.mcyR)), Math.hypot(pos(m.mcxL - r.mcxL), pos(r.mcyL - m.mcyL))]
  },
  {
    id: "observe", group: "fatigue", kind: "observe", dur: 12, region: "global",
    title: "Quiet observation",
    say: "Sit quietly and relax. You can blink normally.",
    watch: "Twitching around one eye or mouth corner (hemifacial spasm), rippling of the skin (myokymia), forceful blinking (blepharospasm), or very few blinks with a mask-like face (parkinsonism)."
  },
  {
    id: "jaw", group: "oral", kind: "move", dur: 4, region: "jaw",
    title: "Open jaw wide",
    say: "Open your mouth as wide as you can.",
    watch: "The jaw deviating to one side on opening (it deviates towards the weak pterygoid, CN V3), clicking or pain (TMJ).",
    delta: (m, r) => { const o = Math.max(0, m.jaw - r.jaw); return [o, o]; }
  },
  {
    id: "tongue", group: "oral", kind: "rate", region: "tongue",
    title: "Tongue protrusion",
    say: "Stick your tongue straight out, then move it side to side.",
    watch: "The tongue deviates towards the weak side (CN XII). Look for wasting or fasciculations with the tongue resting in the mouth.",
    rating: [
      { key: "deviation", label: "On protrusion", options: [["midline", "Midline"], ["R", "Deviates to patient's right"], ["L", "Deviates to patient's left"], ["cannot", "Cannot protrude"]] },
      { key: "wasting", label: "Wasting", options: [["none", "None"], ["R", "Right side"], ["L", "Left side"], ["both", "Both sides"]] },
      { key: "fasciculations", label: "Fasciculations", options: [["no", "No"], ["yes", "Yes"]] },
      { key: "lateral", label: "Side-to-side movement", options: [["normal", "Normal"], ["weakR", "Weak towards right"], ["weakL", "Weak towards left"], ["slow", "Slow / reduced both ways"]] }
    ]
  },
  {
    id: "palate", group: "oral", kind: "rate", region: "tongue",
    title: "Palate and voice",
    say: "Open your mouth wide and say “aah”.",
    watch: "Use a torch. The uvula is pulled AWAY from the weak side (CN IX/X). Listen for a nasal or hoarse voice.",
    rating: [
      { key: "uvula", label: "Uvula on “aah”", options: [["midline", "Midline"], ["R", "Pulled to patient's right"], ["L", "Pulled to patient's left"], ["notSeen", "Not seen"]] },
      { key: "elevation", label: "Palate elevation", options: [["symmetric", "Symmetric"], ["weakR", "Weak on right"], ["weakL", "Weak on left"], ["weakBoth", "Weak on both sides"]] },
      { key: "voice", label: "Voice", options: [["normal", "Normal"], ["nasal", "Nasal"], ["hoarse", "Hoarse / breathy"], ["dysarthric", "Slurred (dysarthria)"]] }
    ]
  }
];

export const STEP = Object.fromEntries(STEPS.map(s => [s.id, s]));
export const MOTOR_STEPS = ["brow", "eye_gentle", "eye_tight", "snarl", "smile", "pucker", "cheek", "lower_teeth"];
export const UPPER_STEPS = ["brow", "eye_gentle", "eye_tight"];
export const LOWER_STEPS = ["snarl", "smile", "pucker", "cheek", "lower_teeth"];

/** Live excursion score used to pick the evidence frame for a step. */
export function stepScore(step, m, rest) {
  if (!rest || !step.delta) return 0;
  const [a, b] = step.delta(m, rest);
  return a + b;
}
