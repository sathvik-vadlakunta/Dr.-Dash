import { formatPeriod } from "@/lib/series/format";
import type { PlottedResult } from "@/types";

/**
 * Section 14.4. Export always reads the untruncated dataset: the chart may draw
 * a reduced set of points for rendering, but a download that quietly dropped
 * observations would be a different dataset wearing the same name.
 */

export interface ExportOptions {
  title?: string | null;
  /** ISO date the file is named after. */
  today: string;
}

export function chartFilename(today: string, extension: "csv" | "png"): string {
  return `dr-dash-${today}.${extension}`;
}

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(series: PlottedResult[], options: ExportOptions): string {
  if (series.length === 0) return "date\n";

  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const byslug = new Map(
    series.map((s) => [s.slug, new Map(s.points.map((p) => [p.date, p.value]))]),
  );

  const lines: string[] = [];
  lines.push(["date", ...series.map((s) => s.label)].map(cell).join(","));
  // A comment line carrying units per column, so a spreadsheet still says what
  // the numbers are.
  lines.push(["# units", ...series.map((s) => s.units)].map(cell).join(","));

  for (const date of dates) {
    const values = series.map((s) => {
      const value = byslug.get(s.slug)?.get(date);
      // A missing observation is an empty cell. Writing 0 would be a lie.
      return value === null || value === undefined ? "" : String(value / (s.displayScale || 1));
    });
    lines.push([date, ...values].join(","));
  }

  if (options.title) lines.push(`# ${options.title}`);

  return `${lines.join("\n")}\n`;
}

export function downloadCsv(series: PlottedResult[], options: ExportOptions): void {
  const blob = new Blob([toCsv(series, options)], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, chartFilename(options.today, "csv"));
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface PngOptions extends ExportOptions {
  /** Section 20.5: the transform chain is burned into the image. */
  formulaChain: string[];
  sources: string[];
  scale?: number;
}

/**
 * Section 14.4. Serialize the chart's SVG, draw it at 2x on a solid surface,
 * then burn the title, the transform chain, and the source line into the
 * bottom left so the image still says what it is once it leaves the app.
 */
export async function downloadPng(svg: SVGSVGElement, options: PngOptions): Promise<void> {
  const scale = options.scale ?? 2;
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const footerHeight = 72;
  const height = Math.max(1, Math.round(rect.height)) + footerHeight;

  const styles = getComputedStyle(document.documentElement);
  const surface = styles.getPropertyValue("--surface").trim() || "#FFFFFF";
  const ink = styles.getPropertyValue("--ink").trim() || "#0B1B2B";
  const inkMuted = styles.getPropertyValue("--ink-muted").trim() || "#56697B";

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(rect.height));
  inlineComputedColors(svg, clone);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot export a PNG.");

    ctx.scale(scale, scale);
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, rect.height);

    let y = rect.height + 20;
    if (options.title) {
      ctx.fillStyle = ink;
      ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(options.title, 16, y);
      y += 18;
    }
    ctx.fillStyle = inkMuted;
    ctx.font = "12px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText(options.formulaChain.join("  ›  "), 16, y);
    y += 16;
    ctx.fillText(`Source: ${options.sources.join(", ")} · Dr. Dash`, 16, y);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (png) triggerDownload(png, chartFilename(options.today, "png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** A cloned SVG loses the page's CSS, so resolved colours are copied onto it. */
function inlineComputedColors(source: SVGSVGElement, clone: SVGSVGElement): void {
  const sourceNodes = source.querySelectorAll("*");
  const cloneNodes = clone.querySelectorAll("*");

  sourceNodes.forEach((node, index) => {
    const target = cloneNodes[index];
    if (!(target instanceof SVGElement)) return;
    const computed = getComputedStyle(node);
    for (const property of ["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "font-size", "font-family"]) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The chart image could not be rendered."));
    image.src = url;
  });
}

/** Section 21.1.3. The chart's accessible equivalent, as real table data. */
export function toTableRows(series: PlottedResult[]): {
  head: string[];
  rows: string[][];
  caption: string;
} {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const byslug = new Map(
    series.map((s) => [s.slug, new Map(s.points.map((p) => [p.date, p.value]))]),
  );
  const frequency = series[0]?.frequency ?? "MONTHLY";

  return {
    caption: series.map((s) => `${s.label} (${s.unitsShort})`).join("; "),
    head: ["Period", ...series.map((s) => `${s.label} (${s.unitsShort})`)],
    rows: dates.map((date) => [
      formatPeriod(date, frequency),
      ...series.map((s) => {
        const value = byslug.get(s.slug)?.get(date);
        return value === null || value === undefined
          ? "n/a"
          : String(Math.round((value / (s.displayScale || 1)) * 1000) / 1000);
      }),
    ]),
  };
}
