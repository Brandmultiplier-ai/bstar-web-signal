"use client";

/**
 * Vision UI primitives shared by the app shell and auth screen.
 *
 * The glass panel itself is the `.nos-card` class in tokens.css rather than a
 * component, because the kit components in src/website-signals-kit apply it
 * directly and are documented to use relative imports only.
 */

type Gradient = "brand" | "purple" | "success" | "flat";

const GRADIENTS: Record<Gradient, string> = {
  brand: "var(--vui-gradient-brand)",
  purple: "var(--vui-gradient-purple)",
  success: "var(--vui-gradient-success)",
  // Inactive tiles in the Vision UI sidebar are flat navy, not gradient.
  flat: "rgba(255, 255, 255, 0.08)",
};

export function IconTile({
  icon: Icon,
  gradient = "brand",
  size = 45,
  iconSize = 18,
  className = "",
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  gradient?: Gradient;
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      className={`vui-tile ${className}`}
      style={{
        width: size,
        height: size,
        background: GRADIENTS[gradient],
        color: gradient === "flat" ? "var(--nos-accent-2)" : "#ffffff",
      }}
    >
      <Icon size={iconSize} strokeWidth={2} />
    </span>
  );
}

export function GradientButton({
  className = "",
  gradient = "brand",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { gradient?: Gradient }) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${className}`}
      style={{ background: GRADIENTS[gradient], boxShadow: "var(--vui-shadow-blue)" }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GradientRule({ className = "" }: { className?: string }) {
  return <hr className={`vui-rule ${className}`} />;
}

/** Breadcrumb trail above a Vision UI page title. */
export function Breadcrumbs({ trail }: { trail: string[] }) {
  return (
    <p className="text-xs text-[var(--nos-text-secondary)]">
      {trail.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 && <span className="mx-1 opacity-50">/</span>}
          <span className={index === trail.length - 1 ? "text-white" : undefined}>{part}</span>
        </span>
      ))}
    </p>
  );
}
