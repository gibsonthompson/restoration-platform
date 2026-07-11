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
  type_of_loss: TypeOfLoss | null;
  category_of_water: number | null;
  class_of_water: number | null;
  cat_code: string | null;
  status: string;
  created_at: string;

  // ---- Cause & Origin ----
  cause_of_loss: string | null;      // narrower than type_of_loss (Xactimate Cause of Loss)
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
}

export interface Room {
  id: string; org_id: string; structure_id: string; name: string;
  cover_media_id: string | null; sort_order: number;
  length_ft: number | null; width_ft: number | null; height_ft: number | null;
  flooring_type: string | null;
}

export interface Note {
  id: string; org_id: string; claim_id: string | null; room_id: string | null;
  author_id: string | null; body: string; created_at: string;
}

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
  replacement_cost: number | null;
  acv: number | null;
  category: string | null;
  age_years: number | null;
  year_purchased: number | null;
  purchase_location: string | null;
  loss_reason: string | null;
  packed_out: boolean | null;
  box_label: string | null;
  claim_id: string | null;
  room_label: string | null;
  created_at: string;
}