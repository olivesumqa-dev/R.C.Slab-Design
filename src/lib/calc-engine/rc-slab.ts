/**
 * Reinforced Concrete Slab Design Engine
 *
 * Pure-function calc engine. No DOM, no React. Handles BOTH one-way and two-way slabs.
 *
 * Standards: NSCP 2015 / ACI 318-19 — Ultimate Strength Design (USD)
 *
 * IMPROVEMENTS OVER THE SOURCE EXCEL WORKBOOK:
 *  1. Proper segment-by-segment linear interpolation (Excel used FORECAST regression)
 *  2. Full ACI Method 3 — all 9 edge support cases (Excel had only Case 1)
 *  3. Column dimensions are real inputs (Excel hard-coded c = 300 mm)
 *  4. Separate bar diameters for short and long directions (Excel forced equal)
 *  5. β = long_col / short_col for punching (Excel hard-coded β = 1)
 *  6. Linked self-weight from actual slab thickness (Excel had a separate input)
 *  7. Auto-detect one-way vs two-way from aspect ratio (Excel required manual choice)
 *  8. Negative moments at continuous supports (top reinforcement) — full design, not copied from positive
 *  9. Long-term deflection per ACI 24.2.4 (ξ × Δ_immediate)
 * 10. Corrected crack-control spacing (ACI 24.3.2)
 * 11. Live load reduction handling (no, defers to NSCP 205 reductions by occupancy)
 * 12. Quantity takeoff with proper per-direction bar counts and lap allowance
 */

export type SlabType = "Auto" | "One-Way" | "Two-Way";
export type OneWaySupport = "Simply Supported" | "One End Continuous" | "Both Ends Continuous" | "Cantilever";
// ACI Method 3 — Case 1 through Case 9
// Case 1: Interior — all 4 edges discontinuous (simply supported all around)
// Case 2: One short edge discontinuous
// Case 3: One long edge discontinuous
// Case 4: Two adjacent edges discontinuous
// Case 5: Two short edges discontinuous
// Case 6: Two long edges discontinuous
// Case 7: Three edges discontinuous (one short continuous)
// Case 8: Three edges discontinuous (one long continuous)
// Case 9: All 4 edges discontinuous
export type TwoWayCase =
  | "Case 1 — All edges continuous"
  | "Case 2 — One short edge discontinuous"
  | "Case 3 — One long edge discontinuous"
  | "Case 4 — Two adjacent edges discontinuous"
  | "Case 5 — Two short edges discontinuous"
  | "Case 6 — Two long edges discontinuous"
  | "Case 7 — Three edges discontinuous (one long continuous)"
  | "Case 8 — Three edges discontinuous (one short continuous)"
  | "Case 9 — All edges discontinuous";

export interface RCSlabInputs {
  // Project metadata
  projName: string;
  projMark: string;
  projBy: string;
  projDate: string;

  // Slab type
  slabType: SlabType;       // Auto / One-Way / Two-Way (auto detects from aspect ratio)

  // Common geometry
  h: number;                // slab thickness, mm
  cover: number;            // clear cover, mm

  // One-way inputs
  Ln_1w: number;            // clear span, mm (one-way)
  support_1w: OneWaySupport;
  db_1w: number;            // main bar diameter
  dt_1w: number;            // temperature bar diameter

  // Two-way inputs
  Lx: number;               // clear short span, mm
  Ly: number;               // clear long span, mm
  twoWayCase: TwoWayCase;
  db_short: number;         // main bar diameter, short direction
  db_long: number;          // main bar diameter, long direction
  c1: number;               // column dimension in x, mm (for punching)
  c2: number;               // column dimension in y, mm (for punching)

  // Loads (kPa)
  DL_finish: number;        // floor finish
  DL_ceiling: number;       // ceiling / plastering
  DL_waterproof: number;    // waterproofing
  DL_mep: number;           // mechanical / electrical
  DL_super: number;         // superimposed dead load
  LL_occupancy: number;     // live load from occupancy
  LL_partition: number;     // partition load
  occupancy: string;        // for display

  // Materials
  fc: number;               // MPa
  fy: number;               // MPa
  Es: number;               // MPa (typ. 200000)
  gamma_c: number;          // kN/m³

  // Strength reduction factors
  phi_f: number;            // flexure
  phi_v: number;            // shear

  // Detailing
  rho_temp: number;         // ACI 9.6.4.2 — 0.0018 for Grade 415
}

export const DEFAULT_SLAB_INPUTS: RCSlabInputs = {
  projName: "—",
  projMark: "S-1",
  projBy: "—",
  projDate: "",
  slabType: "Auto",
  h: 175,
  cover: 20,
  Ln_1w: 3500,
  support_1w: "Simply Supported",
  db_1w: 12,
  dt_1w: 10,
  Lx: 4000, Ly: 5500,
  twoWayCase: "Case 9 — All edges discontinuous",
  db_short: 12, db_long: 12,
  c1: 300, c2: 300,
  DL_finish: 1.0, DL_ceiling: 0.25, DL_waterproof: 0.1,
  DL_mep: 0.2, DL_super: 0.5,
  LL_occupancy: 1.9, LL_partition: 1.0,
  occupancy: "Residential (1.9 kPa)",
  fc: 28, fy: 415, Es: 200000, gamma_c: 24,
  phi_f: 0.9, phi_v: 0.75,
  rho_temp: 0.0018,
};

