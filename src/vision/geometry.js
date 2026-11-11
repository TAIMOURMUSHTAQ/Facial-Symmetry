/* Turns one frame of MediaPipe landmarks into pose-corrected facial measurements.

   Head frame: origin at the nose bridge (168), x along the inner-canthus axis (133 -> 362, i.e. towards the
   PATIENT'S LEFT), y orthogonalised from forehead (10) to chin (152) so it points DOWN the face, z = x × y
   (away from the camera). Every landmark is expressed in that frame and divided by the inter-canthal distance
   (ICD, about 30-35 mm in adults), so measurements do not depend on camera distance or moderate head tilt.

   Side convention: MediaPipe's "right" landmarks (33, 133, 159, 61 ...) are the patient's own right.
   All metric names ending in R / L are the PATIENT'S right / left. */
import { sub, mul, dot, norm, unit, cross, deg, mean } from "../util.js";

export const LM = {
  BROW_R: [70, 63, 105, 66, 107], BROW_L: [300, 293, 334, 296, 336],
  MIDLINE: [10, 9, 8, 168, 6, 197, 195, 5, 4, 1],
  EYE_R: { outer: 33, inner: 133, up: 159, lo: 145 }, EYE_L: { outer: 263, inner: 362, up: 386, lo: 374 },
  IRIS_A: 468, IRIS_B: 473,
  MOUTH_R: 61, MOUTH_L: 291, LIP_IN_UP: 13, LIP_IN_LO: 14,
  LOWLIP_R: 91, LOWLIP_L: 321, UPLIP_R: 40, UPLIP_L: 270,
  ALA_R: 129, ALA_L: 358, CHEEK_R: 205, CHEEK_L: 425, FACE_R: 234, FACE_L: 454,
  CHIN: 152, NOSE_TIP: 1
};
export const FEATURE_POINTS = [61, 291, 33, 133, 263, 362, 159, 145, 386, 374, 468, 473, 168, 152, 129, 358, 91, 321, ...LM.BROW_R, ...LM.BROW_L];

export function headFrame(lm, w, h) {
  const P = i => [lm[i].x * w, lm[i].y * h, lm[i].z * w];
  const a = P(133), b = P(362), o = P(168);
  const span = sub(b, a), scale = norm(span) || 1;
  const ex = unit(span);
  let d = sub(P(152), P(10));
  d = sub(d, mul(ex, dot(d, ex)));
  const ey = unit(d), ez = cross(ex, ey);
  const toLocal = i => { const v = sub(P(i), o); return [dot(v, ex) / scale, dot(v, ey) / scale, dot(v, ez) / scale]; };
  const pose = {
    roll: deg(Math.atan2(ex[1], ex[0])),
    yaw: deg(Math.atan2(ex[2], Math.hypot(ex[0], ex[1]))),
    pitch: deg(Math.atan2(ez[1], ez[2]))
  };
  return { toLocal, pose, ex, ey, o, scale };
}

function eyeMetrics(L, e, irisIdx) {
  const o = L(e.outer), n = L(e.inner), u = L(e.up), d = L(e.lo), c = L(irisIdx);
  const cx = (o[0] + n[0]) / 2, cy = (o[1] + n[1]) / 2, w = Math.abs(o[0] - n[0]) || 1e-6;
  return {
    ap: d[1] - u[1],          // vertical aperture (palpebral fissure height)
    mrd1: c[1] - u[1],        // iris centre to upper lid margin (low = ptosis)
    mrd2: d[1] - c[1],        // iris centre to lower lid margin (high = scleral show / retraction)
    gx: (c[0] - cx) / w,      // horizontal gaze, + towards patient's left
    gy: (c[1] - cy) / w,      // vertical gaze, + downwards
    fw: w                     // palpebral fissure width
  };
}

const blend = (res, name) => {
  const bs = res && res.faceBlendshapes && res.faceBlendshapes[0];
  if (!bs) return null;
  const c = bs.categories.find(x => x.categoryName === name);
  return c ? c.score : null;
};

