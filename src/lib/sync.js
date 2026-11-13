/* Turns verse start-times into "which verse, how far through it" for any moment. */
export function makePosition(T) {
  const n = T.length - 1; // number of verses
  const durs = [];
  for (let i = 0; i < n; i++) durs.push(Math.max(0.5, T[i + 1] - T[i]));
  // A verse followed by a musical interlude looks "long"; cap it near the usual
  // length so its words finish with the singing, not with the interlude.
  const sorted = [...durs].sort((a, b) => a - b);
  const cap = sorted[Math.floor(n / 2)] * 1.2;

  return (t) => {
    if (t < T[0]) return { u: -1, wf: 0 };
    let i = 0;
    while (i < n - 1 && t >= T[i + 1]) i++;
    return { u: i, wf: (t - T[i]) / Math.min(durs[i], cap) };
  };
}
