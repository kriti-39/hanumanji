import { useEffect, useMemo, useRef, useState } from "react";
import { chalisa } from "./data/chalisa.js";
import Aura from "./components/Aura.jsx";
import { createReader } from "./lib/reader.js";
import { downloadText } from "./lib/download.js";
import { createChant } from "./lib/youtube.js";
import { makePosition } from "./lib/sync.js";
import { ART, FOCUS, WIDE } from "./data/art.js";
import { VERSIONS, versionById, loadTimings } from "./data/timings.js";
import { EXTRA_LANGS } from "./data/meanings.js";
import SyncTool from "./components/SyncTool.jsx";

const SYNC_MODE = new URLSearchParams(window.location.search).has("sync");
const HAS_ART = Object.keys(ART).length > 0;
const NOTES = {
  "no-voice": "No Hindi voice on this device. The verses will turn silently.",
  "no-youtube": "Could not reach YouTube. Using this device's voice instead.",
  unsynced: "Video is playing. Swipe to turn the verses as you listen.",
  installed: "Installed. Verses and paintings will now open without internet.",
  ios: "To install: tap the Share button, then “Add to Home Screen”.",
};

const deva = (num) => num.toLocaleString("hi-IN-u-nu-deva");
const SIZES = [1, 1.18, 1.36];
const GOAL = 100; // चौपाई ३८: जो सत बार पाठ कर कोई …

// Meaning choices: off, Hindi, English, then any checked extra languages
const MEANINGS = [
  ["off", "Off", "Hide the meaning", "en"],
  ["hi", "हिंदी", "Meaning in Hindi", "hi"],
  ["en", "English", "Meaning in English", "en"],
  ...EXTRA_LANGS.map((l) => [l.code, l.label, "Meaning in " + l.name, l.code]),
];
const MEANING_CODES = MEANINGS.map((m) => m[0]);
const EXTRA = Object.fromEntries(EXTRA_LANGS.map((l) => [l.code, l]));

// Label every verse once: दोहा, चौपाई १ … चौपाई ४०, दोहा
const VERSES = (() => {
  let c = 0;
  return chalisa.verses.map((v) => {
    const isChaupai = v.kind === "चौपाई";
    if (isChaupai) c++;
    return { ...v, label: isChaupai ? `चौपाई ${deva(c)}` : "दोहा", lines: v.dev.map((l) => l.split(/\s+/).filter(Boolean)) };
  });
})();
const N = VERSES.length;

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

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* Save everything the installed app needs, so it opens without internet:
   the page, its scripts and styles, fonts, and every painting for this screen. */
async function saveForOffline() {
  if (!import.meta.env.PROD || !("caches" in window)) return;
  try {
    const cache = await caches.open("hc-v1");
    const urls = new Set(["/", "/manifest.webmanifest", ...Object.values(ART)]);
    document.querySelectorAll("script[src], link[rel='stylesheet'][href], link[rel='icon'], link[rel='apple-touch-icon']").forEach((el) => urls.add(el.src || el.href));
    performance.getEntriesByType("resource").forEach((r) => {
      if (r.name.startsWith(location.origin) || r.name.includes("fonts.g")) urls.add(r.name);
    });
    for (const url of urls) {
      try {
        if (!(await cache.match(url))) await cache.add(url);
      } catch {
        /* one missing file should not stop the rest */
      }
    }
  } catch {
    /* storage full or blocked: the site still works online */
  }
}

