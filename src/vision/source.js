/* Owns the media source (live camera, uploaded video, uploaded image), runs the landmarker on every new
   frame, draws the overlay and hands a measured frame to the app through onFrame(frame). */
import { measure, isStill, STILL, FEATURE_POINTS } from "./geometry.js";

export class Vision {
  constructor({ video, image, canvas, landmarker, mod, poseLimit, onFrame }) {
    Object.assign(this, { video, image, canvas, landmarker, mod, poseLimit, onFrame });
    this.ctx = canvas.getContext("2d");
    this.kind = "none"; this.mode = "VIDEO"; this.running = false; this.lastTime = -1;
    this.win = []; this.latest = null; this.objUrl = null; this.fps = 0; this._n = 0; this._fpsT = performance.now();
    this.draw = new mod.DrawingUtils(this.ctx);
    this.video.addEventListener("seeking", () => { this.win = []; });
  }

  async setMode(m) { if (this.mode !== m) { await this.landmarker.setOptions({ runningMode: m }); this.mode = m; } }

  size(w, h) { this.canvas.width = w; this.canvas.height = h; return w / h; }

  async startCamera() {
    this.stop(); await this.setMode("VIDEO");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
    this.video.srcObject = stream; this.video.hidden = false; this.image.hidden = true;
    await new Promise(r => { this.video.onloadedmetadata = r; });
    await this.video.play();
    this.kind = "camera"; this.aspect = this.size(this.video.videoWidth, this.video.videoHeight);
    this.run();
  }

  async loadVideo(file) {
    this.stop(); await this.setMode("VIDEO");
    this.objUrl = URL.createObjectURL(file);
    Object.assign(this.video, { muted: true, loop: false, controls: true, src: this.objUrl, hidden: false });
    this.image.hidden = true;
    await new Promise((res, rej) => { this.video.onloadedmetadata = res; this.video.onerror = () => rej(new Error("this video format is not supported by the browser")); });
    this.kind = "video"; this.aspect = this.size(this.video.videoWidth, this.video.videoHeight);
    this.run();
  }

  async loadImage(file) {
    this.stop(); await this.setMode("IMAGE");
    this.objUrl = URL.createObjectURL(file);
    this.image.src = this.objUrl; await this.image.decode();
    this.video.hidden = true; this.image.hidden = false;
    const k = Math.min(1, 1600 / Math.max(this.image.naturalWidth, this.image.naturalHeight));
    this.aspect = this.size(Math.round(this.image.naturalWidth * k), Math.round(this.image.naturalHeight * k));
    this.kind = "image"; this.win = [];
    this.process(this.landmarker.detect(this.image), true);
  }

  stop() {
    this.running = false; this.kind = "none"; this.win = []; this.latest = null;
    const v = this.video;
    if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    v.pause(); v.removeAttribute("src"); v.load(); v.controls = false;
    if (this.objUrl) { URL.revokeObjectURL(this.objUrl); this.objUrl = null; }
    this.image.hidden = true; this.image.removeAttribute("src");
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  run() {
    this.running = true; this.lastTime = -1; this.win = [];
    const tick = () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.currentTime !== this.lastTime) {
        this.lastTime = v.currentTime;
        this.process(this.landmarker.detectForVideo(v, performance.now()), false);
        this._n++;
        const now = performance.now();
        if (now - this._fpsT >= 1000) { this.fps = this._n; this._n = 0; this._fpsT = now; }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  process(res, single) {
    const w = this.canvas.width, h = this.canvas.height, lim = this.poseLimit;
    const r = measure(res, w, h);
    const frame = { t: performance.now(), face: !!r, single };
    if (r) {
      const p = r.pose;
      frame.m = r.m; frame.pose = p;
      frame.poseOk = Math.abs(p.roll) <= lim && Math.abs(p.pitch) <= lim && Math.abs(p.yaw) <= lim;
      frame.sizeOk = r.sizePx >= 22;
      frame.ok = frame.poseOk && frame.sizeOk;
      if (frame.ok) { this.win.push(r.m); if (this.win.length > STILL.frames) this.win.shift(); } else this.win = [];
      frame.still = single ? true : isStill(this.win);
      frame.centered = Math.abs(r.lm[168].x - 0.5) < 0.15 && Math.abs(r.lm[168].y - 0.42) < 0.17;
    } else this.win = [];
    this.drawOverlay(r, frame);
    this.latest = frame;
    this.onFrame(frame);
  }

  drawOverlay(r, frame) {
    const { ctx } = this, w = this.canvas.width, h = this.canvas.height, FL = this.mod.FaceLandmarker;
    ctx.clearRect(0, 0, w, h);
    const good = frame.face && frame.ok;
    // positioning guide
    ctx.save();
    ctx.strokeStyle = good ? "rgba(52,211,153,.85)" : "rgba(251,191,36,.85)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.44, w * 0.19, h * 0.36, 0, 0, 6.2832); ctx.stroke();
    ctx.restore();
    if (!r) return;
    this.draw.drawConnectors(r.lm, FL.FACE_LANDMARKS_TESSELATION, { color: "rgba(52,211,153,0.13)", lineWidth: 0.5 });
    this.draw.drawConnectors(r.lm, FL.FACE_LANDMARKS_CONTOURS, { color: "rgba(52,211,153,0.7)", lineWidth: 1.2 });
    ctx.fillStyle = "#fbbf24";
    for (const i of FEATURE_POINTS) { const p = r.lm[i]; if (!p) continue; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 2.4, 0, 6.2832); ctx.fill(); }
    const F = r.F, k = F.scale * 2.4;
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(226,232,240,.8)";
    ctx.beginPath(); ctx.moveTo(F.o[0] - F.ey[0] * k, F.o[1] - F.ey[1] * k); ctx.lineTo(F.o[0] + F.ey[0] * k * 1.6, F.o[1] + F.ey[1] * k * 1.6); ctx.stroke();
    ctx.strokeStyle = "rgba(251,191,36,.65)";
    ctx.beginPath(); ctx.moveTo(F.o[0] - F.ex[0] * k, F.o[1] - F.ex[1] * k); ctx.lineTo(F.o[0] + F.ex[0] * k, F.o[1] + F.ex[1] * k); ctx.stroke();
    ctx.restore();
    if (!frame.poseOk) { ctx.fillStyle = "rgba(251,191,36,.10)"; ctx.fillRect(0, 0, w, h); }
  }

  /** JPEG of the current frame with the overlay, scaled to at most 640 px wide. Stays in memory only. */
  snapshot() {
    if (this.kind === "none") return null;
    const src = this.kind === "image" ? this.image : this.video;
    const w = this.canvas.width, h = this.canvas.height, k = Math.min(1, 640 / w);
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0, c.width, c.height); g.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  }
}
