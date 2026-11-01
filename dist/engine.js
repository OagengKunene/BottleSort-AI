// Deterministic optical generator and inference. Prediction receives pixels only.
export const CLASS_NAMES = ['Aligned cap', 'Missing cap', 'Tilted cap'];
export const W = 32, H = 48;
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function image(label, seed, difficulty = 0) {
  const r = random(seed);
  const cx = 16 + (r() - .5) * 3, dy = (r() - .5) * 2;
  const width = 6 + r();
  let light = .75 + r() * .5;
  const angle = label === 0 ? (r() - .5) * .1 : (.35 + r() * .4) * (r() < .5 ? -1 : 1);
  const shift = label !== 2 ? 0 : 1 + r();
  light *= 1 - difficulty * .65;
  const data = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + .5 - cx, yy = y + .5 - dy;
    let v = .10 + .018 * y / H;
    const body = Math.abs(dx) < width && yy >= 19 && yy < 43;
    const shoulder = yy >= 14 && yy < 19 && Math.abs(dx) < 3.2 + (yy - 14) / 5 * (width - 3.2);
    const neck = Math.abs(dx) < 3.2 && yy >= 10 && yy < 19;
    if (body || shoulder || neck) {
      v = .46 + .10 * (dx + width) / (width * 2);
      if (Math.abs(dx + width * .63) < .65) v += .15;
      if (body && yy >= 25 && yy < 35) v = .73;
      if (body && yy >= 28 && yy < 31 && Math.abs(dx) < 3.7) v = .29;
    }
    if (label !== 1) {
      const xx = dx - shift, yc = yy - 10;
      const rx = xx * Math.cos(angle) + yc * Math.sin(angle);
      const ry = -xx * Math.sin(angle) + yc * Math.cos(angle);
      if (Math.abs(rx) < 4.5 && Math.abs(ry) < 2.8) v = .83 - .06 * (x % 2);
    }
    v = v * light + (r() - .5) * (.07 + difficulty * .34);
    data[y * W + x] = Math.min(1, Math.max(0, v));
  }
  return data;
}
export function predict(pixels, model) {
  if (pixels.length !== W * H) throw new Error('Invalid camera image shape');
  const scores = model.coefficients.map((weights, c) => {
    let result = model.intercepts[c];
    for (let p = 0; p < pixels.length; p++) result += pixels[p] * weights[p];
    return result;
  });
  const max = Math.max(...scores), exps = scores.map(s => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0), probabilities = exps.map(e => e / total);
  const predicted = probabilities.indexOf(Math.max(...probabilities));
  return { predicted, confidence: probabilities[predicted], probabilities };
}
export function route(prediction, threshold) {
  if (prediction.confidence < threshold) return 'review';
  return prediction.predicted === 0 ? 'accept' : 'reject';
}
export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60), rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
