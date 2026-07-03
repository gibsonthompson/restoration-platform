import { useEffect, useRef, useState } from 'react';
import { LogOut, Upload, Trash2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';

// Legible text color for a brand background (white on dark, navy on light).
function contrastText(hex: string) {
  try {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.6 ? '#0E2A4D' : '#ffffff';
  } catch { return '#ffffff'; }
}

// Downscale + re-encode an uploaded logo to a small PNG data URL (keeps the row
// tiny and lets the report embed it directly, no storage/signed URLs).
function fileToLogoDataUrl(file: File, maxW = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

interface Branding {
  company_name: string; logo_data_url: string; primary_color: string; accent_color: string;
  phone: string; email: string; website: string; license_number: string; report_footer: string;
}
const EMPTY: Branding = {
  company_name: '', logo_data_url: '', primary_color: '#0E2A4D', accent_color: '#29ABE6',
  phone: '', email: '', website: '', license_number: '', report_footer: ''
};

export default function OrgSettings() {
  const { activeOrg, role } = useOrg();
  const { user } = useAuth();
  const [f, setF] = useState<Branding>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => { setF(p => ({ ...p, [k]: v })); setSaved(false); };

  useEffect(() => {
    if (!activeOrg) return;
    setLoading(true);
    supabase.from('resto_org_settings').select('*').eq('org_id', activeOrg.id).limit(1)
      .then(({ data }) => {
        const row: any = data && data[0];
        setF({
          company_name: row?.company_name ?? activeOrg.name ?? '',
          logo_data_url: row?.logo_data_url ?? '',
          primary_color: row?.primary_color ?? '#0E2A4D',
          accent_color: row?.accent_color ?? '#29ABE6',
          phone: row?.phone ?? '', email: row?.email ?? '', website: row?.website ?? '',
          license_number: row?.license_number ?? '', report_footer: row?.report_footer ?? ''
        });
        setLoading(false);
      });
  }, [activeOrg?.id]);

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { set('logo_data_url', await fileToLogoDataUrl(file)); } catch { alert('Could not read that image.'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    if (!activeOrg) return;
    setSaving(true); setSaved(false);
    const { error } = await supabase.from('resto_org_settings')
      .upsert({ org_id: activeOrg.id, ...f, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
    setSaving(false);
    if (error) alert('Save failed: ' + error.message);
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  const onBrand = contrastText(f.primary_color);
  const headSub = [f.company_name, f.phone].filter(Boolean).join('  \u00b7  ');

  const Field = ({ label, k, placeholder, type = 'text' }: { label: string; k: keyof Branding; placeholder?: string; type?: string }) => (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
      <input type={type} value={f[k]} placeholder={placeholder}
        onChange={e => set(k, e.target.value as any)}
        className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky" />
    </label>
  );

  if (loading) return <div className="p-4 text-gray-400 text-sm">Loading settings...</div>;

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="font-display text-lg font-bold text-navy">Settings</h1>

      {/* live report-header preview */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Report header preview</div>
        <div className="rounded-2xl overflow-hidden shadow-soft">
          <div className="flex items-center justify-between px-4 py-3.5" style={{ backgroundColor: f.primary_color }}>
            <div className="min-w-0">
              <div className="font-display font-bold text-[15px] leading-tight" style={{ color: onBrand }}>Property Restoration Report</div>
              {headSub && <div className="text-[11px] mt-0.5 truncate" style={{ color: onBrand, opacity: 0.9 }}>{headSub}</div>}
            </div>
            {f.logo_data_url
              ? <img src={f.logo_data_url} alt="logo" className="h-9 max-w-[110px] object-contain ml-3 shrink-0" />
              : <div className="h-9 px-2 flex items-center text-[10px] rounded ml-3 shrink-0" style={{ color: onBrand, border: `1px dashed ${onBrand}`, opacity: 0.7 }}>your logo</div>}
          </div>
        </div>
      </div>

      {/* branding */}
      <div className="card space-y-3.5">
        <div className="font-bold text-sm text-navy">Branding</div>
        <Field label="Company name" k="company_name" placeholder="Reliable Solutions Atlanta" />

        <div>
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Logo</span>
          <div className="mt-1 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {f.logo_data_url ? <img src={f.logo_data_url} alt="logo" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-gray-400">none</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onLogo} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-1.5 active:bg-gray-50">
              <Upload size={15} /> Upload
            </button>
            {f.logo_data_url && (
              <button onClick={() => set('logo_data_url', '')} className="text-red-500 rounded-xl px-2.5 py-2 text-sm font-semibold flex items-center gap-1.5 active:bg-red-50">
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">PNG with a transparent background works best. It's resized automatically.</p>
        </div>

        <div className="flex gap-3">
          {(['primary_color', 'accent_color'] as const).map(k => (
            <label key={k} className="flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{k === 'primary_color' ? 'Header color' : 'Accent color'}</span>
              <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-2.5 py-2">
                <input type="color" value={f[k]} onChange={e => set(k, e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" />
                <span className="text-xs font-mono text-gray-500 uppercase">{f[k]}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* contact + license (printed in the report footer) */}
      <div className="card space-y-3.5">
        <div className="font-bold text-sm text-navy">Contact &amp; license</div>
        <p className="text-[11px] text-gray-400 -mt-1">These print in the report footer.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" k="phone" placeholder="(770) 555-1234" type="tel" />
          <Field label="License #" k="license_number" placeholder="GA-12345" />
        </div>
        <Field label="Email" k="email" placeholder="help@company.com" type="email" />
        <Field label="Website" k="website" placeholder="company.com" />
        <Field label="Footer line" k="report_footer" placeholder="24/7 emergency water, fire & mold restoration." />
      </div>

      <button onClick={save} disabled={saving}
        className="btn-primary w-full py-3 justify-center disabled:opacity-50">
        {saved ? (<><Check size={16} /> Saved</>) : saving ? 'Saving...' : 'Save branding'}
      </button>

      {/* account */}
      <div className="card space-y-1 text-sm">
        <div className="font-bold text-navy mb-1">Account</div>
        <div><span className="text-gray-400">Company:</span> {activeOrg?.name}</div>
        <div><span className="text-gray-400">Signed in:</span> {user?.email}</div>
        <div><span className="text-gray-400">Role:</span> {role}</div>
      </div>

      <button onClick={() => supabase.auth.signOut()}
        className="w-full border border-red-200 text-red-600 rounded-xl py-3 font-semibold flex items-center justify-center gap-2 active:bg-red-50">
        <LogOut size={16} /> Sign out
      </button>
    </div>
  );
}