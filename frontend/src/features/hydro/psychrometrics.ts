// Pure S500 psychrometric helpers. No deps, fully testable. TODO: implement.
// GPP = W * 7000 where W = 0.622 * (Pv / (Pa - Pv))
// dewPoint(tempF, rh) and vaporPressure(tempF, rh) from standard psychrometric formulas.
export function grainsPerPound(_tempF: number, _rhPct: number): number {
  throw new Error('TODO: implement GPP');
}
export function dewPointF(_tempF: number, _rhPct: number): number {
  throw new Error('TODO: implement dew point');
}
