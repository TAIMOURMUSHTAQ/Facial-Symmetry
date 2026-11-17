/* Emergency safety net: the only built-in clinical rules left in the app.
   Each rule fires only on what the therapist ticks, gives an action (never a diagnosis), and names its source.
   CLINICAL REVIEW REQUIRED: a qualified clinician should confirm the wording and sources before clinical use. */

export const SAFETY_QUESTIONS = [
  { key: "acute_neuro", q: "Sudden onset, with arm or leg weakness, speech or language change, vision loss or loss of balance" },
  { key: "pupil_diplopia", q: "Droopy eyelid with an enlarged pupil, or with new double vision" },
  { key: "thunderclap", q: "Sudden severe headache" },
  { key: "painful_small_pupil", q: "Droopy eyelid with a smaller pupil on the same side, and new neck or face pain" },
  { key: "bilateral_limb", q: "Weakness on both sides of the face, with limb weakness or tingling" },
  { key: "swallow_breath", q: "Difficulty swallowing, coughing when drinking, or shortness of breath" },
  { key: "eye_not_closing", q: "An eye does not close fully" },
  { key: "ear_vesicles", q: "Rash or blisters in or around the ear" },
  { key: "onset_72h", q: "New facial weakness that started within the last 72 hours" }
];

const RULES = [
  { when: a => a.acute_neuro, level: "emergency", title: "Possible stroke",
    action: "Follow your emergency stroke pathway now and record the time the patient was last known to be well. Do not wait to finish this assessment.",
    source: "BE-FAST / FAST stroke recognition, American Heart Association / American Stroke Association" },
  { when: a => a.pupil_diplopia, level: "emergency", title: "Possible compressive third nerve palsy",
    action: "A droopy lid with an enlarged pupil or new double vision needs emergency imaging to exclude an aneurysm.",
    source: "Standard neuro-ophthalmology practice: pupil-involving third nerve palsy is treated as a posterior communicating artery aneurysm until excluded" },
  { when: a => a.thunderclap, level: "emergency", title: "Sudden severe headache",
    action: "A sudden severe ('thunderclap') headache needs emergency assessment for subarachnoid haemorrhage.",
    source: "Thunderclap headache: emergency evaluation for subarachnoid haemorrhage (standard emergency medicine practice)" },
  { when: a => a.painful_small_pupil, level: "emergency", title: "Possible painful Horner syndrome",
    action: "Horner signs with new neck or face pain can mean carotid artery dissection. Emergency referral.",
    source: "Painful Horner syndrome: exclude carotid dissection (standard neuro-ophthalmology practice)" },
  { when: a => a.bilateral_limb, level: "emergency", title: "Bilateral facial weakness with limb symptoms",
    action: "Consider Guillain-Barré syndrome. Check breathing and swallowing and refer urgently to hospital.",
    source: "Leonhard et al. Diagnosis and management of Guillain-Barré syndrome in ten steps. Nat Rev Neurol 2019" },
  { when: a => a.swallow_breath, level: "urgent", title: "Swallowing or breathing risk",
    action: "Keep the patient nil by mouth until a swallow screen or assessment is done. Shortness of breath needs urgent medical review.",
    source: "AHA/ASA stroke guidelines: dysphagia screening before oral intake" },
  { when: a => a.eye_not_closing, level: "urgent", title: "Protect the eye",
    action: "Lubricating drops by day, ointment with taping or a moisture chamber at night. A red or painful eye needs same-day eye review.",
    source: "AAO-HNS Clinical Practice Guideline: Bell's Palsy (Baugh et al., 2013): eye protection for impaired eye closure" },
  { when: a => a.ear_vesicles, level: "urgent", title: "Ear rash or blisters with facial weakness",
    action: "Same-day medical review: this can be Ramsay Hunt syndrome, where early antiviral and steroid treatment is considered.",
    source: "AAO-HNS Clinical Practice Guideline: Bell's Palsy (Baugh et al., 2013): exclude other causes such as herpes zoster" },
  { when: a => a.onset_72h && !a.acute_neuro, level: "urgent", title: "Treatment window",
    action: "Facial weakness that started within 72 hours: arrange same-day medical review, as oral steroids are recommended within this window for Bell's palsy.",
    source: "AAO-HNS Clinical Practice Guideline: Bell's Palsy (Baugh et al., 2013): oral steroids within 72 hours of onset" }
];

/** answers: { key: true } for ticked items. Returns the flags to show, most urgent first. */
export function safetyFlags(answers = {}) {
  const a = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v === true || v === "yes"]));
  const seen = new Set();
  return RULES.filter(r => r.when(a)).filter(r => !seen.has(r.title) && seen.add(r.title))
    .sort((x, y) => (x.level === y.level ? 0 : x.level === "emergency" ? -1 : 1))
    .map(({ level, title, action, source }) => ({ level, title, action, source }));
}