/** Full measurement set for one frame. Returns null when there is no face. */
export function measure(res, w, h) {
  const lm = res && res.faceLandmarks && res.faceLandmarks[0];
  if (!lm) return null;
  const F = headFrame(lm, w, h), L = F.toLocal;
  const mid = mean(LM.MIDLINE.map(i => L(i)[0]));
  const canthY = (L(133)[1] + L(362)[1]) / 2;

  // assign the two iris centres to the eye they sit in (index order is not relied on)
  const eyeCx = e => (L(e.outer)[0] + L(e.inner)[0]) / 2;
  const aNearR = Math.abs(L(LM.IRIS_A)[0] - eyeCx(LM.EYE_R)) < Math.abs(L(LM.IRIS_B)[0] - eyeCx(LM.EYE_R));
  const eR = eyeMetrics(L, LM.EYE_R, aNearR ? LM.IRIS_A : LM.IRIS_B);
  const eL = eyeMetrics(L, LM.EYE_L, aNearR ? LM.IRIS_B : LM.IRIS_A);
  const browH = idx => canthY - mean(idx.map(i => L(i)[1]));

  const m = {
    browR: browH(LM.BROW_R), browL: browH(LM.BROW_L),
    apR: eR.ap, apL: eL.ap, mrd1R: eR.mrd1, mrd1L: eL.mrd1, mrd2R: eR.mrd2, mrd2L: eL.mrd2,
    gxR: eR.gx, gxL: eL.gx, gyR: eR.gy, gyL: eL.gy, fwR: eR.fw, fwL: eL.fw,
    mcxR: mid - L(LM.MOUTH_R)[0], mcxL: L(LM.MOUTH_L)[0] - mid,    // mouth corner distance from midline
    mcyR: L(LM.MOUTH_R)[1], mcyL: L(LM.MOUTH_L)[1],                // mouth corner height (down = larger)
    llR: L(LM.LOWLIP_R)[1], llL: L(LM.LOWLIP_L)[1],                // lateral lower lip height
    ulR: L(LM.UPLIP_R)[1], ulL: L(LM.UPLIP_L)[1],                  // lateral upper lip height
    alaR: L(LM.ALA_R)[1], alaL: L(LM.ALA_L)[1],                    // nasal ala height
    chzR: L(LM.CHEEK_R)[2], chzL: L(LM.CHEEK_L)[2],                // cheek depth (towards camera = smaller)
    faceR: mid - L(LM.FACE_R)[0], faceL: L(LM.FACE_L)[0] - mid,    // half-face width at the cheekbones
    chinX: L(LM.CHIN)[0] - mid,                                    // + = chin towards patient's left
    jaw: L(LM.CHIN)[1] - L(LM.NOSE_TIP)[1],                        // nose tip to chin (mouth opening)
    lipOpen: L(LM.LIP_IN_LO)[1] - L(LM.LIP_IN_UP)[1],
    mouthW: L(LM.MOUTH_L)[0] - L(LM.MOUTH_R)[0],
    tongue: blend(res, "tongueOut"), jawBS: blend(res, "jawOpen")
  };
  const sizePx = F.scale; // inter-canthal distance in pixels
  return { m, pose: F.pose, F, lm, sizePx };
}

/** A window of frames is "still" when lips, eyes and brows barely change (talking, blinking, expressions excluded). */
export const STILL = { frames: 12, open: 0.03, width: 0.04, eye: 0.03, brow: 0.04 };
export function isStill(win) {
  if (win.length < STILL.frames) return false;
  const rg = k => { let lo = Infinity, hi = -Infinity; for (const m of win) { lo = Math.min(lo, m[k]); hi = Math.max(hi, m[k]); } return hi - lo; };
  return rg("lipOpen") < STILL.open && rg("mouthW") < STILL.width &&
    Math.max(rg("apR"), rg("apL")) < STILL.eye && Math.max(rg("browR"), rg("browL")) < STILL.brow;
}
