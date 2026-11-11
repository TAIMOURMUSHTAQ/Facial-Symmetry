# Facial Symmetry Assistant (LinguaLink360 module)

Decision support for clinicians: a guided camera exam that measures facial asymmetry, lists the possibilities
to examine for each face region, explains the reasoning, and flags emergencies. **It does not diagnose.**

## Run it locally

Requirements: Python 3 (already on macOS) and Chrome, Edge or Safari. No Node or build step.

```bash
cd facial-symmetry
./scripts/fetch-vendor.sh     # first time only: downloads the face model (~23 MB) for offline use
./scripts/serve.sh            # then open http://localhost:8080
```

- Use `localhost`, not your IP address: browsers only allow the camera on `localhost` or `https`.
- Stop the server with `Ctrl+C`. Use another port with `./scripts/serve.sh 9000`.
- Engine tests (synthetic patients): http://localhost:8080/tests/engine.test.html
- To test on a phone or tablet, deploy to Render (below), which gives you https.

## Deploy to Render (for testing)

`render.yaml` deploys the app as a free static site with https.

1. Make this folder its own Git repository and push it to GitHub (or GitLab):
   ```bash
   cd facial-symmetry
   git init && git add . && git commit -m "Facial Symmetry Assistant"
   git branch -M main
   git remote add origin https://github.com/<you>/facial-symmetry-assistant.git
   git push -u origin main
   ```
2. In Render: **New + → Blueprint**, pick the repository, then **Apply**.
3. Open the `https://facial-symmetry-assistant.onrender.com` URL Render gives you.

`vendor/` is not committed (see `.gitignore`); Render's build downloads it. If that download fails, the app
loads the model from the CDN instead. Each browser keeps its own patient records (see Storage below), so data
on the Render site is separate from data on localhost.

## Workflow

1. **Patient**: find or create a patient (name or record number optional), see their visit history and trend,
   start a follow-up visit, or run a quick assessment without a record.
2. **History**: onset, stroke warning signs, ear, eye and other questions. Emergency banners appear live.
3. **Guided exam** (19 steps): rest, facial movements, eye closure, gaze, fatigue tests, involuntary-movement
   observation, jaw, and clinician-rated tongue and palate. Each step can come from the camera, a video or an image.
4. **Results**: red flags, pattern (peripheral / central / bilateral / branch), estimated House-Brackmann and
   Sunnybrook, findings by region with accept / reject / change-severity review, and the possibilities with
   evidence for and against, how to confirm, and which questions are still unanswered. Bedside checks
   (pupils, corneal reflex, otoscopy, limb power…) update the possibilities live.
5. **Review and report**: clinician impression, then **Lock and save visit**, then JSON, CSV or print/PDF.
   Follow-up visits show **Change since last visit** (grades, movement symmetry, new and resolved findings).

## Storage

| `storage` option | Where data lives |
|---|---|
| `"local"` (default) | IndexedDB in this browser on this device. Use **Export all records** for backups. |
| `"rest"` | LinguaLink360 Laravel API at `apiBase` (routes listed in `src/store/rest.js`; phase 3). |
| `"memory"` | Nothing kept after the tab closes. |

Visits store the locked report (numbers and text). Evidence frames are saved only if the clinician ticks
"Also save evidence frames". Long-term history answers (diabetes, blood pressure, thyroid, cancer, MS) carry
over to the next visit; episode answers do not.

## Code map

| Path | What it does |
|---|---|
| `src/vision/` | model loading, head-pose-corrected measurements, camera/video/image source |
| `src/exam/protocol.js` | exam steps: what to say, what to watch, how movement is measured |
| `src/engine/analyze.js` | frames → per-side numbers |
| `src/engine/findings.js` | numbers → findings (region, side, severity, reliability) |
| `src/engine/patterns.js` | findings → patterns and grading estimates |
| `src/knowledge/` | history questions, bedside checklist, condition library |
| `src/engine/reason.js` | ranked possibilities, red flags, next checks |
| `src/engine/compare.js` | visit-to-visit change and trends |
| `src/store/` | patient and visit storage (browser now, Laravel API later) |
| `src/engine/thresholds.js` | **every cut-off in one place, for tuning** |
| `src/i18n/` | translation: English text is the key; Urdu is added in phase 3 |

## Embedding in Laravel / Blade (later)

Copy this folder to `public/facial-symmetry/`, then in any Blade view:

```blade
<link rel="stylesheet" href="{{ asset('facial-symmetry/styles.css') }}">
<div id="facial-symmetry"></div>
<script type="module">
  import { mount } from "{{ asset('facial-symmetry/src/main.js') }}";
  mount(document.getElementById("facial-symmetry"), {
    lang: "en",
    onExport: report => fetch("/api/facial-assessments", { method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": "{{ csrf_token() }}" },
      body: JSON.stringify(report) })
  });
</script>
```

All styles are scoped under `.fsa`, so they will not clash with the host page.

## Limits (read before clinical use)

- **Thresholds are first estimates**, not validated cut-offs. Calibrate `thresholds.js` on recorded healthy and
  patient sessions.
- **The condition library and wording need sign-off** from a qualified clinician.
- The camera cannot see tongue detail, palate, pupils, sensation or air leaks. Those are clinician-rated.
- Eye-movement, cheek-puff, jaw and twitch measurements are marked low reliability; confirm them by eye.
- Measurements need the face within ±15° of straight-on and good, even lighting.
