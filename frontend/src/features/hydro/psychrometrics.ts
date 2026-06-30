// Pure S500 psychrometric + equipment-sizing math. No deps, fully testable.
// Magnus approximation; sea-level pressure (1013.25 hPa).
// Sanity: 70F/50%RH -> ~54 GPP, ~50.4F dew point (verified).

const P_ATM = 1013.25; // hPa
const fToC = (f: number) => (f - 32) * 5 / 9;
const cToF = (c: number) => c * 9 / 5 + 32;

// Saturation vapor pressure over water (hPa), temp in C.
function satVP(tc: number): number {
  return 6.112 * Math.exp((17.62 * tc) / (243.12 + tc));
}

export function dewPointF(tempF: number, rhPct: number): number {
  const tc = fToC(tempF);
  const e = satVP(tc) * (rhPct / 100);
  const ln = Math.log(e / 6.112);
  const tdC = (243.12 * ln) / (17.62 - ln);
  return Math.round(cToF(tdC) * 10) / 10;
}

// Grains per pound: mass of water (grains) per pound of dry air.
export function grainsPerPound(tempF: number, rhPct: number): number {
  const tc = fToC(tempF);
  const e = satVP(tc) * (rhPct / 100);
  const w = 0.62198 * (e / (P_ATM - e)); // humidity ratio lb/lb
  return Math.round(w * 7000);
}

// S500 air-mover estimate: ~1 per 14 linear ft of wall, min 1.
export function airMoversNeeded(lengthFt: number, widthFt: number): number {
  if (!lengthFt || !widthFt) return 0;
  const perimeter = 2 * (lengthFt + widthFt);
  return Math.max(1, Math.ceil(perimeter / 14));
}

// Dehumidifier estimate via cubic-feet-per-pint method (refrigerant defaults).
// classFactor = cu ft per pint/day; unitPPD = the dehu's AHAM rating.
const CLASS_FACTOR: Record<number, number> = { 1: 100, 2: 50, 3: 40, 4: 40 };
export function dehumidifiersNeeded(
  lengthFt: number, widthFt: number, heightFt: number, classNum: number, unitPPD = 70
): { ppdNeeded: number; units: number } {
  if (!lengthFt || !widthFt || !heightFt) return { ppdNeeded: 0, units: 0 };
  const cubic = lengthFt * widthFt * heightFt;
  const factor = CLASS_FACTOR[classNum] ?? 50;
  const ppdNeeded = Math.round(cubic / factor);
  const units = Math.max(1, Math.ceil(ppdNeeded / unitPPD));
  return { ppdNeeded, units };
}