import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, FolderOpen, FilePlus, Printer, FileDown, Grid3X3 } from "lucide-react";
import { SaveDialog, LoadDialog, saveCalculation, loadCalculation } from "./calculator-save-load";
import {
  computeRCSlab, fmt, DEFAULT_SLAB_INPUTS,
  type RCSlabInputs, type RCSlabResults,
  type SlabType, type OneWaySupport, type TwoWayCase,
} from "@/lib/calc-engine/rc-slab";

const CALC_TYPE = "rc_slab";

// Theme (matching beam/column/footing)
const ACCENT = "#1e6cb8";
const ACCENT_DARK = "#0c2d57";
const ACCENT_LIGHT = "#7eb6ff";
const PAPER_BG = "#f1f3f5";
const CARD_BG = "#ffffff";
const RULE_LIGHT = "#d6dde4";
const RULE_DOT = "#e1e5ea";
const MUTED = "#5a6573";
const INK = "#0f1419";
const INPUT_BG = "#fff8d6";
const INPUT_BORDER = "#d4c896";

interface Props {
  onClose: () => void;
  title?: string;
}

const OCCUPANCY_OPTIONS = [
  { label: "Residential (1.9 kPa)", value: 1.9 },
  { label: "Office (2.4 kPa)", value: 2.4 },
  { label: "Classroom (1.9 kPa)", value: 1.9 },
  { label: "Corridor (4.8 kPa)", value: 4.8 },
  { label: "Roof Deck (1.0 kPa)", value: 1.0 },
  { label: "Commercial (4.8 kPa)", value: 4.8 },
  { label: "Storage-Light (6.0 kPa)", value: 6.0 },
  { label: "Storage-Heavy (12.0 kPa)", value: 12.0 },
  { label: "Parking (2.4 kPa)", value: 2.4 },
];

const TWO_WAY_CASES: TwoWayCase[] = [
  "Case 1 — All edges continuous",
  "Case 2 — One short edge discontinuous",
  "Case 3 — One long edge discontinuous",
  "Case 4 — Two adjacent edges discontinuous",
  "Case 5 — Two short edges discontinuous",
  "Case 6 — Two long edges discontinuous",
  "Case 7 — Three edges discontinuous (one long continuous)",
  "Case 8 — Three edges discontinuous (one short continuous)",
  "Case 9 — All edges discontinuous",
];

