import { listAudit } from "@/db/queries";
import { Badge, Card, PageHeader, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await listAudit(300);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Record keeping · policy 8.1"
        title="Audit trail"
        description="Append-only record of decisions, approvals, overrides, contract imports and policy changes. The original decision is preserved when a buyer overrides."
      />
      <Card>
        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(event.created_at)}</td>
                  <td className="text-sm">{event.actor}</td>
                  <td><Badge tone={event.action === "OVERRIDE" ? "amber" : event.action === "APPROVE" ? "green" : "slate"}>{event.action}</Badge></td>
                  <td className="text-xs text-slate-500">{event.entity_type}{event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : ""}</td>
                  <td className="text-sm text-slate-700">{event.summary}</td>
                  <td className="max-w-[260px] text-xs text-slate-500">{event.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {events.length === 0 ? <div className="p-6 text-sm text-slate-500">No actions recorded yet.</div> : null}
      </Card>
    </div>
  );
}
