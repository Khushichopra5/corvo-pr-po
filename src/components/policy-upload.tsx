"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Upload } from "lucide-react";

export function PolicyUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function upload() {
    if (!file && !text.trim()) {
      setError("Upload a policy document or describe the change.");
      return;
    }
    setPending(true);
    setError("");
    try {
      let response: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        response = await fetch("/api/policies/upload", { method: "POST", body: form });
      } else {
        response = await fetch("/api/policies/from-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Policy draft failed");
      router.push(`/policy/${body.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Policy draft failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
        <Upload className="mx-auto size-7 text-slate-400" />
        <div className="mt-2 text-sm font-semibold text-slate-800">Upload an amendment or policy PDF</div>
        <p className="mt-1 text-xs text-slate-500">PDF, TXT or Markdown. The app reads it, drafts a version and shows a plain-language diff.</p>
        <input
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain"
          className="mx-auto mt-3 block text-sm text-slate-600"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {file ? <div className="mt-2 text-xs font-medium text-emerald-700">{file.name}</div> : null}
      </div>
      <div className="relative text-center text-xs uppercase tracking-wide text-slate-400">
        <span className="bg-white px-2">or describe the change</span>
      </div>
      <textarea
        className="input min-h-24"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Example: change the spot PO limit to ₹1,50,000 and add a Chakan rule: requirements of ₹8,00,000 or more go to RFP."
      />
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      <button className="btn-primary" onClick={upload} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Draft policy change
      </button>
    </div>
  );
}