export default function RCSlabCalculator({ onClose, title = "Reinforced Concrete Slab Design" }: Props) {
  const [inputs, setInputs] = useState<RCSlabInputs>({
    ...DEFAULT_SLAB_INPUTS,
    projDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  });
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [currentName, setCurrentName] = useState("");
  const [currentFolder, setCurrentFolder] = useState("");
  const [showSave, setShowSave] = useState<null | "save" | "saveas">(null);
  const [showLoad, setShowLoad] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const results = useMemo<RCSlabResults>(() => computeRCSlab(inputs), [inputs]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showSave && !showLoad) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showSave, showLoad]);

  const setField = <K extends keyof RCSlabInputs>(key: K, value: RCSlabInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const doSave = async (name: string, folder: string) => {
    const rec = saveCalculation(CALC_TYPE, {
      id: showSave === "save" ? currentId : null,
      name,
      folder,
      data: inputs,
    });
    setCurrentId(rec.id);
    setCurrentName(rec.name);
    setCurrentFolder(rec.folder);
    flash(showSave === "save" ? `Saved "${rec.name}"` : `Saved as "${rec.name}"`);
  };

  const doLoad = async (id: number) => {
    const rec = loadCalculation(id, CALC_TYPE);
    if (!rec) { flash("Load failed."); return; }
    setInputs(rec.data as RCSlabInputs);
    setCurrentId(rec.id);
    setCurrentName(rec.name);
    setCurrentFolder(rec.folder);
    flash(`Loaded "${rec.name}"`);
  };

  const handleSaveClick = () => setShowSave(currentId !== null ? "save" : "saveas");
  const handleSaveAsClick = () => setShowSave("saveas");
  const handleNew = () => {
    if (!confirm("Clear current inputs and start a new calculation?")) return;
    setInputs({
      ...DEFAULT_SLAB_INPUTS,
      projDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    setCurrentId(null); setCurrentName(""); setCurrentFolder("");
  };

  const exportBOQ = () => {
    const r = results;
    const dim = r.effective_type === "One-Way"
      ? `${(r.inputs.Ln_1w/1000).toFixed(2)} m span, ${r.inputs.h} mm thick`
      : `${(r.inputs.Lx/1000).toFixed(2)}Ã—${(r.inputs.Ly/1000).toFixed(2)} m, ${r.inputs.h} mm thick`;
    const rows = [
      ["#", "Description", "Specification", "Quantity", "Unit"],
      ["1", "Concrete, ready-mix (+10% waste)", `f'c = ${r.inputs.fc} MPa, ${dim}`, r.qty.conc_order.toFixed(3), "mÂ³"],
      ...(r.effective_type === "One-Way"
        ? [
            ["2", "Main rebar (bottom)", `Ï†${r.inputs.db_1w}mm @ ${r.oneway!.s_adopted}mm o.c.`, r.qty.steel_short.toFixed(1), "kg"],
            ["3", "Temperature rebar", `Ï†${r.inputs.dt_1w}mm @ ${r.oneway!.s_temp_adopted}mm o.c.`, r.qty.steel_long.toFixed(1), "kg"],
          ]
        : [
            ["2", "Rebar short direction", `Ï†${r.inputs.db_short}mm @ ${r.twoway!.s_short_pos}mm o.c.`, r.qty.steel_short.toFixed(1), "kg"],
            ["3", "Rebar long direction", `Ï†${r.inputs.db_long}mm @ ${r.twoway!.s_long_pos}mm o.c.`, r.qty.steel_long.toFixed(1), "kg"],
          ]),
      ["4", "Total reinforcement (incl. 10% lap)", `fy = ${r.inputs.fy} MPa`, r.qty.steel_total.toFixed(1), "kg"],
      ["5", "Formwork", r.effective_type === "One-Way" ? "soffit per m width" : "soffit + edges", r.qty.formwork.toFixed(2), "mÂ²"],
    ];
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOQ_${inputs.projMark || "slab"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash("BOQ exported");
  };

  // Live update LL_occupancy when occupancy dropdown changes
  const handleOccupancy = (label: string) => {
    const opt = OCCUPANCY_OPTIONS.find(o => o.label === label);
    setInputs(p => ({ ...p, occupancy: label, LL_occupancy: opt?.value ?? p.LL_occupancy }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: PAPER_BG, color: INK }}
      className="rc-slab-calc fixed inset-0 z-[110] overflow-y-auto"
    >
      <header style={{ background: ACCENT_DARK, borderBottom: `3px solid ${ACCENT}` }}
        className="sticky top-0 z-10 px-6 md:px-12 py-4 flex items-center justify-between no-print text-white">
        <div className="flex items-center gap-4 min-w-0">
          <Grid3X3 className="w-5 h-5 shrink-0" style={{ color: ACCENT_LIGHT }} />
          <div className="min-w-0">
            <h1 className="font-serif text-xl truncate text-white">{title}</h1>
            <p className="font-sans text-[10px] tracking-widest uppercase" style={{ color: "#a8c5e8" }}>
              {currentName ? `${currentName}${currentFolder ? ` Â· ${currentFolder}` : ""}` : `NSCP 2015 / ACI 318-19 Â· ${results.effective_type}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ToolbarBtn onClick={handleNew} icon={<FilePlus className="w-3.5 h-3.5" />} label="New" />
          <ToolbarBtn onClick={handleSaveClick} icon={<Save className="w-3.5 h-3.5" />} label="Save" />
          <ToolbarBtn onClick={handleSaveAsClick} icon={<Save className="w-3.5 h-3.5" />} label="Save As" />
          <ToolbarBtn onClick={() => setShowLoad(true)} icon={<FolderOpen className="w-3.5 h-3.5" />} label="Load" />
          <ToolbarBtn onClick={exportBOQ} icon={<FileDown className="w-3.5 h-3.5" />} label="BOQ" />
          <ToolbarBtn onClick={() => window.print()} icon={<Printer className="w-3.5 h-3.5" />} label="Print" primary />
          <button onClick={onClose} className="ml-2 p-2 rounded transition-colors text-white hover:bg-white/10" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-0 min-h-[calc(100vh-65px)]">
        {/* INPUTS */}
        <aside style={{ background: CARD_BG, borderRight: `1px solid ${RULE_LIGHT}` }} className="p-6 lg:p-8 no-print">
          <SectionLabel>Project</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Field label="Project" value={inputs.projName} onChange={v => setField("projName", v)} text />
            <Field label="Slab Mark" value={inputs.projMark} onChange={v => setField("projMark", v)} text />
            <Field label="Designed By" value={inputs.projBy} onChange={v => setField("projBy", v)} text />
            <Field label="Date" value={inputs.projDate} onChange={v => setField("projDate", v)} text />
          </div>

          <SectionLabel>Slab Type</SectionLabel>
          <Select label="Slab Type" value={inputs.slabType} onChange={v => setField("slabType", v as SlabType)}
            options={["Auto", "One-Way", "Two-Way"]} />
          <div className="font-sans text-[10px] italic py-1.5" style={{ color: MUTED }}>
            Auto-detect uses Ly/Lx threshold: &gt;2 â†’ one-way; â‰¤2 â†’ two-way.
          </div>

          <SectionLabel>Common Geometry</SectionLabel>
          <Field label="Slab thickness, h" unit="mm" value={inputs.h} onChange={v => setField("h", +v)} step={5} />
          <Field label="Clear cover, cc" unit="mm" value={inputs.cover} onChange={v => setField("cover", +v)} />

          {(results.effective_type === "One-Way" || inputs.slabType === "One-Way") && (
            <>
              <SectionLabel>One-Way Inputs</SectionLabel>
              <Field label="Clear span, Ln" unit="mm" value={inputs.Ln_1w} onChange={v => setField("Ln_1w", +v)} step={50} />
              <Select label="Support Condition" value={inputs.support_1w}
                onChange={v => setField("support_1w", v as OneWaySupport)}
                options={["Simply Supported", "One End Continuous", "Both Ends Continuous", "Cantilever"]} />
              <Field label="Main bar Ã˜, db" unit="mm" value={inputs.db_1w} onChange={v => setField("db_1w", +v)} />
              <Field label="Temp bar Ã˜, dt" unit="mm" value={inputs.dt_1w} onChange={v => setField("dt_1w", +v)} />
            </>
          )}

          {(results.effective_type === "Two-Way" || inputs.slabType === "Two-Way") && (
            <>
              <SectionLabel>Two-Way Inputs</SectionLabel>
              <Field label="Short clear span, Lx" unit="mm" value={inputs.Lx} onChange={v => setField("Lx", +v)} step={50} />
              <Field label="Long clear span, Ly" unit="mm" value={inputs.Ly} onChange={v => setField("Ly", +v)} step={50} />
              <Select label="Edge Support Case (ACI Method 3)" value={inputs.twoWayCase}
                onChange={v => setField("twoWayCase", v as TwoWayCase)} options={TWO_WAY_CASES} />
              <Field label="Bar Ã˜ short dir, db_x" unit="mm" value={inputs.db_short} onChange={v => setField("db_short", +v)} />
              <Field label="Bar Ã˜ long dir, db_y" unit="mm" value={inputs.db_long} onChange={v => setField("db_long", +v)} />
              <Field label="Column c1 (x)" unit="mm" value={inputs.c1} onChange={v => setField("c1", +v)} />
              <Field label="Column c2 (y)" unit="mm" value={inputs.c2} onChange={v => setField("c2", +v)} />
            </>
          )}

          <SectionLabel>Loads</SectionLabel>
          <Field label="Floor finish" unit="kPa" value={inputs.DL_finish} onChange={v => setField("DL_finish", +v)} step={0.1} />
          <Field label="Ceiling / plaster" unit="kPa" value={inputs.DL_ceiling} onChange={v => setField("DL_ceiling", +v)} step={0.05} />
          <Field label="Waterproofing" unit="kPa" value={inputs.DL_waterproof} onChange={v => setField("DL_waterproof", +v)} step={0.05} />
          <Field label="MEP" unit="kPa" value={inputs.DL_mep} onChange={v => setField("DL_mep", +v)} step={0.05} />
          <Field label="Other superimposed DL" unit="kPa" value={inputs.DL_super} onChange={v => setField("DL_super", +v)} step={0.05} />
          <Select label="Occupancy" value={inputs.occupancy} onChange={handleOccupancy}
            options={OCCUPANCY_OPTIONS.map(o => o.label)} />
          <Field label="Live load, LL" unit="kPa" value={inputs.LL_occupancy} onChange={v => setField("LL_occupancy", +v)} step={0.1} />
          <Field label="Partition load" unit="kPa" value={inputs.LL_partition} onChange={v => setField("LL_partition", +v)} step={0.1} />

          <SectionLabel>Materials</SectionLabel>
          <Field label="Concrete, f'c" unit="MPa" value={inputs.fc} onChange={v => setField("fc", +v)} />
          <Field label="Steel yield, fy" unit="MPa" value={inputs.fy} onChange={v => setField("fy", +v)} />
          <Field label="Î³c" unit="kN/mÂ³" value={inputs.gamma_c} onChange={v => setField("gamma_c", +v)} />

          <p className="font-sans text-[10px] leading-relaxed mt-6 pt-4"
            style={{ color: MUTED, borderTop: `1px solid ${RULE_LIGHT}` }}>
            Self-weight is calculated automatically from h Ã— Î³c. Edge case selection uses full ACI Method 3 (9 cases). Coefficient interpolation is segment-by-segment linear (not regression).
          </p>
        </aside>

        {/* RESULTS */}
        <main style={{ background: PAPER_BG }} className="p-6 lg:p-10 print-area">
          <div className="hidden print:block pb-3 mb-5" style={{ borderBottom: `2px solid ${ACCENT_DARK}` }}>
            <h2 className="font-serif text-2xl" style={{ color: ACCENT_DARK }}>REINFORCED CONCRETE SLAB DESIGN</h2>
            <p className="font-sans text-xs mt-1" style={{ color: MUTED }}>
              {inputs.projName} &nbsp;|&nbsp; Slab {inputs.projMark} &nbsp;|&nbsp;
              Designed By: {inputs.projBy} &nbsp;|&nbsp; {inputs.projDate}
            </p>
            <p className="font-sans text-xs" style={{ color: MUTED }}>
              {results.effective_type} per NSCP 2015 / ACI 318-19
            </p>
          </div>

          <SectionLabel>Headline Results</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <HeadlineCard label="Slab Type" value={results.effective_type} small sub={results.detection_note} />
            <HeadlineCard label="wu (factored)" value={fmt(results.loads.wu, 2)} unit="kPa"
              sub={results.loads.governing} />
            <HeadlineCard label="Thickness, h" value={`${inputs.h}`} unit="mm"
              sub={results.effective_type === "One-Way"
                ? `d = ${fmt(results.oneway!.d, 0)} mm`
                : `dx = ${fmt(results.twoway!.dx, 0)}, dy = ${fmt(results.twoway!.dy, 0)}`} small />
            <HeadlineCard label="Verdict" value={results.overall_verdict} small
              sub={results.effective_type}
              statusBg={results.overall_verdict === "PASS" ? "#d4edda" : "#f8d7da"}
              statusFg={results.overall_verdict === "PASS" ? "#155724" : "#721c24"} />
          </div>

          {/* Plan/section drawing */}
          <ResultBlock title={`${results.effective_type} Slab — ${results.effective_type === "One-Way" ? "Cross-Section" : "Plan View"}`}>
            <SlabSVG results={results} />
          </ResultBlock>

          {/* Loads */}
          <ResultBlock title="1. Loads & Combinations (NSCP/ACI)">
            <Row label="Self-weight (auto from h Ã— Î³c)" val={fmt(inputs.h / 1000 * inputs.gamma_c, 2)} unit="kPa" />
            <Row label="Total Dead Load, D" val={fmt(results.loads.D_total, 2)} unit="kPa" bold />
            <Row label="Total Live Load, L" val={fmt(results.loads.L_total, 2)} unit="kPa" bold />
            <Row label="LC1: 1.4D" val={fmt(results.loads.wu_LC1, 3)} unit="kPa" />
            <Row label="LC2: 1.2D + 1.6L" val={fmt(results.loads.wu_LC2, 3)} unit="kPa" />
            <Row label="LC3: 0.9D" val={fmt(results.loads.wu_LC3, 3)} unit="kPa" />
            <Row label="Governing wu" val={fmt(results.loads.wu, 3)} unit="kPa" bold />
            <Row label="Governing combination" val={results.loads.governing} />
          </ResultBlock>

          {/* Material properties */}
          <ResultBlock title="2. Material Properties (Derived)">
            <Row label="Ec = 4700Â·âˆšf'c" val={fmt(results.Ec, 1)} unit="MPa" />
            <Row label="fr = 0.62Â·âˆšf'c" val={fmt(results.fr, 3)} unit="MPa" />
            <Row label="Î²â‚" val={fmt(results.beta1, 3)} />
            <Row label="Ï_min = max(0.25âˆšf'c/fy, 1.4/fy)" val={fmt(results.rho_min, 5)} />
            <Row label="Ï_max (tension-controlled, Îµt â‰¥ 0.005)" val={fmt(results.rho_max, 5)} />
            <Row label="Crack-control spacing limit (ACI 24.3.2)" val={fmt(results.s_crack_limit, 1)} unit="mm" />
          </ResultBlock>

          {/* â”€â”€ ONE-WAY RESULTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {results.effective_type === "One-Way" && results.oneway && (
            <>
              <ResultBlock title="3. Analysis — Moment & Shear (ACI 318-19 Â§6.5)">
                <Row label="Effective depth, d = h âˆ’ cc âˆ’ db/2" val={fmt(results.oneway.d, 1)} unit="mm" />
                <Row label="Moment coefficient, Cm" val={fmt(results.oneway.Cm, 4)}
                  formula={`${inputs.support_1w}`} />
                <Row label="Factored moment, Mu" val={fmt(results.oneway.Mu, 3)} unit="kNÂ·m" />
                <Row label="Factored shear, Vu" val={fmt(results.oneway.Vu, 3)} unit="kN" />
              </ResultBlock>

              <ResultBlock title="4. Flexural Design (Bottom Bars)">
                <Row label="Rn = Mu / (Ï†Â·bÂ·dÂ²)" val={fmt(results.oneway.Rn, 4)} unit="MPa" />
                <Row label="Required Ï" val={fmt(results.oneway.rho_req, 5)} />
                <Row label="Design Ï = max(Ï_req, Ï_min)" val={fmt(results.oneway.rho_design, 5)} />
                <Row label="As required" val={fmt(results.oneway.As_req, 1)} unit="mmÂ²/m" />
                <Row label="Bar area Ab (Ï†${inputs.db_1w})"
                  val={fmt(results.oneway.Ab, 1)} unit="mmÂ²" />
                <Row label="Spacing required" val={fmt(results.oneway.s_req, 1)} unit="mm" />
                <Row label="Max spacing (min(450, 3h))" val={fmt(results.oneway.s_max_dh, 0)} unit="mm" />
                <Row label="Crack control limit" val={fmt(results.oneway.s_crack_limit, 1)} unit="mm" />
                <Row label="Adopted spacing (â†“25mm)" val={fmt(results.oneway.s_adopted, 0)} unit="mm" bold />
                <Row label="As provided" val={fmt(results.oneway.As_prov, 1)} unit="mmÂ²/m" />
                <Row label="Ï provided" val={fmt(results.oneway.rho_prov, 5)} />
                <Row label="Ï_max check (â‰¤ Ï_max)" val={results.oneway.rho_max_status} />
                <Row label="Flexure status" val={results.oneway.flex_status} bold />
              </ResultBlock>

              <ResultBlock title="5. Temperature & Shrinkage Reinforcement (ACI 9.6.4)">
                <Row label="Ï_temp" val={fmt(inputs.rho_temp, 5)} />
                <Row label="As_temp required = Ï_temp Ã— b Ã— h" val={fmt(results.oneway.As_temp_req, 1)} unit="mmÂ²/m" />
                <Row label={`Temp bar area (Ï†${inputs.dt_1w})`} val={fmt(results.oneway.Ab_temp, 1)} unit="mmÂ²" />
                <Row label="Temp spacing required" val={fmt(results.oneway.s_temp_req, 1)} unit="mm" />
                <Row label="Max temp spacing (min(450, 5h))" val={fmt(results.oneway.s_temp_max, 0)} unit="mm" />
                <Row label="Adopted temp spacing" val={fmt(results.oneway.s_temp_adopted, 0)} unit="mm" bold />
              </ResultBlock>

              <ResultBlock title="6. Shear Check (ACI 22.5)">
                <Row label="Ï†Vc = Ï†Â·0.17Â·Î»Â·âˆšf'cÂ·bÂ·d" val={fmt(results.oneway.phi_Vc, 3)} unit="kN" />
                <Row label="Vu (demand)" val={fmt(results.oneway.Vu, 3)} unit="kN" />
                <Row label="Utilization Vu / Ï†Vc" val={fmt(results.oneway.shear_util, 4)} />
                <Row label="Shear status" val={results.oneway.shear_status} bold />
              </ResultBlock>

              <ResultBlock title="7. Deflection Check (ACI 9.3 / 24.2)">
                <Row label="Min h (deflection control)" val={fmt(results.oneway.h_min, 0)} unit="mm" />
                <Row label="Provided h" val={fmt(inputs.h, 0)} unit="mm" />
                <Row label="Thickness status" val={results.oneway.thickness_status} />
                <Row label="Ig = bÂ·hÂ³/12" val={fmt(results.oneway.Ig, 0)} unit="mmâ´" />
                <Row label="Immediate deflection, Î”áµ¢" val={fmt(results.oneway.delta_immediate, 3)} unit="mm" />
                <Row label="Long-term deflection (Î¾=2.0, ACI 24.2.4)" val={fmt(results.oneway.delta_long_term, 3)} unit="mm" />
                <Row label="Allowable, L/360" val={fmt(results.oneway.delta_allowable, 3)} unit="mm" />
                <Row label="Deflection status" val={results.oneway.defl_status} bold />
              </ResultBlock>

              <ResultBlock title="8. Crack Control (ACI 24.3.2)">
                <Row label="Crack control spacing limit" val={fmt(results.oneway.s_crack_limit, 1)} unit="mm" />
                <Row label="Adopted bar spacing" val={fmt(results.oneway.s_adopted, 0)} unit="mm" />
                <Row label="Crack status" val={results.oneway.crack_status} bold />
              </ResultBlock>
            </>
          )}

          {/* â”€â”€ TWO-WAY RESULTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {results.effective_type === "Two-Way" && results.twoway && (
            <>
              <ResultBlock title="3. Two-Way Analysis (ACI Method 3)">
                <Row label="Aspect ratio, m = Lx/Ly" val={fmt(results.twoway.m, 4)} />
                <Row label="Edge support case" val={inputs.twoWayCase} />
                <Row label="Effective depth short, dx" val={fmt(results.twoway.dx, 1)} unit="mm" />
                <Row label="Effective depth long, dy" val={fmt(results.twoway.dy, 1)} unit="mm" />
                <Row label="Bar area Ab short" val={fmt(results.twoway.Ab_short, 1)} unit="mmÂ²" />
                <Row label="Bar area Ab long" val={fmt(results.twoway.Ab_long, 1)} unit="mmÂ²" />
              </ResultBlock>

              <ResultBlock title="4. Moment Coefficients (Interpolated)">
                <Row label="Ca_DL (short positive, DL)" val={fmt(results.twoway.Ca_dl, 5)} />
                <Row label="Cb_DL (long positive, DL)" val={fmt(results.twoway.Cb_dl, 5)} />
                <Row label="Ca_LL (short positive, LL)" val={fmt(results.twoway.Ca_ll, 5)} />
                <Row label="Cb_LL (long positive, LL)" val={fmt(results.twoway.Cb_ll, 5)} />
                <Row label="Ca_neg (short, negative at supports)" val={fmt(results.twoway.Ca_neg, 5)} />
                <Row label="Cb_neg (long, negative at supports)" val={fmt(results.twoway.Cb_neg, 5)} />
              </ResultBlock>

              <ResultBlock title="5. Factored Moments">
                <Row label="Ma_DL = Ca_DL Ã— wDL Ã— LxÂ²" val={fmt(results.twoway.Ma_DL, 3)} unit="kNÂ·m/m" />
                <Row label="Ma_LL = Ca_LL Ã— wLL Ã— LxÂ²" val={fmt(results.twoway.Ma_LL, 3)} unit="kNÂ·m/m" />
                <Row label="Mb_DL = Cb_DL Ã— wDL Ã— LyÂ²" val={fmt(results.twoway.Mb_DL, 3)} unit="kNÂ·m/m" />
                <Row label="Mb_LL = Cb_LL Ã— wLL Ã— LyÂ²" val={fmt(results.twoway.Mb_LL, 3)} unit="kNÂ·m/m" />
                <Row label="Mu_short (positive) = 1.2Ma_DL + 1.6Ma_LL" val={fmt(results.twoway.Mu_short_pos, 3)} unit="kNÂ·m/m" bold />
                <Row label="Mu_long (positive)" val={fmt(results.twoway.Mu_long_pos, 3)} unit="kNÂ·m/m" bold />
                <Row label="Mu_short (negative at supports)" val={fmt(results.twoway.Mu_short_neg, 3)} unit="kNÂ·m/m" />
                <Row label="Mu_long (negative at supports)" val={fmt(results.twoway.Mu_long_neg, 3)} unit="kNÂ·m/m" />
              </ResultBlock>

              <ResultBlock title="6. Flexural Design — Bottom Bars (Midspan)">
                <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-1" style={{ color: ACCENT_DARK }}>
                  Short direction (parallel to Lx)
                </h4>
                <Row label="As required" val={fmt(results.twoway.As_short_pos, 1)} unit="mmÂ²/m" />
                <Row label="Adopted spacing" val={`Ï†${inputs.db_short} @ ${results.twoway.s_short_pos}`} unit="mm" bold />
                <Row label="As provided" val={fmt(results.twoway.As_short_pos_prov, 1)} unit="mmÂ²/m" />
                <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-4" style={{ color: ACCENT_DARK }}>
                  Long direction (parallel to Ly)
                </h4>
                <Row label="As required" val={fmt(results.twoway.As_long_pos, 1)} unit="mmÂ²/m" />
                <Row label="Adopted spacing" val={`Ï†${inputs.db_long} @ ${results.twoway.s_long_pos}`} unit="mm" bold />
                <Row label="As provided" val={fmt(results.twoway.As_long_pos_prov, 1)} unit="mmÂ²/m" />
              </ResultBlock>

              {(results.twoway.Mu_short_neg > 0 || results.twoway.Mu_long_neg > 0) && (
                <ResultBlock title="7. Flexural Design — Top Bars (Negative Moment at Continuous Supports)">
                  <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-1" style={{ color: ACCENT_DARK }}>
                    Short direction
                  </h4>
                  <Row label="As required (top)" val={fmt(results.twoway.As_short_neg, 1)} unit="mmÂ²/m" />
                  <Row label="Adopted spacing" val={`Ï†${inputs.db_short} @ ${results.twoway.s_short_neg}`} unit="mm" bold />
                  <Row label="As provided" val={fmt(results.twoway.As_short_neg_prov, 1)} unit="mmÂ²/m" />
                  <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-4" style={{ color: ACCENT_DARK }}>
                    Long direction
                  </h4>
                  <Row label="As required (top)" val={fmt(results.twoway.As_long_neg, 1)} unit="mmÂ²/m" />
                  <Row label="Adopted spacing" val={`Ï†${inputs.db_long} @ ${results.twoway.s_long_neg}`} unit="mm" bold />
                  <Row label="As provided" val={fmt(results.twoway.As_long_neg_prov, 1)} unit="mmÂ²/m" />
                </ResultBlock>
              )}

              <ResultBlock title="8. One-Way Shear Check (ACI 22.5)">
                <Row label="Vu = wu Ã— (Lx/2 âˆ’ dx)" val={fmt(results.twoway.Vu_oneway, 3)} unit="kN/m" />
                <Row label="Ï†Vc (per m width)" val={fmt(results.twoway.phi_Vc_oneway, 3)} unit="kN/m" />
                <Row label="One-way shear status" val={results.twoway.oneway_status} bold />
              </ResultBlock>

              <ResultBlock title="9. Punching Shear Check (ACI 22.6)">
                <Row label="Column dimensions, c1 Ã— c2" val={`${inputs.c1} Ã— ${inputs.c2}`} unit="mm" />
                <Row label="Î²_col = long / short" val={fmt(results.twoway.beta_col, 3)} />
                <Row label="bo (perimeter at d/2 from face)" val={fmt(results.twoway.bo, 3)} unit="m" />
                <Row label="Vu (punching)" val={fmt(results.twoway.Vu_punch, 3)} unit="kN" />
                <Row label="Vc1 = 0.33Â·Î»Â·âˆšf'cÂ·boÂ·d" val={fmt(results.twoway.Vc1, 3)} unit="kN" />
                <Row label="Vc2 = 0.17Â·(1+2/Î²)Â·Î»Â·âˆšf'cÂ·boÂ·d" val={fmt(results.twoway.Vc2, 3)} unit="kN" />
                <Row label="Vc3 = 0.083Â·(Î±sÂ·d/bo+2)Â·Î»Â·âˆšf'cÂ·boÂ·d" val={fmt(results.twoway.Vc3, 3)} unit="kN" />
                <Row label="Ï†Vc punch (min of 3, Ã— Ï†)" val={fmt(results.twoway.phi_Vc_punch, 3)} unit="kN" />
                <Row label="Punching status" val={results.twoway.punch_status} bold />
              </ResultBlock>

              <ResultBlock title="10. Thickness Check (ACI 8.3.1)">
                <Row label="h_min = max(Ly/33, 125)" val={fmt(results.twoway.h_min, 0)} unit="mm" />
                <Row label="Provided h" val={fmt(inputs.h, 0)} unit="mm" />
                <Row label="Thickness status" val={results.twoway.thickness_status} bold />
              </ResultBlock>
            </>
          )}

          {/* BOQ */}
          <ResultBlock title={`${results.effective_type === "One-Way" ? "9" : "11"}. Bill of Quantities`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: ACCENT_DARK, color: "#fff" }}>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">#</th>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Description</th>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Spec</th>
                  <th className="text-right px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Qty</th>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Unit</th>
                </tr>
              </thead>
              <tbody className="font-sans text-xs">
                <BOQRow n="1" desc="Concrete, ready-mix (+10% waste)"
                  spec={`f'c = ${inputs.fc} MPa`} qty={fmt(results.qty.conc_order, 3)} unit="mÂ³" />
                {results.effective_type === "One-Way" ? <>
                  <BOQRow n="2" desc="Main rebar (bottom)"
                    spec={`Ï†${inputs.db_1w}mm @ ${results.oneway!.s_adopted}mm o.c.`}
                    qty={fmt(results.qty.steel_short, 1)} unit="kg" />
                  <BOQRow n="3" desc="Temperature rebar"
                    spec={`Ï†${inputs.dt_1w}mm @ ${results.oneway!.s_temp_adopted}mm o.c.`}
                    qty={fmt(results.qty.steel_long, 1)} unit="kg" />
                </> : <>
                  <BOQRow n="2" desc="Rebar short direction"
                    spec={`Ï†${inputs.db_short}mm @ ${results.twoway!.s_short_pos}mm o.c.`}
                    qty={fmt(results.qty.steel_short, 1)} unit="kg" />
                  <BOQRow n="3" desc="Rebar long direction"
                    spec={`Ï†${inputs.db_long}mm @ ${results.twoway!.s_long_pos}mm o.c.`}
                    qty={fmt(results.qty.steel_long, 1)} unit="kg" />
                </>}
                <BOQRow n="4" desc="Total reinforcement (incl. 10% lap)" spec={`fy = ${inputs.fy} MPa`}
                  qty={fmt(results.qty.steel_total, 1)} unit="kg" />
                <BOQRow n="5" desc="Formwork"
                  spec={results.effective_type === "One-Way" ? "soffit per m width" : "soffit + edges"}
                  qty={fmt(results.qty.formwork, 2)} unit="mÂ²" />
              </tbody>
            </table>
          </ResultBlock>

          {/* Summary */}
          <ResultBlock title={`${results.effective_type === "One-Way" ? "10" : "12"}. Design Summary & Certification`}>
            <Row label="Slab mark" val={inputs.projMark} />
            <Row label="Slab type" val={results.effective_type} bold />
            <Row label="Geometry" val={results.effective_type === "One-Way"
              ? `${(inputs.Ln_1w/1000).toFixed(2)} m Ã— ${inputs.h} mm thick`
              : `${(inputs.Lx/1000).toFixed(2)} Ã— ${(inputs.Ly/1000).toFixed(2)} Ã— ${inputs.h} mm`} />
            <Row label="Governing wu" val={`${fmt(results.loads.wu, 2)} kPa (${results.loads.governing})`} />
            {results.effective_type === "One-Way" && results.oneway && <>
              <Row label="Main bars (bottom)" val={`Ï†${inputs.db_1w}mm @ ${results.oneway.s_adopted}mm o.c.`} />
              <Row label="Temperature bars" val={`Ï†${inputs.dt_1w}mm @ ${results.oneway.s_temp_adopted}mm o.c.`} />
              <Row label="Flexure" val={<StatusPill status={results.oneway.flex_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
              <Row label="Shear" val={<StatusPill status={results.oneway.shear_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
              <Row label="Deflection" val={<StatusPill status={results.oneway.defl_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
              <Row label="Thickness" val={<StatusPill status={results.oneway.thickness_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
              <Row label="Crack control" val={<StatusPill status={results.oneway.crack_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
            </>}
            {results.effective_type === "Two-Way" && results.twoway && <>
              <Row label="Bars (short dir)" val={`Ï†${inputs.db_short}mm @ ${results.twoway.s_short_pos}mm`} />
              <Row label="Bars (long dir)" val={`Ï†${inputs.db_long}mm @ ${results.twoway.s_long_pos}mm`} />
              <Row label="One-way shear" val={<StatusPill status={results.twoway.oneway_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
              <Row label="Punching shear" val={<StatusPill status={results.twoway.punch_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
              <Row label="Thickness" val={<StatusPill status={results.twoway.thickness_status.startsWith("âœ“") ? "PASS" : "FAIL"} />} />
            </>}
            <Row label="OVERALL VERDICT" val={<StatusPill status={results.overall_verdict} />} bold />
            <p className="font-sans text-[11px] italic leading-relaxed mt-4" style={{ color: MUTED }}>
              Design performed per NSCP 2015 / ACI 318-19 using Ultimate Strength Design (USD).
              Two-way slabs use ACI Method 3 (Direct Design / Coefficient Method) with segment-by-segment
              linear interpolation of coefficients. Long-term deflection includes ACI 24.2.4 multiplier
              (Î¾ = 2.0 for sustained loads &gt; 5 years).
            </p>
          </ResultBlock>

          <div className="h-12" />
        </main>
      </div>

      <AnimatePresence>
        {showSave && (
          <SaveDialog mode={showSave} currentName={currentName} currentFolder={currentFolder}
            onSave={doSave} onClose={() => setShowSave(null)} />
        )}
        {showLoad && (
          <LoadDialog calcType={CALC_TYPE} onLoad={doLoad} onClose={() => setShowLoad(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{ background: ACCENT_DARK, color: "#fff" }}
            className="fixed bottom-6 right-6 z-[130] px-4 py-2.5 rounded font-sans text-xs tracking-widest uppercase shadow-lg no-print">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          .no-print { display: none !important; }
          .print-area { padding: 0 !important; }
        }
      `}</style>
    </motion.div>
  );
}

// â”€â”€â”€â”€â”€ Helper components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ToolbarBtn({ onClick, icon, label, primary }: {
  onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
      style={primary
        ? { background: "#ffffff", color: ACCENT_DARK }
        : { background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" }
      }
      className="inline-flex items-center gap-1.5 font-sans text-[10px] tracking-widest uppercase px-3 py-2 rounded transition-all hover:opacity-90">
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-sans text-[11px] font-semibold tracking-widest uppercase pb-1.5 mt-5 first:mt-0 mb-2.5"
      style={{ color: ACCENT_DARK, borderBottom: `2px solid ${ACCENT_DARK}` }}>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, unit, step, text }: {
  label: string; value: string | number; onChange: (v: string) => void;
  unit?: string; step?: number; text?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_92px] items-center gap-2 py-1" style={{ borderBottom: `1px dotted ${RULE_DOT}` }}>
      <label className="font-sans text-xs" style={{ color: INK }}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input type={text ? "text" : "number"} step={step} value={value}
          onChange={e => onChange(e.target.value)}
          style={{ background: INPUT_BG, border: `1px solid ${INPUT_BORDER}`, color: INK }}
          className="w-full rounded px-2 py-1 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {unit && <span className="font-mono text-[10px] w-10" style={{ color: MUTED }}>{unit}</span>}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="py-1.5" style={{ borderBottom: `1px dotted ${RULE_DOT}` }}>
      <label className="font-sans text-xs block mb-1" style={{ color: INK }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: INPUT_BG, border: `1px solid ${INPUT_BORDER}`, color: INK }}
        className="w-full rounded px-2 py-1 font-sans text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function HeadlineCard({ label, value, unit, sub, small, statusBg, statusFg }: {
  label: string; value: string; unit?: string; sub?: string; small?: boolean;
  statusBg?: string; statusFg?: string;
}) {
  return (
    <div className="rounded p-3 text-center"
      style={{ background: statusBg ?? CARD_BG, border: `1px solid ${RULE_LIGHT}`, boxShadow: "0 1px 3px rgba(12,45,87,0.05)" }}>
      <div className="font-sans text-[9px] tracking-widest uppercase" style={{ color: MUTED }}>{label}</div>
      <div className={`font-mono font-semibold mt-1 ${small ? "text-base" : "text-2xl"}`}
        style={{ color: statusFg ?? ACCENT_DARK }}>{value}</div>
      {unit && <div className="font-mono text-[10px]" style={{ color: MUTED }}>{unit}</div>}
      {sub && <div className="font-sans text-[10px] mt-0.5" style={{ color: MUTED }}>{sub}</div>}
    </div>
  );
}

function ResultBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded p-5"
      style={{ background: CARD_BG, border: `1px solid ${RULE_LIGHT}`, boxShadow: "0 1px 3px rgba(12,45,87,0.05)" }}>
      <h3 className="font-sans text-[11px] font-semibold tracking-widest uppercase mb-3 pb-1.5"
        style={{ color: ACCENT_DARK, borderBottom: `1.5px solid ${ACCENT_DARK}` }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, val, unit, formula, bold }: {
  label: string; val: React.ReactNode; unit?: string; formula?: string; bold?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_50px] gap-2 items-baseline py-1.5 last:border-b-0"
      style={{ borderBottom: `1px dotted ${RULE_DOT}` }}>
      <span className="font-sans text-xs"
        style={{ color: bold ? ACCENT_DARK : INK, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span className="font-mono text-xs"
        style={{ color: bold ? ACCENT_DARK : INK, fontWeight: bold ? 600 : 500 }}>{val}</span>
      <span className="font-mono text-[10px]" style={{ color: MUTED }}>{unit ?? ""}</span>
      {formula && <span className="col-span-3 font-sans text-[10px] italic pl-3" style={{ color: "#8590a0" }}>{formula}</span>}
    </div>
  );
}

function StatusPill({ status, label }: { status: "PASS" | "FAIL"; label?: string }) {
  return (
    <span className="inline-block px-2.5 py-1 rounded text-[10px] font-bold tracking-widest font-sans"
      style={status === "PASS"
        ? { background: "#d4edda", color: "#155724", border: "1px solid #c3e6cb" }
        : { background: "#f8d7da", color: "#721c24", border: "1px solid #f5c6cb" }
      }>
      {label ?? (status === "PASS" ? "âœ“ PASS" : "âœ— FAIL")}
    </span>
  );
}

function BOQRow({ n, desc, spec, qty, unit }: { n: string; desc: string; spec: string; qty: string; unit: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${RULE_DOT}` }}>
      <td className="px-3 py-2" style={{ color: MUTED }}>{n}</td>
      <td className="px-3 py-2" style={{ color: INK }}>{desc}</td>
      <td className="px-3 py-2 text-[11px]" style={{ color: MUTED }}>{spec}</td>
      <td className="px-3 py-2 text-right font-mono" style={{ color: ACCENT_DARK, fontWeight: 600 }}>{qty}</td>
      <td className="px-3 py-2" style={{ color: MUTED }}>{unit}</td>
    </tr>
  );
}

// â”€â”€â”€â”€â”€ Slab SVG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SlabSVG({ results }: { results: RCSlabResults }) {
  const i = results.inputs;

  if (results.effective_type === "One-Way") {
    // Cross-section view of one-way slab
    const W = 600, H = 280;
    const margin = 50;
    const slab_len_px = W - 2 * margin;
    const h_px = 90;
    const slab_top = H / 2 - h_px / 2;
    const slab_bot = slab_top + h_px;
    const cover_px = i.cover / i.h * h_px;
    const db_px = Math.max(3, i.db_1w / i.h * h_px);
    const dt_px = Math.max(2, i.dt_1w / i.h * h_px);

    // Distribute main bars along slab length
    const s = results.oneway!.s_adopted;
    const n_bars = Math.floor(slab_len_px / (s / 50));  // scaled for visual
    const bar_spacing_px = slab_len_px / (n_bars + 1);

    const bars: React.JSX.Element[] = [];
    for (let k = 0; k < n_bars; k++) {
      const x = margin + (k + 1) * bar_spacing_px;
      bars.push(<circle key={`m${k}`} cx={x} cy={slab_bot - cover_px - db_px/2} r={db_px/2} fill={ACCENT_DARK} />);
    }
    const tBars: React.JSX.Element[] = [];
    const s_t = results.oneway!.s_temp_adopted;
    const n_temp = Math.floor(slab_len_px / (s_t / 50));
    const t_spacing = slab_len_px / (n_temp + 1);
    for (let k = 0; k < n_temp; k++) {
      const x = margin + (k + 1) * t_spacing;
      tBars.push(<circle key={`t${k}`} cx={x} cy={slab_top + cover_px + dt_px/2} r={dt_px/2} fill="#c0392b" />);
    }

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl mx-auto" xmlns="http://www.w3.org/2000/svg">
        <rect x={margin} y={slab_top} width={slab_len_px} height={h_px} fill="#ede8d8" stroke={ACCENT_DARK} strokeWidth="1.5" />
        {tBars}
        {bars}
        {/* Span dim */}
        <line x1={margin} y1={H - 28} x2={margin + slab_len_px} y2={H - 28} stroke={INK} strokeWidth="0.8" />
        <line x1={margin} y1={H - 33} x2={margin} y2={H - 23} stroke={INK} strokeWidth="0.8" />
        <line x1={margin + slab_len_px} y1={H - 33} x2={margin + slab_len_px} y2={H - 23} stroke={INK} strokeWidth="0.8" />
        <text x={W/2} y={H - 12} textAnchor="middle" fontFamily="sans-serif" fontSize="12" fill={INK}>
          Ln = {(i.Ln_1w/1000).toFixed(2)} m  ({i.support_1w})
        </text>
        {/* Thickness dim */}
        <line x1={margin - 18} y1={slab_top} x2={margin - 18} y2={slab_bot} stroke={INK} strokeWidth="0.8" />
        <line x1={margin - 23} y1={slab_top} x2={margin - 13} y2={slab_top} stroke={INK} strokeWidth="0.8" />
        <line x1={margin - 23} y1={slab_bot} x2={margin - 13} y2={slab_bot} stroke={INK} strokeWidth="0.8" />
        <text x={margin - 32} y={H/2 + 4} textAnchor="end" fontFamily="sans-serif" fontSize="11" fill={INK}>h = {i.h}</text>
        {/* Legends */}
        <text x={W/2} y={slab_top - 12} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill="#c0392b">
          â†‘ Temp bars Ï†{i.dt_1w}mm @ {results.oneway!.s_temp_adopted}mm o.c. (top)
        </text>
        <text x={W/2} y={slab_bot + 15} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill={ACCENT_DARK}>
          â†“ Main bars Ï†{i.db_1w}mm @ {results.oneway!.s_adopted}mm o.c. (bottom)
        </text>
      </svg>
    );
  }

  // Two-way slab plan view
  const W = 560, H = 420;
  const margin = 70;
  const Lx_actual = Math.min(i.Lx, i.Ly);
  const Ly_actual = Math.max(i.Lx, i.Ly);
  const scale = Math.min((W - 2*margin)/Ly_actual, (H - 2*margin)/Lx_actual);
  // Draw slab as Ly horizontal, Lx vertical (long horizontal for nicer layout)
  const slab_w = Ly_actual * scale;
  const slab_h = Lx_actual * scale;
  const x0 = (W - slab_w) / 2;
  const y0 = (H - slab_h) / 2;
  const col_w = i.c2 * scale;
  const col_h = i.c1 * scale;
  const cx = (W - col_w) / 2;
  const cy = (H - col_h) / 2;
  const cover_px = i.cover * scale;

  // Short direction bars (parallel to Lx â†’ vertical in our orientation)
  // Number of bars along Ly (long dim)
  const n_short = Math.max(2, Math.floor(Ly_actual / results.twoway!.s_short_pos / 4));
  const n_long = Math.max(2, Math.floor(Lx_actual / results.twoway!.s_long_pos / 4));

  const shortBars: React.JSX.Element[] = [];
  for (let k = 0; k < n_short; k++) {
    const t = n_short === 1 ? 0.5 : k / (n_short - 1);
    const xLine = x0 + cover_px + t * (slab_w - 2*cover_px);
    shortBars.push(
      <line key={`s${k}`} x1={xLine} y1={y0 + cover_px} x2={xLine} y2={y0 + slab_h - cover_px}
        stroke={ACCENT} strokeWidth="0.8" opacity="0.55" />
    );
  }
  const longBars: React.JSX.Element[] = [];
  for (let k = 0; k < n_long; k++) {
    const t = n_long === 1 ? 0.5 : k / (n_long - 1);
    const yLine = y0 + cover_px + t * (slab_h - 2*cover_px);
    longBars.push(
      <line key={`l${k}`} x1={x0 + cover_px} y1={yLine} x2={x0 + slab_w - cover_px} y2={yLine}
        stroke="#c0392b" strokeWidth="0.8" opacity="0.55" />
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md mx-auto" xmlns="http://www.w3.org/2000/svg">
      <rect x={x0} y={y0} width={slab_w} height={slab_h} fill="#ede8d8" stroke={ACCENT_DARK} strokeWidth="1.5" />
      {shortBars}
      {longBars}
      {/* Column */}
      <rect x={cx} y={cy} width={col_w} height={col_h} fill={ACCENT_DARK} opacity="0.85" />
      <text x={cx + col_w/2} y={cy + col_h/2 + 4} textAnchor="middle" fontFamily="sans-serif" fontSize="9" fill="#fff" fontWeight="600">
        {i.c1}Ã—{i.c2}
      </text>
      {/* Long dim (horizontal) */}
      <line x1={x0} y1={y0 - 25} x2={x0 + slab_w} y2={y0 - 25} stroke={INK} strokeWidth="0.8" />
      <line x1={x0} y1={y0 - 30} x2={x0} y2={y0 - 20} stroke={INK} strokeWidth="0.8" />
      <line x1={x0 + slab_w} y1={y0 - 30} x2={x0 + slab_w} y2={y0 - 20} stroke={INK} strokeWidth="0.8" />
      <text x={x0 + slab_w/2} y={y0 - 32} textAnchor="middle" fontFamily="sans-serif" fontSize="13" fill={INK}>
        Ly = {(Ly_actual/1000).toFixed(2)} m
      </text>
      {/* Short dim (vertical) */}
      <line x1={x0 + slab_w + 25} y1={y0} x2={x0 + slab_w + 25} y2={y0 + slab_h} stroke={INK} strokeWidth="0.8" />
      <line x1={x0 + slab_w + 20} y1={y0} x2={x0 + slab_w + 30} y2={y0} stroke={INK} strokeWidth="0.8" />
      <line x1={x0 + slab_w + 20} y1={y0 + slab_h} x2={x0 + slab_w + 30} y2={y0 + slab_h} stroke={INK} strokeWidth="0.8" />
      <text x={x0 + slab_w + 35} y={y0 + slab_h/2} fontFamily="sans-serif" fontSize="13" fill={INK}>
        Lx = {(Lx_actual/1000).toFixed(2)} m
      </text>
      {/* Legends */}
      <text x={W/2} y={y0 + slab_h + 28} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill={ACCENT}>
        Bottom bars short dir: Ï†{i.db_short}mm @ {results.twoway!.s_short_pos}mm o.c.
      </text>
      <text x={W/2} y={y0 + slab_h + 44} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill="#c0392b">
        Bottom bars long dir: Ï†{i.db_long}mm @ {results.twoway!.s_long_pos}mm o.c.
      </text>
      <text x={W/2} y={y0 + slab_h + 60} textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill={MUTED}>
        Plan view — m = {results.twoway!.m.toFixed(3)}, h = {i.h} mm
      </text>
    </svg>
  );
}


