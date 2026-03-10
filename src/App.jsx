import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const DRAWING_STAGES = [
  { key: "civil_dwg", label: "Civil Dwg." },
  { key: "ga_dwg", label: "GA Dwg." },
  { key: "fab_dwg", label: "Fab. Dwg." },
  { key: "sheet_dwg", label: "Sheet Dwg." },
];
const DWG_STATES = ["none", "in_progress", "done"];
const DWG_LABELS = { none: "Not Started", in_progress: "In Progress", done: "Done" };
const nextDwgState = (c) => DWG_STATES[(DWG_STATES.indexOf(c || "none") + 1) % DWG_STATES.length];

const STATUS_OPTIONS = [
  { value: "Pending", desc: "Order confirmed, work not yet started." },
  { value: "In Progress", desc: "Active work — drawings, fabrication, or painting underway." },
  { value: "On Hold", desc: "Work paused — payment, design changes, or material issues." },
  { value: "Completed", desc: "All work done, not yet dispatched." },
  { value: "Dispatched", desc: "Material sent to site." },
];
const STATUS_VALUES = STATUS_OPTIONS.map((s) => s.value);
const PAINT_SUGGESTIONS = ["9002", "9006", "9010", "7026", "7035", "7040", "DA Grey", "Red Oxide"];

const sC = {
  Pending: { bg: "#3b1a1a", text: "#f87171", border: "#7f1d1d", glow: "#f8717133" },
  "In Progress": { bg: "#1a2e1a", text: "#4ade80", border: "#14532d", glow: "#4ade8033" },
  "On Hold": { bg: "#2e2a1a", text: "#fbbf24", border: "#713f12", glow: "#fbbf2433" },
  Completed: { bg: "#1a2332", text: "#60a5fa", border: "#1e3a5f", glow: "#60a5fa33" },
  Dispatched: { bg: "#1a1a2e", text: "#a78bfa", border: "#312e81", glow: "#a78bfa33" },
};

function dwgScore(s) { return s === "done" ? 1 : s === "in_progress" ? 0.5 : 0; }
function timeAgo(ts) {
  if (!ts) return "";
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (d < 10) return "just now"; if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d / 60) + "m ago"; if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}

async function fetchProjects() {
  const { data, error } = await supabase.from("projects").select("*").order("sn");
  if (error) { console.error(error); return []; }
  return data || [];
}

async function updateProject(id, updates) {
  const { error } = await supabase.from("projects").update(updates).eq("id", id);
  if (error) console.error(error);
}

async function insertProject(project) {
  const { error } = await supabase.from("projects").insert(project);
  if (error) console.error(error);
}

async function deleteProjectDB(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) console.error(error);
}

async function addLogEntry(entry) {
  const { error } = await supabase.from("activity_logs").insert({
    username: entry.user, role: entry.role, project: entry.project,
    action: entry.action, old_value: entry.from || "", new_value: entry.to || "",
  });
  if (error) console.error(error);
}

async function fetchLogs() {
  const { data, error } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { console.error(error); return []; }
  return data || [];
}

async function clearLogsDB() {
  const { error } = await supabase.from("activity_logs").delete().neq("id", 0);
  if (error) console.error(error);
}

async function fetchSettings() {
  const { data, error } = await supabase.from("settings").select("*");
  if (error) { console.error(error); return {}; }
  const s = {};
  (data || []).forEach((r) => { s[r.key] = r.value; });
  return s;
}

async function updateSetting(key, value) {
  const { error } = await supabase.from("settings").upsert({ key, value });
  if (error) console.error(error);
}

function ProgressBar({ project }) {
  const pct = (DRAWING_STAGES.reduce((a, d) => a + dwgScore(project[d.key]), 0) / DRAWING_STAGES.length) * 100;
  return (
    <div style={{ width: "100%", height: 6, background: "#1a2332", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: pct + "%", height: "100%", background: pct === 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : pct > 0 ? "#ef4444" : "#1a2332", borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );
}

function Badge({ status }) {
  const c = sC[status] || sC.Pending;
  return <span style={{ display: "inline-block", padding: "3px 9px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: c.text, background: c.bg, border: "1px solid " + c.border, borderRadius: 4, whiteSpace: "nowrap" }}>{status}</span>;
}

function DwgCell({ state, onChange, disabled }) {
  const s = state || "none";
  const cfg = { none: { border: "#334155", bg: "transparent", icon: null }, in_progress: { border: "#f59e0b", bg: "rgba(245,158,11,0.12)", icon: <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v5l3.5 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> }, done: { border: "#22c55e", bg: "rgba(34,197,94,0.15)", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> } }[s];
  return (
    <td style={{ textAlign: "center", cursor: disabled ? "default" : "pointer", padding: "8px 2px", opacity: disabled ? 0.7 : 1 }} onClick={disabled ? undefined : onChange} title={DWG_LABELS[s]}>
      <div style={{ width: 26, height: 26, margin: "0 auto", borderRadius: 5, border: "2px solid " + cfg.border, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>{cfg.icon}</div>
    </td>
  );
}

function PaintInput({ value, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value || "");
  const [showS, setShowS] = useState(false);
  useEffect(function() { setTemp(value || ""); }, [value]);
  const commit = function(v) { onChange(v); setEditing(false); setShowS(false); };
  const fl = PAINT_SUGGESTIONS.filter(function(p) { return p.toLowerCase().includes(temp.toLowerCase()); });
  if (!editing) return <td style={{ padding: "8px 5px", cursor: disabled ? "default" : "pointer", fontSize: 12, fontFamily: "'Space Mono',monospace", color: value ? "#e2e8f0" : "#475569" }} onClick={disabled ? undefined : function() { setTemp(value || ""); setEditing(true); setTimeout(function() { setShowS(true); }, 50); }}>{value || "\u2014"}</td>;
  return (
    <td style={{ padding: "4px 3px", position: "relative" }}>
      <input autoFocus value={temp} placeholder="Type..." onChange={function(e) { setTemp(e.target.value); setShowS(true); }} onFocus={function() { setShowS(true); }} onBlur={function() { setTimeout(function() { commit(temp); }, 200); }} onKeyDown={function(e) { if (e.key === "Enter") commit(temp); if (e.key === "Escape") { setEditing(false); setShowS(false); } }} style={{ width: "100%", padding: "5px 7px", background: "#0f1923", border: "1px solid #1e40af", borderRadius: 4, color: "#e2e8f0", fontSize: 12, fontFamily: "'Space Mono',monospace", outline: "none", boxSizing: "border-box", minWidth: 70 }} />
      {showS && fl.length > 0 && <div style={{ position: "absolute", top: "100%", left: 3, right: 3, background: "#0c1520", border: "1px solid #1e3a5f", borderRadius: 6, padding: 3, zIndex: 60, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxHeight: 150, overflowY: "auto" }}>{fl.map(function(p) { return <div key={p} onMouseDown={function(e) { e.preventDefault(); commit(p); }} style={{ padding: "5px 9px", fontSize: 12, cursor: "pointer", borderRadius: 4, color: "#cbd5e1", fontFamily: "'Space Mono',monospace" }} onMouseEnter={function(e) { e.currentTarget.style.background = "#1e293b"; }} onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>{p}</div>; })}</div>}
    </td>
  );
}

function DriveCell({ value, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value || "");
  useEffect(function() { setTemp(value || ""); }, [value]);
  var commit = function() { onChange(temp.trim()); setEditing(false); };
  if (editing) return <td style={{ padding: "4px 3px" }}><input autoFocus value={temp} placeholder="Paste link..." onChange={function(e) { setTemp(e.target.value); }} onBlur={commit} onKeyDown={function(e) { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} style={{ width: "100%", padding: "5px 7px", background: "#0f1923", border: "1px solid #1e40af", borderRadius: 4, color: "#e2e8f0", fontSize: 11, outline: "none", boxSizing: "border-box", minWidth: 90 }} /></td>;
  if (value) return <td style={{ padding: "8px 5px", textAlign: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}><a href={value} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 3, textDecoration: "none", color: "#4ade80", fontSize: 11, fontWeight: 600 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4.5 14.5L8 8l4 7H4.5z" fill="#0066DA"/><path d="M8 8l4 7h7.5L15.5 8H8z" fill="#00AC47"/><path d="M12 15H19.5l-3.5 6H8.5L12 15z" fill="#FFBA00"/></svg>Drive</a>{!disabled && <button onClick={function() { setTemp(value); setEditing(true); }} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 10, padding: "1px 3px" }}>&#9998;</button>}</div></td>;
  return <td style={{ padding: "8px 5px", textAlign: "center" }}>{disabled ? <span style={{ color: "#334155", fontSize: 10 }}>{"\u2014"}</span> : <button onClick={function() { setTemp(""); setEditing(true); }} style={{ background: "none", border: "1px dashed #1e293b", borderRadius: 4, color: "#334155", cursor: "pointer", fontSize: 10, padding: "3px 7px" }}>+ Link</button>}</td>;
}

function EditCell({ value, onChange, placeholder, cStyle, disabled }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  useEffect(function() { setTemp(value); }, [value]);
  if (editing && !disabled) return <td style={{ padding: "4px 3px" }}><input autoFocus value={temp} onChange={function(e) { setTemp(e.target.value); }} onBlur={function() { onChange(temp); setEditing(false); }} onKeyDown={function(e) { if (e.key === "Enter") { onChange(temp); setEditing(false); } if (e.key === "Escape") setEditing(false); }} style={Object.assign({ width: "100%", padding: "5px 7px", background: "#0f1923", border: "1px solid #1e40af", borderRadius: 4, color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }, cStyle)} /></td>;
  return <td style={Object.assign({ padding: "8px 6px", cursor: disabled ? "default" : "pointer", color: value ? "#e2e8f0" : "#475569", fontSize: 12 }, cStyle)} onClick={disabled ? undefined : function() { setTemp(value); setEditing(true); }}>{value || placeholder || "\u2014"}</td>;
}

function StatusDD({ cur, onSelect, onClose }) {
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, background: "#0c1520", border: "1px solid #1e3a5f", borderRadius: 8, padding: 5, zIndex: 50, minWidth: 260, boxShadow: "0 12px 36px rgba(0,0,0,0.6)" }}>
      {STATUS_OPTIONS.map(function(s) { var c = sC[s.value]; var a = cur === s.value; return (
        <div key={s.value} onClick={function() { onSelect(s.value); onClose(); }} style={{ padding: "8px 11px", cursor: "pointer", borderRadius: 5, background: a ? c.glow : "transparent", borderLeft: a ? "3px solid " + c.text : "3px solid transparent", marginBottom: 1 }} onMouseEnter={function(e) { if (!a) e.currentTarget.style.background = "#111d2b"; }} onMouseLeave={function(e) { if (!a) e.currentTarget.style.background = a ? c.glow : "transparent"; }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: c.text }} /><span style={{ fontSize: 12, fontWeight: 600, color: a ? c.text : "#cbd5e1" }}>{s.value}</span></div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, paddingLeft: 14 }}>{s.desc}</div>
        </div>
      ); })}
    </div>
  );
}

function LoginScreen({ onLogin, settings }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  var submit = function() {
    if (!name.trim()) { setErr("Enter your name"); return; }
    if (role === "editor" && code !== settings.editor_passcode) { setErr("Wrong editor passcode"); return; }
    if (role === "admin" && code !== settings.admin_passcode) { setErr("Wrong admin passcode"); return; }
    onLogin({ name: name.trim(), role: role });
  };
  var iS = { width: "100%", padding: "12px 14px", background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 8, color: "#e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: "#080e17", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 420, maxWidth: "94vw", background: "#0c1520", border: "1px solid #1e3a5f", borderRadius: 16, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e88" }} />
          <h1 style={{ margin: 0, fontSize: 22, fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#f1f5f9" }}>PEB Tracker</h1>
        </div>
        <p style={{ color: "#475569", fontSize: 13, marginBottom: 24, marginTop: 4 }}>Sign in to view or manage projects</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your Name</label>
            <input style={iS} placeholder="e.g. Rahul, Simran" value={name} onChange={function(e) { setName(e.target.value); setErr(""); }} onKeyDown={function(e) { if (e.key === "Enter") submit(); }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Access Level</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ value: "viewer", label: "Viewer", desc: "View only", icon: "\uD83D\uDC41", col: "#60a5fa" }, { value: "editor", label: "Editor", desc: "View + Edit", icon: "\u270F\uFE0F", col: "#4ade80" }, { value: "admin", label: "Admin", desc: "Full control", icon: "\u2699\uFE0F", col: "#f59e0b" }].map(function(r) { return (
                <div key={r.value} onClick={function() { setRole(r.value); setCode(""); setErr(""); }} style={{ flex: 1, padding: "12px 10px", borderRadius: 8, cursor: "pointer", border: role === r.value ? "1px solid " + r.col + "44" : "1px solid #1e293b", background: role === r.value ? r.col + "10" : "#0f1923", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 3 }}>{r.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: role === r.value ? r.col : "#cbd5e1" }}>{r.label}</div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{r.desc}</div>
                </div>
              ); })}
            </div>
          </div>
          {role !== "viewer" && (
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{role} Passcode</label>
              <input type="password" style={iS} placeholder="Enter passcode..." value={code} onChange={function(e) { setCode(e.target.value); setErr(""); }} onKeyDown={function(e) { if (e.key === "Enter") submit(); }} />
            </div>
          )}
          {err && <div style={{ color: "#f87171", fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <button onClick={submit} style={{ padding: "13px", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", background: name.trim() ? "#1e40af" : "#1e293b", color: name.trim() ? "#fff" : "#475569" }}>Enter Tracker</button>
        </div>
      </div>
    </div>
  );
}

function ActivityLogPanel({ logs, onClose }) {
  var grouped = {};
  logs.forEach(function(l) { var d = new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); if (!grouped[d]) grouped[d] = []; grouped[d].push(l); });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "flex-end", zIndex: 999, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ width: 400, maxWidth: "95vw", background: "#0c1520", borderLeft: "1px solid #1e3a5f", height: "100%", overflowY: "auto", padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, position: "sticky", top: 0, background: "#0c1520", paddingBottom: 8, zIndex: 2 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontFamily: "'Space Mono',monospace", color: "#f1f5f9" }}>Activity Log</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 20, cursor: "pointer" }}>{"\u00D7"}</button>
        </div>
        {logs.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#334155", fontSize: 13 }}>No activity yet.</div> : (
          Object.keys(grouped).map(function(date) { return (
            <div key={date} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "'Space Mono',monospace" }}>{date}</div>
              {grouped[date].map(function(log) {
                var rc = log.role === "admin" ? "#f59e0b" : log.role === "editor" ? "#22c55e" : "#60a5fa";
                return (
                  <div key={log.id} style={{ padding: "9px 11px", background: "#0f1923", borderRadius: 6, marginBottom: 3, borderLeft: "3px solid " + rc }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{log.username} <span style={{ fontSize: 9, color: rc, textTransform: "uppercase" }}>({log.role})</span></span>
                      <span style={{ fontSize: 9, color: "#334155", fontFamily: "'Space Mono',monospace" }}>{new Date(log.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      <span style={{ color: "#60a5fa", fontFamily: "'Space Mono',monospace", fontWeight: 600, fontSize: 10 }}>{log.project}</span>{" \u2014 "}{log.action}
                    </div>
                    {log.old_value && log.new_value && (
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2, fontFamily: "'Space Mono',monospace" }}>
                        <span style={{ color: "#ef4444" }}>{log.old_value}</span>{" \u2192 "}<span style={{ color: "#22c55e" }}>{log.new_value}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ); })
        )}
      </div>
    </div>
  );
}

function AdminPanel({ settings, onSaveSettings, logs, onClearLogs, projects, onClose }) {
  const [ep, setEp] = useState(settings.editor_passcode || "");
  const [ap, setAp] = useState(settings.admin_passcode || "");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("passcodes");
  var saveCodes = async function() {
    if (ep.trim().length < 4 || ap.trim().length < 4) { alert("Min 4 characters"); return; }
    await onSaveSettings(ep.trim(), ap.trim());
    setSaved(true); setTimeout(function() { setSaved(false); }, 2000);
  };
  var iS = { width: "100%", padding: "10px 12px", background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", fontSize: 14, fontFamily: "'Space Mono',monospace", outline: "none", boxSizing: "border-box" };
  var dwgDone = projects.reduce(function(a, p) { return a + DRAWING_STAGES.filter(function(d) { return p[d.key] === "done"; }).length; }, 0);
  var dwgTotal = projects.length * DRAWING_STAGES.length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ background: "#0c1520", border: "1px solid #1e3a5f", borderRadius: 14, width: 500, maxWidth: "94vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontFamily: "'Space Mono',monospace", color: "#f1f5f9" }}>{"\u2699\uFE0F"} Admin Panel</h3>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 22, cursor: "pointer" }}>{"\u00D7"}</button>
          </div>
          <div style={{ display: "flex" }}>
            {["passcodes", "overview", "danger"].map(function(t) { return (
              <button key={t} onClick={function() { setTab(t); }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, border: "none", borderBottom: tab === t ? "2px solid #60a5fa" : "2px solid transparent", background: "transparent", color: tab === t ? "#60a5fa" : "#475569", cursor: "pointer", textTransform: "capitalize" }}>{t === "danger" ? "Danger Zone" : t}</button>
            ); })}
          </div>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {tab === "passcodes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ padding: "14px 16px", background: "#0f1923", borderRadius: 8, border: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: 14 }}>
                <div><label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" }}>Editor Passcode</label><input style={iS} value={ep} onChange={function(e) { setEp(e.target.value); }} /></div>
                <div><label style={{ display: "block", fontSize: 11, color: "#64748b", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" }}>Admin Passcode</label><input style={iS} value={ap} onChange={function(e) { setAp(e.target.value); }} /></div>
              </div>
              <button onClick={saveCodes} style={{ padding: "11px", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", background: saved ? "#14532d" : "#1e40af", color: "#fff" }}>{saved ? "\u2713 Saved!" : "Save Passcodes"}</button>
            </div>
          )}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "14px 16px", background: "#0f1923", borderRadius: 8, border: "1px solid #1e293b" }}>
                <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 10, fontFamily: "'Space Mono',monospace" }}>Projects by Status</div>
                {STATUS_VALUES.map(function(s) { var c = sC[s]; var cnt = projects.filter(function(p) { return p.status === s; }).length; var pct = projects.length > 0 ? (cnt / projects.length) * 100 : 0; return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 90, fontSize: 12, color: c.text, fontWeight: 600 }}>{s}</div>
                    <div style={{ flex: 1, height: 8, background: "#1a2332", borderRadius: 4, overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: c.text, borderRadius: 4 }} /></div>
                    <div style={{ width: 24, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Space Mono',monospace" }}>{cnt}</div>
                  </div>
                ); })}
              </div>
              <div style={{ padding: "14px 16px", background: "#0f1923", borderRadius: 8, border: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: "#22c55e" }}>{dwgTotal > 0 ? Math.round((dwgDone / dwgTotal) * 100) : 0}%</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{dwgDone}/{dwgTotal} drawings done</div>
              </div>
            </div>
          )}
          {tab === "danger" && (
            <div style={{ padding: "14px 16px", background: "#1a0f0f", borderRadius: 8, border: "1px solid #7f1d1d" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>Clear Activity Log</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Remove all log entries. Cannot be undone.</div>
              <button onClick={function() { if (confirm("Clear all logs?")) onClearLogs(); }} style={{ padding: "8px 16px", background: "#7f1d1d", border: "none", borderRadius: 6, color: "#fca5a5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear Logs</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddModal({ onAdd, onClose, nextSn }) {
  const [f, sF] = useState({ project_no: "", location: "", paint_coating: "", job_no: "", remarks: "", drive_link: "" });
  var s = function(k, v) { sF(function(p) { var n = {}; for (var x in p) n[x] = p[x]; n[k] = v; return n; }); };
  var ok = f.project_no.trim() && f.location.trim();
  var go = function() { if (!ok) return; onAdd({ id: "p" + Date.now(), sn: nextSn, project_no: f.project_no, location: f.location, paint_coating: f.paint_coating, job_no: f.job_no, remarks: f.remarks, drive_link: f.drive_link, civil_dwg: "none", ga_dwg: "none", fab_dwg: "none", sheet_dwg: "none", status: "Pending" }); onClose(); };
  var iS = { width: "100%", padding: "10px 12px", background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" };
  var lS = { display: "block", fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 700, textTransform: "uppercase" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ background: "#0c1520", border: "1px solid #1e3a5f", borderRadius: 12, padding: 26, width: 420, maxWidth: "94vw" }}>
        <h3 style={{ margin: "0 0 18px", color: "#e2e8f0", fontSize: 17, fontFamily: "'Space Mono',monospace" }}>+ New Project</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lS}>Project No.</label><input style={iS} placeholder="PB-027" value={f.project_no} onChange={function(e) { s("project_no", e.target.value); }} /></div>
            <div style={{ flex: 1.5 }}><label style={lS}>Location</label><input style={iS} placeholder="Ludhiana" value={f.location} onChange={function(e) { s("location", e.target.value); }} /></div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lS}>Paint</label><input style={iS} placeholder="9002, DA Grey..." value={f.paint_coating} onChange={function(e) { s("paint_coating", e.target.value); }} /></div>
            <div style={{ flex: 1 }}><label style={lS}>Job No.</label><input style={iS} placeholder="J26-05" value={f.job_no} onChange={function(e) { s("job_no", e.target.value); }} /></div>
          </div>
          <div><label style={lS}>Google Drive Link</label><input style={iS} placeholder="Paste folder link..." value={f.drive_link} onChange={function(e) { s("drive_link", e.target.value); }} /></div>
          <div><label style={lS}>Remarks</label><input style={iS} placeholder="Notes..." value={f.remarks} onChange={function(e) { s("remarks", e.target.value); }} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "10px", border: "1px solid #334155", background: "transparent", color: "#94a3b8", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>Cancel</button>
            <button onClick={go} style={{ flex: 1, padding: "10px", border: "none", background: ok ? "#1e40af" : "#1e293b", color: ok ? "#fff" : "#475569", borderRadius: 6, cursor: ok ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 600 }}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [filter, setFilter] = useState("All");
  const [editStat, setEditStat] = useState(null);
  const [liveIndicator, setLiveIndicator] = useState(false);

  var canEdit = user && (user.role === "editor" || user.role === "admin");
  var isAdmin = user && user.role === "admin";

  var loadAll = useCallback(async function() {
    var p = await fetchProjects();
    var l = await fetchLogs();
    var s = await fetchSettings();
    setProjects(p); setLogs(l); setSettings(s); setLoading(false);
  }, []);

  useEffect(function() { loadAll(); }, [loadAll]);

  useEffect(function() {
    var channel = supabase.channel("projects-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, async function() {
        var p = await fetchProjects();
        setProjects(p);
        setLiveIndicator(true);
        setTimeout(function() { setLiveIndicator(false); }, 2000);
      })
      .subscribe();
    return function() { supabase.removeChannel(channel); };
  }, []);

  useEffect(function() {
    if (!editStat) return;
    var h = function(e) { if (!e.target.closest("[data-sd]")) setEditStat(null); };
    document.addEventListener("click", h); return function() { document.removeEventListener("click", h); };
  }, [editStat]);

  var log = useCallback(async function(entry) {
    var full = { user: user ? user.name : "?", role: user ? user.role : "viewer", project: entry.project, action: entry.action, from: entry.from || "", to: entry.to || "" };
    await addLogEntry(full);
    var l = await fetchLogs();
    setLogs(l);
  }, [user]);

  var cycleDwg = async function(id, key) {
    var p = projects.find(function(x) { return x.id === id; });
    var nv = nextDwgState(p[key]);
    await updateProject(id, Object.fromEntries([[key, nv]]));
    setProjects(function(prev) { return prev.map(function(x) { if (x.id === id) { var n = {}; for (var k in x) n[k] = x[k]; n[key] = nv; return n; } return x; }); });
    log({ project: p.project_no, action: DRAWING_STAGES.find(function(s) { return s.key === key; }).label, from: DWG_LABELS[p[key] || "none"], to: DWG_LABELS[nv] });
  };

  var upField = async function(id, key, val, label) {
    var p = projects.find(function(x) { return x.id === id; });
    if (p[key] === val) return;
    await updateProject(id, Object.fromEntries([[key, val]]));
    setProjects(function(prev) { return prev.map(function(x) { if (x.id === id) { var n = {}; for (var k in x) n[k] = x[k]; n[key] = val; return n; } return x; }); });
    log({ project: p.project_no, action: label || key, from: p[key] || "", to: val || "" });
  };

  var addProj = async function(p) {
    await insertProject(p);
    setProjects(function(prev) { return prev.concat([p]); });
    log({ project: p.project_no, action: "New project added" });
  };

  var delProj = async function(id) {
    var p = projects.find(function(x) { return x.id === id; });
    if (!confirm("Remove " + p.project_no + "?")) return;
    await deleteProjectDB(id);
    setProjects(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    log({ project: p.project_no, action: "Project removed" });
  };

  var saveSettings2 = async function(ep, ap) {
    await updateSetting("editor_passcode", ep);
    await updateSetting("admin_passcode", ap);
    setSettings(function(s) { return { editor_passcode: ep, admin_passcode: ap }; });
    log({ project: "SYSTEM", action: "Passcodes updated" });
  };

  var clearLogs2 = async function() { await clearLogsDB(); setLogs([]); };

  var filtered = filter === "All" ? projects : projects.filter(function(p) { return p.status === filter; });
  var stats = {
    total: projects.length,
    done: projects.filter(function(p) { return p.status === "Completed" || p.status === "Dispatched"; }).length,
    active: projects.filter(function(p) { return p.status === "In Progress"; }).length,
    wait: projects.filter(function(p) { return p.status === "Pending" || p.status === "On Hold"; }).length
  };
  var nextSn = projects.length > 0 ? Math.max.apply(null, projects.map(function(p) { return p.sn || 0; })) + 1 : 1;

  if (loading) return <div style={{ minHeight: "100vh", background: "#080e17", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "#64748b", fontFamily: "'Space Mono',monospace", fontSize: 14 }}>Loading...</div></div>;
  if (!user) return <LoginScreen onLogin={setUser} settings={settings} />;

  return (
    <div style={{ minHeight: "100vh", background: "#080e17", color: "#e2e8f0" }}>
      <div style={{ background: "linear-gradient(180deg,#0c1a2a 0%,#080e17 100%)", borderBottom: "1px solid #1e293b", padding: "14px 18px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: liveIndicator ? "#f59e0b" : "#22c55e", boxShadow: "0 0 8px " + (liveIndicator ? "#f59e0b88" : "#22c55e88"), transition: "all 0.3s" }} />
              <h1 style={{ margin: 0, fontSize: 19, fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#f1f5f9" }}>PEB Project Tracker</h1>
              {liveIndicator && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>LIVE UPDATE</span>}
            </div>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "'Space Mono',monospace" }}>
              <span style={{ color: isAdmin ? "#f59e0b" : canEdit ? "#4ade80" : "#60a5fa" }}>{user.name} ({user.role})</span>
              <span style={{ color: "#1e293b", margin: "0 6px" }}>{"\u00B7"}</span>
              <span style={{ color: "#22c55e" }}>{"\u25CF"} Real-time sync active</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button onClick={async function() { var l = await fetchLogs(); setLogs(l); setShowLog(true); }} style={{ padding: "7px 10px", background: "transparent", border: "1px solid #1e293b", borderRadius: 6, color: "#64748b", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              Log {logs.length > 0 && <span style={{ background: "#1e40af", color: "#fff", fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 7 }}>{logs.length}</span>}
            </button>
            {isAdmin && <button onClick={function() { setShowAdmin(true); }} style={{ padding: "7px 10px", background: "transparent", border: "1px solid #713f12", borderRadius: 6, color: "#f59e0b", fontSize: 11, cursor: "pointer" }}>{"\u2699\uFE0F"} Admin</button>}
            {canEdit && <button onClick={function() { setShowAdd(true); }} style={{ padding: "7px 12px", background: "#1e40af", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 15 }}>+</span> Add</button>}
            <button onClick={function() { setUser(null); }} style={{ padding: "7px 10px", background: "transparent", border: "1px solid #1e293b", borderRadius: 6, color: "#475569", fontSize: 11, cursor: "pointer" }}>Logout</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {[{ l: "Total", v: stats.total, c: "#64748b" }, { l: "Active", v: stats.active, c: "#22c55e" }, { l: "Pending", v: stats.wait, c: "#f59e0b" }, { l: "Done", v: stats.done, c: "#60a5fa" }].map(function(s) { return (
            <div key={s.l} style={{ padding: "6px 11px", background: "#0f1923", border: "1px solid #1e293b", borderRadius: 6, minWidth: 55 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: s.c, fontFamily: "'Space Mono',monospace" }}>{s.v}</div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
            </div>
          ); })}
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 10, flexWrap: "wrap" }}>
          {["All"].concat(STATUS_VALUES).map(function(s) { return (
            <button key={s} onClick={function() { setFilter(s); }} style={{ padding: "4px 9px", fontSize: 10, fontWeight: 600, border: filter === s ? "1px solid #1e40af" : "1px solid #1e293b", background: filter === s ? "#1e40af22" : "transparent", color: filter === s ? "#60a5fa" : "#475569", borderRadius: 4, cursor: "pointer", textTransform: "uppercase" }}>{s}</button>
          ); })}
        </div>
        {!canEdit && <div style={{ marginTop: 8, padding: "5px 10px", background: "#1e293b33", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11, color: "#64748b" }}>{"\uD83D\uDD12"} View-only {"\u00B7"} Updates appear in real-time</div>}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 1px", minWidth: 960, fontSize: 12 }}>
          <thead>
            <tr>
              {[{ h: "#", w: 30, a: "center" }, { h: "Project" }, { h: "Civil", a: "center" }, { h: "GA", a: "center" }, { h: "Fab.", a: "center" }, { h: "Sheet", a: "center" }, { h: "Progress" }, { h: "Paint" }, { h: "Status" }, { h: "Job No." }, { h: "Drive", a: "center" }, { h: "Remarks", mW: 90 }].concat(canEdit ? [{ h: "", w: 26 }] : []).map(function(c, i) { return (
                <th key={c.h + i} style={{ padding: "10px 4px", textAlign: c.a || "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", borderBottom: "1px solid #1e293b", fontFamily: "'Space Mono',monospace", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#080e17", zIndex: 2, width: c.w || undefined, minWidth: c.mW || undefined }}>{c.h}</th>
              ); })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={canEdit ? 13 : 12} style={{ textAlign: "center", padding: 36, color: "#334155" }}>No projects.</td></tr>}
            {filtered.map(function(p, i) { return (
              <tr key={p.id} style={{ background: "transparent", transition: "background 0.15s" }}
                onMouseEnter={function(e) { e.currentTarget.style.background = "#0c1520"; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = "transparent"; }}>
                <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 10, color: "#334155", fontFamily: "'Space Mono',monospace" }}>{p.sn || i + 1}</td>
                <td style={{ padding: "8px 4px", whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, fontFamily: "'Space Mono',monospace", color: "#f1f5f9" }}>{p.project_no}</div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{p.location}</div>
                </td>
                {DRAWING_STAGES.map(function(d) { return <DwgCell key={d.key} state={p[d.key]} onChange={function() { cycleDwg(p.id, d.key); }} disabled={!canEdit} />; })}
                <td style={{ padding: "8px 4px", minWidth: 48 }}>
                  <ProgressBar project={p} />
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 2, textAlign: "center", fontFamily: "'Space Mono',monospace" }}>{DRAWING_STAGES.filter(function(d) { return p[d.key] === "done"; }).length}/{DRAWING_STAGES.length}</div>
                </td>
                <PaintInput value={p.paint_coating} onChange={function(v) { upField(p.id, "paint_coating", v, "Paint"); }} disabled={!canEdit} />
                <td style={{ padding: "8px 4px", position: "relative" }} data-sd="1">
                  <div onClick={canEdit ? function(e) { e.stopPropagation(); setEditStat(editStat === p.id ? null : p.id); } : undefined} style={{ cursor: canEdit ? "pointer" : "default" }}><Badge status={p.status} /></div>
                  {editStat === p.id && canEdit && <StatusDD cur={p.status} onSelect={function(v) { upField(p.id, "status", v, "Status"); }} onClose={function() { setEditStat(null); }} />}
                </td>
                <EditCell value={p.job_no} onChange={function(v) { upField(p.id, "job_no", v, "Job No."); }} placeholder={"\u2014"} disabled={!canEdit} cStyle={{ fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }} />
                <DriveCell value={p.drive_link} onChange={function(v) { upField(p.id, "drive_link", v, "Drive link"); }} disabled={!canEdit} />
                <EditCell value={p.remarks} onChange={function(v) { upField(p.id, "remarks", v, "Remarks"); }} placeholder={canEdit ? "Add..." : "\u2014"} disabled={!canEdit} cStyle={{ fontSize: 11, color: "#94a3b8", minWidth: 90 }} />
                {canEdit && <td style={{ padding: "8px 3px", textAlign: "center" }}><button onClick={function() { delProj(p.id); }} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 15, padding: "2px 4px", borderRadius: 4 }} onMouseEnter={function(e) { e.currentTarget.style.color = "#ef4444"; }} onMouseLeave={function(e) { e.currentTarget.style.color = "#334155"; }}>{"\u00D7"}</button></td>}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "12px 18px", textAlign: "center", fontSize: 10, color: "#1e293b", fontFamily: "'Space Mono',monospace" }}>
        Real-time sync powered by Supabase {"\u00B7"} Changes appear instantly for all users
      </div>

      {showAdd && canEdit && <AddModal onAdd={addProj} onClose={function() { setShowAdd(false); }} nextSn={nextSn} />}
      {showLog && <ActivityLogPanel logs={logs} onClose={function() { setShowLog(false); }} />}
      {showAdmin && isAdmin && <AdminPanel settings={settings} onSaveSettings={saveSettings2} logs={logs} onClearLogs={clearLogs2} projects={projects} onClose={function() { setShowAdmin(false); }} />}
    </div>
  );
}
```

**Paste ALL of this** into the `src/App.jsx` file on GitHub and click **Commit changes**.

After committing, your GitHub repository should show these 7 files:
```
index.html
package.json
vite.config.js
src/
  App.jsx
  index.css
  main.jsx
  supabase.js
