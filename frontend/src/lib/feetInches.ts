// ============================================================================
// FEET AND INCHES
// ----------------------------------------------------------------------------
// A tech measures 12 feet 7 inches. Math needs 12.58333. A carrier report needs
// 12' 7" again. This module is the only place that translation happens.
//
// THE RULE: store DECIMAL FEET. Never store the string. A stored "12'7\"" is a bug
// waiting to happen, because the next thing that reads it will have to re-parse it,
// and one of those parsers will eventually disagree with this one.
//
// A rejected value is better than a wrong one. Garbage returns null so the field can
// show an error, rather than silently becoming zero. A zero dimension is a zero
// dollar amount on an insurance estimate.
// ============================================================================

const IN_PER_FT = 12;

// A bare inch component: "7", "7.5", "7 1/2", "1/2".
function parseInchPart(raw: string): number | null {
  const s = raw.trim();
  if (!s) return 0;
  // "7 1/2"
  let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const den = Number(m[3]); if (!den) return null;
    return Number(m[1]) + Number(m[2]) / den;
  }
  // "1/2"
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const den = Number(m[2]); if (!den) return null;
    return Number(m[1]) / den;
  }
  // "7" or "7.5"
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Parse a human measurement into DECIMAL FEET.
 * Accepts, in the forms a tech actually types on a phone:
 *   12' 7"   12'7"   12'7   12'     (feet marker)
 *   7"   151"   7 1/2"              (inches only)
 *   12-7   12 7                     (architectural dash, or a plain space)
 *   12ft 7in   12 feet 7 inches
 *   12.583                          (a bare decimal is FEET)
 *   12' 7 1/2"                      (fractional inches)
 * Returns null for anything it cannot read. Negative values are rejected: a wall
 * cannot be minus three feet long, and accepting one would corrupt an estimate.
 */
export function parseFeetInches(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return isFinite(input) && input >= 0 ? input : null;

  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('-')) return null;                       // no negative dimensions

  // normalize the many quote characters a phone keyboard can produce
  s = s.replace(/[\u2032\u2018\u2019\u00b4`]/g, "'")        // prime, smart quotes -> '
       .replace(/[\u2033\u201c\u201d]/g, '"');              // double prime, smart quotes -> "
  // words -> markers. Anchored to a preceding digit so "12ft" works as well as
  // "12 ft": \bft\b never matches in "12ft", because 2 and f are both word chars.
  s = s.replace(/(\d)\s*(?:feet|foot|ft)(?![a-z])/g, "$1'")
       .replace(/(\d)\s*(?:inches|inch|ins|in)(?![a-z])/g, '$1"');
  s = s.replace(/\s+/g, ' ').trim();
  if (!/\d/.test(s)) return null;

  // 1) explicit feet marker, with optional inches: 12' 7 1/2"  /  12'7"  /  12'
  let m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (m) {
    const feet = Number(m[1]);
    let rest = m[2].trim().replace(/"$/, '').trim();
    if (!rest) return feet;
    const inches = parseInchPart(rest);
    if (inches == null) return null;
    if (inches >= IN_PER_FT) return null;                   // 12' 15" is a typo, not 13'3"
    return feet + inches / IN_PER_FT;
  }

  // 2) inches only: 151"  /  7 1/2"
  m = s.match(/^(.+)"$/);
  if (m) {
    const inches = parseInchPart(m[1]);
    if (inches == null) return null;
    return inches / IN_PER_FT;
  }

  // 3) architectural dash: 12-7  /  12-7 1/2
  m = s.match(/^(\d+)\s*-\s*(.+)$/);
  if (m) {
    const inches = parseInchPart(m[2]);
    if (inches == null || inches >= IN_PER_FT) return null;
    return Number(m[1]) + inches / IN_PER_FT;
  }

  // 4) space separated: 12 7  /  12 7 1/2   (the construction convention: feet then inches)
  m = s.match(/^(\d+)\s+(.+)$/);
  if (m) {
    const inches = parseInchPart(m[2]);
    if (inches == null || inches >= IN_PER_FT) return null;
    return Number(m[1]) + inches / IN_PER_FT;
  }

  // 5) a bare number is FEET (so "12.583" and "12" both work)
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);

  return null;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Decimal feet -> the string a human reads: 12.58333 -> `12' 7"`.
 * `denom` is the inch fraction to round to (8 = nearest eighth, 1 = whole inches).
 * Display rounds; the stored value keeps full precision.
 */
export function formatFeetInches(ft: number | null | undefined, denom = 8): string {
  if (ft == null || !isFinite(ft)) return '';
  if (ft < 0) return '';
  const totalIn = Math.round(ft * IN_PER_FT * denom) / denom;
  let feet = Math.floor(totalIn / IN_PER_FT + 1e-9);
  let inches = totalIn - feet * IN_PER_FT;
  // rounding can push inches to exactly 12
  if (inches >= IN_PER_FT - 1e-9) { feet += 1; inches = 0; }

  const whole = Math.floor(inches + 1e-9);
  const fracVal = inches - whole;
  let frac = '';
  if (fracVal > 1e-9) {
    let num = Math.round(fracVal * denom), den = denom;
    const g = gcd(num, den) || 1;
    num /= g; den /= g;
    if (num > 0) frac = `${whole ? ' ' : ''}${num}/${den}`;
  }
  const inchStr = (whole > 0 || frac) ? `${whole > 0 || !frac ? whole : ''}${frac}"` : '';

  if (feet && inchStr) return `${feet}' ${inchStr}`;
  if (feet) return `${feet}'`;
  if (inchStr) return inchStr;
  return `0'`;
}

/** Short form for tight UI: 12.583 -> 12'7" (no space). */
export function formatFeetInchesShort(ft: number | null | undefined, denom = 8): string {
  return formatFeetInches(ft, denom).replace(/'\s+/, "'");
}

/** Round a decimal-feet value to the nearest inch fraction (8 = eighth of an inch). */
export function roundToFraction(ft: number, denom = 8): number {
  if (!isFinite(ft)) return ft;
  return Math.round(ft * IN_PER_FT * denom) / (IN_PER_FT * denom);
}

/** True when a string parses. For live input validation. */
export const isValidMeasure = (s: string) => parseFeetInches(s) != null;