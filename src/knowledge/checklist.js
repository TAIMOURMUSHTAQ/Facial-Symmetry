/* Bedside checks the camera cannot do. The clinician records the result; the reasoning engine uses it. */
export const CHECKLIST = [
  { key: "eye_resistance", q: "Eye closure against gentle resistance", options: [["normal", "Normal both sides"], ["weakR", "Weak on right"], ["weakL", "Weak on left"]] },
  { key: "bells_phenomenon", q: "Bell's phenomenon (eye rolls up on attempted closure)", options: [["absent", "Not seen / eye closes"], ["R", "Seen on right"], ["L", "Seen on left"]] },
  { key: "pupils", q: "Pupils (size and light reaction)", options: [["equal", "Equal and reactive"], ["R_larger", "Right larger"], ["L_larger", "Left larger"]] },
  { key: "corneal", q: "Corneal reflex", options: [["normal", "Normal"], ["reducedR", "Reduced on right"], ["reducedL", "Reduced on left"]] },
  { key: "sensation", q: "Facial sensation (forehead, cheek, jaw)", options: [["normal", "Normal"], ["reducedR", "Reduced on right"], ["reducedL", "Reduced on left"]] },
  { key: "masseter", q: "Jaw clench (feel masseter and temporalis)", options: [["normal", "Normal"], ["weakR", "Weak on right"], ["weakL", "Weak on left"]] },
  { key: "hearing", q: "Hearing (whisper, Rinne and Weber)", options: [["normal", "Normal"], ["reducedR", "Reduced on right"], ["reducedL", "Reduced on left"]] },
  { key: "otoscopy", q: "Ear examination (otoscopy)", options: [["normal", "Normal"], ["vesicles", "Vesicles / rash"], ["otitis", "Otitis or discharge"], ["mass", "Mass or cholesteatoma"]] },
  { key: "parotid", q: "Parotid and neck palpation", options: [["normal", "Normal"], ["massR", "Mass on right"], ["massL", "Mass on left"]] },
  { key: "taste", q: "Taste, front of tongue", options: [["normal", "Normal"], ["reducedR", "Reduced on right"], ["reducedL", "Reduced on left"]] },
  { key: "gag", q: "Gag reflex and cough", options: [["normal", "Normal"], ["reduced", "Reduced"]] },
  { key: "limbs", q: "Limb power / arm drift", options: [["normal", "Normal"], ["weakR", "Weak on right"], ["weakL", "Weak on left"], ["weakBoth", "Weak in both / ascending"]] },
  { key: "ice_test", q: "Ice pack on the droopy lid for 2 minutes", options: [["improved", "Lid lifted (positive)"], ["nochange", "No change"]] },
  { key: "swallow", q: "Swallow screen (sip of water)", options: [["pass", "Passed"], ["fail", "Coughing, wet voice or failed"]] }
];
