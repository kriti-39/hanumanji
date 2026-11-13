/* ------------------------------------------------------------
   Reader engine — everything that moves, outside React.

   The page never scrolls. It is a stack of slides (the title,
   the 43 verses, the ending) and one of them is on screen at a
   time. One scroll, one swipe or one key press turns to the next
   slide, which glides in sideways; then its words light up one
   after another by themselves, like a transcript being read.

   Ways to turn:   wheel / trackpad, swipe (up or sideways),
                   arrow keys, or the ‹ › buttons.
   Ways to read:   • by hand — words reveal themselves at a calm pace
                   • paath   — a recording (or the device voice)
                               drives the glow and turns the slides.
   ------------------------------------------------------------ */

const MS_PER_CHAR = 105; // pace of the device voice when it gives no word timings
const RATE = 0.8;
const REVEAL_MS_PER_CHAR = 85; // pace of the self-reading glow
const REVEAL_DELAY = 480; // wait for the slide to arrive before reading

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createReader({ root, signals, progressEl, onVerse, onPlaying, onNote, onToggle }) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // every slide in order: the title, the 43 verses, the ending
  const slides = [...root.querySelectorAll(".fold")].map((el) => ({ el, key: "" }));
  const units = [...root.querySelectorAll(".verse")].map((el) => {
    const words = [];
    const lines = [];
    for (const lineEl of el.querySelectorAll(".line")) {
      const ws = [...lineEl.querySelectorAll(".w")];
      lines.push({
        from: words.length,
        // what the voice is given: the same words, without the danda marks
        tokens: ws.map((w) => w.textContent.replace(/[।॥]/g, "").trim()),
      });
      words.push(...ws);
    }
    return { el, words, lines, state: "future", idx: -1 };
  });
  const n = units.length;

  let idx = -1; //   the slide we are on: -1 = title, 0…n-1 = verses, n = ending
  let e = -1; //     where the slides actually are right now (glides towards idx)
  let drag = 0; //   sideways finger drag, in slides
  let vw = window.innerWidth;
  let travel = vw; // how far a slide glides sideways
  let prevCur = -1;
  let ptx = 0;
  let pty = 0;
  let ptKey = "";
  let progKey = "";
  let raf = 0;
  let lastFrame = performance.now();

  function measure() {
    vw = window.innerWidth;
    const wide = vw >= 900 && vw > window.innerHeight;
    travel = wide ? vw * 0.45 : vw;
    for (const sl of slides) sl.key = "";
  }

  /* ---------- painting the glow ---------- */
  // cur = verse being read (-1 before the first), widx = word being read
  // (-1 = none yet, words.length = the whole verse is lit).
  function paint(cur, widx) {
    const lo = Math.max(0, Math.min(prevCur, cur));
    const hi = Math.min(n - 1, Math.max(prevCur, cur) + 1);
    for (let i = lo; i <= hi; i++) {
      const u = units[i];
      const st = i < cur ? "past" : i > cur ? "future" : "now";
      if (u.state !== st) {
        u.state = st;
        u.el.dataset.s = st;
        if (st !== "now" && u.idx !== -1) {
          for (const w of u.words) w.className = "w";
          u.idx = -1;
        }
      }
      if (st === "now" && u.idx !== widx) {
        for (let k = 0; k < u.words.length; k++) {
          u.words[k].className = k < widx ? "w lit" : k === widx ? "w now" : "w";
        }
        if (widx > u.idx) signals.energy = 1; // the background answers each new word
        u.idx = widx;
      }
    }
    prevCur = cur;
  }

  /* ---------- the self-reading glow ---------- */
  const R = { u: -1, t0: 0, cum: [], done: true };

  function startReveal(u) {
    R.u = u;
    R.cum = [];
    let acc = 0;
    for (const w of units[u].words) {
      acc += w.textContent.length + 1.5;
      R.cum.push(acc * REVEAL_MS_PER_CHAR);
    }
    R.t0 = performance.now() + (reduce.matches ? 0 : REVEAL_DELAY);
    R.done = false;
    paint(u, -1);
  }

  function tickReveal(now) {
    if (R.done) return;
    const el = now - R.t0;
    if (el < 0) return;
    const len = R.cum.length;
    if (el >= R.cum[len - 1]) {
      paint(R.u, len);
      R.done = true;
      return;
    }
    let k = 0;
    while (k < len - 1 && el > R.cum[k]) k++;
    paint(R.u, k);
  }

  /* ---------- turning the slides ---------- */
  function setIndex(k) {
    k = clamp(k, -1, n);
    if (k === idx) return;
    idx = k;
    onVerse(k);
    if (k < 0) {
      R.done = true;
      paint(-1, 0);
    } else if (k >= n) {
      R.done = true;
      paint(n - 1, units[n - 1].words.length);
    } else if (!P.on) {
      startReveal(k);
    }
  }

  // turned by hand — this always wins over autoplay
  function go(k) {
    pause();
    setIndex(k);
  }
  const step = (dir) => go(idx + dir);

  /* ---------- paath (read aloud) ---------- */
  const P = { on: false, u: 0, l: 0, gen: 0, t0: 0, bound: false, silent: false, cum: [], total: 0, wait: 0, voice: null, utt: null, follow: null };
  const synth = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window ? window.speechSynthesis : null;
  if (synth) synth.getVoices(); // warm the voice list — it loads asynchronously

  function goSilent() {
    if (!P.silent) {
      P.silent = true;
      onNote("no-voice");
    }
  }

  function speakLine() {
    const gen = ++P.gen;
    const u = units[P.u];
    const line = u.lines[P.l];
    P.cum = [];
    let acc = 0;
    for (const t of line.tokens) {
      acc += t.length + 1.5;
      P.cum.push(acc);
    }
    P.total = (acc * MS_PER_CHAR) / RATE;
    P.t0 = performance.now();
    P.bound = false;
    paint(P.u, line.from);

    if (P.silent || !synth) return;
    const utt = new SpeechSynthesisUtterance(line.tokens.join(" "));
    utt.lang = "hi-IN";
    if (P.voice) utt.voice = P.voice;
    utt.rate = RATE;
    utt.pitch = 0.9;
    const offs = [];
    let o = 0;
    for (const t of line.tokens) {
      offs.push(o);
      o += t.length + 1;
    }
    utt.onstart = () => {
      if (gen === P.gen) P.t0 = performance.now();
    };
    utt.onboundary = (ev) => {
      if (gen !== P.gen || (ev.name && ev.name !== "word")) return;
      let k = 0;
      for (let i = 0; i < offs.length; i++) if (offs[i] <= ev.charIndex) k = i;
      P.bound = true;
      paint(P.u, line.from + k);
    };
    utt.onend = () => {
      if (gen === P.gen) lineDone();
    };
    utt.onerror = (ev) => {
      if (gen !== P.gen || ev.error === "interrupted" || ev.error === "canceled") return;
      goSilent();
      P.t0 = performance.now();
    };
    P.utt = utt; // hold a reference — some browsers drop events otherwise
    synth.speak(utt);
  }

  function lineDone() {
    P.gen++;
    const u = units[P.u];
    P.l++;
    if (P.l >= u.lines.length) {
      paint(P.u, u.words.length);
      if (P.u + 1 >= n) {
        pause();
        return;
      }
      P.u++;
      P.l = 0;
      P.wait = performance.now() + 900; // time for the next slide to arrive
      setIndex(P.u);
      paint(P.u, -1);
    } else {
      P.wait = performance.now() + 300;
    }
  }

  function tickPaath(now) {
    if (P.wait) {
      if (now >= P.wait) {
        P.wait = 0;
        speakLine();
      }
      return;
    }
    const el = now - P.t0;
    const line = units[P.u].lines[P.l];
    if (!P.bound) {
      // no word timings from the voice — keep pace by word length
      let k = 0;
      while (k < P.cum.length - 1 && el > (P.cum[k] * MS_PER_CHAR) / RATE) k++;
      paint(P.u, line.from + k);
    }
    if (P.silent) {
      if (el > P.total + 250) lineDone();
    } else if (el > P.total * 2.5 + 4000) {
      // the voice never finished (or never started): carry on silently
      goSilent();
      if (synth) synth.cancel();
      lineDone();
    }
  }

  // read aloud with the device voice, from the verse on screen
  function play() {
    if (P.on) return;
    const cur = idx < 0 || idx >= n ? 0 : idx;
    P.on = true;
    P.u = cur;
    P.l = 0;
    P.wait = 0;
    P.silent = false;
    R.done = true;
    if (!synth) {
      goSilent();
    } else {
      const voices = synth.getVoices();
      P.voice = voices.find((v) => /^hi([-_]|$)/i.test(v.lang)) || null;
      if (voices.length > 0 && !P.voice) goSilent();
      synth.cancel();
    }
    setIndex(cur);
    onPlaying(true);
    speakLine(); // must run inside the tap/click so mobile browsers allow speech
  }

  /* Follow an outside clock (the YouTube recording). `fn` returns
     { u: verse index or -1, wf: 0..1 progress through that verse }. */
  function follow(fn) {
    if (P.on) stop();
    P.on = true;
    P.follow = fn;
    R.done = true;
  }

  // stop quietly (no callback) — used when the recording stops by itself
  function stop() {
    if (!P.on) return;
    P.on = false;
    P.follow = null;
    P.gen++;
    P.wait = 0;
    if (synth) synth.cancel();
  }

  function pause() {
    if (!P.on) return;
    stop();
    onPlaying(false);
  }

  /* ---------- the frame loop ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;

    const gap = now - lastFrame;
    lastFrame = now;
    // If frames stopped for a while (tab in the background), anything paced
    // by the clock waits rather than racing ahead to catch up.
    if (gap > 500) {
      if (P.on && P.silent) {
        P.t0 += gap;
        if (P.wait) P.wait += gap;
      }
      if (!R.done) R.t0 += gap;
    }

    if (P.on) {
      if (P.follow) {
        const pos = P.follow();
        if (pos && pos.u >= 0) {
          P.u = Math.min(pos.u, n - 1);
          if (idx !== P.u) setIndex(P.u);
          const len = units[P.u].words.length;
          paint(P.u, pos.wf >= 1 ? len : Math.floor(pos.wf * len));
        }
      } else tickPaath(now);
    } else tickReveal(now);

    // glide the slides towards where they should be
    const target = idx + drag;
    if (reduce.matches || Math.abs(target - e) < 0.0015) e = target;
    else e += (target - e) * (1 - Math.exp(-Math.min(gap, 1000) / (drag ? 45 : 150)));

    const still = reduce.matches;
    for (let j = 0; j < slides.length; j++) {
      const sl = slides[j];
      const d = clamp(j - 1 - e, -1.05, 1.05);
      const a = Math.abs(d);
      const key = still ? (a < 0.5 ? "on" : "off") : d.toFixed(3);
      if (key === sl.key) continue;
      sl.key = key;
      if (still) {
        sl.el.style.transform = "";
        sl.el.style.opacity = a < 0.5 ? "1" : "0";
      } else {
        sl.el.style.transform = `translate3d(${(d * travel).toFixed(1)}px,0,0) scale(${(1 - a * 0.05).toFixed(3)})`;
        sl.el.style.opacity = clamp(1 - a * 1.35, 0, 1).toFixed(3);
      }
      sl.el.classList.toggle("is-here", a < 0.5);
    }

    const p = clamp((e + 1) / (n + 1), 0, 1);
    const pk = p.toFixed(4);
    if (pk !== progKey) {
      progKey = pk;
      signals.progress = p;
      if (progressEl) progressEl.style.transform = `scaleX(${pk})`;
    }

    // lets the painting lean a little with the mouse
    ptx += (signals.pointerX - ptx) * 0.05;
    pty += (signals.pointerY - pty) * 0.05;
    const ptk = ptx.toFixed(2) + pty.toFixed(2);
    if (ptk !== ptKey) {
      ptKey = ptk;
      document.documentElement.style.setProperty("--px", ptx.toFixed(2));
      document.documentElement.style.setProperty("--py", pty.toFixed(2));
    }
  }

  /* ---------- listeners ---------- */
  const onPointer = (ev) => {
    if (ev.pointerType !== "mouse") return;
    signals.pointerX = (ev.clientX / window.innerWidth) * 2 - 1;
    signals.pointerY = (ev.clientY / window.innerHeight) * 2 - 1;
  };

  // Wheel / trackpad: one deliberate scroll = one slide. Trackpads send a
  // long tail of small movements, so after a turn we rest briefly.
  let wheelAcc = 0;
  let wheelRest = 0;
  let wheelLast = 0;
  const onWheel = (ev) => {
    if (ev.ctrlKey) return; // pinch-zoom
    const box = ev.target.closest && ev.target.closest(".verse");
    if (box && box.scrollHeight > box.clientHeight + 4 && Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
      const atEnd = ev.deltaY > 0 ? box.scrollTop + box.clientHeight >= box.scrollHeight - 2 : box.scrollTop <= 0;
      if (!atEnd) return; // a long verse scrolls inside its panel first
    }
    ev.preventDefault();
    const now = performance.now();
    if (now < wheelRest) return;
    if (now - wheelLast > 250) wheelAcc = 0;
    wheelLast = now;
    const dx = ev.deltaX;
    const dy = ev.deltaY;
    wheelAcc += (Math.abs(dx) > Math.abs(dy) ? dx : dy) * (ev.deltaMode === 1 ? 30 : 1);
    if (Math.abs(wheelAcc) >= 50) {
      step(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0;
      wheelRest = now + 750;
    }
  };

  // Touch: swipe up or left for the next slide, down or right for the
  // previous. A sideways drag carries the slides with the finger.
  const T = { x: 0, y: 0, mode: -1, inner: false };
  const onTouchStart = (ev) => {
    const el = ev.target;
    if (ev.touches.length > 1 || (el.closest && el.closest(".dock, .chant, .menu, .bar"))) {
      T.mode = -1;
      return;
    }
    T.x = ev.touches[0].clientX;
    T.y = ev.touches[0].clientY;
    T.mode = 0;
    // a verse too long for its panel (big text + meaning) scrolls inside it
    const box = el.closest && el.closest(".verse");
    T.inner = !!box && box.scrollHeight > box.clientHeight + 4;
  };
  const onTouchMove = (ev) => {
    if (T.mode < 0) return;
    if (ev.touches.length > 1) {
      T.mode = -1;
      drag = 0;
      return;
    }
    const dx = ev.touches[0].clientX - T.x;
    const dy = ev.touches[0].clientY - T.y;
    if (T.mode === 0) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) T.mode = 1;
      else if (Math.abs(dy) > 8) T.mode = 2;
    }
    if (T.mode === 2 && T.inner) return; // let the panel scroll
    if (T.mode > 0 && ev.cancelable) ev.preventDefault(); // no pull-to-refresh, no page drift
    if (T.mode === 1) drag = clamp(-dx / travel, -1, 1);
  };
  const onTouchEnd = (ev) => {
    if (T.mode <= 0) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - T.x;
    const dy = t.clientY - T.y;
    const mode = T.mode;
    T.mode = -1;
    drag = 0;
    if (mode === 1) {
      if (dx < -vw * 0.14) step(1);
      else if (dx > vw * 0.14) step(-1);
    } else if (T.inner) return;
    else if (dy < -36) step(1);
    else if (dy > 36) step(-1);
  };

  const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown"]);
  const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);
  const onKey = (ev) => {
    const tag = ev.target && ev.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (ev.code === "Space") {
      if (tag === "BUTTON" || tag === "A") return;
      ev.preventDefault();
      if (onToggle) onToggle();
      else if (P.on) pause();
      else play();
    } else if (NEXT_KEYS.has(ev.key)) {
      ev.preventDefault();
      step(1);
    } else if (PREV_KEYS.has(ev.key)) {
      ev.preventDefault();
      step(-1);
    } else if (ev.key === "Home") go(-1);
    else if (ev.key === "End") go(n);
  };
  const onHide = () => pause();

  window.addEventListener("resize", measure);
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKey);
  window.addEventListener("pagehide", onHide);

  measure();
  raf = requestAnimationFrame(frame);

  return {
    play,
    pause,
    follow,
    stop,
    go,
    next: () => step(1),
    prev: () => step(-1),
    isOn: () => P.on,
    /** the verse on screen, or -1 on the title / ending */
    current: () => (idx >= 0 && idx < n ? idx : -1),
    destroy() {
      pause();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", onHide);
    },
  };
}
