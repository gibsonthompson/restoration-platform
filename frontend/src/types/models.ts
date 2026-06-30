// Domain model types. Mirror the resto_* tables. Keep in sync with migrations.

export type Role = 'owner' | 'manager' | 'lead_tech' | 'tech';
export type TypeOfLoss = 'water' | 'fire' | 'mold' | 'other';

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
  carrier_identifier: string | null;
  contractor_identifier: string | null;
  assignment_identifier: string | null;
  date_of_loss: string | null;
  date_created: string | null;
  insurance_company: string | null;
  broker_agent: string | null;
  project_manager: string | null;
  adjuster: string | null;
  policy_number: string | null;
  type_of_loss: TypeOfLoss | null;
  category_of_water: number | null;
  class_of_water: number | null;
  cat_code: string | null;
  status: string;
  created_at: string;
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
  created_at: string;
}