/** Median of finite numbers (v3 definition: mean of the two central values for even counts). */
export function median(values) {
  const a = values.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
