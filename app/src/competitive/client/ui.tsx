import type { ComponentProps, ReactNode } from "react";
import { Button } from "../../client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../client/components/ui/dialog";
import { Input } from "../../client/components/ui/input";
import { Textarea } from "../../client/components/ui/textarea";
import { cn } from "../../client/utils";

// Console-themed building blocks for the competitive pages. Dialogs and sheets
// render in a portal outside the app shell, so they re-declare `dark` to keep
// the shell's colors.

export const consoleOverlayClass =
  "dark bg-console-surface border-console-border text-console-fg";

const controlClass =
  "border-console-border bg-console-raised text-console-fg placeholder:text-console-dim focus-visible:ring-console-cyan";

export function ConsoleInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return <Input className={cn(controlClass, className)} {...props} />;
}

export function ConsoleTextarea({
  className,
  ...props
}: ComponentProps<typeof Textarea>) {
  return <Textarea className={cn(controlClass, className)} {...props} />;
}

export function ConsoleSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        controlClass,
        "h-9 w-full rounded-md border px-3 text-sm shadow-sm [color-scheme:dark] focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-console-muted font-mono text-[10px] font-bold tracking-[1px] uppercase"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-console-subtle text-xs">{hint}</p>}
    </div>
  );
}

export function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "bg-console-raised border-console-border text-console-muted inline-flex items-center gap-[5px] rounded border px-2 py-[3px] font-mono text-[10px] font-bold whitespace-nowrap uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EntityLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="border-console-border bg-console-raised flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-console-muted text-sm font-semibold">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function PrimaryButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "bg-console-mint text-console-mint-foreground hover:bg-console-mint/90 font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export function QuietButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      className={cn(
        "border-console-border text-console-fg hover:bg-console-raised hover:text-console-fg bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

/** A modal form: title, fields, and a Cancel / submit footer. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  isSubmitting,
  destructive = false,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  isSubmitting: boolean;
  destructive?: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={consoleOverlayClass}>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-console-muted">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          {children}
          <DialogFooter>
            <QuietButton type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </QuietButton>
            {destructive ? (
              <Button
                type="submit"
                variant="destructive"
                disabled={isSubmitting}
              >
                {submitLabel}
              </Button>
            ) : (
              <PrimaryButton type="submit" disabled={isSubmitting}>
                {submitLabel}
              </PrimaryButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
