import Link from "next/link";
import { FileText, GitBranch, ShieldCheck } from "lucide-react";
import { listPolicies } from "@/db/queries";
import { PolicyUpload } from "@/components/policy-upload";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const policies = await listPolicies();
  const active = policies.find((policy) => policy.status === "active") ?? policies[0];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Policy as data"
        title="Procurement policy"
        description="Limits, windows, rule order and outcomes live in a versioned JSON policy. Upload an amendment or describe a change; review the diff and impact, then approve it without a code change."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-950">Active policy</h2>
          </div>
          {active ? (
            <>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{active.version}</div>
              <div className="mt-1 text-sm text-slate-500">
                Effective {formatDate(active.effective_from)} · {active.status} · {active.label || "Corvo procurement policy"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge tone="green">{policies.filter((policy) => policy.status === "active").length} active</Badge>
                <Badge tone="amber">{policies.filter((policy) => policy.status === "draft").length} draft</Badge>
                <Badge tone="violet">{policies.filter((policy) => policy.status === "scheduled").length} scheduled</Badge>
              </div>
              <div className="mt-5 flex gap-2">
                <Link href={`/policy/${active.id}`} className="btn-primary text-xs">
                  <FileText className="size-3.5" /> View rules & parameters
                </Link>
                <Link href="/api/health" className="btn text-xs">
                  Health check
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4 text-sm text-slate-500">No policy is seeded yet.</div>
          )}
        </Card>
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <GitBranch className="size-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-950">Change the policy</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            The amendment is read into a draft; it is never activated without review. If extraction misses a rule, use the structured editor on the draft.
          </p>
          <div className="mt-3">
            <a href="/amendment-sample.txt" className="text-xs font-semibold text-slate-700 underline" download>
              Download the rehearsal amendment
            </a>
          </div>
          <div className="mt-4">
            <PolicyUpload />
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Version history</h2>
        </div>
        <div className="table-wrap rounded-none border-0 shadow-none">
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Effective</th>
                <th>Status</th>
                <th>Label</th>
                <th>Approved by</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td className="font-semibold text-slate-900">{policy.version}</td>
                  <td>{formatDate(policy.effective_from)}</td>
                  <td>
                    <Badge tone={policy.status === "active" ? "green" : policy.status === "draft" ? "amber" : policy.status === "scheduled" ? "violet" : "slate"}>
                      {policy.status}
                    </Badge>
                  </td>
                  <td className="max-w-[320px] text-sm text-slate-600">{policy.label}</td>
                  <td>{policy.approved_by ?? "—"}</td>
                  <td className="text-xs text-slate-500">{formatDate(policy.created_at)}</td>
                  <td>
                    <Link href={`/policy/${policy.id}`} className="text-xs font-semibold text-slate-800 underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
