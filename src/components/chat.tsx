"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Check, Loader2, RotateCcw, Send, User } from "lucide-react";
import type { RequirementView } from "@/db/queries";

type ItemOption = {
  itemCode: string;
  description: string;
  uom: string;
  category: string;
  confidence: number;
};

type Stage = "idle" | "choose" | "qty" | "plant" | "date" | "urgency" | "estimate" | "confirm" | "created";

type Draft = {
  description: string;
  itemCode?: string;
  itemDescription?: string;
  uom?: string;
  quantity?: number;
  plant?: string;
  needByDate?: string;
  urgency?: string;
  estimatedUnitPrice?: number;
  isNew?: boolean;
};

type Message = {
  role: "assistant" | "user";
  content: string;
  candidates?: ItemOption[];
};

import { extractPrice, parseDraft } from "@/lib/chat-parser";

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello â€” I can raise a purchase request for you. Tell me what you need, for which plant, and by when. Iâ€™ll ask for anything missing and show a confirmation before creating the PR.",
    },
  ]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<Draft>({ description: "" });
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ prNo: string; requirement: RequirementView | null } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stage, created]);

  function addAssistant(content: string, candidates?: ItemOption[]) {
    setMessages((current) => [...current, { role: "assistant", content, candidates }]);
  }

  function addUser(content: string) {
    setMessages((current) => [...current, { role: "user", content }]);
  }

  function nextQuestion(next: Draft) {
    if (!next.itemCode && !next.isNew && next.description) {
      void searchItems(next.description, next);
      return;
    }
    if (!next.quantity) {
      setStage("qty");
      addAssistant(`How many ${next.itemDescription ?? next.description} do you need?`);
      return;
    }
    if (!next.plant) {
      setStage("plant");
      addAssistant("Which plant is this for â€” PUN1 Bhosari or CHK1 Chakan?");
      return;
    }
    if (!next.needByDate) {
      setStage("date");
      addAssistant("What is the need-by date? You can say â€œnext Fridayâ€, â€œ25 Novâ€ or give a YYYY-MM-DD date.");
      return;
    }
    if (!next.urgency) {
      setStage("urgency");
      addAssistant("Is this Normal or Emergency? â€œUrgentâ€ is not automatically an emergency under policy v5.0.");
      return;
    }
    if (next.isNew && !next.estimatedUnitPrice) {
      setStage("estimate");
      addAssistant("This item is not in the item master. What is your estimated unit price in INR? The buyer will source it as a new item.");
      return;
    }
    setStage("confirm");
    addAssistant("Please confirm the PR details below. I will only create it when you press Confirm.");
  }

  async function searchItems(description: string, base: Draft = draft) {
    setPending(true);
    try {
      const response = await fetch(`/api/items/search?q=${encodeURIComponent(description)}&limit=4`);
      const body = await response.json();
      const items = (body.items ?? []) as ItemOption[];
      const best = items[0];
      if (best && best.confidence >= 0.78) {
        const next = {
          ...base,
          description,
          itemCode: best.itemCode,
          itemDescription: best.description,
          uom: best.uom,
          isNew: false,
        };
        setDraft(next);
        addAssistant(`I found ${best.itemCode} â€” ${best.description} (${best.uom}).`);
        nextQuestion(next);
      } else if (items.length > 0 && items[0].confidence >= 0.45) {
        setDraft({ ...base, description });
        setStage("choose");
        addAssistant("I found a few possible items. Which one did you mean?", items);
      } else {
        const next: Draft = { ...base, description, isNew: true };
        setDraft(next);
        addAssistant(`I couldnâ€™t find â€œ${description}â€ in the item master. It will be a new item â€” Iâ€™ll ask for an estimate so it can be sourced.`);
        nextQuestion(next);
      }
    } catch {
      addAssistant("I couldnâ€™t search the item master just now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function chooseItem(option: ItemOption) {
    const next: Draft = {
      ...draft,
      itemCode: option.itemCode,
      itemDescription: option.description,
      uom: option.uom,
      isNew: false,
    };
    setDraft(next);
    addUser(option.itemCode);
    addAssistant(`Using ${option.itemCode} â€” ${option.description}.`);
    nextQuestion(next);
  }

  function chooseNewItem() {
    const next: Draft = { ...draft, isNew: true, itemCode: undefined, itemDescription: undefined };
    setDraft(next);
    addUser("None of these");
    addAssistant("Understood. Iâ€™ll treat it as a new item and ask for an estimated unit price.");
    nextQuestion(next);
  }

  function reset() {
    setMessages([
      {
        role: "assistant",
        content: "Ready for another request. Tell me the item, quantity, plant and need-by date.",
      },
    ]);
    setDraft({ description: "" });
    setStage("idle");
    setCreated(null);
    setInput("");
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setInput("");
    addUser(message);
    const parsed = parseDraft(message);

    if (stage === "choose") {
      const lastCandidates = [...messages].reverse().find((entry) => entry.candidates)?.candidates ?? [];
      const chosen = lastCandidates.find(
        (candidate) => candidate.itemCode.toLowerCase() === message.toLowerCase() || candidate.description.toLowerCase().includes(message.toLowerCase()),
      );
      if (chosen) return chooseItem(chosen);
      if (/none|new|not these/i.test(message)) return chooseNewItem();
      return searchItems(message, draft);
    }
    if (stage === "qty") {
      const number = extractPrice(message);
      if (!number) return addAssistant("Please give a positive quantity, for example 200.");
      const next = { ...draft, quantity: number, uom: parsed.uom ?? draft.uom };
      setDraft(next);
      return nextQuestion(next);
    }
    if (stage === "plant") {
      if (!parsed.plant) return addAssistant("Please choose PUN1 Bhosari or CHK1 Chakan.");
      const next = { ...draft, plant: parsed.plant };
      setDraft(next);
      return nextQuestion(next);
    }
    if (stage === "date") {
      if (!parsed.needByDate) return addAssistant("Please give a date such as â€œnext Fridayâ€, â€œ25 Novâ€ or 2026-11-25.");
      const next = { ...draft, needByDate: parsed.needByDate };
      setDraft(next);
      return nextQuestion(next);
    }
    if (stage === "urgency") {
      if (!parsed.urgency) return addAssistant("Please answer Normal or Emergency.");
      const next = { ...draft, urgency: parsed.urgency };
      setDraft(next);
      return nextQuestion(next);
    }
    if (stage === "estimate") {
      const price = extractPrice(message);
      if (!price) return addAssistant("Please give a positive estimated unit price in INR.");
      const next = { ...draft, estimatedUnitPrice: price };
      setDraft(next);
      return nextQuestion(next);
    }
    if (stage === "confirm") {
      return addAssistant("Use the confirmation card above, or press Start over.");
    }

    const next = { ...draft, ...parsed, description: parsed.description ?? draft.description };
    setDraft(next);
    if (!next.itemCode && !next.isNew) return searchItems(next.description, next);
    return nextQuestion(next);
  }

  async function confirm() {
    setPending(true);
    try {
      const response = await fetch("/api/prs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCode: draft.itemCode,
          description: draft.itemDescription ?? draft.description,
          quantity: draft.quantity,
          uom: draft.uom,
          plant: draft.plant,
          needByDate: draft.needByDate,
          urgency: draft.urgency,
          estimatedUnitPrice: draft.estimatedUnitPrice,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not create the PR");
      setCreated({ prNo: body.pr_no, requirement: body.requirement });
      setStage("created");
      addAssistant(`PR ${body.pr_no} created. The decision is ${body.row?.route ?? "ready"}${body.row?.supplier_id ? ` with ${body.row.supplier_id}` : ""}. Iâ€™ve sent it to the buyer queue.`);
    } catch (caught) {
      addAssistant(caught instanceof Error ? caught.message : "Could not create the PR.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="card flex min-h-[70vh] flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="grid size-9 place-items-center rounded-full bg-slate-900 text-white"><Bot className="size-4" /></div>
          <div>
            <div className="text-sm font-semibold text-slate-950">Corvo intake assistant</div>
            <div className="text-xs text-slate-500">Chat intake Â· confirmation required</div>
          </div>
          <button className="btn ml-auto text-xs" onClick={reset}><RotateCcw className="size-3.5" /> Start over</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.map((message, index) => (
            <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
              {message.role === "assistant" ? <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Bot className="size-3.5" /></div> : null}
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                {message.content}
                {message.candidates ? (
                  <div className="mt-3 space-y-2">
                    {message.candidates.map((candidate) => (
                      <button key={candidate.itemCode} className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-left text-xs hover:border-slate-400" onClick={() => chooseItem(candidate)}>
                        <span className="font-semibold text-slate-900">{candidate.itemCode}</span> Â· {candidate.description}
                        <span className="ml-1 text-slate-400">({Math.round(candidate.confidence * 100)}%)</span>
                      </button>
                    ))}
                    <button className="text-xs font-semibold text-slate-600 underline" onClick={chooseNewItem}>
                      None of these â€” create a new item
                    </button>
                  </div>
                ) : null}
              </div>
              {message.role === "user" ? <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600"><User className="size-3.5" /></div> : null}
            </div>
          ))}
          {stage === "plant" ? (
            <div className="flex justify-end gap-2">
              {[
                ["PUN1", "PUN1 Bhosari"],
                ["CHK1", "CHK1 Chakan"],
              ].map(([value, label]) => (
                <button key={value} className="chip" onClick={() => send(value)}>{label}</button>
              ))}
            </div>
          ) : null}
          {stage === "urgency" ? (
            <div className="flex justify-end gap-2">
              <button className="chip" onClick={() => send("Normal")}>Normal</button>
              <button className="chip" onClick={() => send("Emergency")}>Emergency</button>
            </div>
          ) : null}
          {stage === "confirm" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-semibold text-emerald-950">Confirm purchase request</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-emerald-700">Item</dt><dd className="font-medium text-emerald-950">{draft.itemCode ?? "NEW"} Â· {draft.itemDescription ?? draft.description}</dd>
                <dt className="text-emerald-700">Quantity</dt><dd className="font-medium text-emerald-950">{draft.quantity} {draft.uom}</dd>
                <dt className="text-emerald-700">Plant</dt><dd className="font-medium text-emerald-950">{draft.plant}</dd>
                <dt className="text-emerald-700">Need by</dt><dd className="font-medium text-emerald-950">{draft.needByDate}</dd>
                <dt className="text-emerald-700">Urgency</dt><dd className="font-medium text-emerald-950">{draft.urgency}</dd>
                {draft.isNew ? <><dt className="text-emerald-700">Estimate</dt><dd className="font-medium text-emerald-950">â‚¹{draft.estimatedUnitPrice?.toLocaleString("en-IN")}</dd></> : null}
              </dl>
              <button className="btn-primary mt-4" onClick={confirm} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm & create PR
              </button>
            </div>
          ) : null}
          {created ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <div className="font-semibold">PR {created.prNo} created</div>
              <div className="mt-1">
                {created.requirement ? `${created.requirement.route} Â· ${created.requirement.supplier_id ?? "sourcing"} Â· â‚¹${(created.requirement.group_value_inr ?? 0).toLocaleString("en-IN")}` : "Decision created."}
              </div>
              <div className="mt-3">
                <Link href={created.requirement ? `/requirements/${created.requirement.id}` : "/inbox"} className="btn-primary text-xs">
                  View decision
                </Link>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
        <form
          className="flex items-center gap-2 border-t border-slate-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <input
            className="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={stage === "created" ? "Start over to raise another request" : "e.g. need 200 nitrile gloves for Chakan by next Friday"}
            disabled={pending || stage === "created"}
          />
          <button className="btn-primary" type="submit" disabled={pending || !input.trim() || stage === "created"}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <div className="card card-pad">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What the assistant will ask</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>â€¢ <strong>Item</strong> â€” it searches the master and never invents a code.</li>
            <li>â€¢ <strong>Quantity, plant, need-by date and urgency</strong> â€” only the missing ones.</li>
            <li>â€¢ <strong>Confirmation</strong> â€” no PR is created until you press Confirm.</li>
            <li>â€¢ <strong>Unknown item</strong> â€” it says so, asks for an estimate and creates a NEW item sourcing request.</li>
          </ul>
        </div>
        <div className="card card-pad">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Example</h2>
          <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm italic leading-6 text-slate-600">
            â€œNeed 200 nitrile gloves for Chakan by next Friday.â€
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            The assistant resolves ITM-1048, asks for urgency, shows the absolute date and then asks you to confirm.
          </p>
        </div>
      </div>
    </div>
  );
}



