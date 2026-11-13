/* ------------------------------------------------------------
   The YouTube recording used by the play button, and when each
   verse begins in it (seconds).

   TIMINGS has 44 numbers: the start of each of the 43 verses,
   then the moment the last verse ends. Make them once with the
   tap-along tool: open the site with  ?sync  at the end of the
   address, e.g.  http://localhost:5190/?sync

   Until TIMINGS is filled in, the video still plays, but the
   words glow by scrolling rather than in time with the singing.
   ------------------------------------------------------------ */

export const VIDEO_ID = "AETFvQonfV8"; // T-Series Bhakti Sagar — Hariharan, Gulshan Kumar

export const TIMINGS = null;

const KEY = "hc-timings-" + VIDEO_ID;

export function loadTimings() {
  if (Array.isArray(TIMINGS) && TIMINGS.length === 44) return TIMINGS;
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(t) && t.length === 44) return t;
  } catch {
    /* nothing saved */
  }
  return null;
}

export function saveTimings(t) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* private mode */
  }
}
