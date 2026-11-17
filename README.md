# Facial Symmetry Assistant (LinguaLink360 module)

Decision support for clinicians: a guided camera exam that measures facial asymmetry, lists the possibilities
to examine for each face region, explains the reasoning, and flags emergencies. **It does not diagnose.**

## Run it locally

Requirements: Python 3 (already on macOS) and Chrome, Edge or Safari. No Node, no build step.

```bash
cd facial-symmetry
./scripts/fetch-vendor.sh     # first time only: downloads the face model (~23 MB) for offline use
./scripts/serve.sh            # then open http://localhost:8080
```

- The app opens straight on **Scan** and asks for the camera. History and patient are optional; you can
  pick or create the patient when you save.
- **AI second opinion, local (free, private):** run `ollama serve` and `ollama pull medgemma1.5` once.
  `serve.sh` uses MedGemma automatically.
- **AI with OpenAI locally:** `OPENAI_API_KEY=sk-... ./scripts/serve.sh` (optional `OPENAI_MODEL=...`).
- Use `localhost`, not your IP address: browsers only allow the camera on `localhost` or `https`.
- Stop with `Ctrl+C`. Another port: `./scripts/serve.sh 9000`.
- Engine tests: http://localhost:8080/tests/engine.test.html

## Deploy to Render (live testing with OpenAI)

`render.yaml` creates a free **Python web service** (`server.py`): it serves the app over https and forwards AI
requests to OpenAI, so the API key stays on the server.

1. Push this folder to GitHub (already done if you deployed before; push the new commits).
2. **If you already have the old static site** named `facial-symmetry-assistant`: delete it in Render first
   (Settings → Delete). Render cannot turn a static site into a web service, and deleting it frees the name and URL.
3. Render → **New + → Blueprint** → pick the repository → **Apply**.
4. When asked, paste your **OPENAI_API_KEY** (or add it later under the service's **Environment** tab, then redeploy).
5. Open `https://facial-symmetry-assistant.onrender.com`.

Notes:
- Default model `gpt-5-mini`; change `OPENAI_MODEL` in the Environment tab.
- Each visitor IP is limited to 60 AI requests per hour (`AI_RATE_LIMIT_PER_HOUR`) to protect your key.
- Free web services sleep after 15 minutes idle; the first visit then takes about a minute to wake.
- Patient records live in each browser (IndexedDB), not on Render. Don't use real patient data yet.

## Evaluate an AI model (MedGemma, ChatGPT…)

The AI layer (`src/ai/`) talks to any OpenAI-compatible endpoint. To measure how well a model reasons on the
12 synthetic patients in `tests/scenarios.js`:

```bash
ollama serve &                 # if Ollama is not already running
ollama pull medgemma1.5        # MedGemma 1.5 4B, ~3.3 GB, runs locally and free
node scripts/eval-ai.mjs       # or: npm run eval:ai
```

Options: `--mode=blind` (model reasons from findings only), `--mode=assist` (model also sees the rule
engine's output and gives a second opinion), `--cases=bells,stroke`. Any OpenAI-compatible API works:
`AI_ENDPOINT=https://api.openai.com/v1 AI_MODEL=<model> AI_KEY=... node scripts/eval-ai.mjs`.
The scorecard is saved to `tests/results/`. Only measurements, findings and history answers are sent: no
images or names.

## Workflow (therapist-led: nothing is preset)

1. **Examine**: the therapist types what they ask the patient to do, in their own words ("Relaxed face",
   "Raise eyebrows", "Say pa-ta-ka"…), picks a length (photo, 3–30 s) and records. One capture is marked as the
   **reference** (usually a relaxed face); every other capture is measured as change from it. Captures can be
   saved as **My routine** and reloaded for the next patient.
2. **Case notes** (optional): free-text notes, the therapist's **own history fields** (built once, reused), and
   the **safety check**, the only built-in rules, each citing its clinical source.
3. **Findings and AI**: neutral right/left numbers and % difference for every capture, with no normal ranges,
   no severity labels and no scores. The therapist can ask the **AI** a question; it interprets the numbers and
   notes and **suggests next captures**, which the therapist can add with one click or ignore.
4. **Save and report**: the therapist's impression and plan, save to a new or existing patient, then JSON, CSV
   or print/PDF. Follow-up visits compare captures with the same name.

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
| `src/vision/` | model loading, head-pose-corrected landmarks, camera/video/image source |
| `src/engine/measure.js` | neutral per-capture measurements (right/left, % difference, timeline); `HOW_MEASURED` documents every definition |
| `src/engine/compare.js` | visit-to-visit comparison of captures with the same name |
| `src/knowledge/safety.js` | the emergency safety net: therapist-ticked items → actions, each with its source |
| `src/ai/` | AI prompt, OpenAI-compatible client, assistant panel logic |
| `src/store/` | patients, visits, routines and history-field settings (browser now, Laravel API later) |
| `src/ui/` | screens: examine (app.js), case notes, findings and AI, report, patients |
| `server.py` | static server + AI proxy (OpenAI or Ollama), no dependencies |
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

- **No normal ranges are built in.** The app reports neutral numbers; the therapist (and the AI) interpret them.
  The only fixed values are measurement mechanics, all listed in the app under "How the numbers are measured":
  head-pose limit (15°), camera precision (1 mm), and the 32 mm inner-eye-corner scale for mm estimates.
- **The safety check wording and sources need sign-off** from a qualified clinician.
- **AI quality depends on the model.** In tests the local MedGemma 1.5 (4B) sometimes misreads clear asymmetry;
  use OpenAI (or another strong model) for live testing and treat every AI answer as a colleague's opinion.
- The camera cannot see tongue detail, palate, pupils, sensation or air leaks; record those in your notes.
- Measurements need the face within ±15° of straight-on and good, even lighting.
