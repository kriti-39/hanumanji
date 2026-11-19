/* ------------------------------------------------------------
   Paintings behind the verses.

   Full-size paintings live in  src/art/  named by verse number:
     00 = first doha, 01 = second doha, 02 = chaupai 1 …
     41 = chaupai 40, 42 = closing doha
   (jpg, png or webp). They are picked up automatically.

   src/art/phone/  holds lighter 1080px copies with the same
   names. Phones get those (about 250 KB each instead of
   2–5 MB); wider screens get the full-size files. If you add or
   replace a painting, make its phone copy too (Claude can).

   Prompts for every verse are in art-prompts.md.
   ------------------------------------------------------------ */

const full = import.meta.glob("../art/*.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" });
const phone = import.meta.glob("../art/phone/*.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" });

function byNumber(files) {
  const out = {};
  // .png files go first, so a .jpg / .webp with the same number replaces them
  const ordered = Object.entries(files).sort(([a], [b]) => a.endsWith(".png") - b.endsWith(".png")).reverse();
  for (const [path, url] of ordered) {
    const m = path.match(/(\d+)\.\w+$/);
    if (m) out[Number(m[1])] = url;
  }
  return out;
}

export const ART_FULL = byNumber(full);
export const ART_PHONE = byNumber(phone);

const small = typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches;

/** The paintings this screen should use: phone copies on phones, full size elsewhere. */
export const ART = small ? { ...ART_FULL, ...ART_PHONE } : ART_FULL;

// Paintings that are wide (16:9) rather than square. All are square now.
export const WIDE = new Set([]);

// Where the figure sits in a wide painting. Square, centred paintings need no entry.
export const FOCUS = {};
