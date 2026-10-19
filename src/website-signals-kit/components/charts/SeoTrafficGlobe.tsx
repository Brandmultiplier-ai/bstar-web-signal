"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { geoOrthographic, geoPath, geoGraticule10, type GeoSphere } from "d3-geo";
import type { CountryRow } from "../../lib/types";

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const MAX_DPR = 1.25;
const SPIN_MS = 80; // ~12fps idle spin — smooth enough, much lighter than 60fps
/**
 * world-atlas identifies countries by ISO 3166-1 numeric code, while our
 * traffic rows are keyed by alpha-2, so a landmass can only be tinted if it
 * appears here. Covers the countries that realistically show up in web
 * analytics; anything missing still gets its marker plotted, just no fill.
 */
const ISO_NUM_TO_ALPHA2: Record<string, string> = {
  "004": "AF", "008": "AL", "012": "DZ", "024": "AO", "032": "AR", "036": "AU",
  "040": "AT", "050": "BD", "051": "AM", "056": "BE", "064": "BT", "068": "BO",
  "070": "BA", "072": "BW", "076": "BR", "084": "BZ", "096": "BN", "100": "BG",
  "104": "MM", "108": "BI", "112": "BY", "116": "KH", "120": "CM", "124": "CA",
  "140": "CF", "144": "LK", "148": "TD", "152": "CL", "156": "CN", "170": "CO",
  "178": "CG", "180": "CD", "188": "CR", "191": "HR", "192": "CU", "196": "CY",
  "203": "CZ", "204": "BJ", "208": "DK", "214": "DO", "218": "EC", "222": "SV",
  "226": "GQ", "231": "ET", "232": "ER", "233": "EE", "242": "FJ", "246": "FI",
  "250": "FR", "262": "DJ", "266": "GA", "268": "GE", "270": "GM", "276": "DE",
  "288": "GH", "300": "GR", "320": "GT", "324": "GN", "328": "GY", "332": "HT",
  "340": "HN", "348": "HU", "352": "IS", "356": "IN", "360": "ID", "364": "IR",
  "368": "IQ", "372": "IE", "376": "IL", "380": "IT", "384": "CI", "388": "JM",
  "392": "JP", "398": "KZ", "400": "JO", "404": "KE", "408": "KP", "410": "KR",
  "414": "KW", "417": "KG", "418": "LA", "422": "LB", "426": "LS", "428": "LV",
  "430": "LR", "434": "LY", "440": "LT", "442": "LU", "450": "MG", "454": "MW",
  "458": "MY", "466": "ML", "478": "MR", "480": "MU", "484": "MX", "496": "MN",
  "498": "MD", "499": "ME", "504": "MA", "508": "MZ", "512": "OM", "516": "NA",
  "524": "NP", "528": "NL", "540": "NC", "554": "NZ", "558": "NI", "562": "NE",
  "566": "NG", "578": "NO", "586": "PK", "591": "PA", "598": "PG", "600": "PY",
  "604": "PE", "608": "PH", "616": "PL", "620": "PT", "624": "GW", "626": "TL",
  "630": "PR", "634": "QA", "642": "RO", "643": "RU", "646": "RW", "682": "SA",
  "686": "SN", "688": "RS", "694": "SL", "702": "SG", "703": "SK", "704": "VN",
  "705": "SI", "706": "SO", "710": "ZA", "716": "ZW", "724": "ES", "728": "SS",
  "729": "SD", "740": "SR", "748": "SZ", "752": "SE", "756": "CH", "760": "SY",
  "762": "TJ", "764": "TH", "768": "TG", "780": "TT", "788": "TN", "792": "TR",
  "795": "TM", "800": "UG", "804": "UA", "818": "EG", "826": "GB", "834": "TZ",
  "840": "US", "854": "BF", "858": "UY", "860": "UZ", "862": "VE", "887": "YE",
  "894": "ZM",
};

