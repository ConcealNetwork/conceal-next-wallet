import { render } from "@testing-library/react";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { DottedQrCode, LOZENGE_ANGLE_DEG, LOZENGE_SIDE } from "@/components/qr/dotted-qr";

const SAMPLE_URI =
  "conceal:ccx7V4LeUXy2eZ9waDXgsLS7Uc11e2CZNPbE92gSMV4y6C8DF7UV5RkoZ3macmRNGS2V6DWMNlV6oZfrrJVGGzdU2V4DDxgGK9?amount=12.5";

type Point = [number, number];

function parseLozenges(path: SVGPathElement | null): Point[][] {
  const d = path?.getAttribute("d") ?? "";
  return [
    ...d.matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z/g),
  ].map((match) => [
    [Number(match[1]), Number(match[2])],
    [Number(match[3]), Number(match[4])],
    [Number(match[5]), Number(match[6])],
    [Number(match[7]), Number(match[8])],
  ]);
}

function pointInQuad(px: number, py: number, corners: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i];
    const [xj, yj] = corners[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Rasterise the dotted QR SVG onto an RGBA buffer so jsQR can attempt a real
 *  decode. The underlying logo is simulated as a solid dark square (worst case
 *  for the white-lozenge canvas that must restore the light modules on top). */
function rasterize(svg: SVGSVGElement, scale: number, quiet: number) {
  const moduleCount = Number((svg.getAttribute("viewBox") ?? "").split(" ")[2]);
  const side = (moduleCount + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);

  const setPixel = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= side || y >= side) return;
    const i = (y * side + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value;
  };

  const fillRect = (x: number, y: number, w: number, h: number, value: number) => {
    for (let py = (y + quiet) * scale; py < (y + h + quiet) * scale; py++) {
      for (let px = (x + quiet) * scale; px < (x + w + quiet) * scale; px++) {
        setPixel(Math.round(px), Math.round(py), value);
      }
    }
  };

  const fillLozenges = (lozenges: Point[][], value: number) => {
    const rad = (LOZENGE_ANGLE_DEG * Math.PI) / 180;
    const halfExtent =
      (LOZENGE_SIDE / 2) * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad))) * scale;
    for (const corners of lozenges) {
      const cornersPx: Point[] = corners.map(([x, y]) => [
        (x + quiet) * scale,
        (y + quiet) * scale,
      ]);
      const cx = cornersPx.reduce((sum, [x]) => sum + x, 0) / cornersPx.length;
      const cy = cornersPx.reduce((sum, [, y]) => sum + y, 0) / cornersPx.length;
      for (let py = Math.floor(cy - halfExtent); py <= Math.ceil(cy + halfExtent); py++) {
        for (let px = Math.floor(cx - halfExtent); px <= Math.ceil(cx + halfExtent); px++) {
          if (pointInQuad(px, py, cornersPx)) setPixel(px, py, value);
        }
      }
    }
  };

  // Layer 1: the underlying logo as a solid black square, 85% of the side.
  const image = svg.querySelector("image");
  if (image) {
    const [x, y, w, h] = ["x", "y", "width", "height"].map((attr) =>
      Number(image.getAttribute(attr) ?? 0),
    );
    fillRect(x, y, w, h, 0);
  }

  // Layers 2 and 3: white-lozenge canvas, then dark lozenges.
  const [lightPath, darkPath] = svg.querySelectorAll("path");
  fillLozenges(parseLozenges(lightPath), 255);
  fillLozenges(parseLozenges(darkPath), 0);

  // Finder/alignment squares, in document order so white inner rects overwrite.
  for (const rect of svg.querySelectorAll("rect")) {
    const [x, y, w, h] = ["x", "y", "width", "height"].map((attr) =>
      Number(rect.getAttribute(attr) ?? 0),
    );
    if (w === moduleCount && h === moduleCount) continue; // background
    fillRect(x, y, w, h, rect.getAttribute("fill") === "#ffffff" ? 255 : 0);
  }

  return { data, side, moduleCount };
}

describe("DottedQrCode", () => {
  it("renders square corners, a white-lozenge canvas, and dark lozenges", () => {
    const { container } = render(
      <DottedQrCode value={SAMPLE_URI} logoSrc="/brand/conceal-mark-orange.svg" />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    const moduleCount = Number((svg.getAttribute("viewBox") ?? "").split(" ")[2]);

    // Module count must match a valid QR version: 17 + 4 * version.
    expect(moduleCount).toBeGreaterThanOrEqual(21);
    expect((moduleCount - 17) % 4).toBe(0);

    // The underlying logo spans 85% of the QR side, with no excavation.
    const image = svg.querySelector("image");
    expect(image?.getAttribute("href")).toBe("/brand/conceal-mark-orange.svg");
    expect(Number(image?.getAttribute("width"))).toBeCloseTo(moduleCount * 0.85);

    // White and dark lozenges are separate layers of the same size/angle.
    const [lightPath, darkPath] = svg.querySelectorAll("path");
    expect(parseLozenges(lightPath).length).toBeGreaterThan(0);
    expect(parseLozenges(darkPath).length).toBeGreaterThan(0);

    // 3 finder patterns x 2 dark rects each, plus alignment patterns.
    const darkRects = [...svg.querySelectorAll("rect")].filter(
      (rect) => rect.getAttribute("fill") === "#171513",
    );
    expect(darkRects.length).toBeGreaterThanOrEqual(6);
  });

  it("stays decodable with a solid-dark underlying logo at 85%", () => {
    const { container } = render(
      <DottedQrCode value={SAMPLE_URI} logoSrc="/brand/conceal-mark-orange.svg" />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    const { data, side } = rasterize(svg, 8, 4);

    const decoded = jsQR(data, side, side);
    expect(decoded?.data).toBe(SAMPLE_URI);
  });
});
