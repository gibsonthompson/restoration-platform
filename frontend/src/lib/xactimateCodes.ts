// ============================================================================
// XACTIMATE CODE TABLES
// ----------------------------------------------------------------------------
// SOURCE: Verisk's own published list, "Category codes in Xactimate online".
// https://xactware.helpdocs.io/l/enUS/article/gb9lf49tdw-category-codes-in-xactimate-online
//
// These are CATEGORY codes. A line item is a CATEGORY plus a SELECTOR (CAT + SEL),
// and together they resolve to one row of the Verisk price list. We send the CAT,
// the SEL, the quantity and the unit. WE NEVER SEND A PRICE. Xactimate prices every
// line from the carrier's price list for the region and the date of loss, so any
// number we invent is a number that gets overwritten, argued about, or both.
//
// Do not add codes to this file from memory. If a code is not on the Verisk page it
// does not exist, and a made-up selector is how you get an estimate rejected.
// ============================================================================

export interface XactCategory { code: string; label: string }

// The full published list, verbatim.
export const XACT_CATEGORIES: XactCategory[] = [
  { code: 'ACC', label: 'Accessories, mobile home' },
  { code: 'ACT', label: 'Acoustical treatments' },
  { code: 'APP', label: 'Appliances' },
  { code: 'ARC', label: 'Art restoration, conservation' },
  { code: 'AWN', label: 'Awnings and patio covers' },
  { code: 'CAB', label: 'Cabinetry' },
  { code: 'CAP CONT', label: 'Clean appliances' },
  { code: 'CEL CONT', label: 'Clean electric items' },
  { code: 'CGN CONT', label: 'Clean, general items' },
  { code: 'CHF CONT', label: 'Clean, hard furniture' },
  { code: 'CLM CONT', label: 'Clean, lamps or vases' },
  { code: 'CLN', label: 'Cleaning' },
  { code: 'CNC', label: 'Concrete and asphalt' },
  { code: 'CON', label: 'Content manipulation' },
  { code: 'CPS CONT', label: 'Packing, handling, storage' },
  { code: 'CSF', label: 'Cleaning' },
  { code: 'CUP CONT', label: 'Clean, upholstery and soft goods' },
  { code: 'CWH CONT', label: 'Cleaning, wall hangings' },
  { code: 'DMO', label: 'General demolition' },
  { code: 'DOR', label: 'Doors' },
  { code: 'DRY', label: 'Drywall' },
  { code: 'ELE', label: 'Electrical' },
  { code: 'ELS', label: 'Electrical, special systems' },
  { code: 'EQA', label: 'Misc. equipment, agricultural' },
  { code: 'EQC', label: 'Misc. equipment, commercial' },
  { code: 'EQU', label: 'Heavy equipment' },
  { code: 'EXC', label: 'Excavation' },
  { code: 'FCC', label: 'Floor covering, carpet' },
  { code: 'FCR', label: 'Floor covering, resilient' },
  { code: 'FCS', label: 'Floor covering, stone' },
  { code: 'FCT', label: 'Floor covering, ceramic tile' },
  { code: 'FCV', label: 'Floor covering, vinyl' },
  { code: 'FCW', label: 'Floor covering, wood' },
  { code: 'FEE', label: 'Permits and fees' },
  { code: 'FEN', label: 'Fencing' },
  { code: 'FNC', label: 'Finish carpentry and trim work' },
  { code: 'FNH', label: 'Finish hardware' },
  { code: 'FPL', label: 'Fireplaces' },
  { code: 'FPS', label: 'Fire protection systems' },
  { code: 'FRM', label: 'Framing and rough carpentry' },
  { code: 'FRP', label: 'Fire proofing' },
  { code: 'GLS', label: 'Glass, glazing and store fronts' },
  { code: 'HMR', label: 'Hazardous material remediation' },
  { code: 'HVC', label: 'Heat, vent and air conditioning' },
  { code: 'INM', label: 'Insulation, mechanical' },
  { code: 'INS', label: 'Insulation' },
  { code: 'LAB', label: 'Labor only' },
  { code: 'LIT', label: 'Light fixtures' },
  { code: 'LND', label: 'Landscaping' },
  { code: 'MAS', label: 'Masonry' },
  { code: 'MBL', label: 'Marble, cultured or natural' },
  { code: 'MPR', label: 'Moisture protection' },
  { code: 'MSD', label: 'Mirrors and shower doors' },
  { code: 'MSK', label: 'Mobile homes, skirting and setup' },
  { code: 'MTL', label: 'Metal structures and components' },
  { code: 'OBS', label: 'Obsolete items' },
  { code: 'ORI', label: 'Ornamental iron' },
  { code: 'PLA', label: 'Interior lath and plaster' },
  { code: 'PLM', label: 'Plumbing' },
  { code: 'PNL', label: 'Paneling and wood wall finishes' },
  { code: 'PNT', label: 'Painting' },
  { code: 'POL', label: 'Swimming pools and spas' },
  { code: 'PRM', label: 'Property repair and maintenance' },
  { code: 'PTG', label: 'Painting, low or no VOC' },
  { code: 'RFG', label: 'Roofing' },
  { code: 'SCF', label: 'Scaffolding' },
  { code: 'SDG', label: 'Siding' },
  { code: 'SFG', label: 'Soffit, fascia and gutter' },
  { code: 'SPE', label: 'Specialty items' },
  { code: 'SPR', label: 'Sprinklers' },
  { code: 'STJ', label: 'Steel joist components' },
  { code: 'STL', label: 'Steel components' },
  { code: 'STR', label: 'Stairs' },
  { code: 'STU', label: 'Stucco and exterior plaster' },
  { code: 'TBA', label: 'Toilet and bath accessories' },
  { code: 'TCR', label: 'Trauma and crime scene remediation' },
  { code: 'TIL', label: 'Tile' },
  { code: 'TMB', label: 'Timber framing' },
  { code: 'TMP', label: 'Temporary repairs' },
  { code: 'USR', label: 'User defined items' },
  { code: 'VTC', label: 'Valuation tool cost' },
  { code: 'WDA', label: 'Windows, aluminum' },
  { code: 'WDP', label: 'Windows, sliding patio doors' },
  { code: 'WDR', label: 'Windows, reglazing and repair' },
  { code: 'WDS', label: 'Windows, skylights' },
  { code: 'WDT', label: 'Window treatment' },
  { code: 'WDV', label: 'Windows, vinyl' },
  { code: 'WDW', label: 'Windows, wood' },
  { code: 'WPR', label: 'Wallpaper' },
  { code: 'WTR', label: 'Water extraction and remediation' },
  { code: 'XST', label: 'Exterior structures' }
];

