"use client";

import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import { Badge } from "./Badge";
import type { SectionTldr } from "../lib/types";

interface SectionTLDRProps {
  tldr: SectionTldr;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function SectionTLDR({ tldr }: SectionTLDRProps) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <motion.div
        variants={itemVariants}
        className="relative overflow-hidden p-5"
        style={{
          background: "var(--vui-gradient-card)",
          backdropFilter: "blur(120px)",
          border: "1px solid var(--nos-accent-border)",
          borderRadius: "var(--vui-radius-card)",
        }}
      >
        <div
          className="absolute top-0 inset-x-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--nos-accent), var(--nos-accent-2), transparent)",
            opacity: 0.6,
          }}
        />
        <div className="flex gap-3">
          <div
            className="vui-tile mt-0.5"
            style={{ background: "var(--vui-gradient-brand)", width: 38, height: 38 }}
          >
            <Radar size={16} strokeWidth={2} />
          </div>
          <div>
            <p
              className="text-label-caps mb-2"
              style={{
                background: "linear-gradient(90deg, var(--nos-accent) 0%, var(--nos-accent-2) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              AI Channel Summary
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--nos-text-secondary)" }}>
              {tldr.summary}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <h3 className="text-label-caps mb-3">Recommended Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tldr.actions.map((action, i) => (
            <motion.div key={i} variants={itemVariants} className="nos-card flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug" style={{ color: "var(--nos-text-primary)" }}>
                  {action.title}
                </p>
                <Badge
                  className="text-[10px] shrink-0"
                  style={
                    action.priority === "high"
                      ? {
                          background: "rgba(227,26,26,0.15)",
                          color: "var(--nos-signal-hot)",
                          borderColor: "rgba(227,26,26,0.35)",
                        }
                      : {
                          background: "rgba(255,181,71,0.15)",
                          color: "var(--nos-signal-warm)",
                          borderColor: "rgba(255,181,71,0.35)",
                        }
                  }
                >
                  {capitalize(action.priority)}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--nos-text-muted)" }}>
                {action.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
