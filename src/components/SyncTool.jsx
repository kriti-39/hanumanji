import { useEffect, useRef, useState } from "react";
import { createChant } from "../lib/youtube.js";
import { VIDEO_ID, saveTimings } from "../data/timings.js";

/* ------------------------------------------------------------
   Tap-along timing tool (open the site with ?sync).

   Listen to the recording once and tap (or press Space) at the
   first word of every doha / chaupai, then once more when the
   last line ends. The result is saved in this browser straight
   away, and shown as text to paste into src/data/timings.js so
   every visitor gets it.
   ------------------------------------------------------------ */

const REACTION = 0.2; // seconds — people tap slightly after they hear the word

export default function SyncTool({ verses }) {
  const mount = useRef(null);
  const chant = useRef(null);
  const [started, setStarted] = useState(false);
  const [taps, setTaps] = useState([]);
  const tapRef = useRef(() => {});

  const total = verses.length + 1; // every verse start + the very end
  const done = taps.length >= total;
  const next = taps.length;

  useEffect(() => () => chant.current && chant.current.destroy(), []);

  const start = () => {
    setStarted(true);
    chant.current = createChant({ mount: mount.current, videoId: VIDEO_ID, onState: () => {}, onFail: () => alert("Could not load the YouTube video.") });
  };

  tapRef.current = () => {
    if (!chant.current || done) return;
    const t = Math.max(0, chant.current.time() - REACTION);
    const all = [...taps, Math.round(t * 100) / 100];
    setTaps(all);
    if (all.length === total) {
      saveTimings(all);
      chant.current.pause();
    }
  };

  const undo = () => {
    if (!taps.length) return;
    const all = taps.slice(0, -1);
    setTaps(all);
    // jump back to a few seconds before the previous tap so you can redo it
    if (chant.current) {
      chant.current.seek(Math.max(0, (all[all.length - 1] ?? 0) - 1));
      chant.current.play();
    }
  };

  useEffect(() => {
    const key = (e) => {
      if (e.code !== "Space" || (e.target && e.target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      tapRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const code = `export const TIMINGS = [${taps.join(", ")}];`;

  return (
    <main className="sync">
      <h1>Timing tool · ताल मिलाएँ</h1>
      <p className="sync__help" lang="en">
        Play the recording and tap the big button (or press Space) at the <b>first word</b> of each doha / chaupai. After the last verse, tap once more when the singing of it ends. It takes one
        listen, about ten minutes.
      </p>

      <div className="sync__video" ref={mount} />

      {!started && (
        <button type="button" className="sync__tap" onClick={start}>
          Start the recording
        </button>
      )}

      {started && !done && (
        <>
          <p className="sync__count">
            {next + 1} / {total}
          </p>
          <div className="sync__verse" lang="hi">
            {next < verses.length ? (
              <>
                <p className="sync__label">{verses[next].label} — tap when this begins:</p>
                {verses[next].dev.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </>
            ) : (
              <p className="sync__label">Tap when the last line finishes.</p>
            )}
          </div>
          <button type="button" className="sync__tap" onClick={() => tapRef.current()}>
            TAP
          </button>
          <button type="button" className="sync__undo" onClick={undo} disabled={!taps.length}>
            Undo last tap
          </button>
        </>
      )}

      {done && (
        <div className="sync__done" lang="en">
          <p>
            <b>Done — saved in this browser.</b> Open the site normally and press play to see the words follow the singing. To make it work for every visitor, paste this line into{" "}
            <code>src/data/timings.js</code> in place of <code>export const TIMINGS = null;</code>
          </p>
          <textarea readOnly value={code} rows={5} onFocus={(e) => e.target.select()} />
          <p>
            <button type="button" className="sync__undo" onClick={() => navigator.clipboard && navigator.clipboard.writeText(code)}>
              Copy
            </button>{" "}
            <button type="button" className="sync__undo" onClick={() => setTaps([])}>
              Start over
            </button>{" "}
            <a href={window.location.pathname}>Open the site</a>
          </p>
        </div>
      )}
    </main>
  );
}
