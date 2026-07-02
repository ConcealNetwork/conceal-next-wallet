import { smartPulse } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";

const { formatStatusPulse, parseStatusPulse, pulsePhase, untilEndMs } = smartPulse;

describe("status pulse wire format", () => {
  it("round-trips {status,alive,2026-07-02,2}", () => {
    const body = formatStatusPulse("alive", "2026-07-02", 2);
    expect(body).toBe("{status,alive,2026-07-02,2}");
    expect(parseStatusPulse(body)).toEqual({
      kind: "alive",
      until: "2026-07-02",
      graceDays: 2,
    });
  });

  it("parses all broadcast kinds", () => {
    for (const kind of ["alive", "sos", "sick", "dnd"] as const) {
      expect(parseStatusPulse(formatStatusPulse(kind, "2026-12-01", 1))?.kind).toBe(kind);
    }
  });

  it("pulsePhase: ok → grace → overdue", () => {
    const pulse = parseStatusPulse("{status,alive,2026-07-02,2}");
    const end = untilEndMs("2026-07-02");
    expect(pulse).not.toBeNull();
    expect(end).not.toBeNull();
    if (pulse === null || end === null) return;
    expect(pulsePhase(pulse, end - 1)).toBe("ok");
    expect(pulsePhase(pulse, end + 1)).toBe("grace");
    expect(pulsePhase(pulse, end + 2 * 86_400_000 + 1)).toBe("overdue");
  });
});
