# Website Signals Kit

Standalone drop-in package for the **Website Signals** UI from NOS:
Clarity-style behavioral KPIs, interactive traffic globe, session recordings, conversion funnel, and company signal feed.

Extracted from `components/sections/WebsiteSignals.tsx` + `SeoTrafficGlobe.tsx`. Relative imports only — no `@/` aliases.

---

## Install peer dependencies

```bash
npm install framer-motion lucide-react d3-geo recharts
npm install -D @types/d3-geo
```

Also needs **React 18+**, **Tailwind CSS** (v3 or v4), and a client-component environment (Next.js `"use client"` already set).

---

## Copy into your project

```text
your-app/
  website-signals-kit/   ← this entire folder
```

Or rename / move pieces as you like. Entry point: `index.ts`.

---

## Wire up styles

Import tokens once (e.g. in `app/globals.css` or root layout CSS):

```css
@import "./website-signals-kit/styles/tokens.css";
```

Set page background to the canvas token:

```css
body {
  background: var(--nos-bg-canvas);
  color: var(--nos-text-primary);
}
```

Optional fonts — map Geist (or any stack) to the CSS variables in `tokens.css`:

```css
:root {
  --font-geist-sans: var(--font-your-sans);
  --font-geist-mono: var(--font-your-mono);
}
```

---

## Minimal usage

```tsx
"use client";

import { WebsiteSignals, sampleWebsiteData } from "./website-signals-kit";

export default function Page() {
  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <WebsiteSignals data={sampleWebsiteData} />
    </main>
  );
}
```

Replace `sampleWebsiteData` with your own object matching `WebsiteData` (`lib/types.ts`).

---

## Globe only

```tsx
import { SeoTrafficGlobe } from "./website-signals-kit";
import type { CountryRow } from "./website-signals-kit";

<SeoTrafficGlobe
  countries={countries}
  activeCode={active}
  onCountryHover={setHovered}
  onCountrySelect={setActive}
/>
```

---

## Folder map

| Path | Role |
|---|---|
| `styles/tokens.css` | Colors, `.nos-card`, typography utilities |
| `lib/types.ts` | `WebsiteData` + related interfaces |
| `lib/sample-data.ts` | Ready-to-render fixture |
| `components/WebsiteSignals.tsx` | Full section layout |
| `components/charts/SeoTrafficGlobe.tsx` | Orthographic canvas globe |
| `components/KPICard.tsx` | Clarity behavioral KPI cards |
| `components/DashboardCard.tsx` | Titled card shell + info button |
| `index.ts` | Public exports |

---

## Design DNA (quick)

- Canvas `#050507` · cards `#0C0C10` · radius **14px** · padding **20×24**
- Accent `#7C7FFF` / `#A78BFA`
- Growing geo = emerald · declining = red
- Bar ease `[0.16, 1, 0.3, 1]`
- Globe: idle spin 0.35° / 80ms, drag ×0.35, lat clamp ±55°, max 480px

Phase 3 narrative KPI from the original app is omitted (app-specific). Everything else from the Website Signals section is included.
