/* Plain-text download. The BOM keeps Devanagari readable in Windows Notepad. */
export function downloadText(chalisa) {
  const out = [`॥ ${chalisa.title} ॥`, chalisa.author, ""];
  let chaupai = 0;
  for (const v of chalisa.verses) {
    if (v.kind === "चौपाई") chaupai++;
    out.push(v.kind === "चौपाई" ? `॥ चौपाई ${chaupai} ॥` : "॥ दोहा ॥");
    out.push(...v.dev, "");
  }
  const blob = new Blob(["﻿" + out.join("\r\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hanuman-chalisa.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
