import { useEffect, useMemo, useRef, useState } from "react";
import { chalisa } from "./data/chalisa.js";
import Aura from "./components/Aura.jsx";
import { createReader } from "./lib/reader.js";
import { downloadText } from "./lib/download.js";
import { createChant } from "./lib/youtube.js";
import { makePosition } from "./lib/sync.js";
import { ART, FOCUS, WIDE } from "./data/art.js";
import { VIDEO_ID, loadTimings } from "./data/timings.js";
import SyncTool from "./components/SyncTool.jsx";

const SYNC_MODE = new URLSearchParams(window.location.search).has("sync");
const HAS_ART = Object.keys(ART).length > 0;
const NOTES = {
  "no-voice": "No Hindi voice on this device. The verses will turn silently.",
  "no-youtube": "Could not reach YouTube. Using this device's voice instead.",
  unsynced: "Video is playing. Swipe to turn the verses as you listen.",
};

const deva = (num) => num.toLocaleString("hi-IN-u-nu-deva");
const MEANING = ["off", "hi", "en"];
const SIZES = [1, 1.18, 1.36];

// Label every verse once: दोहा, चौपाई १ … चौपाई ४०, दोहा
const VERSES = (() => {
  let c = 0;
  return chalisa.verses.map((v) => {
    const isChaupai = v.kind === "चौपाई";
    if (isChaupai) c++;
    return { ...v, label: isChaupai ? `चौपाई ${deva(c)}` : "दोहा", lines: v.dev.map((l) => l.split(/\s+/).filter(Boolean)) };
  });
})();

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const save = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode — nothing to remember, nothing breaks */
  }
};

