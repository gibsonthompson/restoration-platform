import { SubHeader } from '../components/SubHeader';

// Cross-org "Network" sharing (resto_claim_shares). Module not built yet; needs
// the cross-org read RLS extension noted in migration 0005.
export default function Share() {
  return (
    <div>
      <SubHeader title="Share" />
      <p className="p-4 text-gray-400 text-sm">
        Share this claim with an adjuster or outside estimator (view / estimator
        role). Backend share + cross-org access RLS to be built.
      </p>
    </div>
  );
}