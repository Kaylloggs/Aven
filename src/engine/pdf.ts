// Minimal dependency-free PDF writer: one page per raster image, lossless (FlateDecode RGB).
export interface PdfPage {
  /** page size in PDF points (1/72 inch) */
  widthPt: number;
  heightPt: number;
  /** pixel data (RGBA, as from canvas getImageData) */
  pixels: Uint8ClampedArray;
  pxWidth: number;
  pxHeight: number;
  /** background used to flatten transparency */
  background?: [number, number, number];
}

const enc = new TextEncoder();

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  });
  const stream = source.pipeThrough(new CompressionStream("deflate") as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pdfString(s: string): string {
  // UTF-16BE hex string handles any characters in metadata
  let hex = "FEFF";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) {
      const c = code - 0x10000;
      hex += (0xd800 + (c >> 10)).toString(16).padStart(4, "0") + (0xdc00 + (c & 0x3ff)).toString(16).padStart(4, "0");
    } else hex += code.toString(16).padStart(4, "0");
  }
  return `<${hex.toUpperCase()}>`;
}

function pdfDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export async function buildPdf(pages: PdfPage[], meta: { title: string; author?: string }): Promise<Uint8Array> {
  if (!pages.length) throw new Error("Nothing to export.");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === "string" ? enc.encode(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string | Uint8Array[], dict?: string) => {
    offsets[n] = length;
    if (typeof body === "string") push(`${n} 0 obj\n${body}\nendobj\n`);
    else {
      push(`${n} 0 obj\n${dict}\nstream\n`);
      for (const b of body) push(b);
      push(`\nendstream\nendobj\n`);
    }
  };

  push("%PDF-1.7\n%âãÏÓ\n");
  // object numbers: 1 catalog, 2 pages, 3 info, then 3 per page (page, image, content)
  const pageIds = pages.map((_, i) => 4 + i * 3);
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  obj(3, `<< /Title ${pdfString(meta.title)} /Producer ${pdfString("Aven")} /Creator ${pdfString("Aven")}${meta.author ? ` /Author ${pdfString(meta.author)}` : ""} /CreationDate (${pdfDate()}) >>`);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const [br, bg, bb] = p.background ?? [255, 255, 255];
    const rgb = new Uint8Array(p.pxWidth * p.pxHeight * 3);
    for (let s = 0, d = 0; s < p.pixels.length; s += 4, d += 3) {
      const a = p.pixels[s + 3] / 255;
      rgb[d] = Math.round(p.pixels[s] * a + br * (1 - a));
      rgb[d + 1] = Math.round(p.pixels[s + 1] * a + bg * (1 - a));
      rgb[d + 2] = Math.round(p.pixels[s + 2] * a + bb * (1 - a));
    }
    const img = await deflate(rgb);
    const pageId = pageIds[i];
    const w = p.widthPt.toFixed(2);
    const h = p.heightPt.toFixed(2);
    obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId + 1} 0 R >> >> /Contents ${pageId + 2} 0 R >>`);
    obj(pageId + 1, [img], `<< /Type /XObject /Subtype /Image /Width ${p.pxWidth} /Height ${p.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.length} >>`);
    const content = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    obj(pageId + 2, [content], `<< /Length ${content.length} >>`);
  }

  const total = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
