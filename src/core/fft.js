/**
 * In-place iterative radix-2 FFT (decimation in time). Twiddles are computed per butterfly,
 * exactly as Berger Lab v3 did, so historical spectra reproduce bit for bit.
 * @param {Float64Array} re real part, length a power of two
 * @param {Float64Array} im imaginary part, same length
 */
export function fftInPlace(re, im) {
  const n = re.length;
  if (n & (n - 1)) throw new Error('FFT length must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    for (let base = 0; base < n; base += len) {
      for (let j = 0; j < len / 2; j++) {
        const a = (-2 * Math.PI * j) / len;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const k = base + j;
        const h = k + len / 2;
        const tr = re[h] * c - im[h] * s;
        const ti = re[h] * s + im[h] * c;
        re[h] = re[k] - tr;
        im[h] = im[k] - ti;
        re[k] += tr;
        im[k] += ti;
      }
    }
  }
}