const Icon = ({ d, fill }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const PLAY = "M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7A.6.6 0 0 0 8 5.2z";
const PAUSE = "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";
const DOWN = "M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14";
const INSTALL = "M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5zM12 8v6m0 0l-2.5-2.5M12 14l2.5-2.5M10.5 17.5h3";

/* A sliding switch: a gold thumb glides to the chosen option. */
function Switch({ label, options, value, onChange }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="seg2" role="radiogroup" aria-label={label} style={{ "--n": options.length, "--i": i }}>
      <span className="seg2__thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={o.aria} lang={o.lang} style={o.style} onClick={() => onChange(o.value)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  return SYNC_MODE ? <SyncTool verses={VERSES} /> : <Chalisa />;
}

function Chalisa() {
  const signals = useMemo(() => ({ pointerX: 0, pointerY: 0, energy: 0, progress: 0, scene: 0 }), []);
  const chantRef = useRef(null);
  const chantMount = useRef(null);
  const toggleRef = useRef(() => {});
  const reopenRef = useRef(false);
  const ttsRef = useRef(false); // true once YouTube has failed and we fell back to the device voice
  const unsyncedTold = useRef(false);
  const rootRef = useRef(null);
  const progressRef = useRef(null);
  const readerRef = useRef(null);
  const menuRef = useRef(null);
  const passRef = useRef({ started: false, sawLast: false });

  const [pace, setPace] = useState(() => versionById(load("hc-pace", "slow")).id);
  const version = versionById(pace);
  // when each verse begins in the chosen recording (null until it has been timed)
  const position = useMemo(() => {
    const T = loadTimings(version);
    return T ? { T, at: makePosition(T) } : null;
  }, [version]);
  const positionRef = useRef(position);
  positionRef.current = position;

  const [chantOpen, setChantOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const [meaning, setMeaning] = useState(() => {
    const m = load("hc-meaning", "off");
    return MEANING_CODES.includes(m) ? m : "off";
  });
  const [size, setSize] = useState(() => {
    const s = load("hc-size", 0);
    return s >= 0 && s < SIZES.length ? s : 0;
  });
  const [count, setCount] = useState(() => {
    const c = load("hc-paath", 0);
    return Number.isInteger(c) && c >= 0 ? c : 0;
  });
  const [menu, setMenu] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  const dockRef = useRef(null);
  const [note, setNote] = useState("");
  const [installEvt, setInstallEvt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const reader = createReader({
      root: rootRef.current,
      signals,
      progressEl: progressRef.current,
      onVerse: setCur,
      onPlaying: (on) => {
        setPlaying(on);
        // the reader stopped itself (someone turned away) → hush the recording too
        if (!on && chantRef.current) chantRef.current.pause();
      },
      onNote: (kind) => setNote(NOTES[kind] || ""),
      onToggle: () => toggleRef.current(),
      // turning a verse while a timed recording plays moves the recording there
      onSeek: (k) => {
        const pos = positionRef.current;
        if (chantRef.current && pos) chantRef.current.seek(pos.T[k]);
      },
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

  /* ---------- install to home screen ---------- */
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault(); // keep it for our own "Install app" button
      setInstallEvt(e);
    };
    const onInstalled = () => {
      setInstallEvt(null);
      setInstalled(true);
      setNote(NOTES.installed);
      saveForOffline();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // opened from the home screen: make sure everything is saved for offline use
    if (isStandalone()) {
      const t = setTimeout(saveForOffline, 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (installEvt) {
      installEvt.prompt();
      try {
        await installEvt.userChoice;
      } catch {
        /* closed */
      }
      setInstallEvt(null);
    } else {
      setNote(NOTES.ios);
    }
  };
  const canInstall = !installed && (installEvt || isIOS());

  /* ---------- paath counter ----------
     A recitation counts when you start at the first doha, reach the last
     verse and arrive at the ending — by hand or with the recording. */
  useEffect(() => {
    const p = passRef.current;
    if (cur === 0) {
      p.started = true;
      p.sawLast = false;
    } else if (cur === N - 1 && p.started) {
      p.sawLast = true;
    } else if (cur === N && p.started && p.sawLast) {
      p.started = false;
      setCount((c) => {
        save("hc-paath", c + 1);
        return c + 1;
      });
    }
  }, [cur]);

  const resetCount = () => {
    if (!window.confirm("Reset your recitation count to 0?")) return;
    save("hc-paath", 0);
    setCount(0);
  };

  /* ---------- the recording ---------- */
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
    const at = reader.current();
    if (!chantRef.current) {
      // first press: bring in the recording, starting at the verse on screen
      setChantOpen(true);
      const pos = position;
      chantRef.current = createChant({
        mount: chantMount.current,
        videoId: version.videoId,
        start: pos && at > 0 ? pos.T[at] : 0,
        onState: (state) => {
          if (state === "playing") {
            setPlaying(true);
            if (pos) reader.follow(() => pos.at(chantRef.current ? chantRef.current.time() : 0));
            else if (!unsyncedTold.current) {
              unsyncedTold.current = true;
              setNote(NOTES.unsynced);
            }
          } else {
            setPlaying(false);
            reader.stop();
            // the whole recording has been heard: arrive at the ending (and count the paath)
            if (state === "ended" && pos) reader.go(N);
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
      // resuming after turning elsewhere → sing from the verse on screen
      if (position && at >= 0 && position.at(chantRef.current.time()).u !== at) chantRef.current.seek(position.T[at]);
      chantRef.current.play();
    }
  };

  // Play: while playing it pauses; otherwise it offers the three paces first
  const pressPlay = () => {
    if (playing) toggleRef.current();
    else setPaceOpen((o) => !o);
  };
  // a pace was chosen: play that recording (or carry on with it)
  const startWith = (id) => {
    setPaceOpen(false);
    save("hc-pace", id);
    if (id === pace) {
      toggleRef.current();
      return;
    }
    if (chantRef.current) closeChant();
    reopenRef.current = true; // starts once the new pace is in place
    setPace(id);
  };
  useEffect(() => {
    if (!reopenRef.current) return;
    reopenRef.current = false;
    toggleRef.current();
  }, [pace]);

  /* ---------- settings ---------- */
  useEffect(() => {
    document.documentElement.style.setProperty("--ts", SIZES[size]);
    save("hc-size", size);
  }, [size]);
  useEffect(() => {
    save("hc-meaning", meaning);
    // the layout gives the words more room when a meaning is showing
    document.documentElement.dataset.meaning = meaning === "off" ? "off" : meaning === "hi" ? "hi" : "en";
  }, [meaning]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 5000);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!paceOpen) return;
    const out = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) setPaceOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setPaceOpen(false);
    window.addEventListener("pointerdown", out);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", out);
      window.removeEventListener("keydown", esc);
    };
  }, [paceOpen]);

  // close the menu on outside click / Escape
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

  return (
    <>
      {HAS_ART && (
        <div className="art" aria-hidden="true">
          {Object.entries(ART)
            // the painting on screen, the one before, and the next two (so they are ready in time)
            .filter(([i]) => Number(i) >= cur - 1 && Number(i) <= cur + 2)
            .map(([i, src]) => (
              <div
                key={i}
                className={"art__img art__img--" + (Number(i) % 2 ? "r" : "l") + (WIDE.has(Number(i)) ? " art__img--wide" : "") + (Number(i) === cur ? " is-on" : "")}
                style={{ backgroundImage: `url(${src})`, "--focus": FOCUS[i] || "50% 50%" }}
              />
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
          {cur >= 0 && cur < N ? VERSES[cur].label : ""}
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
              <div className="mtiles">
                {canInstall && (
                  <button
                    type="button"
                    className="mtile mtile--wide"
                    onClick={() => {
                      setMenu(false);
                      install();
                    }}
                  >
                    <Icon d={INSTALL} />
                    <span>
                      <b>Install app</b>
                      <small>Opens from your home screen, works offline</small>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="mtile"
                  onClick={() => {
                    setMenu(false);
                    if (playing) toggleRef.current();
                    setTimeout(() => window.print(), 60);
                  }}
                >
                  <Icon d={DOWN} />
                  <span>
                    <b>PDF</b>
                    <small>Print or save</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="mtile"
                  onClick={() => {
                    setMenu(false);
                    downloadText(chalisa);
                  }}
                >
                  <Icon d={DOWN} />
                  <span>
                    <b>Text</b>
                    <small>Plain .txt file</small>
                  </span>
                </button>
              </div>

              <div className="mset">
                <span className="mset__label">Meaning</span>
                <Switch label="Meaning" value={meaning} onChange={setMeaning} options={MEANINGS.map(([m, text, aria, lang]) => ({ value: m, text, aria, lang }))} />
                <span className="mset__note">More languages coming soon</span>
              </div>

              <div className="mset">
                <span className="mset__label">Text size</span>
                <Switch
                  label="Text size"
                  value={size}
                  onChange={setSize}
                  options={SIZES.map((_, i) => ({ value: i, text: "A", aria: `Text size ${i + 1} of ${SIZES.length}`, style: { fontSize: `${0.85 + i * 0.2}rem` } }))}
                />
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
            {EXTRA[meaning] && (
              <div className="verse__meaning">
                <p lang={meaning}>{EXTRA[meaning].texts[vi]}</p>
              </div>
            )}
          </section>
        ))}

        <footer className="outro fold">
          <p className="outro__jai">॥ जय श्री राम ॥</p>
          <p className="outro__sub">॥ जय हनुमान ॥</p>

          <div className="paath" lang="en">
            <p className="paath__num">{count}</p>
            <p className="paath__label">
              {count === 1 ? "recitation" : "recitations"} completed
              {count < GOAL ? ` · ${count} of ${GOAL}` : ""}
            </p>
            <span className="paath__bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (count / GOAL) * 100)}%` }} />
            </span>
            {count > 0 && (
              <button type="button" className="paath__reset" onClick={resetCount}>
                Reset
              </button>
            )}
          </div>

          <button type="button" className="outro__again" onClick={() => readerRef.current && readerRef.current.go(-1)} lang="en">
            Read again
          </button>
        </footer>
      </main>

      <nav className="dock" aria-label="Controls" ref={dockRef}>
        {paceOpen && (
          <div className="pace" role="dialog" aria-label="Choose a pace" lang="en">
            <p className="pace__title">Choose a pace</p>
            <Switch label="Pace" value={pace} onChange={startWith} options={VERSIONS.map((v) => ({ value: v.id, text: v.label, aria: `${v.label} recitation` }))} />
          </div>
        )}
        <button type="button" className="dock__btn dock__btn--turn" onClick={() => readerRef.current && readerRef.current.prev()} aria-label="Previous verse" title="Previous (←)">
          <Icon d="M14.5 5.5L8 12l6.5 6.5" />
        </button>
        <button
          type="button"
          className={"dock__btn dock__btn--play" + (playing ? " is-on" : "")}
          onClick={pressPlay}
          aria-pressed={playing}
          aria-expanded={playing ? undefined : paceOpen}
          aria-label={playing ? "Pause the video" : "Play the video"}
          title={playing ? "Pause (Space)" : "Listen (Space)"}
        >
          <Icon fill d={playing ? PAUSE : PLAY} />
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