function topoFeatures(topo: {
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: { countries: { geometries: { type: string; id?: string | number; arcs: number[][] | number[][][] }[] } };
}): GeoJSON.Feature[] {
  const { transform, arcs: topoArcs, objects } = topo;
  const [sx, sy] = transform?.scale ?? [1, 1];
  const [tx, ty] = transform?.translate ?? [0, 0];

  function decodeArc(arcIdx: number): number[][] {
    const arc = topoArcs[arcIdx < 0 ? ~arcIdx : arcIdx];
    let x = 0, y = 0;
    const pts = arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
    return arcIdx < 0 ? pts.reverse() : pts;
  }

  function stitchArcs(rings: number[][]): number[][][] {
    return rings.map((ring) => ring.flatMap((i) => decodeArc(i)));
  }

  return objects.countries.geometries.map((geom) => ({
    type: "Feature" as const,
    id: geom.id,
    properties: { id: geom.id },
    geometry:
      geom.type === "Polygon"
        ? { type: "Polygon" as const, coordinates: stitchArcs(geom.arcs as number[][]) }
        : { type: "MultiPolygon" as const, coordinates: (geom.arcs as number[][][]).map((rings) => stitchArcs(rings)) },
  }));
}

interface SeoTrafficGlobeProps {
  countries: CountryRow[];
  activeCode?: string | null;
  onCountryHover?: (code: string | null) => void;
  onCountrySelect?: (code: string | null) => void;
  /**
   * Upper bound on the rendered square. The globe otherwise fills the width of
   * its card, so this is what stops a wide bento cell from producing a globe
   * taller than the row beside it.
   */
  maxSize?: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtChange(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : String(abs);
  return `${n >= 0 ? "+" : "−"}${s}`;
}

export const SeoTrafficGlobe = memo(function SeoTrafficGlobe({
  countries,
  activeCode,
  onCountryHover,
  onCountrySelect,
  maxSize = 560,
}: SeoTrafficGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const worldFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const rotation = useRef<[number, number]>([-20, -20]);
  const isDragging = useRef(false);
  const isVisible = useRef(true);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafDrag = useRef<number | null>(null);
  const tooltipRef = useRef<{ country: CountryRow; x: number; y: number } | null>(null);
  const hoverThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ country: CountryRow; x: number; y: number } | null>(null);

  const countryMapRef = useRef(new Map<string, CountryRow>());
  const maxTrafficRef = useRef(1);

  useEffect(() => {
    tooltipRef.current = tooltip;
  }, [tooltip]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !worldFeaturesRef.current.length) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const size = Math.min(W, H);

    // The card behind the canvas is translucent navy, so paint the same base
    // rather than clearing to transparent (the context is alpha: false).
    ctx.fillStyle = "#070c22";
    ctx.fillRect(0, 0, W, H);

    const proj = geoOrthographic()
      .rotate([rotation.current[0], rotation.current[1], 0])
      .translate([W / 2, H / 2])
      .scale(size / 2.15)
      .clipAngle(90);

    const path = geoPath(proj, ctx);
    const radius = size / 2.15;

    // Outer atmosphere glow, the halo around the Vision UI globe.
    const halo = ctx.createRadialGradient(
      W / 2,
      H / 2,
      radius * 0.9,
      W / 2,
      H / 2,
      radius * 1.35,
    );
    halo.addColorStop(0, "rgba(33,212,253,0.20)");
    halo.addColorStop(1, "rgba(33,212,253,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    const sphere: GeoSphere = { type: "Sphere" };
    ctx.beginPath();
    path(sphere);
    // Lit from the upper left so the sphere reads as a globe, not a disc.
    const body = ctx.createRadialGradient(
      W / 2 - radius * 0.35,
      H / 2 - radius * 0.35,
      radius * 0.1,
      W / 2,
      H / 2,
      radius,
    );
    body.addColorStop(0, "#14205a");
    body.addColorStop(1, "#060a1e");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "rgba(33,212,253,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = "rgba(33,212,253,0.12)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const maxTraffic = maxTrafficRef.current;
    const countryMap = countryMapRef.current;

    for (const feature of worldFeaturesRef.current) {
      const numId = String(feature.id).padStart(3, "0");
      const alpha2 = ISO_NUM_TO_ALPHA2[numId];
      const countryData = alpha2 ? countryMap.get(alpha2) : null;

      ctx.beginPath();
      path(feature);

      if (countryData) {
        const t = countryData.traffic / maxTraffic;
        const growing =
          countryData.trafficChange === null ? null : countryData.trafficChange >= 0;
        ctx.fillStyle =
          growing === null
            ? `rgba(0,117,255,${0.25 + t * 0.5})`
            : growing
              ? `rgba(1,181,116,${0.25 + t * 0.5})`
              : `rgba(227,26,26,${0.2 + t * 0.45})`;
        ctx.strokeStyle =
          growing === null
            ? "rgba(0,117,255,0.7)"
            : growing
              ? "rgba(53,239,161,0.7)"
              : "rgba(227,26,26,0.65)";
        ctx.lineWidth = 0.7;
      } else {
        // Unattributed landmass: faint blue-white, close to the particle wash
        // in the Vision UI globe.
        ctx.fillStyle = "rgba(160,174,192,0.16)";
        ctx.strokeStyle = "rgba(160,174,192,0.3)";
        ctx.lineWidth = 0.4;
      }

      ctx.fill();
      ctx.stroke();
    }

    // Markers
    for (const c of countries) {
      const projected = proj([c.lon, c.lat]);
      if (!projected) continue;
      const [x, y] = projected;
      const cosAngle =
        Math.cos((c.lat * Math.PI) / 180) *
        Math.cos(((c.lon - -rotation.current[0]) * Math.PI) / 180);
      if (cosAngle < 0.15) continue;

      const growing = c.trafficChange === null ? null : c.trafficChange >= 0;
      const r = 3 + (c.traffic / maxTraffic) * 5;
      const isActive = activeCode === c.code;
      const dot = growing === null ? "0,117,255" : growing ? "53,239,161" : "227,26,26";

      // Soft bloom under each marker so the dots glow off the dark sphere.
      const bloom = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      bloom.addColorStop(0, `rgba(${dot},0.45)`);
      bloom.addColorStop(1, `rgba(${dot},0)`);
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = bloom;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${dot},1)`;
      ctx.fill();
      if (isActive) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [countries, activeCode]);

  const startSpin = useCallback(() => {
    if (spinTimer.current) return;
    spinTimer.current = setInterval(() => {
      if (!isVisible.current || isDragging.current || tooltipRef.current) return;
      rotation.current[0] += 0.35;
      draw();
    }, SPIN_MS);
  }, [draw]);

  const stopSpin = useCallback(() => {
    if (spinTimer.current) {
      clearInterval(spinTimer.current);
      spinTimer.current = null;
    }
  }, []);

  // Load map once
  useEffect(() => {
    let cancelled = false;
    fetch(WORLD_URL)
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return;
        worldFeaturesRef.current = topoFeatures(topo);
        setLoading(false);
        draw();
        startSpin();
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [draw, startSpin]);

  // Pause when off-screen or tab hidden
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible.current = entry.isIntersecting;
        if (entry.isIntersecting) startSpin();
        else stopSpin();
      },
      { threshold: 0.1 }
    );
    io.observe(el);

    const onVis = () => {
      if (document.hidden) stopSpin();
      else if (isVisible.current) startSpin();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      stopSpin();
      if (rafDrag.current) cancelAnimationFrame(rafDrag.current);
    };
  }, [startSpin, stopSpin]);

  // Resize — cap DPR for performance
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      // The element is width-constrained by the card and capped by maxSize, so
      // its own measured width is the square's side.
      const size = Math.max(Math.min(rect.width, maxSize), 1);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.height = `${size}px`;
      draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [draw, maxSize]);

  useEffect(() => {
    countryMapRef.current = new Map(countries.map((c) => [c.code, c]));
    maxTrafficRef.current = Math.max(...countries.map((c) => c.traffic), 1);
    draw();
  }, [countries, draw, activeCode]);

  const getHitCountry = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    const maxTraffic = maxTrafficRef.current;

    for (const c of countries) {
      const proj = geoOrthographic()
        .rotate([rotation.current[0], rotation.current[1], 0])
        .translate([canvas.width / 2, canvas.height / 2])
        .scale(canvas.width / 2.15)
        .clipAngle(90);
      const projected = proj([c.lon, c.lat]);
      if (!projected) continue;
      const dx = projected[0] - x;
      const dy = projected[1] - y;
      const r = 3 + (c.traffic / maxTraffic) * 5 + 10;
      if (dx * dx + dy * dy < r * r) return c;
    }
    return null;
  }, [countries]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging.current) {
        if (!lastPos.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved.current = true;
        rotation.current[0] += dx * 0.35;
        rotation.current[1] = Math.max(-55, Math.min(55, rotation.current[1] - dy * 0.35));
        lastPos.current = { x: e.clientX, y: e.clientY };

        if (rafDrag.current) cancelAnimationFrame(rafDrag.current);
        rafDrag.current = requestAnimationFrame(draw);
        return;
      }

      if (hoverThrottle.current) return;
      hoverThrottle.current = setTimeout(() => { hoverThrottle.current = null; }, 40);

      const hit = getHitCountry(e.clientX, e.clientY);
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (hit && rect) {
        setTooltip({ country: hit, x: e.clientX - rect.left, y: e.clientY - rect.top });
        onCountryHover?.(hit.code);
      } else {
        setTooltip(null);
        onCountryHover?.(null);
      }
    },
    [draw, getHitCountry, onCountryHover]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
    stopSpin();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isDragging.current = false;
    if (!hasMoved.current) {
      const hit = getHitCountry(e.clientX, e.clientY);
      if (hit) onCountrySelect?.(hit.code);
    }
    lastPos.current = null;
    if (isVisible.current) startSpin();
  };

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      {loading && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl"
          style={{ background: "rgba(7,12,34,0.7)" }}
        >
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--nos-accent-border)", borderTopColor: "var(--nos-accent-2)" }}
          />
          <p className="text-xs" style={{ color: "var(--nos-text-secondary)" }}>
            Loading map...
          </p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="mx-auto block w-full rounded-2xl"
        style={{
          cursor: isDragging.current ? "grabbing" : "grab",
          aspectRatio: "1/1",
          maxWidth: maxSize,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          isDragging.current = false;
          setTooltip(null);
          onCountryHover?.(null);
          if (isVisible.current) startSpin();
        }}
      />

      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 px-3 py-2.5 rounded-xl text-center transition-opacity duration-150"
          style={{
            left: Math.min(tooltip.x + 12, 260),
            top: Math.max(tooltip.y - 72, 8),
            background: "var(--vui-gradient-card)",
            backdropFilter: "blur(120px)",
            border: "1px solid var(--nos-accent-border)",
            boxShadow: "0 20px 27px rgba(0,0,0,0.55)",
            minWidth: 160,
          }}
        >
          <p className="text-lg leading-none mb-0.5">{tooltip.country.flag}</p>
          <p className="text-xs font-semibold" style={{ color: "var(--nos-text-primary)" }}>{tooltip.country.name}</p>
          <p className="text-sm font-bold mt-1" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--nos-text-primary)" }}>
            {fmt(tooltip.country.traffic)}
          </p>
          {tooltip.country.trafficChange !== null && (
            <p
              className="text-[10px] font-bold"
              style={{
                color:
                  tooltip.country.trafficChange >= 0
                    ? "var(--nos-positive)"
                    : "var(--nos-negative)",
              }}
            >
              {fmtChange(tooltip.country.trafficChange)}
            </p>
          )}
          <p className="text-[9px] mt-1" style={{ color: "var(--nos-text-muted)" }}>Drag to rotate</p>
        </div>
      )}
    </div>
  );
});
