"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface CardInfoButtonProps {
  description: string;
}

export function CardInfoButton({ description }: CardInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const panelWidth = 264;
    const left = Math.min(
      Math.max(8, rect.right - panelWidth),
      window.innerWidth - panelWidth - 8
    );
    setCoords({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="What this card shows"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          updatePosition();
          setOpen(true);
        }}
        className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer shrink-0 transition-all"
        style={{
          color: open ? "var(--nos-accent-2)" : "var(--nos-text-muted)",
          background: open ? "var(--nos-accent-muted)" : "transparent",
          border: `1px solid ${open ? "var(--nos-accent-border)" : "transparent"}`,
        }}
      >
        <Info size={11} strokeWidth={2.5} />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Card description"
            style={{
              top: coords.top,
              left: coords.left,
              position: "fixed",
              zIndex: 9999,
              width: 264,
              background: "var(--vui-gradient-card)",
              backdropFilter: "blur(120px)",
              border: "1px solid var(--nos-accent-border)",
              borderRadius: 16,
              padding: "12px 14px",
              boxShadow: "0 20px 27px rgba(0,0,0,0.5)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "20%",
                right: "20%",
                height: 1,
                background: "linear-gradient(90deg, transparent, var(--nos-accent), transparent)",
                opacity: 0.6,
              }}
            />
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Info size={12} style={{ color: "var(--nos-accent-2)", marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--nos-text-secondary)", margin: 0 }}>
                {description}
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
