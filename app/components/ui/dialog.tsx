"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import React from "react";

import { cn } from "~/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = ({
  className,
  ref,
  ...props
}: DialogPrimitive.Backdrop.Props) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[rgb(46_42_64/0.6)] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
      className,
    )}
    {...props}
  />
);
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = ({
  className,
  overlayClassName,
  showClose = true,
  closeLabel = "Close",
  children,
  ref,
  ...props
}: DialogPrimitive.Popup.Props & {
  overlayClassName?: string;
  showClose?: boolean;
  closeLabel?: string;
}) => (
  <DialogPrimitive.Portal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        "bg-card fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 border p-7 shadow-lg outline-hidden transition-[opacity,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-5 right-5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-hidden">
          <XIcon className="size-4" />
          <span className="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Popup>
  </DialogPrimitive.Portal>
);
DialogContent.displayName = "DialogContent";

const DialogTitle = ({
  className,
  ref,
  ...props
}: DialogPrimitive.Title.Props) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-2xl font-light tracking-tight", className)}
    {...props}
  />
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = ({
  className,
  ref,
  ...props
}: DialogPrimitive.Description.Props) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
);
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
};
