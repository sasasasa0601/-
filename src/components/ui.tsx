"use client";

import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
  size?: "md" | "lg";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-chip-gold text-felt-950 font-bold shadow-lg shadow-chip-gold/20 active:bg-chip-gold/85 disabled:bg-white/10 disabled:text-ink-500 disabled:shadow-none",
  ghost:
    "bg-white/5 text-ink-50 ring-1 ring-inset ring-white/10 active:bg-white/10 disabled:text-ink-500",
  subtle: "bg-transparent text-ink-300 active:text-ink-50 disabled:text-ink-500",
  danger:
    "bg-transparent text-chip-lose ring-1 ring-inset ring-chip-lose/30 active:bg-chip-lose/10",
};

/** タップ領域を 44px 以上に保った、スマホ前提のボタン */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "ghost", size = "md", className = "", ...props },
  ref,
) {
  const sizing = size === "lg" ? "min-h-14 px-6 text-base" : "min-h-11 px-4 text-sm";
  return (
    <button
      ref={ref}
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl transition-colors select-none disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
    />
  );
});

export function Card({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-3xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10 ${className}`}
    />
  );
}

export function Label({
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={`block text-xs font-medium tracking-wide text-ink-300 ${className}`}
    />
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={`w-full min-h-11 rounded-xl bg-felt-950/60 px-3 text-base text-ink-50 ring-1 ring-inset ring-white/10 outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-chip-gold/60 ${className}`}
    />
  );
});

/** チップ枚数用。スマホでテンキーが出るようにしてある */
export const ChipInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function ChipInput({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      {...props}
      className={`w-full min-h-12 rounded-xl bg-felt-950/60 px-3 text-right text-lg tabnum text-ink-50 ring-1 ring-inset ring-white/10 outline-none placeholder:text-ink-500 focus:ring-2 focus:ring-chip-gold/60 ${className}`}
    />
  );
});

export function Spinner({ label = "読み込み中" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-300">
      <span className="size-4 animate-spin rounded-full border-2 border-ink-500 border-t-chip-gold" />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-2xl bg-chip-lose/10 px-4 py-3 text-sm text-chip-lose ring-1 ring-inset ring-chip-lose/25"
    >
      {message}
    </p>
  );
}
