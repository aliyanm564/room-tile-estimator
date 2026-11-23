"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { DISCLAIMER } from "@/lib/disclaimer";

const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export function PrimaryButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${base} bg-[var(--brand)] text-[var(--brand-text)] active:opacity-90 ${className}`} />;
}

export function SecondaryButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${base} bg-white text-stone-900 ring-1 ring-stone-300 active:bg-stone-100 ${className}`} />;
}

export function DangerButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${base} bg-white text-red-800 ring-1 ring-red-300 active:bg-red-50 ${className}`} />;
}

export function LinkButton({ href, children, primary, className = "" }: { href: string; children: ReactNode; primary?: boolean; className?: string }) {
  return (
    <a
      href={href}
      className={`${base} ${primary ? "bg-[var(--brand)] text-[var(--brand-text)]" : "bg-white text-stone-900 ring-1 ring-stone-300 active:bg-stone-100"} ${className}`}
    >
      {children}
    </a>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="-ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-base font-medium text-stone-700 active:bg-stone-200 print:hidden">
      <span aria-hidden className="mr-1">←</span> {label}
    </a>
  );
}

export function Card({ children, className = "", as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "li"; "aria-label"?: string }) {
  return (
    <As {...rest} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5 ${className}`}>
      {children}
    </As>
  );
}

export type BadgeTone = "green" | "grey" | "amber" | "orange" | "red" | "blue";
const TONES: Record<BadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-900",
  grey: "bg-stone-200 text-stone-700",
  amber: "bg-amber-100 text-amber-900",
  orange: "bg-orange-100 text-orange-900",
  red: "bg-red-100 text-red-900",
  blue: "bg-sky-100 text-sky-900",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function SourceBadge({ source }: { source: "measured" | "estimated" }) {
  return <Badge tone={source === "measured" ? "green" : "grey"}>{source}</Badge>;
}

export function Notice({ tone = "info", children, onDismiss }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode; onDismiss?: () => void }) {
  const cls = {
    info: "bg-sky-50 text-sky-950 ring-sky-200",
    warn: "bg-amber-50 text-amber-950 ring-amber-200",
    error: "bg-red-50 text-red-900 ring-red-200",
    success: "bg-emerald-50 text-emerald-950 ring-emerald-200",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl p-3 text-sm ring-1 ${cls}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-lg">
          ×
        </button>
      )}
    </div>
  );
}

/** In-page "are you sure?" (no browser pop-ups). */
export function ConfirmDelete({ label, message, onConfirm }: { label: string; message: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <DangerButton onClick={() => setAsking(true)}>{label}</DangerButton>;
  return (
    <div role="alertdialog" aria-label={label} className="rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
      <p className="text-base text-red-900">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onConfirm} className={`${base} bg-red-700 text-white`}>
          Yes, delete
        </button>
        <SecondaryButton onClick={() => setAsking(false)}>Cancel</SecondaryButton>
      </div>
    </div>
  );
}

/** A title with a Rename button that turns into an input. */
export function EditableName({ value, onSave, label, as: As = "h1" }: { value: string; onSave: (v: string) => void; label: string; as?: "h1" | "h2" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const size = As === "h1" ? "text-2xl" : "text-xl";
  if (!editing) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <As className={`min-w-0 break-words font-bold ${size}`}>{value}</As>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-sky-800 active:bg-sky-50 print:hidden"
        >
          Rename
        </button>
      </div>
    );
  }
  const save = () => {
    onSave(draft);
    setEditing(false);
  };
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        aria-label={label}
        autoFocus
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-12 min-w-0 flex-1 rounded-xl px-3 text-lg ring-1 ring-stone-300"
      />
      <PrimaryButton type="submit">Save</PrimaryButton>
      <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
    </form>
  );
}

export function Disclaimer({ className = "" }: { className?: string }) {
  return <p className={`text-sm text-stone-600 ${className}`}>{DISCLAIMER}</p>;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, className = "", ...rest } = props;
  return (
    <label className="flex flex-col gap-2">
      <span className="text-base font-semibold">{label}</span>
      <input {...rest} className={`min-h-12 w-full rounded-xl px-3 text-lg ring-1 ring-stone-300 ${className}`} />
    </label>
  );
}