const Icon = ({ d, fill }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default function App() {
  return SYNC_MODE ? <SyncTool verses={VERSES} /> : <Chalisa />;
}

function Chalisa() {
  const signals = useMemo(() => ({ pointerX: 0, pointerY: 0, energy: 0, progress: 0, scene: 0 }), []);
  const chantRef = useRef(null);
  const chantMount = useRef(null);
  const toggleRef = useRef(() => {});
  const ttsRef = useRef(false); // true once YouTube has failed and we fell back to the device voice
  const unsyncedTold = useRef(false);
  const position = useMemo(() => {
    const T = loadTimings();
    return T ? { T, at: makePosition(T) } : null;
  }, []);
  const [chantOpen, setChantOpen] = useState(false);
  const rootRef = useRef(null);
  const progressRef = useRef(null);
  const readerRef = useRef(null);
  const menuRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const [meaning, setMeaning] = useState(() => {
    const m = load("hc-meaning", "off");
    return MEANING.includes(m) ? m : "off";
  });
  const [size, setSize] = useState(() => {
    const s = load("hc-size", 0);
    return s >= 0 && s < SIZES.length ? s : 0;
  });
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const reader = createReader({
      root: rootRef.current,
      signals,
      progressEl: progressRef.current,
      onVerse: setCur,
      onPlaying: (on) => {
        setPlaying(on);
        // the reader stopped itself (someone scrolled) → hush the recording too
        if (!on && chantRef.current) chantRef.current.pause();
      },
      onNote: (kind) => setNote(NOTES[kind] || ""),
      onToggle: () => toggleRef.current(),
    });
    readerRef.current = reader;
    return () => {
      reader.destroy();
      if (chantRef.current) chantRef.current.destroy();
      chantRef.current = null;
    };
  }, [signals]);

  useEffect(() => {
    document.documentElement.classList.add("is-stage");
    return () => document.documentElement.classList.remove("is-stage");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("is-chant", chantOpen);
    return () => document.documentElement.classList.remove("is-chant");
  }, [chantOpen]);

  const closeChant = () => {
    if (chantRef.current) chantRef.current.destroy();
    chantRef.current = null;
    setChantOpen(false);
    setPlaying(false);
    if (readerRef.current) readerRef.current.stop();
  };

  toggleRef.current = () => {
    const reader = readerRef.current;
    if (!reader) return;
    if (ttsRef.current) {
      if (reader.isOn()) reader.pause();
      else reader.play();
      return;
    }
    const cur = reader.current();
    if (!chantRef.current) {
      // first press: bring in the recording, starting at the verse on screen
      setChantOpen(true);
      chantRef.current = createChant({
        mount: chantMount.current,
        videoId: VIDEO_ID,
        start: position && cur > 0 ? position.T[cur] : 0,
        onState: (state) => {
          if (state === "playing") {
            setPlaying(true);
            if (position) reader.follow(() => position.at(chantRef.current ? chantRef.current.time() : 0));
            else if (!unsyncedTold.current) {
              unsyncedTold.current = true;
              setNote(NOTES.unsynced);
            }
          } else {
            setPlaying(false);
            reader.stop();
          }
        },
        onFail: () => {
          closeChant();
          ttsRef.current = true;
          setNote(NOTES["no-youtube"]);
          reader.play();
        },
      });
      return;
    }
    if (playing) {
      chantRef.current.pause();
    } else {
      // resuming after scrolling elsewhere → sing from the verse on screen
      if (position && cur >= 0 && position.at(chantRef.current.time()).u !== cur) chantRef.current.seek(position.T[cur]);
      chantRef.current.play();
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--ts", SIZES[size]);
    save("hc-size", size);
  }, [size]);
  useEffect(() => {
    save("hc-meaning", meaning);
    // the layout gives the words more room when a meaning is showing
    document.documentElement.dataset.meaning = meaning;
  }, [meaning]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 5000);
    return () => clearTimeout(t);
  }, [note]);

  // close the download menu on outside click / Escape
  useEffect(() => {
    if (!menu) return;
    const out = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    const esc = (e) => e.key === "Escape" && setMenu(false);
    window.addEventListener("pointerdown", out);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", out);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const nextMeaning = MEANING[(MEANING.indexOf(meaning) + 1) % MEANING.length];
  const meaningLabel = { off: "अर्थ", hi: "हिं", en: "EN" }[meaning];

  return (
    <>
      {HAS_ART && (
        <div className="art" aria-hidden="true">
          {Object.entries(ART)
            .filter(([i]) => Math.abs(Number(i) - cur) <= 1)
            .map(([i, src]) => (
              <div key={i} className={"art__img art__img--" + (Number(i) % 2 ? "r" : "l") + (WIDE.has(Number(i)) ? " art__img--wide" : "") + (Number(i) === cur ? " is-on" : "")} style={{ backgroundImage: `url(${src})`, "--focus": FOCUS[i] || "50% 50%" }} />
            ))}
        </div>
      )}
      <Aura signals={signals} overArt={HAS_ART} />

      <div className="progress" aria-hidden="true">
        <span ref={progressRef} />
      </div>

      <header className="bar">
        <button type="button" className="bar__title" onClick={() => readerRef.current && readerRef.current.go(-1)} aria-label="Hanuman Chalisa, back to the start">
          <span lang="hi">॥ हनुमान चालीसा ॥</span>
        </button>
        <p className="bar__where" aria-live="polite">
          {cur >= 0 && cur < VERSES.length ? VERSES[cur].label : ""}
        </p>

        <div className="bar__menuwrap" ref={menuRef}>
          <button type="button" className={"bar__menu" + (menu ? " is-on" : "")} onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="true" aria-label="Menu" title="Menu">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path className="bar__line bar__line--a" d="M5 9h14" />
              <path className="bar__line bar__line--b" d="M11 15h8" />
              <circle className="bar__dot" cx="6.2" cy="15" r="1.7" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {menu && (
            <div className="menu" lang="en">
              <div className="menu__group">
                <button
                  type="button"
                  className="menu__item"
                  onClick={() => {
                    setMenu(false);
                    toggleRef.current();
                  }}
                >
                  <Icon fill d={playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7A.6.6 0 0 0 8 5.2z"} />
                  <span>{playing ? "Pause video" : "Play video"}</span>
                </button>
                <button
                  type="button"
                  className="menu__item"
                  onClick={() => {
                    setMenu(false);
                    if (playing) toggleRef.current();
                    setTimeout(() => window.print(), 60);
                  }}
                >
                  <Icon d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  className="menu__item"
                  onClick={() => {
                    setMenu(false);
                    downloadText(chalisa);
                  }}
                >
                  <Icon d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
                  <span>Download text</span>
                </button>
              </div>

              <div className="menu__group menu__group--set">
                <div className="menu__row">
                  <p>Meaning</p>
                  <div className="seg" role="group" aria-label="Meaning">
                    {[
                      ["off", "Off", "Hide the meaning", "en"],
                      ["hi", "हिंदी", "Meaning in Hindi", "hi"],
                      ["en", "English", "Meaning in English", "en"],
                    ].map(([m, text, label, lang]) => (
                      <button key={m} type="button" lang={lang} aria-pressed={meaning === m} aria-label={label} onClick={() => setMeaning(m)}>
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="menu__row">
                  <p>Text size</p>
                  <div className="seg" role="group" aria-label="Text size">
                    {SIZES.map((s, i) => (
                      <button key={i} type="button" aria-pressed={size === i} aria-label={`Text size ${i + 1} of ${SIZES.length}`} onClick={() => setSize(i)} style={{ fontSize: `${0.85 + i * 0.2}rem` }}>
                        A
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main ref={rootRef} className="stage">
        <header className="hero fold">
          <p className="hero__pre">॥ श्री गणेशाय नमः ॥</p>
          <h1 className="hero__title">
            <span>श्री हनुमान</span> <span>चालीसा</span>
          </h1>
          <p className="hero__by">{chalisa.author}</p>
          <p className="hero__hint">
            <span lang="hi">स्वाइप या स्क्रॉल करें — हर शब्द अपने आप प्रकाशित होगा</span>
            <span lang="en">Swipe or scroll to turn each verse, or press play to listen</span>
          </p>
        </header>

        {VERSES.map((v, vi) => (
          <section key={v.id} className={"verse fold verse--" + (vi % 2 ? "l" : "r")} aria-label={v.label}>
            <h2 className="verse__kind">{v.label}</h2>
            <div className="verse__text" lang="hi">
              {v.lines.map((words, i) => (
                <p className="line" key={i}>
                  {words.map((w, k) => (
                    <span key={k}>
                      <span className="w">{w}</span>
                      {k < words.length - 1 ? " " : ""}
                    </span>
                  ))}
                </p>
              ))}
            </div>
            {meaning === "hi" && (
              <div className="verse__meaning">
                <p lang="hi">{v.hi}</p>
              </div>
            )}
            {meaning === "en" && (
              <div className="verse__meaning">
                <p className="roman" lang="hi-Latn">
                  {v.roman}
                </p>
                <p lang="en">{v.en}</p>
              </div>
            )}
          </section>
        ))}

        <footer className="outro fold">
          <p className="outro__jai">॥ जय श्री राम ॥</p>
          <p className="outro__sub">॥ जय हनुमान ॥</p>
          <button type="button" className="outro__again" onClick={() => readerRef.current && readerRef.current.go(-1)}>
            <span lang="hi">फिर से पढ़ें</span>
          </button>
        </footer>
      </main>

      <nav className="dock" aria-label="Controls">
        <button type="button" className="dock__btn dock__btn--turn" onClick={() => readerRef.current && readerRef.current.prev()} aria-label="Previous verse" title="Previous (←)">
          <Icon d="M14.5 5.5L8 12l6.5 6.5" />
        </button>
        <button
          type="button"
          className={"dock__btn dock__btn--play" + (playing ? " is-on" : "")}
          onClick={() => toggleRef.current()}
          aria-pressed={playing}
          aria-label={playing ? "Pause the video" : "Play the video"}
          title={playing ? "Pause (Space)" : "Listen (Space)"}
        >
          <Icon fill d={playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7A.6.6 0 0 0 8 5.2z"} />
        </button>
        <button type="button" className="dock__btn dock__btn--turn" onClick={() => readerRef.current && readerRef.current.next()} aria-label="Next verse" title="Next (→)">
          <Icon d="M9.5 5.5L16 12l-6.5 6.5" />
        </button>
      </nav>

      <aside className={"chant" + (chantOpen ? " is-open" : "")} aria-label="YouTube recording" aria-hidden={!chantOpen}>
        <div className="chant__frame" ref={chantMount} />
        {chantOpen && (
          <button type="button" className="chant__close" onClick={closeChant} aria-label="Close the video">
            ×
          </button>
        )}
      </aside>

      <p className={"toast" + (note ? " is-on" : "")} role="status" aria-live="polite" onClick={() => setNote("")}>
        {note}
      </p>
    </>
  );
}
