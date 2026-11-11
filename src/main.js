/* Public entry point.
   Standalone: index.html calls FacialSymmetry.mount(document.getElementById("app")).
   Laravel/Blade: include styles.css and this module, then mount into any element:
     <div id="facial-symmetry"></div>
     <script type="module">
       import { mount } from "{{ asset('facial-symmetry/src/main.js') }}";
       mount(document.getElementById("facial-symmetry"), { lang: "en", onExport: report => {...} });
     </script> */
import { App } from "./ui/app.js";

export function mount(el, options = {}) {
  if (!el) throw new Error("FacialSymmetry.mount: element not found");
  const app = new App(el, options);
  return {
    getReport: () => app.session.report,
    getSession: () => app.session,
    newPatient: () => app.newPatient(),
    destroy: () => { app.cancelRecording(true); if (app.vision) app.vision.stop(); el.innerHTML = ""; el.classList.remove("fsa"); }
  };
}

window.FacialSymmetry = { mount };
