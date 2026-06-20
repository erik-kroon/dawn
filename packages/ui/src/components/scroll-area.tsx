"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import type React from "react";
import { cn } from "@dawn/ui/lib/utils";

export type ScrollAreaProps = ScrollAreaPrimitive.Root.Props & {
  clampContentMinWidth?: boolean;
  contentClassName?: string;
  fill?: boolean;
  horizontalScrollbarStyle?: React.CSSProperties;
  scrollFade?: boolean;
  scrollbarClassName?: string;
  scrollbarGutter?: boolean;
  thumbClassName?: string;
  verticalScrollbarStyle?: React.CSSProperties;
  viewportClassName?: string;
};

export function ScrollArea({
  children,
  className,
  clampContentMinWidth = true,
  contentClassName,
  fill = false,
  horizontalScrollbarStyle,
  scrollFade = false,
  scrollbarClassName,
  scrollbarGutter = false,
  thumbClassName,
  verticalScrollbarStyle,
  viewportClassName,
  ...props
}: ScrollAreaProps): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Root className={cn("size-full min-h-0", className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        className={cn(
          "h-full rounded-[inherit] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-has-overflow-y:overscroll-y-contain data-has-overflow-x:overscroll-x-contain",
          scrollFade &&
            "mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))] mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))] mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))] [--fade-size:1.5rem]",
          scrollbarGutter && "data-has-overflow-y:pe-2.5 data-has-overflow-x:pb-2.5",
          viewportClassName,
        )}
        data-slot="scroll-area-viewport"
      >
        <ScrollAreaPrimitive.Content
          className={cn(
            clampContentMinWidth && "min-w-0",
            fill && "flex min-h-full flex-col",
            contentClassName,
          )}
          data-slot="scroll-area-content"
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar
        className={scrollbarClassName}
        orientation="vertical"
        style={verticalScrollbarStyle}
        thumbClassName={thumbClassName}
      />
      <ScrollBar
        className={scrollbarClassName}
        orientation="horizontal"
        style={horizontalScrollbarStyle}
        thumbClassName={thumbClassName}
      />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  );
}

export type ScrollBarProps = ScrollAreaPrimitive.Scrollbar.Props & {
  thumbClassName?: string;
};

export function ScrollBar({
  className,
  orientation = "vertical",
  thumbClassName,
  ...props
}: ScrollBarProps): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        "m-1 flex opacity-0 transition-opacity delay-300 data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5 data-[orientation=horizontal]:flex-col data-hovering:opacity-100 data-scrolling:opacity-100 data-hovering:delay-0 data-scrolling:delay-0 data-hovering:duration-100 data-scrolling:duration-100",
        className,
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className={cn("relative flex-1 rounded-full bg-foreground/20", thumbClassName)}
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollAreaPrimitive };
