import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCompare, ShieldCheck } from "lucide-react";
import { getLatestRun, getPolicyById, getPolicyRecord, listAuditForEntity } from "@/db/queries";
import { PolicyEditor } from "@/components/policy-editor";
import { ReprocessButton } from "@/components/reprocess-button";
import { Badge, Card, PageHeader, formatDate, formatDateTime } from "@/components/ui";
import { diffPolicies, plainLanguageChanges, policyRuleSummary } from "@/lib/policy";

export const dynamic = "force-dynamic";

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getPolicyById(id);
  if (!record) notFound();
  const current = await getPolicyRecord();
  const latestRun = await getLatestRun();
  const changes = record.policy.status === "draft" ? diffPolicies(current.policy, record.policy) : [];
  const plain = plainLanguageChanges(changes);
  const audit = await listAuditForEntity("POLICY", id);

  return (
    <div className="space-y-5">
      <Link href="/policy" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Back to policy
      </Link>
      <PageHeader
        eyebrow={`Policy ${record.policy.policy_id}`}
        title={`Version ${record.policy.version}`}
        description={`Effective ${formatDate(record.policy.effective_from)} · ${record.label ?? "Corvo procurement policy"}`}
        action={
          <Badge tone={record.policy.status === "active" ? "green" : record.policy.status === "draft" ? "amber" : record.policy.status === "scheduled" ? "violet" : "slate"}>
            {record.policy.status}
          </Badge>
        }
      />

      {record.policy.status === "draft" ? (
        <Card className="card-pad border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <GitCompare className="size-4" /> Draft — not active until approved
          </div>
          {plain.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm text-amber-950">
              {plain.map((line, index) => (
                <li key={index}>• {line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-amber-900">No supported changes were detected. Use the editor below to make the amendment explicit.</p>
          )}
        </Card>
      ) : null}

      {record.policy.status !== "draft" && latestRun ? (
        <Card className="card-pad border-blue-200 bg-blue-50/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-blue-950">Reprocess the latest batch with this version</div>
              <p className="mt-1 text-xs text-blue-800">
                Backtest {record.policy.version} against {latestRun.filename}. The requirement dates stay unchanged; only the policy rules change.
              </p>
            </div>
            <ReprocessButton runId={latestRun.id} policyVersion={record.policy.version} />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-950">Rule set & parameters</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Rule order is priority order. The first matching rule decides the outcome; supplier guard excludes Blocked/Inactive everywhere.
          </p>
          <div className="mt-4">
            <PolicyEditor id={record.id ?? ""} initialPolicy={record.policy} status={record.policy.status} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Rules at a glance</h2>
            <div className="mt-3 space-y-2">
              {record.policy.rules
                .filter((rule) => rule.enabled !== false)
                .sort((a, b) => a.priority - b.priority)
                .map((rule) => (
                  <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {rule.priority} · {rule.clause}
                      </span>
                      <Badge tone="slate">{rule.then.route}</Badge>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{policyRuleSummary(rule)}</div>
                  </div>
                ))}
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-lg font-semibold text-slate-950">Approval & audit</h2>
            <div className="mt-3 text-sm text-slate-600">
              <div>Approved by: {record.approvedBy ?? "—"}</div>
              <div>Approved at: {record.approvedAt ? formatDateTime(record.approvedAt) : "—"}</div>
            </div>
            <div className="mt-4 space-y-3">
              {audit.length > 0 ? (
                audit.map((event) => (
                  <div key={event.id} className="border-l-2 border-slate-200 pl-3">
                    <div className="text-sm font-medium text-slate-800">{event.summary}</div>
                    <div className="text-xs text-slate-500">
                      {event.actor} · {formatDateTime(event.created_at)}
                    </div>
                    {event.comment ? <div className="text-xs text-amber-700">“{event.comment}”</div> : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No approval events yet.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
