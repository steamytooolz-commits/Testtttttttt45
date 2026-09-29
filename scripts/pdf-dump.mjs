// Dev utility: dump text items with real positions from a PDF using pdfjs-dist.
// Usage: node scripts/pdf-dump.mjs <file.pdf>
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pdfjs;
try {
  pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
} catch {
  pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/pdf-dump.mjs <file.pdf>');
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data, useSystemFonts: false, isEvalSupported: false }).promise;
console.log(`pages: ${doc.numPages}`);

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  console.log(`\n===== PAGE ${p} (${Math.round(vp.width)}x${Math.round(vp.height)} pt) =====`);
  const tc = await page.getTextContent({ includeMarkedContent: false });
  // Group items into visual rows by y (0.5pt tolerance)
  const items = tc.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => {
      const m = pdfjs.Util.transform(vp.transform, i.transform);
      return { x: m[4], y: m[5], size: Math.hypot(m[2], m[3]), str: i.str, font: i.fontName };
      // y is baseline from TOP in PDF.js viewport coords; we print from bottom for PDF feel
    });
  items.forEach((i) => (i.yb = Math.round(vp.height - i.y)));
  items.sort((a, b) => b.yb - a.yb || a.x - b.x);
  let lastY = null;
  for (const i of items) {
    const sep = lastY !== null && Math.abs(i.yb - lastY) > 1 ? '\n' : '';
    const pad = lastY !== null && Math.abs(i.yb - lastY) <= 1 ? ' | '.repeat(0) : '';
    process.stdout.write(
      `${sep}y=${String(i.yb).padStart(4)} x=${String(Math.round(i.x)).padStart(3)} sz=${i.size.toFixed(1).padStart(5)}  ${i.str}`
    );
    lastY = i.yb;
  }
  process.stdout.write('\n');
}
