import { useEffect, useRef, useState } from "react";
import { createChant } from "../lib/youtube.js";
import { VERSIONS, loadTimings, saveTimings } from "../data/timings.js";

/* ------------------------------------------------------------
   Tap-along timing tool (open the site with ?sync).

   Pick a recording, listen to it once and tap (or press Space)
   at the first word of every doha / chaupai, then once more when
   the last line ends. The result is saved in this browser at
   once, and shown as a line to put into src/data/timings.js so
   every visitor gets it.
   ------------------------------------------------------------ */

const REACTION = 0.2; // seconds — people tap slightly after they hear the word

export default function SyncTool({ verses }) {
  const mount = useRef(null);
  const chant = useRef(null);
  const [version, setVersion] = useState(null);
  const [taps, setTaps] = useState([]);
  const tapRef = useRef(() => {});

  const total = verses.length + 1; // every verse start + the very end
  const done = taps.length >= total;
  const next = taps.length;

  useEffect(() => () => chant.current && chant.current.destroy(), []);

  const start = (v) => {
    setVersion(v);
    setTaps([]);
    chant.current = createChant({ mount: mount.current, videoId: v.videoId, onState: () => {}, onFail: () => alert("Could not load the YouTube video.") });
  };

  tapRef.current = () => {
    if (!chant.current || done) return;
    const t = Math.max(0, chant.current.time() - REACTION);
    const all = [...taps, Math.round(t * 100) / 100];
    setTaps(all);
    if (all.length === total) {
      saveTimings(version.videoId, all);
      chant.current.pause();
    }
  };

  const undo = () => {
    if (!taps.length) return;
    const all = taps.slice(0, -1);
    setTaps(all);
    // jump back to a second before the previous tap so you can redo it
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

  const code = version ? `${version.id}: [${taps.join(", ")}]` : "";

  return (
    <main className="sync" lang="en">
      <h1>Timing tool</h1>
      <p className="sync__help">
        Choose a recording and play it. Tap the big button (or press Space) at the <b>first word</b> of each doha and chaupai. After the last verse, tap once more when its singing ends. One
        listen per recording.
      </p>

      {!version && (
        <div className="sync__pick">
          {VERSIONS.map((v) => (
            <button key={v.id} type="button" className="sync__tap" onClick={() => start(v)}>
              {v.label}
              <small>
                {v.singer}
                {loadTimings(v) ? " · already timed" : ""}
              </small>
            </button>
          ))}
        </div>
      )}

      <div className="sync__video" ref={mount} hidden={!version} />

      {version && !done && (
        <>
          <p className="sync__count">
            {version.label} · {next + 1} / {total}
          </p>
          <div className="sync__verse">
            {next < verses.length ? (
              <>
                <p className="sync__label">{verses[next].label} — tap when this begins:</p>
                {verses[next].dev.map((l, i) => (
                  <p key={i} lang="hi">
                    {l}
                  </p>
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
        <div className="sync__done">
          <p>
            <b>Done — saved in this browser.</b> Open the site and choose the <b>{version.label}</b> pace: the verses now turn with the singing. To make it work for every visitor, copy the line below
            and send it to Claude (or put it into <code>src/data/timings.js</code> yourself).
          </p>
          <textarea readOnly value={code} rows={5} onFocus={(e) => e.target.select()} />
          <p>
            <button type="button" className="sync__undo" onClick={() => navigator.clipboard && navigator.clipboard.writeText(code)}>
              Copy
            </button>{" "}
            <button type="button" className="sync__undo" onClick={() => window.location.reload()}>
              Time another recording
            </button>{" "}
            <a href={window.location.pathname}>Open the site</a>
          </p>
        </div>
      )}
    </main>
  );
}
