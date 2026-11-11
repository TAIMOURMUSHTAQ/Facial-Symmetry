/* Condition library: possibilities the clinician should consider, grouped by face region.
   Each condition scores the evidence (findings + history + bedside checks) and explains itself:
     why      evidence for       against  evidence against
     confirm  bedside tests      ask      history keys that would help (shown only when unanswered)
   urgency: emergency | urgent | soon | routine.
   CLINICAL CONTENT MUST BE REVIEWED BY A QUALIFIED CLINICIAN BEFORE USE. Scores rank possibilities;
   they are not probabilities and not a diagnosis. */
import { sideName } from "../i18n/index.js";

const opp = s => (s === "R" ? "L" : s === "L" ? "R" : s);

function scorer() {
  const r = { score: 0, why: [], against: [] };
  r.add = (cond, pts, text) => { if (cond) { r.score += pts; (pts >= 0 ? r.why : r.against).push(text); } return !!cond; };
  return r;
}

export const CONDITIONS = [
  /* ---------------- facial nerve: peripheral ---------------- */
  {
    id: "bells", name: "Bell's palsy (idiopathic facial nerve palsy)", category: "Facial nerve (CN VII), peripheral",
    regions: ["forehead", "eyes", "mouth"], urgency: "urgent",
    about: "Acute one-sided weakness of the whole face developing over hours to 3 days, with no other cause found. Steroids work best when started within 72 hours.",
    confirm: ["Forehead wrinkling absent or weak on the affected side", "Bell's phenomenon on attempted eye closure", "Normal otoscopy (no vesicles)", "No limb weakness or other cranial nerve signs", "Taste or hyperacusis changes support a proximal lesion"],
    ask: ["onset", "duration", "ear_rash", "hearing_loss", "recurrent", "limb_weakness"],
    match(x) {
      const r = scorer(), P = x.P;
      r.add(P.facial === "peripheral", 2.5, `Upper and lower face both weak on the ${sideName(P.side)}`);
      r.add(P.facial === "lower_only_untested", 1, "Lower face weak; forehead not yet tested");
      r.add(P.facial === "upper_only", 0.5, "Upper face weak on one side");
      if (r.score <= 0) return r;
      r.add(x.h.onset === "days" || x.h.onset === "sudden", 1, "Onset over hours to days");
      r.add(x.h.duration === "lt72h", 0.3, "Within 72 hours: steroid window still open");
      r.add(x.yes("pregnancy") || x.yes("diabetes"), 0.5, "Pregnancy or diabetes increase risk");
      r.add(x.yes("ear_pain") && !x.yes("ear_rash"), 0.3, "Ear pain is common in Bell's palsy");
      r.add(x.h.onset === "gradual", -2, "Gradual onset is not typical: look for a tumour");
      r.add(x.h.recurrent === "same", -1, "Recurrence on the same side needs imaging");
      r.add(x.yes("ear_rash") || x.c.otoscopy === "vesicles", -1.5, "Ear vesicles point to Ramsay Hunt syndrome");
      r.add(x.yes("limb_weakness") || x.yes("speech_change"), -2, "Limb or speech symptoms point to a central cause");
      r.add(P.bilateral, -1, "Bilateral weakness is rarely Bell's palsy");
      r.add(x.h.duration === "gt6m", -1, "No recovery after 6 months is unusual: reconsider the diagnosis");
      return r;
    }
  },
  {
    id: "ramsay_hunt", name: "Ramsay Hunt syndrome (herpes zoster oticus)", category: "Facial nerve (CN VII), peripheral",
    regions: ["forehead", "eyes", "mouth"], urgency: "urgent",
    about: "Varicella-zoster reactivation in the geniculate ganglion: facial palsy with ear pain and a vesicular rash, often hearing loss or vertigo. Worse prognosis than Bell's palsy; antivirals plus steroids are given early.",
    confirm: ["Inspect the ear canal, concha and palate for vesicles", "Hearing test (sensorineural loss)", "Ask about vertigo"],
    ask: ["ear_rash", "ear_pain", "hearing_loss", "vertigo"],
    match(x) {
      const r = scorer(), P = x.P;
      const facial = r.add(P.facial === "peripheral" || P.facial === "lower_only_untested", 1, "One-sided peripheral facial weakness");
      r.add(x.yes("ear_rash") || x.c.otoscopy === "vesicles", 2.5, "Rash or vesicles in or around the ear");
      r.add(x.yes("ear_pain"), 0.7, "Ear pain");
      r.add(x.yes("hearing_loss") || x.c.hearing === "reduced" + P.side, 1, "Hearing loss on the same side");
      r.add(x.yes("vertigo"), 0.7, "Vertigo");
      if (!facial) r.score *= 0.5;
      return r;
    }
  },
  {
    id: "tumour", name: "Compressive lesion: acoustic neuroma, parotid tumour, cholesteatoma or skull base tumour", category: "Facial nerve (CN VII), peripheral",
    regions: ["forehead", "mouth", "global"], urgency: "soon",
    about: "Facial weakness that develops slowly, recurs on the same side, comes with a lump, hearing loss or twitching, or does not recover, needs imaging.",
    confirm: ["Palpate the parotid and neck", "Hearing test", "Otoscopy for cholesteatoma or mass", "Refer for MRI of the internal auditory canal and parotid"],
    ask: ["onset", "recurrent", "hearing_loss", "facial_swelling", "cancer", "twitching"],
    match(x) {
      const r = scorer(), P = x.P;
      const facial = r.add(["peripheral", "upper_only", "lower_only_untested"].includes(P.facial), 0.8, "One-sided facial weakness");
      r.add(x.h.onset === "gradual", 2, "Gradual onset over weeks or months");
      r.add(x.h.recurrent === "same", 1.5, "Recurrence on the same side");
      r.add(x.yes("hearing_loss") || (P.side && x.c.hearing === "reduced" + P.side), 1, "Hearing loss on the same side");
      r.add(x.c.parotid === "mass" + P.side || x.yes("facial_swelling"), 1.5, "Lump in the parotid or face");
      r.add(x.c.otoscopy === "mass", 1.5, "Mass seen on otoscopy");
      r.add(x.yes("cancer"), 1, "History of cancer");
      r.add(x.h.duration === "gt6m", 0.8, "No recovery after 6 months");
      r.add(P.branches.length === 1 && facial, 0.5, "Only one nerve branch involved");
      r.add(x.f("eye_twitch", P.side) || x.f("mouth_twitch", P.side), 0.5, "Twitching on the weak side");
      if (!facial) r.score *= 0.4;
      return r;
    }
  },
  {
    id: "trauma", name: "Traumatic or post-surgical facial nerve injury", category: "Facial nerve (CN VII), peripheral",
    regions: ["forehead", "eyes", "mouth"], urgency: "urgent",
    about: "Temporal bone fracture, facial laceration, or parotid, ear or neck surgery can injure the nerve or one of its branches. Immediate complete palsy after trauma may need surgical assessment.",
    confirm: ["Check whether weakness was immediate or delayed after the injury", "Look for Battle's sign, haemotympanum or CSF leak", "Refer to ENT or maxillofacial surgery"],
    ask: ["trauma"],
    match(x) {
      const r = scorer(), P = x.P;
      const facial = P.facial !== "none" && P.facial !== "rest_only";
      r.add(x.yes("trauma"), facial ? 3 : 0.8, "Recent injury or surgery to the face, ear, parotid or neck");
      return r;
    }
  },
  {
    id: "otitis", name: "Otitis media or mastoiditis with facial nerve involvement", category: "Facial nerve (CN VII), peripheral",
    regions: ["forehead", "mouth"], urgency: "urgent",
    about: "Middle ear infection can inflame the facial nerve in its bony canal, especially in children.",
    confirm: ["Otoscopy: bulging or perforated drum, discharge", "Tenderness or swelling behind the ear", "Temperature"],
    ask: ["ear_pain", "ear_discharge", "fever"],
    match(x) {
      const r = scorer(), P = x.P;
      const facial = P.facial === "peripheral" || P.facial === "lower_only_untested";
      r.add(x.c.otoscopy === "otitis", 2.5, "Otitis or discharge seen on otoscopy");
      r.add(x.yes("ear_discharge"), 1.5, "Ear discharge or recent ear infection");
      r.add(x.yes("ear_pain") && x.yes("fever"), 1, "Ear pain with fever");
      if (!facial) r.score *= 0.4; else r.add(true, 0.3, "Peripheral facial weakness");
      return r;
    }
  },
  {
    id: "lyme", name: "Lyme neuroborreliosis", category: "Facial nerve (CN VII), infective",
    regions: ["forehead", "mouth"], urgency: "urgent",
    about: "Facial palsy, sometimes on both sides, after a tick bite in endemic areas.",
    confirm: ["Ask about travel to tick areas", "Look for erythema migrans", "Lyme serology"],
    ask: ["tick_bite"],
    match(x) {
      const r = scorer(), P = x.P;
      r.add(x.yes("tick_bite"), 2.5, "Tick bite or spreading circular rash");
      r.add(P.bilateral && x.yes("tick_bite"), 1, "Bilateral weakness with tick exposure");
      if (P.facial === "none" || P.facial === "rest_only") r.score *= 0.3;
      return r;
    }
  },
  {
    id: "gbs", name: "Guillain-Barré syndrome (bilateral facial weakness)", category: "Facial nerve, bilateral",
    regions: ["global", "mouth"], urgency: "emergency",
    about: "Rapidly ascending weakness after an infection, often with bilateral facial palsy. Breathing and swallowing can fail: urgent hospital assessment.",
    confirm: ["Limb power and reflexes (reduced or absent)", "Ask about tingling starting in the feet", "Check breathing (count to 20 in one breath) and swallowing"],
    ask: ["limb_weakness", "recent_infection", "breathing", "swallowing"],
    match(x) {
      const r = scorer(), P = x.P;
      r.add(P.bilateral, 1.5, "Reduced facial movement on both sides");
      r.add(x.yes("limb_weakness") || x.c.limbs === "weakBoth", 1.5, "Limb weakness");
      r.add(x.yes("recent_infection"), 0.8, "Infection or vaccination in the last 4 weeks");
      r.add(x.yes("breathing") || x.yes("swallowing"), 1, "Breathing or swallowing difficulty");
      if (!P.bilateral) r.score *= 0.3;
      return r;
    }
  },
  {
    id: "bilateral_other", name: "Other causes of bilateral facial weakness (sarcoidosis, HIV, leukaemia, Möbius syndrome)", category: "Facial nerve, bilateral",
    regions: ["global"], urgency: "soon",
    about: "Facial palsy on both sides is rarely idiopathic. Asymmetry scores can look near normal, so absolute movement matters.",
    confirm: ["Compare absolute movement, not only symmetry", "Systemic review: rash, lymph nodes, eyes (uveitis), parotid swelling", "Blood tests and imaging as advised by a physician"],
    ask: ["onset", "fever"],
    match(x) {
      const r = scorer(), P = x.P;
      r.add(P.bilateral, 2, "Movement reduced on both sides");
      r.add(x.h.onset === "congenital" && P.bilateral, 1, "Present since birth: consider Möbius syndrome");
      r.add(x.P.gazeLimits.some(g => g.move === "abduction") && x.h.onset === "congenital", 1, "Congenital with limited abduction (Möbius)");
      return r;
    }
  },
  {
    id: "branch", name: "Isolated facial nerve branch lesion", category: "Facial nerve (CN VII), peripheral",
    regions: ["forehead", "mouth"], urgency: "soon",
    about: "Weakness confined to one branch (temporal: forehead; zygomatic: eye closure; buccal: smile and cheek; marginal mandibular: lower lip), typically after surgery, trauma or a parotid lesion.",
    confirm: ["Map exactly which muscles are weak", "Ask about surgery or injury along that branch", "Palpate the parotid"],
    ask: ["trauma", "facial_swelling"],
    match(x) {
      const r = scorer(), P = x.P;
      r.add(P.branches.length === 1 && P.facial !== "none", 2, `Weakness limited to the ${P.branches[0]} branch on the ${sideName(P.side)}`);
      r.add(x.yes("trauma"), 1, "Recent surgery or injury");
      return r;
    }
  },
  {
    id: "synkinesis", name: "Post-paralytic synkinesis (aberrant regeneration)", category: "Facial nerve (CN VII), sequelae",
    regions: ["eyes", "mouth"], urgency: "routine",
    about: "After a facial palsy, regrowing nerve fibres connect to the wrong muscles: the eye narrows when smiling, or the mouth moves on eye closure. Responds to targeted facial therapy and botulinum toxin.",
    confirm: ["Watch the eye during smile and pucker", "Watch the mouth during eye closure", "Feel for tightness or hypertonicity at rest"],
    ask: ["recurrent", "duration"],
    match(x) {
      const r = scorer();
      const s = x.F.filter(f => f.type === "synkinesis");
      r.add(s.length > 0, 2 + Math.max(0, ...s.map(f => f.sev)) * 0.3, `Linked movement measured on the ${sideName(s[0] && s[0].side)}`);
      r.add(["lt6m", "gt6m"].includes(x.h.duration), 0.8, "Weakness started months ago (synkinesis appears during recovery)");
      r.add(x.h.recurrent === "same" || x.h.recurrent === "other", 0.5, "Previous facial palsy");
      r.add(x.h.duration === "lt72h" || x.h.duration === "lt3w", -1, "Too early for synkinesis");
      return r;
    }
  },

  /* ---------------- facial nerve: central ---------------- */
  {
    id: "stroke", name: "Stroke or other central lesion (upper motor neuron facial weakness)", category: "Central nervous system",
    regions: ["mouth", "forehead", "global"], urgency: "emergency",
    about: "Weakness of the lower face with the forehead spared, because the forehead has input from both sides of the brain. The lesion is on the side opposite to the weak face. Sudden onset is a medical emergency.",
    confirm: ["FAST test: face, arm drift, speech", "Note the time last known well", "Check limb power, sensation, visual fields and speech", "Follow your emergency stroke pathway if onset is new"],
    ask: ["onset", "limb_weakness", "speech_change", "body_numbness", "headache"],
    match(x) {
      const r = scorer(), P = x.P;
      const central = r.add(P.facial === "central", 2.5, `Lower face weak on the ${sideName(P.side)} with the forehead spared (lesion would be on the ${sideName(opp(P.side))} side of the brain)`);
      r.add(P.facial === "lower_only_untested", 1, "Lower face weak; forehead not tested yet");
      r.add(x.h.onset === "sudden", central ? 1.5 : 0.5, "Sudden onset");
      r.add(x.yes("limb_weakness") || (P.side && x.c.limbs === "weak" + P.side), 2, "Limb weakness");
      r.add(x.yes("speech_change") || x.F.some(f => f.type === "voice_dysarthric"), 1, "Speech or language change");
      r.add(x.yes("body_numbness"), 0.8, "Numbness of the body");
      r.add(x.yes("hypertension") || x.yes("diabetes"), 0.3, "Vascular risk factors");
      r.add(P.facial === "peripheral" && !x.yes("limb_weakness"), -1, "Forehead is also weak, which points to a peripheral cause");
      return r;
    }
  },
  {
    id: "ms", name: "Demyelination (multiple sclerosis) or brainstem lesion", category: "Central nervous system",
    regions: ["gaze", "global"], urgency: "urgent",
    about: "Brainstem lesions can cause facial weakness or myokymia together with eye movement problems such as internuclear ophthalmoplegia.",
    confirm: ["Check eye movements for an adduction lag with nystagmus of the other eye", "Full neurological examination", "MRI brain"],
    ask: ["ms", "double_vision", "body_numbness"],
    match(x) {
      const r = scorer();
      r.add(x.yes("ms"), 1.5, "History of MS or neurological episodes");
      r.add(x.P.gazeLimits.some(g => g.move === "adduction") && !x.P.ptosisSide, 1, "Adduction lag without ptosis (possible INO)");
      r.add(x.F.some(f => f.type === "mouth_twitch" && f.sev >= 1) && x.yes("ms"), 0.5, "Facial twitching or myokymia");
      r.add(x.yes("double_vision"), 0.3, "Double vision");
      return r;
    }
  },

  /* ---------------- movement disorders ---------------- */
  {
    id: "hemifacial_spasm", name: "Hemifacial spasm", category: "Involuntary movement",
    regions: ["eyes", "mouth"], urgency: "routine",
    about: "Involuntary, painless twitching of one side of the face, usually starting around the eye and spreading to the mouth. Often caused by a blood vessel pressing on the facial nerve; MRI is advised. Treated with botulinum toxin.",
    confirm: ["Observe for 1 to 2 minutes", "Brow rising as the eye closes during a spasm (the 'other Babinski sign')", "MRI to exclude compression"],
    ask: ["twitching"],
    match(x) {
      const r = scorer(), s = x.P.twitchSide;
      r.add(s === "R" || s === "L", 2, `One-sided twitching on the ${sideName(s)}`);
      r.add(["R", "L"].includes(s) && x.f("eye_twitch", s) && x.f("mouth_twitch", s), 1, "Both eye and mouth involved on the same side");
      r.add(x.yes("twitching"), 1, "Patient reports facial twitching");
      r.add(s === "both", -0.5, "Twitching on both sides is more typical of blepharospasm or tics");
      return r;
    }
  },
  {
    id: "blepharospasm", name: "Blepharospasm", category: "Involuntary movement",
    regions: ["eyes"], urgency: "routine",
    about: "Involuntary forceful blinking or eye closure on both sides (focal dystonia). Worse with bright light and stress.",
    confirm: ["Observe blinking during conversation", "Check for dry eye as a trigger", "Ask about light sensitivity"],
    ask: ["twitching"],
    match(x) {
      const r = scorer();
      r.add(x.f("blink_high"), 1.5, "High blink rate");
      r.add(x.P.twitchSide === "both", 1, "Eye closures on both sides");
      return r;
    }
  },
  {
    id: "parkinsonism", name: "Parkinsonism (reduced facial expression, hypomimia)", category: "Movement disorder",
    regions: ["global"], urgency: "routine",
    about: "Reduced facial expression and blink rate on both sides with no true weakness. Look for tremor, rigidity and slowness.",
    confirm: ["Check for rest tremor, rigidity and slowness (finger taps)", "Watch spontaneous expression during conversation", "Assess speech volume and swallowing"],
    ask: ["tremor_slowness"],
    match(x) {
      const r = scorer();
      r.add(x.f("global_reduced"), 1.5, "Reduced movement on both sides");
      r.add(x.f("blink_low"), 1.5, "Low blink rate");
      r.add(x.yes("tremor_slowness"), 2, "Tremor, stiffness or slowness");
      r.add(x.f("tongue_slow"), 0.5, "Slow tongue movements");
      r.add(x.age >= 55, 0.3, "Age over 55");
      r.add(x.P.facial === "peripheral" || x.P.facial === "central", -1, "One-sided weakness pattern is not typical");
      return r;
    }
  },

  /* ---------------- eyelids ---------------- */
  {
    id: "myasthenia", name: "Myasthenia gravis", category: "Neuromuscular junction",
    regions: ["eyes", "gaze", "mouth", "global"], urgency: "urgent",
    about: "Fatigable weakness: ptosis or double vision that worsens with sustained use and through the day, often with weak eye closure. Swallowing or breathing problems need urgent care.",
    confirm: ["Sustained upward gaze for 60 seconds", "Ice pack test on the droopy lid", "Eye closure strength against resistance (orbicularis weakness)", "Count to 50 aloud: voice fatigue", "Acetylcholine-receptor antibodies"],
    ask: ["fluctuating", "double_vision", "chewing_fatigue", "swallowing", "breathing"],
    match(x) {
      const r = scorer();
      r.add(x.f("fatigable_ptosis"), 2.5, "Eyelid drooped during sustained upward gaze");
      r.add(x.f("fatigable_weakness"), 2, "Smile weakened with repetition");
      r.add(x.c.ice_test === "improved", 2.5, "Positive ice pack test");
      r.add(x.yes("fluctuating"), 1.5, "Symptoms fluctuate or worsen with use");
      r.add(x.yes("double_vision"), 0.8, "Double vision");
      r.add(x.yes("chewing_fatigue"), 0.8, "Jaw tires with chewing");
      r.add(x.P.ptosisSide && x.c.pupils === "equal", 0.5, "Ptosis with normal pupils");
      r.add(x.P.gazeLimits.length > 0 && x.c.pupils === "equal", 0.5, "Eye movement limitation with normal pupils");
      r.add(x.f("weak_bilateral", null, "eye_tight"), 0.5, "Weak eye closure on both sides");
      r.add(x.c.ice_test === "nochange" && x.P.ptosisSide, -0.8, "Negative ice pack test");
      return r;
    }
  },
  {
    id: "cn3", name: "Third nerve (oculomotor) palsy", category: "Cranial nerve III",
    regions: ["eyes", "gaze"], urgency: "emergency",
    about: "Ptosis with the eye turned down and out and limited adduction, elevation and depression. A dilated pupil suggests compression (posterior communicating artery aneurysm): emergency imaging. A spared pupil with diabetes or hypertension suggests a microvascular cause.",
    confirm: ["Pupil size and light reaction on the ptotic side", "Eye position at rest (down and out)", "Ask about double vision and headache", "Emergency imaging if the pupil is involved or headache is severe"],
    ask: ["double_vision", "headache", "diabetes", "hypertension"],
    match(x) {
      const r = scorer(), ps = x.P.ptosisSide;
      const lim = x.P.gazeLimits.filter(g => ["adduction", "elevation", "depression"].includes(g.move) && (g.eye === ps || ps === "both"));
      r.add(ps && lim.length, 2.5, `Ptosis and limited ${lim.map(g => g.move).join(", ")} of the ${sideName(lim[0] && lim[0].eye)} eye`);
      r.add(ps && ps !== "both" && x.c.pupils === ps + "_larger", 2, "Larger pupil on the ptotic side: possible compression");
      r.add(x.yes("double_vision"), 0.8, "Double vision");
      r.add(x.yes("headache"), 1, "Severe headache");
      r.add(!ps && x.P.gazeLimits.some(g => g.move === "adduction" || g.move === "elevation"), 0.6, "Limited adduction or elevation");
      r.add(x.yes("diabetes") || x.yes("hypertension"), 0.2, "Vascular risk factors (microvascular cause possible if the pupil is spared)");
      r.add(x.f("fatigable_ptosis"), -0.5, "Fatigable ptosis suggests myasthenia instead");
      return r;
    }
  },
  {
    id: "horner", name: "Horner syndrome", category: "Sympathetic pathway",
    regions: ["eyes"], urgency: "urgent",
    about: "Mild ptosis (1-2 mm) with a slightly raised lower lid and a smaller pupil on the same side. Acute painful Horner's with neck pain can mean carotid dissection: emergency.",
    confirm: ["Compare pupil size in dim light (smaller pupil dilates late)", "Check sweating on that side of the face", "Ask about neck or face pain and recent neck trauma"],
    ask: ["neck_pain", "headache", "cancer"],
    match(x) {
      const r = scorer(), ps = x.P.ptosisSide;
      r.add(ps && ps !== "both" && x.P.ptosisSev <= 2, 0.8, `Mild ptosis on the ${sideName(ps)}`);
      r.add(ps && x.f("lower_lid_raised", ps), 1.5, "Lower lid raised on the same side (reverse ptosis)");
      r.add(ps && ps !== "both" && x.c.pupils === opp(ps) + "_larger", 2.5, "Smaller pupil on the ptotic side");
      r.add(x.yes("neck_pain"), 1, "Recent neck pain: exclude carotid dissection");
      r.add(x.P.gazeLimits.length > 0, -0.8, "Eye movements are normal in Horner syndrome");
      return r;
    }
  },
  {
    id: "aponeurotic", name: "Aponeurotic (age-related) or mechanical ptosis", category: "Eyelid",
    regions: ["eyes"], urgency: "routine",
    about: "Stretching of the levator tendon with age, contact lens use or eye surgery. Stable, not fatigable, normal pupils and eye movements. Also consider dermatochalasis (excess skin) or brow ptosis causing a pseudo-ptosis.",
    confirm: ["High or absent lid crease", "Good levator function", "Normal pupils and eye movements", "Lift excess skin or the brow to see if the lid position changes"],
    ask: ["onset", "fluctuating"],
    match(x) {
      const r = scorer(), ps = x.P.ptosisSide;
      if (!ps) return r;
      r.add(true, 1, `Ptosis on ${ps === "both" ? "both sides" : "the " + sideName(ps)}`);
      r.add(x.age >= 50, 0.8, "Age 50 or over");
      r.add(x.h.onset === "gradual", 0.7, "Gradual onset");
      r.add(x.f("fatigable_ptosis") || x.yes("fluctuating"), -1.5, "Fatigable or fluctuating ptosis suggests myasthenia");
      r.add(x.P.gazeLimits.length > 0, -1, "Eye movement limitation suggests a nerve or muscle cause");
      r.add(ps !== "both" && x.c.pupils && x.c.pupils !== "equal", -1, "Unequal pupils suggest Horner's or third nerve palsy");
      return r;
    }
  },
  {
    id: "thyroid_eye", name: "Thyroid eye disease (lid retraction)", category: "Eyelid / orbit",
    regions: ["eyes", "gaze"], urgency: "soon",
    about: "Upper or lower lid retraction showing white above or below the iris, lid lag on downgaze, and later restricted eye movements, usually with thyroid disease.",
    confirm: ["Lid lag on slow downgaze", "Proptosis (look from above)", "Restricted upgaze", "Thyroid function tests"],
    ask: ["thyroid", "eyes_bulging", "double_vision"],
    match(x) {
      const r = scorer();
      r.add(x.f("lid_retraction"), 1.5, "Scleral show or lid retraction");
      r.add(x.yes("thyroid"), 1.5, "Thyroid disease");
      r.add(x.yes("eyes_bulging"), 1, "Prominent eyes");
      r.add(x.P.gazeLimits.some(g => g.move === "elevation"), 0.4, "Limited upgaze");
      return r;
    }
  },
  {
    id: "exposure", name: "Exposure keratopathy risk (incomplete eye closure)", category: "Eye safety",
    regions: ["eyes"], urgency: "urgent",
    about: "Any eye that does not close fully is at risk of corneal drying and ulceration. Protect it: lubricating drops by day, ointment and taping or a moisture chamber at night. Red or painful eye: same-day ophthalmology review.",
    confirm: ["Check the cornea for redness or staining", "Check for Bell's phenomenon", "Ask about eye pain, grittiness or blurred vision"],
    ask: ["eye_closure_problem"],
    match(x) {
      const r = scorer(), f = x.F.filter(y => y.type === "incomplete_closure");
      r.add(f.length > 0, 2.5, `Incomplete eye closure on the ${sideName(f[0] && f[0].side)}`);
      r.add(x.yes("eye_closure_problem"), 0.8, "Dry, watering or open eye reported");
      return r;
    }
  },

  /* ---------------- eye movements ---------------- */
  {
    id: "cn6", name: "Sixth nerve (abducens) palsy", category: "Cranial nerve VI",
    regions: ["gaze"], urgency: "urgent",
    about: "The eye cannot move outwards (abduction), with horizontal double vision worse looking to that side. Causes: microvascular, raised intracranial pressure, tumour, trauma.",
    confirm: ["Cover test and double vision worse in the direction of the weak eye", "Fundoscopy for papilloedema", "Ask about headache and visual obscurations"],
    ask: ["double_vision", "headache", "diabetes", "hypertension"],
    match(x) {
      const r = scorer(), g = x.P.gazeLimits.find(y => y.move === "abduction");
      r.add(g, 2 + (g ? g.sev * 0.3 : 0), `Limited abduction of the ${sideName(g && g.eye)} eye`);
      r.add(g && x.yes("double_vision"), 1, "Double vision");
      r.add(g && x.yes("headache"), 0.8, "Headache: check for raised intracranial pressure");
      return r;
    }
  },
  {
    id: "cn4", name: "Fourth nerve (trochlear) palsy", category: "Cranial nerve IV",
    regions: ["gaze"], urgency: "soon",
    about: "Vertical double vision, worse looking down and in (reading, stairs), often with a head tilt away from the affected side. Common after head trauma.",
    confirm: ["Parks three-step test", "Look for head tilt to the opposite side", "Ask about vertical or tilted double vision"],
    ask: ["double_vision", "trauma"],
    match(x) {
      const r = scorer(), g = x.P.gazeLimits.find(y => y.move === "depression");
      r.add(g && !x.P.ptosisSide, 1.5, `Reduced depression of the ${sideName(g && g.eye)} eye`);
      r.add(g && x.yes("trauma"), 0.8, "Recent head injury");
      r.add(g && x.yes("double_vision"), 0.7, "Double vision");
      return r;
    }
  },
  {
    id: "ino", name: "Internuclear ophthalmoplegia (INO)", category: "Brainstem (MLF)",
    regions: ["gaze"], urgency: "urgent",
    about: "One eye fails to adduct on lateral gaze while the other abducts with nystagmus, with no ptosis. Young patients: MS; older: stroke.",
    confirm: ["Fast horizontal saccades: adducting eye lags", "Nystagmus of the abducting eye", "Convergence often preserved"],
    ask: ["ms", "double_vision"],
    match(x) {
      const r = scorer(), g = x.P.gazeLimits.find(y => y.move === "adduction");
      r.add(g && !x.P.ptosisSide, 1.5, `Limited adduction of the ${sideName(g && g.eye)} eye without ptosis`);
      r.add(g && x.yes("ms"), 1, "History of MS");
      return r;
    }
  },

  /* ---------------- jaw ---------------- */
  {
    id: "cn5_motor", name: "Trigeminal motor weakness (CN V3)", category: "Cranial nerve V",
    regions: ["jaw"], urgency: "soon",
    about: "The jaw deviates towards the weak side on opening (weak lateral pterygoid), with weak or wasted masseter and often reduced sensation on that side.",
    confirm: ["Feel masseter and temporalis while clenching", "Resist jaw opening and side movement", "Test light touch over forehead, cheek and jaw; corneal reflex"],
    ask: ["facial_numbness", "chewing_fatigue"],
    match(x) {
      const r = scorer(), j = x.F.find(f => f.type === "jaw_deviation");
      r.add(j, 1.5, `Jaw deviates towards the ${sideName(j && j.side)} on opening`);
      r.add(j && x.c.masseter === "weak" + j.side, 2, "Weak masseter on the same side");
      r.add(j && x.c.sensation === "reduced" + j.side, 1.5, "Reduced facial sensation on the same side");
      r.add(j && x.c.corneal === "reduced" + j.side, 0.8, "Reduced corneal reflex");
      r.add(x.yes("facial_numbness") && !j, 0.5, "Facial numbness reported");
      r.add(j && x.yes("jaw_pain"), -0.5, "Jaw pain or clicking suggests a joint problem");
      return r;
    }
  },
  {
    id: "tmj", name: "Temporomandibular joint dysfunction", category: "Joint / musculoskeletal",
    regions: ["jaw"], urgency: "routine",
    about: "Jaw deviation with clicking, pain or limited opening from the joint or chewing muscles, with normal nerve function.",
    confirm: ["Palpate the joints while opening (clicks, crepitus)", "Measure opening between incisors (normal about 40 mm)", "Tenderness of chewing muscles"],
    ask: ["jaw_pain"],
    match(x) {
      const r = scorer(), j = x.F.find(f => f.type === "jaw_deviation");
      r.add(j && x.yes("jaw_pain"), 2, "Jaw deviation with pain or clicking");
      r.add(!j && x.yes("jaw_pain"), 1, "Jaw pain or clicking");
      r.add(x.f("jaw_open_limited"), 0.7, "Limited opening");
      r.add(j && !x.yes("jaw_pain") && x.h.jaw_pain === undefined, 0.4, "Jaw deviation (ask about pain and clicking)");
      return r;
    }
  },
  {
    id: "dental", name: "Dental or skeletal malocclusion", category: "Structural",
    regions: ["jaw", "global"], urgency: "routine",
    about: "A chin that is off the midline at rest with normal movement is often skeletal or dental, not neurological.",
    confirm: ["Check the dental midlines and bite", "Ask whether it is long-standing"],
    ask: ["onset", "dental_pain"],
    match(x) {
      const r = scorer();
      r.add(x.f("chin_offset") && !x.f("jaw_deviation"), 1.2, "Chin off the midline at rest with normal opening");
      r.add(x.h.onset === "congenital", 0.5, "Long-standing");
      return r;
    }
  },

  /* ---------------- tongue, palate, voice ---------------- */
  {
    id: "cn12", name: "Hypoglossal nerve (CN XII) weakness", category: "Cranial nerve XII",
    regions: ["tongue"], urgency: "soon",
    about: "The tongue deviates towards the weak side on protrusion. Wasting and fasciculations indicate a lower motor neuron lesion (nerve, skull base, motor neuron disease). Without wasting, consider an upper motor neuron (stroke) cause.",
    confirm: ["Look at the tongue resting in the mouth for wasting and fasciculations", "Push the tongue against the cheek on each side", "Check speech for lingual sounds (t, d, l)"],
    ask: ["speech_change", "swallowing", "neck_pain"],
    match(x) {
      const r = scorer(), d = x.F.find(f => f.type === "tongue_deviation");
      r.add(d, 2.5, `Tongue deviates to the ${sideName(d && d.side)} (weak side)`);
      r.add(d && x.f("tongue_wasting", d.side), 1, "Wasting on the same side (lower motor neuron)");
      r.add(x.f("tongue_weak"), 1.5, "Cannot protrude the tongue");
      r.add(x.f("tongue_lateral_weak"), 0.7, "Weak side-to-side tongue movement");
      return r;
    }
  },
  {
    id: "bulbar", name: "Glossopharyngeal / vagus weakness (CN IX, X): palatal and swallowing problems", category: "Cranial nerves IX, X",
    regions: ["tongue"], urgency: "urgent",
    about: "The uvula is pulled away from the weak side; a nasal or hoarse voice and swallowing problems may follow. Aspiration risk: do a swallow screen before oral intake.",
    confirm: ["Torch exam of the palate on 'aah'", "Gag reflex", "Swallow screen with a sip of water", "Voluntary cough strength"],
    ask: ["swallowing", "speech_change"],
    match(x) {
      const r = scorer(), u = x.F.find(f => f.type === "uvula_deviation");
      r.add(u, 2, `Uvula pulled to the ${sideName(u && u.side)}: weakness on the ${sideName(opp(u && u.side))}`);
      r.add(x.f("palate_weak"), 1.5, "Weak palate elevation");
      r.add(x.F.some(f => f.type === "voice_nasal" || f.type === "voice_hoarse"), 1, "Nasal or hoarse voice");
      r.add(x.yes("swallowing") || x.c.swallow === "fail", 1.2, "Swallowing difficulty");
      r.add(x.c.gag === "reduced", 0.7, "Reduced gag reflex");
      return r;
    }
  },
  {
    id: "mnd", name: "Motor neurone disease (bulbar onset)", category: "Neurodegenerative",
    regions: ["tongue", "global"], urgency: "soon",
    about: "Tongue wasting and fasciculations with slurred speech and swallowing difficulty, often with mixed upper and lower motor neuron signs. Needs specialist neurology review.",
    confirm: ["Tongue fasciculations at rest", "Brisk jaw jerk", "Limb wasting, fasciculations and brisk reflexes"],
    ask: ["swallowing", "speech_change", "limb_weakness"],
    match(x) {
      const r = scorer();
      r.add(x.f("tongue_fasciculations"), 2, "Tongue fasciculations");
      r.add(x.f("tongue_wasting"), 1.5, "Tongue wasting");
      r.add(x.F.some(f => f.type === "voice_dysarthric") || x.yes("speech_change"), 0.7, "Slurred speech");
      r.add(x.yes("swallowing"), 0.7, "Swallowing difficulty");
      r.add(x.h.onset === "sudden", -1, "Sudden onset is not typical");
      return r;
    }
  },
  {
    id: "pseudobulbar", name: "Pseudobulbar palsy (bilateral upper motor neuron)", category: "Central nervous system",
    regions: ["tongue", "global"], urgency: "soon",
    about: "Slow, stiff tongue without wasting, spastic dysarthria, swallowing difficulty and sometimes emotional lability, from bilateral strokes, MS or MND.",
    confirm: ["Brisk jaw jerk", "Slow tongue movements without wasting", "Emotional lability", "Spastic speech"],
    ask: ["speech_change", "swallowing", "ms"],
    match(x) {
      const r = scorer();
      r.add(x.f("tongue_slow") && !x.f("tongue_wasting"), 1.5, "Slow tongue without wasting");
      r.add(x.F.some(f => f.type === "voice_dysarthric"), 1, "Slurred speech");
      r.add(x.yes("swallowing"), 0.5, "Swallowing difficulty");
      return r;
    }
  },

  /* ---------------- structural / soft tissue ---------------- */
  {
    id: "brow_ptosis", name: "Brow ptosis (involutional or habitual brow asymmetry)", category: "Soft tissue",
    regions: ["forehead"], urgency: "routine",
    about: "A low brow at rest that lifts normally on raising suggests soft-tissue descent, not nerve weakness. Also check for brow elevation compensating for a droopy lid on the other side.",
    confirm: ["Brow raise symmetric despite the resting difference", "Lift the brow manually and see the lid change"],
    ask: ["onset"],
    match(x) {
      const r = scorer(), b = x.F.find(f => f.type === "rest_brow_low");
      const browWeak = x.F.some(f => f.type === "weak" && f.step === "brow");
      r.add(b && !browWeak && x.P.browTested, 1.8, `Brow lower at rest on the ${sideName(b && b.side)} but lifts normally`);
      r.add(b && x.age >= 50, 0.5, "Age 50 or over");
      r.add(b && x.P.ptosisSide === opp(b.side), 0.5, "The other brow may be raised to compensate for a droopy lid");
      return r;
    }
  },
  {
    id: "structural", name: "Developmental or structural asymmetry (hemifacial microsomia, Parry-Romberg, old fracture)", category: "Structural",
    regions: ["global"], urgency: "routine",
    about: "Asymmetry of face volume or bone with normal, symmetric movement. Progressive loss of fat and tissue on one side in a young person suggests Parry-Romberg syndrome (refer).",
    confirm: ["Compare with old photographs", "Palpate the cheekbones and jaw", "Ask whether it is changing"],
    ask: ["onset", "trauma", "worsening"],
    match(x) {
      const r = scorer(), w = x.F.find(f => f.type === "face_width");
      r.add(w && x.P.facial === "none", 1.5, "Contour asymmetry with symmetric movement");
      r.add(w && x.h.onset === "congenital", 1, "Present since childhood");
      r.add(w && x.yes("trauma"), 0.8, "Previous injury");
      r.add(w && x.yes("worsening") && x.age < 30, 0.8, "Progressive in a young person (consider Parry-Romberg)");
      r.add(w && x.yes("facial_swelling"), -1, "Recent swelling suggests a soft-tissue cause");
      return r;
    }
  },
  {
    id: "swelling", name: "Facial swelling: parotitis, dental abscess, cellulitis, lymph node or angioedema", category: "Soft tissue",
    regions: ["global", "cheeks"], urgency: "urgent",
    about: "A newly fuller side of the face is often swelling, not weakness. Rapid swelling of lips, tongue or throat (angioedema) can block the airway: emergency.",
    confirm: ["Palpate: warmth, tenderness, fluctuance", "Look in the mouth: teeth, parotid duct (pus), tongue swelling", "Temperature", "Check breathing and voice if lips or tongue are swollen"],
    ask: ["facial_swelling", "dental_pain", "fever"],
    match(x) {
      const r = scorer(), w = x.F.find(f => f.type === "face_width");
      r.add(x.yes("facial_swelling"), 1.5, "Swelling or lump reported");
      r.add(w && x.yes("facial_swelling"), 1, `The ${sideName(w && w.side)} side measures fuller`);
      r.add(x.yes("dental_pain"), 0.8, "Toothache");
      r.add(x.yes("fever"), 0.6, "Fever");
      r.add(x.c.parotid === "massR" || x.c.parotid === "massL", 1, "Parotid mass on palpation");
      return r;
    }
  },
  {
    id: "normal_variation", name: "Normal facial asymmetry", category: "No disease",
    regions: ["global", "forehead", "eyes", "mouth"], urgency: "routine",
    about: "Most faces are slightly asymmetric. Small resting differences with symmetric movement and no history of change are usually normal. Keep this result as a baseline.",
    confirm: ["Compare with old photographs", "Repeat the exam if symptoms are new"],
    ask: [],
    match(x) {
      const r = scorer();
      const maxSev = Math.max(0, ...x.F.map(f => f.sev));
      r.add(x.P.facial === "none" && maxSev <= 1 && x.F.length <= 4, 1.8, "Only mild differences, and movement is symmetric");
      r.add(x.P.facial === "none" && maxSev === 0, 0.7, "No findings");
      return r;
    }
  }
];

export const CONDITION = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));
