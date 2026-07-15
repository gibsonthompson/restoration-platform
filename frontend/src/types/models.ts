// Domain model types. Mirror the resto_* tables. Keep in sync with migrations.

export type Role = 'owner' | 'manager' | 'lead_tech' | 'tech';
export type TypeOfLoss = 'water' | 'fire' | 'mold' | 'other';

// How the loss began. This is the gradual-vs-sudden determination: policies cover
// sudden and accidental damage and exclude gradual deterioration, so this single
// field is the most common ground a water claim is denied on outright.
export type LossOnset = 'sudden' | 'gradual' | 'unknown';

export type PolicyType = 'homeowner' | 'commercial' | 'renter' | 'condo' | 'other';
export type DeductibleApplies = 'all_coverages' | 'coverage_specific';

// Xactimate Coverages & Loss. Xactimate auto-creates rows for Dwelling, Other
// Structures, Contents, and Loss of Use; others can be added.
export type CoverageType = 'dwelling' | 'other_structures' | 'contents' | 'loss_of_use' | 'other';
export interface Coverage {
  type: CoverageType;
  name: string;
  limit: number | null;
  deductible: number | null;
  apply_to: 'rc' | 'acv' | 'both' | null;   // replacement cost / actual cash value
}

// What a photo actually shows, so readiness can flag a billed line with no photo
// behind it. null = untagged (photos captured before this existed).
export type PhotoKind =
  | 'overview' | 'mid' | 'damage' | 'cause_of_loss' | 'water_line'
  | 'moisture_reading' | 'equipment' | 'contents' | 'demo' | 'completion' | 'other';

export interface Org { id: string; name: string; plan: string; status: string; }

export interface OrgMembership { org_id: string; user_id: string; role: Role; }

export interface Claim {
  id: string;
  org_id: string;
  policyholder_name: string | null;
  policyholder_email: string | null;
  policyholder_phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  carrier_identifier: string | null;      // Xactimate "Claim Number"
  contractor_identifier: string | null;
  assignment_identifier: string | null;   // Xactimate "Adj. File Number"
  date_of_loss: string | null;
  date_created: string | null;
  insurance_company: string | null;
  broker_agent: string | null;
  project_manager: string | null;
  adjuster: string | null;                // Xactimate "Claim Rep"
  policy_number: string | null;
  type_of_loss: TypeOfLoss | null;        // Xactimate TOL @code / @desc
  category_of_water: number | null;
  class_of_water: number | null;
  cat_code: string | null;
  status: string;
  created_at: string;

  // ---- Cause & Origin ----
  // Xactimate carries BOTH of these on the same element:
  //   <TOL desc="Water" code="WATER">
  //     <COL desc="Broken Pipe" otherCause="High Water Pressure"/>
  //   </TOL>
  // cause_of_loss is the NAMED cause, scoped to the type of loss the way Xactimate
  // scopes it. cause_other is the free text for what actually made it happen, and it
  // is the sentence that decides whether an adjuster reads the loss as sudden.
  cause_of_loss: string | null;      // COL @desc
  cause_other: string | null;        // COL @otherCause
  loss_onset: LossOnset | null;      // sudden vs gradual, the #1 denial argument
  date_discovered: string | null;    // when it was FOUND (vs date_of_loss = when it happened)
  cause_notes: string | null;

  // ---- Xactimate claim dates (required to complete an estimate) ----
  date_contacted: string | null;
  date_inspected: string | null;
  date_received: string | null;

  // ---- Policy & coverage ----
  policy_type: PolicyType | null;
  policy_effective_date: string | null;
  policy_expiration_date: string | null;
  deductible: number | null;
  deductible_applies: DeductibleApplies | null;
  coverages: Coverage[];             // jsonb, defaults to []
  estimator: string | null;          // Xactimate required field alongside the claim rep
}

export interface Structure {
  id: string; org_id: string; claim_id: string; name: string;
  cover_media_id: string | null; sort_order: number;
  // Fallback ceiling height for rooms with none of their own. There is deliberately NO
  // UI for this: ceiling height is a MEASUREMENT and it is captured in the sketch, which
  // writes Room.height_ft. Read-only from the app's point of view.
  default_ceiling_height_ft: number | null;
}

export interface Room {
  id: string; org_id: string; structure_id: string; name: string;
  cover_media_id: string | null; sort_order: number;
  length_ft: number | null; width_ft: number | null;
  // CEILING height. Written by the sketch editor and nowhere else. Wall area is
  // (perimeter x this) minus every opening, so it is on every drywall, paint and
  // insulation line in the room.
  height_ft: number | null;
  flooring_type: string | null;
  // true = part of the loss (photos, moisture map, scope, line items expected).
  // false = structural context only (a hallway on the floor plan: it carries doors
  // and shows the flow, but is not scoped, scored, or counted for photo coverage).
  affected: boolean;

  // ---- Per-surface scope ----
  // Which SURFACES of an affected room are part of the loss. Default true (in scope).
  // Turning one off (say an unaffected tile floor under wet walls) keeps the surface
  // MEASURED and SHOWN on the documents, marked "not in scope," but drops it from the
  // measurement totals and from the Xactimate line items. The room geometry is never
  // changed by these; scope is what is billed, not what the room is. Backed by
  // resto_rooms.include_floor / include_walls / include_ceiling / include_baseboard.
  include_floor: boolean;
  include_walls: boolean;
  include_ceiling: boolean;
  include_baseboard: boolean;
}

export interface Note {
  id: string; org_id: string; claim_id: string | null; room_id: string | null;
  author_id: string | null; body: string; created_at: string;
}

// What happened to the item itself.
export type Disposition = 'restorable' | 'non_restorable' | 'disposed';

export interface ContentsItem {
  id: string;
  org_id: string;
  room_id: string;
  media_id: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  quantity: number | null;
  condition: string | null;
  disposition: Disposition | null;
  category: string | null;          // legacy free-text label, kept for old rows
  age_years: number | null;
  year_purchased: number | null;
  purchase_location: string | null;
  loss_reason: string | null;
  packed_out: boolean | null;
  box_label: string | null;
  claim_id: string | null;
  room_label: string | null;
  created_at: string;

  // ---- Xactimate ----
  // The item TYPE is the Xactimate category: "clean hard furniture" is a category
  // because a sofa and a dresser price differently. CAT + SEL resolve to exactly one
  // row of the Verisk price list.
  item_type: string | null;         // keyed to CONTENTS_ITEM_TYPES in lib/xactimateCodes
  xact_cat: string | null;          // CHF CONT, CPS CONT, CON, USR ...
  xact_sel: string | null;          // selector; unverified until we have a real price list
  moved: boolean | null;            // moved within the property  -> CON
  cleaned: boolean | null;          // cleaned on site            -> the type's clean category

  // ---- RETIRED ----
  // We do not price contents. Xactimate prices every line from the carrier price list,
  // and personal property is valued in XactContents. Nothing writes these, nothing reads
  // them, nothing prints them. They exist only so old rows still parse.
  /** @deprecated Xactimate values contents, not us. */
  replacement_cost?: number | null;
  /** @deprecated Xactimate values contents, not us. */
  acv?: number | null;
}