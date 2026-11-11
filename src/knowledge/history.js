/* History questions. Answers feed the reasoning engine and red-flag rules.
   Yes/no questions store "yes" | "no" | "unknown"; unanswered = undefined. */
const YN = "yn";

export const HISTORY = [
  {
    group: "Onset and course", items: [
      { key: "onset", q: "How did it start?", type: "choice", options: [["sudden", "Suddenly (minutes to hours)"], ["days", "Over 1 to 3 days"], ["gradual", "Gradually over weeks or months"], ["congenital", "Since birth or early childhood"], ["unknown", "Not sure"]] },
      { key: "duration", q: "When did it start?", type: "choice", options: [["lt72h", "Less than 72 hours ago"], ["lt3w", "3 days to 3 weeks ago"], ["lt6m", "3 weeks to 6 months ago"], ["gt6m", "More than 6 months ago"], ["unknown", "Not sure"]] },
      { key: "recurrent", q: "Has this happened before?", type: "choice", options: [["no", "No"], ["same", "Yes, same side"], ["other", "Yes, the other side"], ["unknown", "Not sure"]] },
      { key: "worsening", q: "Is it still getting worse?", type: YN },
      { key: "fluctuating", q: "Does it vary, e.g. worse at the end of the day or after use?", type: YN }
    ]
  },
  {
    group: "Stroke and neurological warning signs", red: true, items: [
      { key: "limb_weakness", q: "New weakness or clumsiness of an arm or leg?", type: YN },
      { key: "speech_change", q: "New slurred speech, or trouble finding or understanding words?", type: YN },
      { key: "swallowing", q: "Difficulty swallowing, choking or drooling?", type: YN },
      { key: "double_vision", q: "Double vision?", type: YN },
      { key: "headache", q: "Sudden severe headache, or the worst headache of their life?", type: YN },
      { key: "body_numbness", q: "Numbness of an arm, leg or one side of the body?", type: YN },
      { key: "breathing", q: "Shortness of breath or weak cough?", type: YN }
    ]
  },
  {
    group: "Ear, face and mouth", items: [
      { key: "ear_pain", q: "Pain in or behind the ear?", type: YN },
      { key: "ear_rash", q: "Rash or blisters in or around the ear or on the palate?", type: YN },
      { key: "hearing_loss", q: "Hearing loss or ringing in the ear?", type: YN },
      { key: "vertigo", q: "Spinning dizziness (vertigo)?", type: YN },
      { key: "ear_discharge", q: "Ear discharge or recent ear infection?", type: YN },
      { key: "taste_change", q: "Change in taste?", type: YN },
      { key: "sound_sensitivity", q: "Sounds seem unusually loud on one side?", type: YN },
      { key: "facial_numbness", q: "Numbness or pain of the face?", type: YN },
      { key: "facial_swelling", q: "Swelling or a lump on the face, in front of the ear or under the jaw?", type: YN },
      { key: "dental_pain", q: "Toothache or recent dental problem?", type: YN },
      { key: "jaw_pain", q: "Jaw pain, clicking or locking?", type: YN },
      { key: "chewing_fatigue", q: "Jaw tires when chewing?", type: YN },
      { key: "twitching", q: "Twitching or spasms of the face?", type: YN }
    ]
  },
  {
    group: "Eyes", items: [
      { key: "eye_closure_problem", q: "Trouble closing an eye, or a dry or watering eye?", type: YN },
      { key: "eyes_bulging", q: "Eyes look more prominent or bulging?", type: YN }
    ]
  },
  {
    group: "Other history", items: [
      { key: "trauma", q: "Recent head or face injury, or surgery on the face, ear, parotid or neck?", type: YN },
      { key: "tick_bite", q: "Tick bite, or a spreading circular rash?", type: YN },
      { key: "fever", q: "Fever or feeling unwell?", type: YN },
      { key: "recent_infection", q: "Infection or vaccination in the last 4 weeks?", type: YN },
      { key: "neck_pain", q: "Recent neck pain or neck injury?", type: YN },
      { key: "tremor_slowness", q: "Tremor, stiffness or slowness of movement?", type: YN },
      { key: "diabetes", q: "Diabetes?", type: YN },
      { key: "hypertension", q: "High blood pressure?", type: YN },
      { key: "pregnancy", q: "Pregnant or recently given birth?", type: YN },
      { key: "thyroid", q: "Thyroid disease?", type: YN },
      { key: "cancer", q: "History of cancer?", type: YN },
      { key: "ms", q: "Multiple sclerosis or previous neurological episodes?", type: YN }
    ]
  }
];

export const HISTORY_Q = Object.fromEntries(HISTORY.flatMap(g => g.items.map(i => [i.key, i])));
export const YN_OPTIONS = [["yes", "Yes"], ["no", "No"], ["unknown", "Unknown"]];
