"use client";

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** Dot diameter as a fraction of a module: π/4 × 0.62² ≈ 30% of the square's
 *  ink surface, per design. Level-H error correction absorbs the loss. */
const DOT_DIAMETER = 0.62;
/** Underlying logo side as a fraction of the QR side. */
const LOGO_RATIO = 0.85;
const FINDER = 7;

/** Alignment-pattern centre coordinates per QR version 2–40 (ISO/IEC 18004). */
const ALIGNMENT_POSITIONS: readonly (readonly number[])[] = [
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

type Box = { x: number; y: number; w: number; h: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function circlePath(cx: number, cy: number, r: number): string {
  const d = r * 2;
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${d} 0a${r} ${r} 0 1 0 ${-d} 0`;
}

/**
 * A "dotted" QR code layered bottom-to-top, GIMP style:
 *   1. the underlying logo, centred at 85% of the QR side (no excavation);
 *   2. a white-dot canvas — one white dot per light module — restoring the
 *      light cells on top of the artwork;
 *   3. black dots for the dark modules (same size as the white ones), with the
 *      three finder corners and the alignment patterns kept as solid squares.
 * All coordinates are in module units (viewBox 0..moduleCount), so the SVG
 * scales losslessly.
 */
export function DottedQrCode({
  value,
  size = 180,
  logoSrc,
  fgColor = "#171513",
  bgColor = "#ffffff",
}: {
  value: string;
  size?: number;
  logoSrc?: string;
  fgColor?: string;
  bgColor?: string;
}) {
  const layout = useMemo(() => {
    if (!value) return null;
    const qr = qrcode(0, "H");
    qr.addData(value, "Byte");
    qr.make();
    const n = qr.getModuleCount();
    const version = (n - 17) / 4;

    const finders: Box[] = [
      { x: 0, y: 0, w: FINDER, h: FINDER },
      { x: n - FINDER, y: 0, w: FINDER, h: FINDER },
      { x: 0, y: n - FINDER, w: FINDER, h: FINDER },
    ];

    const logoSide = n * LOGO_RATIO;
    const logoBox: Box = {
      x: (n - logoSide) / 2,
      y: (n - logoSide) / 2,
      w: logoSide,
      h: logoSide,
    };

    const positions = ALIGNMENT_POSITIONS[version - 2] ?? [];
    const alignments = positions
      .flatMap((cy) => positions.map((cx) => ({ cx, cy })))
      .filter(({ cx, cy }) => {
        const box: Box = { x: cx - 2, y: cy - 2, w: 5, h: 5 };
        return !finders.some((finder) => overlaps(box, finder));
      });

    const reserved: Box[] = [
      ...finders,
      ...alignments.map(({ cx, cy }) => ({ x: cx - 2, y: cy - 2, w: 5, h: 5 })),
    ];

    const radius = DOT_DIAMETER / 2;
    let darkDotsPath = "";
    let lightDotsPath = "";
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const cell: Box = { x: col, y: row, w: 1, h: 1 };
        if (reserved.some((box) => overlaps(cell, box))) continue;
        const dot = circlePath(col + 0.5, row + 0.5, radius);
        if (qr.isDark(row, col)) darkDotsPath += dot;
        else lightDotsPath += dot;
      }
    }

    return { n, finders, alignments, logoBox, darkDotsPath, lightDotsPath };
  }, [value]);

  if (!layout) {
    return <svg width={size} height={size} role="img" aria-label="QR code" />;
  }

  const { n, finders, alignments, logoBox, darkDotsPath, lightDotsPath } = layout;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="QR code">
      <rect width={n} height={n} fill={bgColor} />
      {logoSrc && (
        <image
          href={logoSrc}
          x={logoBox.x}
          y={logoBox.y}
          width={logoBox.w}
          height={logoBox.h}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <path d={lightDotsPath} fill={bgColor} />
      <path d={darkDotsPath} fill={fgColor} />
      {finders.map((finder) => (
        <g key={`${finder.x}-${finder.y}`}>
          <rect x={finder.x} y={finder.y} width={7} height={7} fill={fgColor} />
          <rect x={finder.x + 1} y={finder.y + 1} width={5} height={5} fill={bgColor} />
          <rect x={finder.x + 2} y={finder.y + 2} width={3} height={3} fill={fgColor} />
        </g>
      ))}
      {alignments.map(({ cx, cy }) => (
        <g key={`${cx}-${cy}`}>
          <rect x={cx - 2} y={cy - 2} width={5} height={5} fill={fgColor} />
          <rect x={cx - 1} y={cy - 1} width={3} height={3} fill={bgColor} />
          <rect x={cx} y={cy} width={1} height={1} fill={fgColor} />
        </g>
      ))}
    </svg>
  );
}
