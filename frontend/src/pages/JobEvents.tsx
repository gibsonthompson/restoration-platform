import { SubHeader } from '../components/SubHeader';

// Activity timeline for the claim (who did what, when). Module not built yet.
export default function JobEvents() {
  return (
    <div>
      <SubHeader title="Job Events" />
      <p className="p-4 text-gray-400 text-sm">
        Activity timeline: next module. Will log structure/room/photo/reading/report
        events with author and timestamp.
      </p>
    </div>
  );
}