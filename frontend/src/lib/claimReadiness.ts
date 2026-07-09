// ============================================================================
// Claim Readiness engine — the pre-submission "scrub-proof" audit.
// Pure, deterministic rules over data we already capture. No AI, no network.
// Predicts what an adjuster will challenge before the package is sent.
// Relevance-aware: drying checks only apply when the claim has drying chambers.
// ============================================================================

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  to?: string; // route to go fix it
}

export interface ReadinessResult {
  score: number; // 0-100
  level: 'ready' | 'gaps' | 'not_ready';
  checks: ReadinessCheck[];
  passCount: number;
  total: number;
}

export interface ReadinessInput {
  claimId: string;
  claim: any;
  rooms: any[];
  photos: any[];      // resto_media, type photo
  sketches: any[];    // resto_sketches (moisture maps)
  chambers: any[];    // resto_drying_chambers
  readings: any[];    // resto_readings (all chambers)
  equipment: any[];   // resto_equipment (all chambers)
  signatures: any[];  // resto_claim_signatures
}

const dayKey = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { claim, rooms, photos, sketches, chambers, readings, equipment, signatures } = input;
  const checks: ReadinessCheck[] = [];
  const hasChambers = chambers.length > 0;

  // 1) Loss details complete (adjusters reject on missing cat/class/DOL)
  {
    const missing = [
      !claim.type_of_loss && 'type of loss',
      claim.category_of_water == null && 'water category',
      claim.class_of_water == null && 'drying class',
      !claim.date_of_loss && 'date of loss'
    ].filter(Boolean);
    checks.push({
      id: 'loss', label: 'Loss details complete',
      status: missing.length === 0 ? 'pass' : missing.length <= 1 ? 'warn' : 'fail',
      detail: missing.length ? `Missing: ${missing.join(', ')}.` : 'Type, category, class, and date of loss are set.',
      to: `/claims/${input.claimId}/edit`
    });
  }

  // 2) At least one room documented
  checks.push({
    id: 'rooms', label: 'Affected areas defined',
    status: rooms.length ? 'pass' : 'fail',
    detail: rooms.length ? `${rooms.length} room${rooms.length === 1 ? '' : 's'} documented.` : 'No structures or rooms added yet.',
    to: `/claims/${input.claimId}`
  });

  // 3) Photo documentation, per affected room
  {
    const roomsWithPhotos = new Set(photos.map((p) => p.room_id).filter(Boolean));
    const roomsMissing = rooms.filter((r) => !roomsWithPhotos.has(r.id)).length;
    checks.push({
      id: 'photos', label: 'Photo documentation',
      status: photos.length === 0 ? 'fail' : roomsMissing > 0 ? 'warn' : 'pass',
      detail: photos.length === 0 ? 'No photos captured.' : roomsMissing > 0 ? `${roomsMissing} room${roomsMissing === 1 ? '' : 's'} have no photos.` : `${photos.length} photos across all rooms.`,
      to: `/claims/${input.claimId}/photos`
    });
  }

  // 4) Moisture documentation (a map with geometry OR material readings)
  {
    const hasMap = sketches.some((s) => {
      const cj = s.canvas_json || {};
      return (cj.walls && cj.walls.length) || (cj.wetAreas && cj.wetAreas.length) || (cj.moisturePoints && cj.moisturePoints.length);
    });
    const hasMoistureReadings = readings.some((r) => r.reading_type === 'material_mc');
    checks.push({
      id: 'moisture', label: 'Moisture documented',
      status: hasMap || hasMoistureReadings ? 'pass' : 'warn',
      detail: hasMap || hasMoistureReadings ? 'Moisture map and/or material readings present.' : 'No moisture map or material readings yet.',
      to: `/claims/${input.claimId}`
    });
  }

  // 5) Signed work authorization (can't bill without it)
  {
    const signed = signatures.some((s) => s.doc_type === 'work_authorization');
    checks.push({
      id: 'authorization', label: 'Work authorization signed',
      status: signed ? 'pass' : 'fail',
      detail: signed ? 'Authorization & Direction to Pay is signed.' : 'No signed work authorization on file.',
      to: `/claims/${input.claimId}/forms`
    });
  }

  // ---- drying-specific checks (only when the job has chambers) ----
  if (hasChambers) {
    // 6) Daily monitoring (consecutive days, no gaps, recent)
    let worstGap = 0, staleChambers = 0;
    for (const ch of chambers) {
      const days = [...new Set(readings.filter((r) => r.chamber_id === ch.id).map((r) => dayKey(r.captured_at)).filter(Boolean))].sort();
      if (!days.length) { staleChambers++; continue; }
      const span = Math.round((new Date(days[days.length - 1]).getTime() - new Date(days[0]).getTime()) / 86400000) + 1;
      worstGap = Math.max(worstGap, span - days.length); // missed days within the span
      const lastReadAgeH = (Date.now() - new Date(days[days.length - 1]).getTime()) / 3600000;
      const signed = signatures.some((s) => s.doc_type === 'chamber_signoff' && s.doc_snapshot && s.doc_snapshot.chamber_id === ch.id);
      if (lastReadAgeH > 36 && !signed) staleChambers++;
    }
    checks.push({
      id: 'monitoring', label: 'Daily drying monitoring',
      status: staleChambers > 0 ? 'fail' : worstGap > 0 ? 'warn' : 'pass',
      detail: staleChambers > 0 ? `${staleChambers} chamber${staleChambers === 1 ? '' : 's'} missing recent or any readings.` : worstGap > 0 ? `${worstGap} skipped monitoring day${worstGap === 1 ? '' : 's'} detected.` : 'Readings recorded on consecutive days.',
      to: `/claims/${input.claimId}` // Hydro entry lives under the claim
    });

    // 7) 3+ monitoring points per chamber (S500)
    {
      let thin = 0;
      for (const ch of chambers) {
        const pts = new Set(readings.filter((r) => r.chamber_id === ch.id && r.reading_type === 'material_mc' && r.location_label).map((r) => r.location_label));
        if (pts.size < 3) thin++;
      }
      checks.push({
        id: 'points', label: '3+ monitoring points per chamber',
        status: thin === 0 ? 'pass' : 'warn',
        detail: thin === 0 ? 'Every chamber has at least 3 reading locations.' : `${thin} chamber${thin === 1 ? '' : 's'} have fewer than 3 monitoring points.`,
        to: `/claims/${input.claimId}`
      });
    }

    // 8) Equipment logged with dates (justifies the invoice)
    {
      const withDates = equipment.filter((e) => e.placed_at).length;
      checks.push({
        id: 'equipment', label: 'Equipment days logged',
        status: withDates > 0 ? 'pass' : 'fail',
        detail: withDates > 0 ? `${withDates} equipment record${withDates === 1 ? '' : 's'} with placement dates.` : 'No equipment logged with dates.',
        to: `/claims/${input.claimId}`
      });
    }

    // 9) GPP present on psychrometric readings (proves the dehus worked)
    {
      const psy = readings.filter((r) => r.reading_type === 'psychrometric');
      const withGpp = psy.filter((r) => r.gpp != null).length;
      checks.push({
        id: 'gpp', label: 'Grains (GPP) recorded',
        status: psy.length === 0 ? 'warn' : withGpp === psy.length ? 'pass' : 'warn',
        detail: psy.length === 0 ? 'No psychrometric readings yet.' : withGpp === psy.length ? 'GPP computed on all atmospheric readings.' : `${psy.length - withGpp} readings missing GPP.`,
        to: `/claims/${input.claimId}`
      });
    }
  }

  const weight = (s: CheckStatus) => (s === 'pass' ? 1 : s === 'warn' ? 0.5 : 0);
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const score = Math.round((checks.reduce((a, c) => a + weight(c.status), 0) / checks.length) * 100);
  const level: ReadinessResult['level'] = checks.some((c) => c.status === 'fail') ? 'not_ready' : score >= 85 ? 'ready' : 'gaps';

  return { score, level, checks, passCount, total: checks.length };
}