export const CATEGORY_LABEL: Record<string, string> =
  Object.fromEntries(XACT_CATEGORIES.map(c => [c.code, c.label]));

// ----------------------------------------------------------------------------
// CONTENTS
// ----------------------------------------------------------------------------
// There is NO generic "contents" category in Xactimate. What exists is a set of
// categories for the WORK you do to someone's belongings: moving them, packing them,
// storing them, cleaning them. The belongings themselves are inventoried in
// XactContents, a separate product, where each item carries its own CAT/SEL and is
// priced by Verisk.
//
// So a contents item in this app records WHAT IT IS and WHAT WE DID TO IT, and the
// dollar value is Xactimate's problem, not ours. We do not invent prices, and we do
// not invent an RCV or an ACV: a number we make up is a number an adjuster gets to
// argue with, and we hand them the argument for free.
// ----------------------------------------------------------------------------
export const CONTENTS_CATEGORIES: XactCategory[] = [
  { code: 'CON', label: 'Content manipulation' },
  { code: 'CPS CONT', label: 'Packing, handling, storage' },
  { code: 'CAP CONT', label: 'Clean appliances' },
  { code: 'CEL CONT', label: 'Clean electric items' },
  { code: 'CGN CONT', label: 'Clean, general items' },
  { code: 'CHF CONT', label: 'Clean, hard furniture' },
  { code: 'CLM CONT', label: 'Clean, lamps or vases' },
  { code: 'CUP CONT', label: 'Clean, upholstery and soft goods' },
  { code: 'CWH CONT', label: 'Cleaning, wall hangings' }
];

