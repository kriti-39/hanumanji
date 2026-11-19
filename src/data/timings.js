/* ------------------------------------------------------------
   The YouTube recordings the play button can use, one per pace,
   and when each verse begins in each of them (seconds).

   `timings` has 44 numbers: the start of each of the 43 verses,
   then the moment the last verse ends. Make them once per
   recording with the tap-along tool: open the site with ?sync
   at the end of the address, e.g.  http://localhost:5190/?sync

   Until a recording's timings are filled in, it still plays,
   but the verses do not turn by themselves.
   ------------------------------------------------------------ */

export const VERSIONS = [
  {
    id: "slow",
    label: "Slow",
    singer: "Hariharan",
    videoId: "AETFvQonfV8", // T-Series Bhakti Sagar · 9:42
    timings: null,
  },
  {
    id: "medium",
    label: "Medium",
    singer: "Rasraj Ji Maharaj (lo-fi)",
    videoId: "N86zFLRGHVE", // Rasraj Ji Maharaj Official, lo-fi version · 3:52
    timings: null,
  },
  {
    id: "fast",
    label: "Fast",
    singer: "Shankar Mahadevan",
    videoId: "xdtHK7AJINA", // Shemaroo Bhakti, "Superfast Breathless" · 3:49
    timings: null,
  },
];

export const versionById = (id) => VERSIONS.find((v) => v.id === id) || VERSIONS[0];

const key = (videoId) => "hc-timings-" + videoId;
const valid = (t) => Array.isArray(t) && t.length === 44 && t.every((x, i) => typeof x === "number" && (i === 0 || x >= t[i - 1]));

/** Timings for a recording: the ones written into this file win, then any saved in this browser by the tool. */
export function loadTimings(version) {
  if (valid(version.timings)) return version.timings;
  try {
    const t = JSON.parse(localStorage.getItem(key(version.videoId)));
    if (valid(t)) return t;
  } catch {
    /* nothing saved */
  }
  return null;
}

export function saveTimings(videoId, t) {
  try {
    localStorage.setItem(key(videoId), JSON.stringify(t));
  } catch {
    /* private mode */
  }
}
