/* ------------------------------------------------------------
   Paintings behind the verses.

   Just drop an image into  src/art/  named by verse number:
     00 = first doha, 01 = second doha, 02 = chaupai 1 …
     41 = chaupai 40, 42 = closing doha
   e.g. src/art/07.jpg  (jpg, png or webp). It is picked up
   automatically. Verses without a file show the plain
   dark-gold background. Prompts for every verse are in
   art-prompts.md at the top of the project.
   ------------------------------------------------------------ */

const files = import.meta.glob("../art/*.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" });

export const ART = {};
// The small .png previews go first, so a full-size .jpg / .webp with the same number replaces them.
const ordered = Object.entries(files).sort(([a], [b]) => a.endsWith(".png") - b.endsWith(".png")).reverse();
for (const [path, url] of ordered) {
  const m = path.match(/(\d+)\.\w+$/);
  if (m) ART[Number(m[1])] = url;
}

// Paintings that are wide (16:9) rather than square. They are shown whole,
// in a wide frame, never cropped.
export const WIDE = new Set([2, 12, 19]);

// Where the figure sits in WIDE paintings, so tall phone screens crop to it.
// Square, centred paintings don't need an entry.
export const FOCUS = {
  2: "84% 50%",
  12: "24% 40%",
  19: "26% 45%",
};
