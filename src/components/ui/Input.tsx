import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full px-3 rounded-md bg-bg border border-bg-border text-fg placeholder:text-fg-subtle",
        "focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full p-3 rounded-md bg-bg border border-bg-border text-fg placeholder:text-fg-subtle",
        "focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60",
        className,
      )}
      {...rest}
    />
  );
});

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wide">
      {children}
    </label>
  );
}