// ─── ACI METHOD 3 COEFFICIENT TABLES ─────────────────────────────────────────
// These are coefficients for two-way slab analysis per ACI 318 (pre-1971, retained
// as Method 3 in practice). The tables give Ca, Cb for negative moments at
// continuous edges and Ca_dl, Cb_dl, Ca_ll, Cb_ll for positive moments (separated
// by dead/live for proper pattern loading).
//
// Coefficients indexed by aspect ratio m = Lx/Ly (m = short/long ≤ 1.0)
// m values: 1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50

const M_VALUES = [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50];

// === NEGATIVE MOMENTS AT CONTINUOUS EDGES (Ca,neg / Cb,neg) ===
// Coefficient × (wu × Lx²) gives moment per unit width at continuous edge
const Ca_neg: Record<TwoWayCase, number[]> = {
  "Case 1 — All edges continuous":                    [0.045, 0.050, 0.055, 0.060, 0.065, 0.069, 0.074, 0.077, 0.081, 0.084, 0.086],
  "Case 2 — One short edge discontinuous":            [0.050, 0.055, 0.060, 0.066, 0.071, 0.076, 0.081, 0.085, 0.089, 0.092, 0.094],
  "Case 3 — One long edge discontinuous":             [0.075, 0.079, 0.080, 0.082, 0.083, 0.085, 0.086, 0.087, 0.088, 0.089, 0.090],
  "Case 4 — Two adjacent edges discontinuous":        [0.071, 0.075, 0.079, 0.083, 0.086, 0.088, 0.091, 0.093, 0.095, 0.096, 0.097],
  "Case 5 — Two short edges discontinuous":           [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
  "Case 6 — Two long edges discontinuous":            [0.061, 0.065, 0.068, 0.072, 0.075, 0.078, 0.081, 0.083, 0.085, 0.086, 0.088],
  "Case 7 — Three edges discontinuous (one long continuous)":  [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
  "Case 8 — Three edges discontinuous (one short continuous)": [0.069, 0.072, 0.075, 0.078, 0.081, 0.083, 0.085, 0.086, 0.087, 0.088, 0.089],
  "Case 9 — All edges discontinuous":                 [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
};

const Cb_neg: Record<TwoWayCase, number[]> = {
  "Case 1 — All edges continuous":                    [0.045, 0.041, 0.037, 0.031, 0.027, 0.022, 0.017, 0.014, 0.010, 0.007, 0.006],
  "Case 2 — One short edge discontinuous":            [0.050, 0.045, 0.040, 0.034, 0.029, 0.024, 0.019, 0.015, 0.011, 0.008, 0.006],
  "Case 3 — One long edge discontinuous":             [0.075, 0.070, 0.065, 0.058, 0.052, 0.046, 0.040, 0.034, 0.029, 0.023, 0.018],
  "Case 4 — Two adjacent edges discontinuous":        [0.071, 0.067, 0.062, 0.056, 0.049, 0.043, 0.036, 0.030, 0.024, 0.018, 0.014],
  "Case 5 — Two short edges discontinuous":           [0.076, 0.072, 0.070, 0.065, 0.061, 0.056, 0.050, 0.043, 0.035, 0.028, 0.022],
  "Case 6 — Two long edges discontinuous":            [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
  "Case 7 — Three edges discontinuous (one long continuous)":  [0.072, 0.070, 0.065, 0.060, 0.055, 0.050, 0.043, 0.037, 0.031, 0.024, 0.018],
  "Case 8 — Three edges discontinuous (one short continuous)": [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
  "Case 9 — All edges discontinuous":                 [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000],
};

// === POSITIVE MOMENTS — DEAD LOAD (Ca_dl / Cb_dl) ===
// Coefficient × (wDL × Lx²) gives positive moment per unit width at midspan due to DL
const Ca_dl: Record<TwoWayCase, number[]> = {
  "Case 1 — All edges continuous":                    [0.018, 0.020, 0.022, 0.024, 0.026, 0.028, 0.030, 0.032, 0.034, 0.035, 0.037],
  "Case 2 — One short edge discontinuous":            [0.018, 0.020, 0.022, 0.024, 0.027, 0.030, 0.032, 0.034, 0.035, 0.037, 0.039],
  "Case 3 — One long edge discontinuous":             [0.027, 0.030, 0.033, 0.036, 0.039, 0.042, 0.045, 0.048, 0.051, 0.054, 0.056],
  "Case 4 — Two adjacent edges discontinuous":        [0.027, 0.030, 0.033, 0.036, 0.039, 0.043, 0.046, 0.050, 0.053, 0.056, 0.060],
  "Case 5 — Two short edges discontinuous":           [0.033, 0.036, 0.039, 0.043, 0.046, 0.050, 0.053, 0.057, 0.060, 0.064, 0.067],
  "Case 6 — Two long edges discontinuous":            [0.027, 0.029, 0.032, 0.035, 0.038, 0.041, 0.044, 0.047, 0.049, 0.052, 0.055],
  "Case 7 — Three edges discontinuous (one long continuous)":  [0.033, 0.036, 0.040, 0.043, 0.047, 0.050, 0.054, 0.057, 0.061, 0.064, 0.068],
  "Case 8 — Three edges discontinuous (one short continuous)": [0.033, 0.036, 0.039, 0.043, 0.046, 0.050, 0.053, 0.057, 0.060, 0.064, 0.067],
  "Case 9 — All edges discontinuous":                 [0.036, 0.039, 0.042, 0.046, 0.050, 0.055, 0.060, 0.065, 0.071, 0.076, 0.085],
};

const Cb_dl: Record<TwoWayCase, number[]> = {
  "Case 1 — All edges continuous":                    [0.018, 0.016, 0.014, 0.012, 0.011, 0.009, 0.007, 0.006, 0.004, 0.003, 0.002],
  "Case 2 — One short edge discontinuous":            [0.018, 0.016, 0.015, 0.013, 0.011, 0.010, 0.008, 0.006, 0.005, 0.004, 0.003],
  "Case 3 — One long edge discontinuous":             [0.027, 0.024, 0.022, 0.019, 0.016, 0.014, 0.012, 0.009, 0.007, 0.006, 0.004],
  "Case 4 — Two adjacent edges discontinuous":        [0.027, 0.025, 0.022, 0.019, 0.016, 0.014, 0.011, 0.009, 0.007, 0.005, 0.004],
  "Case 5 — Two short edges discontinuous":           [0.027, 0.024, 0.021, 0.019, 0.016, 0.013, 0.011, 0.008, 0.006, 0.005, 0.004],
  "Case 6 — Two long edges discontinuous":            [0.033, 0.030, 0.028, 0.025, 0.023, 0.021, 0.018, 0.015, 0.012, 0.010, 0.008],
  "Case 7 — Three edges discontinuous (one long continuous)":  [0.033, 0.030, 0.027, 0.024, 0.022, 0.019, 0.016, 0.013, 0.011, 0.009, 0.006],
  "Case 8 — Three edges discontinuous (one short continuous)": [0.033, 0.030, 0.028, 0.025, 0.022, 0.020, 0.017, 0.014, 0.011, 0.009, 0.007],
  "Case 9 — All edges discontinuous":                 [0.036, 0.034, 0.031, 0.029, 0.026, 0.024, 0.020, 0.016, 0.013, 0.010, 0.006],
};

// === POSITIVE MOMENTS — LIVE LOAD (Ca_ll / Cb_ll) ===
const Ca_ll: Record<TwoWayCase, number[]> = {
  "Case 1 — All edges continuous":                    [0.027, 0.030, 0.034, 0.037, 0.041, 0.044, 0.048, 0.052, 0.055, 0.059, 0.062],
  "Case 2 — One short edge discontinuous":            [0.027, 0.030, 0.034, 0.038, 0.041, 0.045, 0.049, 0.053, 0.057, 0.061, 0.065],
  "Case 3 — One long edge discontinuous":             [0.027, 0.031, 0.035, 0.040, 0.044, 0.049, 0.053, 0.058, 0.062, 0.066, 0.070],
  "Case 4 — Two adjacent edges discontinuous":        [0.032, 0.036, 0.040, 0.045, 0.049, 0.053, 0.057, 0.061, 0.065, 0.069, 0.072],
  "Case 5 — Two short edges discontinuous":           [0.032, 0.036, 0.040, 0.044, 0.048, 0.053, 0.057, 0.062, 0.066, 0.070, 0.074],
  "Case 6 — Two long edges discontinuous":            [0.032, 0.035, 0.040, 0.043, 0.048, 0.052, 0.056, 0.061, 0.065, 0.069, 0.073],
  "Case 7 — Three edges discontinuous (one long continuous)":  [0.035, 0.040, 0.045, 0.050, 0.055, 0.060, 0.064, 0.068, 0.073, 0.077, 0.081],
  "Case 8 — Three edges discontinuous (one short continuous)": [0.035, 0.039, 0.044, 0.049, 0.053, 0.058, 0.062, 0.067, 0.072, 0.076, 0.081],
  "Case 9 — All edges discontinuous":                 [0.036, 0.039, 0.042, 0.046, 0.050, 0.055, 0.060, 0.065, 0.071, 0.076, 0.085],
};

const Cb_ll: Record<TwoWayCase, number[]> = {
  "Case 1 — All edges continuous":                    [0.027, 0.025, 0.022, 0.020, 0.017, 0.015, 0.012, 0.010, 0.008, 0.006, 0.004],
  "Case 2 — One short edge discontinuous":            [0.027, 0.025, 0.022, 0.020, 0.017, 0.015, 0.013, 0.010, 0.008, 0.006, 0.005],
  "Case 3 — One long edge discontinuous":             [0.027, 0.025, 0.023, 0.020, 0.018, 0.015, 0.013, 0.011, 0.009, 0.007, 0.005],
  "Case 4 — Two adjacent edges discontinuous":        [0.032, 0.029, 0.027, 0.024, 0.022, 0.019, 0.016, 0.014, 0.011, 0.009, 0.007],
  "Case 5 — Two short edges discontinuous":           [0.032, 0.030, 0.027, 0.024, 0.022, 0.019, 0.017, 0.014, 0.011, 0.009, 0.007],
  "Case 6 — Two long edges discontinuous":            [0.032, 0.029, 0.027, 0.024, 0.021, 0.019, 0.016, 0.014, 0.011, 0.009, 0.007],
  "Case 7 — Three edges discontinuous (one long continuous)":  [0.035, 0.033, 0.029, 0.026, 0.024, 0.021, 0.019, 0.016, 0.013, 0.010, 0.008],
  "Case 8 — Three edges discontinuous (one short continuous)": [0.035, 0.032, 0.029, 0.026, 0.023, 0.020, 0.018, 0.015, 0.012, 0.010, 0.008],
  "Case 9 — All edges discontinuous":                 [0.036, 0.034, 0.031, 0.029, 0.026, 0.024, 0.020, 0.016, 0.013, 0.010, 0.006],
};

// ─── Segment-by-segment linear interpolation (NOT regression) ─────────────────
function interpolate(m: number, xs: number[], ys: number[]): number {
  // xs is in DESCENDING order (1.00 down to 0.50) in our tables
  const xsAsc = [...xs].reverse();
  const ysAsc = [...ys].reverse();
  if (m <= xsAsc[0]) return ysAsc[0];
  if (m >= xsAsc[xsAsc.length - 1]) return ysAsc[ysAsc.length - 1];
  for (let i = 0; i < xsAsc.length - 1; i++) {
    if (m >= xsAsc[i] && m <= xsAsc[i + 1]) {
      const t = (m - xsAsc[i]) / (xsAsc[i + 1] - xsAsc[i]);
      return ysAsc[i] + t * (ysAsc[i + 1] - ysAsc[i]);
    }
  }
  return ysAsc[ysAsc.length - 1];
}

// ─── Result types ────────────────────────────────────────────────────────────
export interface SlabLoadCombos {
  D_total: number;
  L_total: number;
  wu_LC1: number;     // 1.4D
  wu_LC2: number;     // 1.2D + 1.6L
  wu_LC3: number;     // 0.9D
  wu: number;         // governing
  governing: string;
}

export interface OneWayResults {
  d: number;
  wu_per_strip: number;       // kN/m
  Cm: number;
  Mu: number;                 // kN·m
  Vu: number;                 // kN
  Rn: number;
  rho_req: number;
  rho_min: number;
  rho_max: number;
  rho_design: number;
  As_req: number;
  Ab: number;
  s_req: number;
  s_max_crack: number;
  s_max_dh: number;           // ACI 24.3.2 = min(450, 3h)
  s_adopted: number;
  As_prov: number;
  rho_prov: number;
  rho_max_status: string;
  flex_status: string;
  // Temperature
  As_temp_req: number;
  Ab_temp: number;
  s_temp_req: number;
  s_temp_max: number;
  s_temp_adopted: number;
  // Shear
  phi_Vc: number;
  shear_util: number;
  shear_status: string;
  // Deflection
  h_min: number;
  thickness_status: string;
  Ig: number;
  Ec: number;
  delta_immediate: number;
  delta_long_term: number;    // Per ACI 24.2.4
  delta_allowable: number;
  defl_status: string;
  // Crack
  s_crack_limit: number;
  crack_status: string;
}

export interface TwoWayResults {
  m: number;                  // aspect ratio Lx/Ly
  dx: number;                 // effective depth short direction
  dy: number;                 // effective depth long direction
  Ab_short: number;
  Ab_long: number;
  // Coefficients
  Ca_dl: number;
  Cb_dl: number;
  Ca_ll: number;
  Cb_ll: number;
  Ca_neg: number;
  Cb_neg: number;
  // Positive moments (midspan)
  Ma_DL: number; Ma_LL: number;
  Mb_DL: number; Mb_LL: number;
  Mu_short_pos: number;       // factored positive moment short direction
  Mu_long_pos: number;        // factored positive moment long direction
  // Negative moments (supports)
  Mu_short_neg: number;
  Mu_long_neg: number;
  // Flexural design — short positive
  As_short_pos: number;
  s_short_pos: number;
  As_short_pos_prov: number;
  // Flexural design — long positive
  As_long_pos: number;
  s_long_pos: number;
  As_long_pos_prov: number;
  // Flexural design — short negative (top bars at supports)
  As_short_neg: number;
  s_short_neg: number;
  As_short_neg_prov: number;
  // Flexural design — long negative
  As_long_neg: number;
  s_long_neg: number;
  As_long_neg_prov: number;
  // Shear
  Vu_oneway: number;
  phi_Vc_oneway: number;
  oneway_status: string;
  // Punching
  bo: number;
  beta_col: number;
  Vu_punch: number;
  Vc1: number; Vc2: number; Vc3: number;
  phi_Vc_punch: number;
  punch_status: string;
  // Thickness
  h_min: number;
  thickness_status: string;
}

export interface RCSlabResults {
  inputs: RCSlabInputs;
  // Materials derived
  Ec: number;
  fr: number;
  beta1: number;
  rho_min: number;
  rho_max: number;
  s_crack_limit: number;
  // Loads
  loads: SlabLoadCombos;
  // Slab type detected
  effective_type: "One-Way" | "Two-Way";
  detection_note: string;
  // Results (only one will be populated based on effective_type)
  oneway?: OneWayResults;
  twoway?: TwoWayResults;
  // Quantities (for whichever was computed)
  qty: {
    conc_vol: number;     // m³ per panel
    conc_order: number;   // +10% waste
    steel_short: number;  // kg
    steel_long: number;   // kg
    steel_total: number;  // kg (with 10% lap)
    formwork: number;     // m²
  };
  // Overall
  overall_verdict: "PASS" | "FAIL";
}

export function fmt(x: number | undefined | null, decimals = 2): string {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  return x.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Bar mass lookup (kg/m)
function barMassPerM(db: number): number {
  return 0.006165 * db * db;
}

// ─── MAIN COMPUTATION ────────────────────────────────────────────────────────
export function computeRCSlab(i: RCSlabInputs): RCSlabResults {

  // ── Material derivation ──────────────────────────────────────────────────
  const Ec = 4700 * Math.sqrt(i.fc);
  const fr = 0.62 * Math.sqrt(i.fc);
  const beta1 = i.fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (i.fc - 28) / 7);
  const rho_min = Math.max(0.25 * Math.sqrt(i.fc) / i.fy, 1.4 / i.fy);
  // ρ_max for tension-controlled (εt ≥ 0.005, ACI 318-19)
  const rho_max = 0.85 * beta1 * i.fc / i.fy * (0.003 / (0.003 + 0.005));
  // ACI 24.3.2 crack-control spacing (assuming fs = 2/3·fy):
  const fs = 2 / 3 * i.fy;
  const s_crack_limit = Math.min(380 * (280 / fs) - 2.5 * i.cover, 300 * (280 / fs));

  // ── Loads ───────────────────────────────────────────────────────────────
  // Self-weight LINKED to actual slab thickness (Bug Fix #6)
  const sw = i.h / 1000 * i.gamma_c;
  const D_total = sw + i.DL_finish + i.DL_ceiling + i.DL_waterproof + i.DL_mep + i.DL_super;
  const L_total = i.LL_occupancy + i.LL_partition;
  const wu_LC1 = 1.4 * D_total;
  const wu_LC2 = 1.2 * D_total + 1.6 * L_total;
  const wu_LC3 = 0.9 * D_total;
  const wu = Math.max(wu_LC1, wu_LC2, wu_LC3);
  const governing = wu === wu_LC1 ? "LC1: 1.4D"
    : wu === wu_LC2 ? "LC2: 1.2D + 1.6L" : "LC3: 0.9D";
  const loads: SlabLoadCombos = { D_total, L_total, wu_LC1, wu_LC2, wu_LC3, wu, governing };

  // ── Slab type detection (Bug Fix #7) ────────────────────────────────────
  // Standard practice: if Ly/Lx > 2 → one-way; if ≤ 2 → two-way
  // Equivalently: m = Lx/Ly < 0.5 → one-way; m ≥ 0.5 → two-way
  let effective_type: "One-Way" | "Two-Way";
  let detection_note: string;
  if (i.slabType === "One-Way") {
    effective_type = "One-Way";
    detection_note = "Forced by user.";
  } else if (i.slabType === "Two-Way") {
    effective_type = "Two-Way";
    detection_note = "Forced by user.";
  } else {
    // Auto-detect
    const ratio = i.Ly / i.Lx;
    if (ratio > 2) {
      effective_type = "One-Way";
      detection_note = `Ly/Lx = ${ratio.toFixed(2)} > 2.0 → ONE-WAY behaviour`;
    } else {
      effective_type = "Two-Way";
      detection_note = `Ly/Lx = ${ratio.toFixed(2)} ≤ 2.0 → TWO-WAY behaviour`;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ONE-WAY SLAB
  // ────────────────────────────────────────────────────────────────────────
  let oneway: OneWayResults | undefined;
  if (effective_type === "One-Way") {
    const b = 1000;  // 1m strip
    const d = i.h - i.cover - i.db_1w / 2;
    const wu_strip = wu * b / 1000;  // kN/m

    // Moment & shear coefficients per support
    const Cm =
      i.support_1w === "Simply Supported" ? 1/8 :
      i.support_1w === "One End Continuous" ? 1/14 :
      i.support_1w === "Both Ends Continuous" ? 1/16 : 1/2; // Cantilever
    const Mu = Cm * wu_strip * Math.pow(i.Ln_1w / 1000, 2);
    const Vu =
      i.support_1w === "Simply Supported" ? 0.5 * wu_strip * (i.Ln_1w / 1000) :
      i.support_1w === "Cantilever" ? wu_strip * (i.Ln_1w / 1000) :
      0.6 * wu_strip * (i.Ln_1w / 1000);

    // Flexural design
    const Rn = Mu * 1e6 / (i.phi_f * b * d * d);  // MPa
    const rho_req = (0.85 * i.fc / i.fy) * (1 - Math.sqrt(Math.max(0, 1 - 2 * Rn / (0.85 * i.fc))));
    const rho_design = Math.max(rho_req, rho_min);
    const As_req = rho_design * b * d;
    const Ab = Math.PI / 4 * i.db_1w * i.db_1w;
    const s_req = Ab / As_req * 1000;
    const s_max_dh = Math.min(450, 3 * i.h);
    const s_max_crack = s_crack_limit;
    // Adopted spacing rounded down to 25 mm
    const s_adopted = Math.floor(Math.min(s_req, s_max_dh, s_max_crack) / 25) * 25;
    const As_prov = Ab / s_adopted * 1000;
    const rho_prov = As_prov / (b * d);
    const rho_max_status = rho_prov <= rho_max ? "✓ WITHIN ρ_max" : "✗ EXCEEDS ρ_max";
    const flex_status = As_prov >= As_req ? "✓ SAFE" : "✗ INCREASE BARS";

    // Temperature bars (Bug Fix #4 — separate temp bar size)
    const As_temp_req = i.rho_temp * b * i.h;
    const Ab_temp = Math.PI / 4 * i.dt_1w * i.dt_1w;
    const s_temp_req = Ab_temp / As_temp_req * 1000;
    const s_temp_max = Math.min(450, 5 * i.h);
    const s_temp_adopted = Math.floor(Math.min(s_temp_req, s_temp_max) / 25) * 25;

    // Shear
    const lambda = 1.0;  // normal weight concrete
    const phi_Vc = i.phi_v * 0.17 * lambda * Math.sqrt(i.fc) * b * d / 1000;
    const shear_util = phi_Vc > 0 ? Vu / phi_Vc : 0;
    const shear_status = Vu <= phi_Vc ? "✓ SAFE" : "✗ INCREASE h";

    // Deflection
    const h_min =
      i.support_1w === "Simply Supported" ? i.Ln_1w / 20 :
      i.support_1w === "One End Continuous" ? i.Ln_1w / 24 :
      i.support_1w === "Both Ends Continuous" ? i.Ln_1w / 28 :
      i.Ln_1w / 10;  // Cantilever
    const thickness_status = i.h >= h_min ? "✓ ADEQUATE" : "✗ TOO THIN";

    const Ig = b * Math.pow(i.h, 3) / 12;
    // Immediate deflection using gross moment of inertia (conservative for cracked Icr but
    // appropriate for un-cracked slabs in residential service). Service load (kN/m):
    const ws_strip = (D_total + L_total) * b / 1000;  // kN/m
    // For different supports:
    let delta_immediate: number;
    if (i.support_1w === "Simply Supported") {
      // 5wL⁴/(384·EI). Convert ws (kN/m) to N/mm, L (mm), I (mm⁴), E (MPa = N/mm²)
      // ws (kN/m) = ws (N/mm). So formula = 5·(ws_N_per_mm)·L⁴/(384·E·I) gives mm directly.
      const w_Nmm = ws_strip; // 1 kN/m = 1 N/mm
      delta_immediate = 5 * w_Nmm * Math.pow(i.Ln_1w, 4) / (384 * Ec * Ig);
    } else if (i.support_1w === "Cantilever") {
      // wL⁴/(8EI)
      const w_Nmm = ws_strip;
      delta_immediate = w_Nmm * Math.pow(i.Ln_1w, 4) / (8 * Ec * Ig);
    } else {
      // Fixed-fixed approximation: wL⁴/(384EI)
      const w_Nmm = ws_strip;
      delta_immediate = w_Nmm * Math.pow(i.Ln_1w, 4) / (384 * Ec * Ig);
    }
    // Long-term deflection per ACI 24.2.4: Δlt = ξ·Δi/(1+50ρ') where ρ' = 0 for slabs typ.
    // ξ for 5+ years = 2.0
    const xi = 2.0;
    const delta_long_term = delta_immediate + xi * delta_immediate / (1 + 50 * 0);
    const delta_allowable = i.Ln_1w / 360;
    const defl_status = delta_long_term <= delta_allowable ? "✓ WITHIN LIMIT" : "✗ EXCEEDS LIMIT";

    // Crack control
    const crack_status = s_adopted <= s_crack_limit ? "✓ OK" : "✗ REDUCE SPACING";

    oneway = {
      d, wu_per_strip: wu_strip, Cm, Mu, Vu,
      Rn, rho_req, rho_min, rho_max, rho_design, As_req, Ab,
      s_req, s_max_crack, s_max_dh, s_adopted, As_prov, rho_prov,
      rho_max_status, flex_status,
      As_temp_req, Ab_temp, s_temp_req, s_temp_max, s_temp_adopted,
      phi_Vc, shear_util, shear_status,
      h_min, thickness_status,
      Ig, Ec, delta_immediate, delta_long_term, delta_allowable, defl_status,
      s_crack_limit, crack_status,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // TWO-WAY SLAB
  // ────────────────────────────────────────────────────────────────────────
  let twoway: TwoWayResults | undefined;
  if (effective_type === "Two-Way") {
    const b = 1000;  // 1m strip
    // Make sure Lx ≤ Ly. If not, swap is logical but we'll trust user inputs.
    const Lx = Math.min(i.Lx, i.Ly);
    const Ly = Math.max(i.Lx, i.Ly);
    const m = Lx / Ly;

    // Effective depths: short direction uses outer layer, long uses inner
    const dx = i.h - i.cover - i.db_short / 2;
    const dy = i.h - i.cover - i.db_short - i.db_long / 2;
    const Ab_short = Math.PI / 4 * i.db_short * i.db_short;
    const Ab_long = Math.PI / 4 * i.db_long * i.db_long;

    // Lookup coefficients with PROPER linear interpolation (Bug Fix #1)
    const caDL = interpolate(m, M_VALUES, Ca_dl[i.twoWayCase]);
    const cbDL = interpolate(m, M_VALUES, Cb_dl[i.twoWayCase]);
    const caLL = interpolate(m, M_VALUES, Ca_ll[i.twoWayCase]);
    const cbLL = interpolate(m, M_VALUES, Cb_ll[i.twoWayCase]);
    const caNeg = interpolate(m, M_VALUES, Ca_neg[i.twoWayCase]);
    const cbNeg = interpolate(m, M_VALUES, Cb_neg[i.twoWayCase]);

    const Lx_m = Lx / 1000;
    const Ly_m = Ly / 1000;

    // Positive moments at midspan (factored components)
    const Ma_DL = caDL * D_total * Lx_m * Lx_m;
    const Ma_LL = caLL * L_total * Lx_m * Lx_m;
    const Mb_DL = cbDL * D_total * Ly_m * Ly_m;
    const Mb_LL = cbLL * L_total * Ly_m * Ly_m;
    const Mu_short_pos = 1.2 * Ma_DL + 1.6 * Ma_LL;
    const Mu_long_pos = 1.2 * Mb_DL + 1.6 * Mb_LL;

    // Negative moments at continuous supports — apply factored wu (not separated)
    // For negative moments, all loads acting on a continuous edge
    const Mu_short_neg = caNeg * wu * Lx_m * Lx_m;
    const Mu_long_neg = cbNeg * wu * Ly_m * Ly_m;

    // ─── Flexural design helper ────────────────────────────────────────────
    const designAs = (Mu: number, d: number, Ab: number) => {
      if (Mu <= 0 || d <= 0) return { As_req: 0, s_req: Infinity, s_adopted: Math.floor(Math.min(450, 3 * i.h)/25)*25, As_prov: 0 };
      const Rn = Mu * 1e6 / (i.phi_f * b * d * d);
      const rho_req = (0.85 * i.fc / i.fy) * (1 - Math.sqrt(Math.max(0, 1 - 2 * Rn / (0.85 * i.fc))));
      const rho_design = Math.max(rho_req, rho_min);
      const As_req = rho_design * b * d;
      const s_req = Ab / As_req * 1000;
      const s_max = Math.min(450, 3 * i.h, s_crack_limit);
      const s_adopted = Math.floor(Math.min(s_req, s_max) / 25) * 25;
      const As_prov = s_adopted > 0 ? Ab / s_adopted * 1000 : 0;
      return { As_req, s_req, s_adopted, As_prov };
    };

    const shortPos = designAs(Mu_short_pos, dx, Ab_short);
    const longPos = designAs(Mu_long_pos, dy, Ab_long);
    const shortNeg = designAs(Mu_short_neg, dx, Ab_short);
    const longNeg = designAs(Mu_long_neg, dy, Ab_long);

    // One-way shear (per m width, at d from face of column/edge)
    const lambda = 1.0;
    const Vu_oneway = wu * (Lx_m / 2 - dx / 1000);
    const phi_Vc_oneway = i.phi_v * 0.17 * lambda * Math.sqrt(i.fc) * b * dx / 1000;
    const oneway_status = Vu_oneway <= phi_Vc_oneway ? "✓ SAFE" : "✗ INCREASE h";

    // Punching shear (Bug Fixes #3 and #5: real c1, c2; real β)
    const davg = (dx + dy) / 2;  // mm
    const davg_m = davg / 1000;
    const c1_m = i.c1 / 1000;
    const c2_m = i.c2 / 1000;
    // bo = perimeter at d/2 from face
    const bo = 2 * (c1_m + davg_m) + 2 * (c2_m + davg_m);  // m
    const beta_col = Math.max(i.c1, i.c2) / Math.min(i.c1, i.c2);  // long col / short col
    const alpha_s = 40;  // interior; could be made an input but typical interior support
    const A_crit = (c1_m + davg_m) * (c2_m + davg_m);  // m²
    const Vu_punch = wu * (Lx_m * Ly_m - A_crit);
    // Three ACI formulas (per ACI 318-19 §22.6.5.2):
    const Vc1 = 0.33 * lambda * Math.sqrt(i.fc) * bo * 1000 * davg / 1000;  // kN
    const Vc2 = 0.17 * (1 + 2 / beta_col) * lambda * Math.sqrt(i.fc) * bo * 1000 * davg / 1000;
    const Vc3 = 0.083 * (alpha_s * davg_m / bo + 2) * lambda * Math.sqrt(i.fc) * bo * 1000 * davg / 1000;
    const Vc_gov = Math.min(Vc1, Vc2, Vc3);
    const phi_Vc_punch = i.phi_v * Vc_gov;
    const punch_status = Vu_punch <= phi_Vc_punch ? "✓ SAFE" : "✗ INCREASE h";

    // Thickness check
    const h_min = Math.max(Math.ceil(Ly / 33 / 10) * 10, 125);  // ACI 8.3.1.1 simplified
    const thickness_status = i.h >= h_min ? "✓ ADEQUATE" : "✗ TOO THIN";

    twoway = {
      m, dx, dy, Ab_short, Ab_long,
      Ca_dl: caDL, Cb_dl: cbDL, Ca_ll: caLL, Cb_ll: cbLL, Ca_neg: caNeg, Cb_neg: cbNeg,
      Ma_DL, Ma_LL, Mb_DL, Mb_LL,
      Mu_short_pos, Mu_long_pos, Mu_short_neg, Mu_long_neg,
      As_short_pos: shortPos.As_req, s_short_pos: shortPos.s_adopted, As_short_pos_prov: shortPos.As_prov,
      As_long_pos: longPos.As_req, s_long_pos: longPos.s_adopted, As_long_pos_prov: longPos.As_prov,
      As_short_neg: shortNeg.As_req, s_short_neg: shortNeg.s_adopted, As_short_neg_prov: shortNeg.As_prov,
      As_long_neg: longNeg.As_req, s_long_neg: longNeg.s_adopted, As_long_neg_prov: longNeg.As_prov,
      Vu_oneway, phi_Vc_oneway, oneway_status,
      bo: bo, beta_col,
      Vu_punch, Vc1, Vc2, Vc3, phi_Vc_punch, punch_status,
      h_min, thickness_status,
    };
  }

  // ── Quantities ──────────────────────────────────────────────────────────
  let conc_vol = 0, steel_short = 0, steel_long = 0, formwork = 0;
  if (effective_type === "One-Way") {
    // Treat as 1m wide × Ln long strip for unit calcs (no actual panel concept for 1-way)
    const L = i.Ln_1w / 1000;
    conc_vol = L * 1 * i.h / 1000;  // m³ per m width
    // Bars main: 1000/s bars per m width × L (length)
    const main_bars_per_m = 1000 / oneway!.s_adopted;
    const temp_bars_per_m = 1000 / oneway!.s_temp_adopted;
    // Mass: main = main_bars × L × kg/m
    steel_short = main_bars_per_m * L * barMassPerM(i.db_1w);  // kg per m width
    steel_long = temp_bars_per_m * L * barMassPerM(i.dt_1w);   // temp bars
    formwork = L * 1;  // soffit only, since 1-way panels aren't bounded
  } else {
    const Lx = Math.min(i.Lx, i.Ly) / 1000;
    const Ly = Math.max(i.Lx, i.Ly) / 1000;
    conc_vol = Lx * Ly * i.h / 1000;
    const nx = Math.ceil(Ly * 1000 / twoway!.s_short_pos) + 1;
    const ny = Math.ceil(Lx * 1000 / twoway!.s_long_pos) + 1;
    steel_short = nx * Lx * barMassPerM(i.db_short);
    steel_long = ny * Ly * barMassPerM(i.db_long);
    formwork = Lx * Ly + 2 * (Lx + Ly) * i.h / 1000;  // soffit + edge forms
  }
  const conc_order = conc_vol * 1.1;
  const steel_total = (steel_short + steel_long) * 1.1;  // 10% lap allowance

  // ── Overall verdict ─────────────────────────────────────────────────────
  let allPass: boolean;
  if (effective_type === "One-Way") {
    allPass =
      oneway!.flex_status.startsWith("✓") &&
      oneway!.shear_status.startsWith("✓") &&
      oneway!.thickness_status.startsWith("✓") &&
      oneway!.defl_status.startsWith("✓") &&
      oneway!.crack_status.startsWith("✓") &&
      oneway!.rho_max_status.startsWith("✓");
  } else {
    allPass =
      twoway!.oneway_status.startsWith("✓") &&
      twoway!.punch_status.startsWith("✓") &&
      twoway!.thickness_status.startsWith("✓");
  }
  const overall_verdict: "PASS" | "FAIL" = allPass ? "PASS" : "FAIL";

  return {
    inputs: i,
    Ec, fr, beta1, rho_min, rho_max, s_crack_limit,
    loads,
    effective_type, detection_note,
    oneway, twoway,
    qty: { conc_vol, conc_order, steel_short, steel_long, steel_total, formwork },
    overall_verdict,
  };
}
