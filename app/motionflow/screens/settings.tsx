import { useState } from "react";
import {
  AppChrome,
  Button,
  Glass,
  IconChevron,
  IconPlus,
  type NavKey,
} from "../primitives";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 8 }}>{label.toUpperCase()}</div>
    <input
      defaultValue={value}
      style={{
        width: "100%", padding: "11px 14px", borderRadius: 10,
        background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)",
        color: "var(--ink-0)", fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box",
      }}
    />
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: "1px solid var(--line)" }}>
    <div style={{ fontSize: 13, color: "var(--ink-1)" }}>{label}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" }}>
      {value} <IconChevron size={12} style={{ color: "var(--ink-3)" }}/>
    </div>
  </div>
);

export const SettingsScreen = ({ onNav }: { onNav?: (k: NavKey) => void }) => {
  const [section, setSection] = useState("workspace");
  const sections = [
    { k: "workspace", t: "Workspace" },
    { k: "brand",     t: "Brand kit" },
    { k: "members",   t: "Members" },
    { k: "billing",   t: "Billing" },
    { k: "render",    t: "Render defaults" },
    { k: "api",       t: "API & integrations" },
  ];

  return (
    <AppChrome
      active="settings"
      onNav={onNav}
      project="Settings"
      right={<Button variant="primary" size="sm">Save changes</Button>}
    >
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", padding: "48px 56px 80px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 12 }}>SETTINGS</div>
          <h1 className="mf-h1" style={{ margin: 0, fontSize: 40 }}>Workspace & defaults</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 40 }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sections.map((s) => (
              <button
                key={s.k}
                onClick={() => setSection(s.k)}
                style={{
                  padding: "10px 14px", borderRadius: 10, textAlign: "left", fontFamily: "inherit",
                  background: section === s.k ? "rgba(122,162,255,0.06)" : "transparent",
                  border: `1px solid ${section === s.k ? "rgba(122,162,255,0.25)" : "transparent"}`,
                  color: section === s.k ? "var(--ink-0)" : "var(--ink-2)",
                  fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 200ms",
                }}
              >
                {s.t}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Glass style={{ padding: 28 }}>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>Workspace</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>How your team appears across MotionFlow.</div>
              </div>
              <Field label="Workspace name" value="Lattice"/>
              <Field label="Workspace URL" value="motionflow.ai/lattice"/>
              <Row label="Default style preset" value="Linear · 4K · 24fps"/>
            </Glass>

            <Glass style={{ padding: 28 }}>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>Brand defaults</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>Applied to every new project.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 8 }}>PRIMARY</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["#7AA2FF", "#A78BFA", "#67E8F9", "#F472B6", "#FCD34D"].map((c, i) => (
                      <div
                        key={c}
                        style={{
                          width: 30, height: 30, borderRadius: 8, background: c,
                          border: i === 0 ? "2px solid white" : "1px solid var(--line)",
                          boxShadow: i === 0 ? `0 0 12px ${c}80` : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 8 }}>TYPEFACE</div>
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    Geist · Sans <IconChevron size={12} style={{ color: "var(--ink-3)" }}/>
                  </div>
                </div>
              </div>
            </Glass>

            <Glass style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>Members</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>4 active · Pro plan</div>
                </div>
                <Button variant="ghost" size="sm" icon={<IconPlus size={12}/>}>Invite</Button>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[
                  { n: "Eden Lavi", e: "eden@lattice.com",  r: "Owner" },
                  { n: "Maya Kim",  e: "maya@lattice.com",  r: "Editor" },
                  { n: "Nadav Ben", e: "nadav@lattice.com", r: "Editor" },
                  { n: "Roi Cohen", e: "roi@lattice.com",   r: "Viewer" },
                ].map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, oklch(0.72 0.18 ${230 + i * 30}), oklch(0.55 0.18 ${280 + i * 20}))`, display: "grid", placeItems: "center", color: "white", fontSize: 11, fontWeight: 600 }}>
                      {m.n.split(" ").map((x) => x[0]).join("")}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.n}</div>
                      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", marginTop: 2 }}>{m.e}</div>
                    </div>
                    <span className="mf-pill" style={{ padding: "3px 10px", fontSize: 11 }}>{m.r}</span>
                  </div>
                ))}
              </div>
            </Glass>
          </div>
        </div>
      </div>
    </AppChrome>
  );
};
