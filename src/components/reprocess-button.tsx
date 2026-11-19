"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

export function ReprocessButton({ runId, policyVersion }: { runId: string; policyVersion: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      {error ? <div className="text-xs text-rose-700">{error}</div> : null}
      <button
        className="btn-primary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const response = await fetch(`/api/runs/${runId}/reprocess`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ policyVersion }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error?.message ?? "Reprocess failed");
            router.push(`/inbox?policy=${encodeURIComponent(policyVersion)}`);
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Reprocess failed");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Reprocess latest batch under v{policyVersion}
      </button>
    </div>
  );
}