// ----------------------------------------------------------------------------
// CONTENTS ITEM TYPES
// ----------------------------------------------------------------------------
// Verisk's contents categories are not a taxonomy of WORK, they are a taxonomy of
// ITEM TYPE. "Clean hard furniture" is a category because a sofa and a dresser price
// differently. So the item type a tech picks IS the Xactimate category, and choosing
// "Hard furniture" hands you CHF CONT with no second question asked.
//
// This replaces the old free-text list (Furniture, Electronics, Textile / soft...),
// which was our own invention and mapped to nothing.
// ----------------------------------------------------------------------------
export interface ContentsItemType { value: string; label: string; cat: string; hint?: string }

export const CONTENTS_ITEM_TYPES: ContentsItemType[] = [
  { value: 'hard_furniture', label: 'Hard furniture', cat: 'CHF CONT', hint: 'Tables, dressers, bed frames, case goods.' },
  { value: 'upholstery', label: 'Upholstery and soft goods', cat: 'CUP CONT', hint: 'Sofas, mattresses, rugs, textiles, clothing.' },
  { value: 'appliance', label: 'Appliances', cat: 'CAP CONT', hint: 'Fridge, washer, dishwasher, range.' },
  { value: 'electronics', label: 'Electric items', cat: 'CEL CONT', hint: 'TVs, computers, audio, small electrics.' },
  { value: 'lamps_vases', label: 'Lamps or vases', cat: 'CLM CONT', hint: 'Lamps, shades, ceramics, glassware.' },
  { value: 'wall_hangings', label: 'Wall hangings', cat: 'CWH CONT', hint: 'Art, mirrors, framed pieces.' },
  { value: 'general', label: 'General items', cat: 'CGN CONT', hint: 'Anything that does not fit a category above.' },
  { value: 'user_defined', label: 'Other (user defined)', cat: 'USR', hint: 'Xactimate prices this from a user-defined item.' }
];

export const ITEM_TYPE_BY_VALUE: Record<string, ContentsItemType> =
  Object.fromEntries(CONTENTS_ITEM_TYPES.map(t => [t.value, t]));

// What the crew physically did with the item. This is OUR field, not Xactimate's, but
// it is what decides which contents category the work maps to.
export type ContentsDisposition = 'in_place' | 'moved' | 'packed_out' | 'cleaned' | 'non_restorable';

export const DISPOSITION_LABEL: Record<ContentsDisposition, string> = {
  in_place: 'Left in place',
  moved: 'Moved within the property',
  packed_out: 'Packed out and stored',
  cleaned: 'Cleaned on site',
  non_restorable: 'Non-salvageable'
};

// Suggest the billable category from what was actually done. HANDLING BEATS TYPE: if an
// item was packed out, the billable line is the pack-out, not the cleaning of it.
//
// This is a SUGGESTION and the tech can override it. We never silently pick a billable
// code on someone's behalf: a code we choose for them is a code they get asked to defend.
export function suggestContentsCat(opts: {
  itemType?: string | null;
  packedOut?: boolean | null;
  moved?: boolean | null;
  cleaned?: boolean | null;
}): { cat: string; why: string } | null {
  if (opts.packedOut) return { cat: 'CPS CONT', why: 'Packed out and stored.' };
  if (opts.moved) return { cat: 'CON', why: 'Moved within the property.' };
  if (opts.cleaned && opts.itemType) {
    const t = ITEM_TYPE_BY_VALUE[opts.itemType];
    if (t) return { cat: t.cat, why: 'Cleaned on site, priced by item type.' };
  }
  return null;
}