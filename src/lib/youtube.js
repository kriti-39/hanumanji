/* A small wrapper around the YouTube IFrame Player API. */

let apiPromise = null;

function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube API failed to load"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/**
 * Creates a player inside `mount` and starts playing.
 * onState gets "playing" | "paused" | "ended"; onFail is called if
 * YouTube cannot be reached or the video cannot be played.
 */
export function createChant({ mount, videoId, start = 0, onState, onFail }) {
  let player = null;
  let ready = false;
  let dead = false;
  let playing = false;
  let lastT = 0;
  let lastAt = 0;

  loadApi()
    .then((YT) => {
      if (dead) return;
      const el = document.createElement("div");
      mount.appendChild(el);
      player = new YT.Player(el, {
        videoId,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, start: Math.floor(start) },
        events: {
          onReady: () => {
            ready = true;
            player.playVideo();
          },
          onStateChange: (e) => {
            playing = e.data === 1;
            lastAt = 0;
            if (e.data === 1) onState("playing");
            else if (e.data === 2) onState("paused");
            else if (e.data === 0) onState("ended");
          },
          onError: () => onFail("video"),
        },
      });
    })
    .catch(() => {
      if (!dead) onFail("api");
    });

  return {
    play: () => ready && player.playVideo(),
    pause: () => ready && player.pauseVideo(),
    seek: (s) => {
      if (!ready) return;
      lastAt = 0;
      player.seekTo(s, true);
    },
    /** Current time in seconds. YouTube only reports it a few times a
        second, so between reports we advance it with the clock. */
    time: () => {
      if (!ready || !player.getCurrentTime) return 0;
      const t = player.getCurrentTime();
      const now = performance.now();
      if (t !== lastT || !lastAt) {
        lastT = t;
        lastAt = now;
        return t;
      }
      return playing ? t + Math.min(0.5, (now - lastAt) / 1000) : t;
    },
    destroy: () => {
      dead = true;
      try {
        if (player) player.destroy();
      } catch {
        /* already gone */
      }
      mount.innerHTML = "";
    },
  };
}
