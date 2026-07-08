import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, FileSignature, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { SignaturePad } from '../components/SignaturePad';

interface Claim {
  id: string; policyholder_name: string | null; address: string | null;
  insurance_company: string | null; policy_number: string | null; assignment_identifier: string | null;
  adjuster: string | null; date_of_loss: string | null;
}
interface Sig { id: string; doc_type: string; signer_name: string | null; signature_data: string | null; signed_at: string; }

const DOCS = [
  { type: 'work_authorization', title: 'Work Authorization & Direction to Pay', when: 'Sign before mitigation begins' },
  { type: 'completion_certificate', title: 'Certificate of Completion & Satisfaction', when: 'Sign at substantial completion' }
];

function clauses(type: string, company: string, claim: Claim): { intro: string; items: string[] } {
  const prop = claim.address || 'the property';
  if (type === 'work_authorization') {
    return {
      intro: `I, ${claim.policyholder_name || 'the undersigned owner/agent'}, authorize ${company} to perform emergency mitigation and restoration services at ${prop}.`,
      items: [
        `Scope: services may include water extraction, structural drying with air movers and dehumidifiers, removal and disposal of non-salvageable materials, antimicrobial application, and daily monitoring.`,
        `Direction to pay: I direct my insurer to include ${company} as a payee on all claim payments for this work. To the extent payment is not made directly, I assign the insurance proceeds attributable to ${company}'s work to ${company}.`,
        `Payment responsibility: I am responsible for my deductible, any depreciation, and amounts not covered by insurance, and I agree to pay ${company} for the work whether or not it is covered.`,
        `Materials & no guarantee: flooring and adjacent materials may need to be removed and disposed of. There is no guarantee, express or implied, that materials can be restored to their pre-loss condition.`,
        `Access & utilities: I will provide continuous access to the work area and reasonable utilities (electricity, water, heat).`,
        `Completion: I agree to sign a Certificate of Completion and Satisfaction upon substantial completion of the work.`
      ]
    };
  }
  return {
    intro: `I, ${claim.policyholder_name || 'the undersigned owner/agent'}, acknowledge that ${company} has completed the authorized emergency mitigation and restoration services at ${prop} to my satisfaction.`,
    items: [
      `Substantial completion: the work area can be occupied for its intended use as of the date signed below.`,
      `Direction to pay: I authorize final payment to ${company} and direct my insurer to release the proceeds for the completed work.`,
      `Remaining balances (deductible, depreciation, or uncovered amounts) remain my responsibility.`
    ]
  };
}

export default function FormsPage() {
  const { claimId } = useParams();
  const nav = useNavigate();
  const { activeOrg } = useOrg();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [sigs, setSigs] = useState<Sig[]>([]);
  const [openType, setOpenType] = useState<string | null>(null);
  const [signer, setSigner] = useState('');
  const [sigData, setSigData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!claimId) return;
    const { data: c } = await supabase.from('resto_claims').select('*').eq('id', claimId).single();
    setClaim(c as Claim);
    const { data: s } = await supabase.from('resto_signatures').select('*').eq('claim_id', claimId).order('signed_at', { ascending: false });
    setSigs((s as Sig[]) ?? []);
  }
  useEffect(() => { void load(); }, [claimId]);

  const company = activeOrg?.name || 'the Company';
  const latest = (type: string) => sigs.find(s => s.doc_type === type) || null;

  function open(type: string) { setOpenType(type); setSigner(claim?.policyholder_name || ''); setSigData(null); }

  async function sign() {
    if (!openType || !activeOrg || !claimId || !claim || !sigData || !signer.trim()) return;
    setSaving(true);
    try {
      const c = clauses(openType, company, claim);
      await supabase.from('resto_signatures').insert({
        org_id: activeOrg.id, claim_id: claimId, doc_type: openType,
        signer_name: signer.trim(), signer_role: 'policyholder', signature_data: sigData,
        doc_snapshot: { company, property: claim.address, insured: claim.policyholder_name, carrier: claim.insurance_company, policy: claim.policy_number, claimNo: claim.assignment_identifier, adjuster: claim.adjuster, intro: c.intro, items: c.items }
      });
      setOpenType(null);
      await load();
    } finally { setSaving(false); }
  }

  const doc = openType ? DOCS.find(d => d.type === openType) : null;
  const c = openType && claim ? clauses(openType, company, claim) : null;

  return (
    <div className="pb-10">
      <div className="safe-top bg-gradient-to-b from-navy-soft to-navy text-white px-4 pt-4 pb-5 rounded-b-3xl">
        <button onClick={() => nav(`/claims/${claimId}`)} className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center mb-3 active:scale-95 transition"><ChevronLeft size={20} /></button>
        <div className="font-display font-bold text-[21px] leading-tight flex items-center gap-2"><FileSignature size={22} /> Forms & Signatures</div>
        <div className="opacity-75 text-[13px] font-medium mt-0.5">Authorization and completion sign-off</div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {DOCS.map(d => {
          const s = latest(d.type);
          return (
            <div key={d.type} className="card">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="font-bold text-sm">{d.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{d.when}</div>
                </div>
                {s && <CheckCircle2 className="text-green-600 shrink-0" size={20} />}
              </div>
              {s ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  {s.signature_data && <img src={s.signature_data} alt="signature" className="h-14" />}
                  <div className="text-xs text-gray-500 mt-1">Signed by {s.signer_name} on {new Date(s.signed_at).toLocaleDateString()}</div>
                  <button onClick={() => open(d.type)} className="text-xs font-semibold text-sky mt-2">Re-sign</button>
                </div>
              ) : (
                <button onClick={() => open(d.type)} className="btn-primary w-full py-2.5 mt-3 text-sm">Review & sign</button>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-gray-400 px-1">These are standard templates. Review the exact wording with your counsel to match your state and carrier requirements.</p>
      </div>

      {doc && c && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col">
          <div className="safe-top px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between">
            <div className="font-bold text-navy text-sm pr-2">{doc.title}</div>
            <button onClick={() => setOpenType(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-0.5">
              <div><span className="font-semibold">Company:</span> {company}</div>
              <div><span className="font-semibold">Property:</span> {claim?.address || '—'}</div>
              <div><span className="font-semibold">Insured:</span> {claim?.policyholder_name || '—'}</div>
              <div><span className="font-semibold">Carrier / Policy / Claim:</span> {[claim?.insurance_company, claim?.policy_number, claim?.assignment_identifier].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <p className="text-gray-700 leading-relaxed">{c.intro}</p>
            <ol className="list-decimal pl-5 space-y-2 text-gray-600 leading-relaxed">
              {c.items.map((it, i) => <li key={i}>{it}</li>)}
            </ol>
            <div className="pt-2">
              <label className="text-xs font-semibold text-gray-500">Signer name</label>
              <input value={signer} onChange={e => setSigner(e.target.value)} placeholder="Full name"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 mt-1 text-[16px] outline-none focus:border-sky" />
            </div>
            <div className="pt-1"><SignaturePad onChange={setSigData} /></div>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 safe-bottom">
            <button onClick={sign} disabled={saving || !sigData || !signer.trim()} className="btn-primary w-full py-3 disabled:opacity-40">
              {saving ? 'Saving…' : 'Sign & save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}