// lib/server/derive.ts
// NeuPrint v4.0 backend_required_calcs derivation
//
// Contract
// - Input: report object containing at least { gpt_raw: { raw_features: ... } , backend?: {...} }
// - Output: same report object with backend_required_calcs fields populated (deterministic).
//
// Principles
// - GPT returns raw features only.
// - All numeric scores are normalized to 0..1 where applicable.
// - Missing values are handled defensively (nullable fields remain null when spec says MVP-unused).
//
// NOTE
// - This file intentionally focuses on deterministic math/arrays.
// - Discrete selection / labeling / ranking belongs in inference.ts.

export type StructureType = "linear" | "hierarchical" | "networked" | string;

export type RawFeatures = {
  // Layer 0
  units: number;            // >= 1
  claims: number;
  reasons: number;
  evidence: number;

  // Layer 1
  sub_claims?: number;
  warrants?: number;
  counterpoints?: number;
  refutations?: number;
  structure_type?: StructureType;

  // Layer 2
  transitions?: number;
  transition_ok?: number;
  transition_types?: string[] | null;
  revisions?: number;
  revision_depth_sum?: number;
  belief_change?: boolean;

  // Evidence set
  evidence_types?: Record<string, number> | null;

  // Layer 3
  intent_markers?: number;
  drift_segments?: number;
  hedges?: number;
  loops?: number;
  self_regulation_signals?: number;

  // Other optional raw slots used by other charts
  adjacency_links?: number;
  cross_links?: number;

  // --- Optional extended raw features (from 계산용.xlsx) ---
  // Structural variance inputs
  argument_edge_patterns?: any;
  section_level_structure_vectors?: number[][]; // per-section structure vectors (e.g., ratios)
  cross_section_variation?: number;             // precomputed 0..1 proxy (if available)

  // Human rhythm inputs
  unit_lengths?: number[];          // length per unit
  transition_gaps?: number[];       // distance between transition points
  revision_positions?: number[];    // indices/positions where revisions occurred

  // Transition flow inputs
  transition_chain_length_avg?: number; // average chain length for transitions

  // Revision depth inputs (alternative to revision_depth_sum)
  revision_depths?: number[];       // per-revision depth values
  revision_types?: string[];        // per-revision type labels
};

export type DeriveOptions = {
  // Optional cohort CDF function for percentile.
  // Input is the overall level score (0..1 or 0..5 depending on your internal representation),
  // output must be percentile in 0..1.
  cohort_percentile_fn?: (levelScore: number) => number;
};

function safeDiv(a: number, b: number): number {
  return a / Math.max(1, b);
}
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function pickStructureWeight(st: StructureType): number {
  const t = (st || "linear").toLowerCase();
  if (t === "networked") return 1.0;
  if (t === "hierarchical") return 0.6;
  if (t === "linear") return 0.3;
  // fallback for unknown/custom types
  return 0.3;
}

function countEvidenceTypes01(evidenceTypes?: Record<string, number> | null): number {
  if (!evidenceTypes) return 0;
  const keys = Object.keys(evidenceTypes);
  let n = 0;
  for (const k of keys) {
    const v = Number(evidenceTypes[k] ?? 0);
    if (v > 0) n += 1;
  }
  // spec: normalize by 4 core types (experience/data/example/principle)
  return clamp01(n / 4);
}



// -----------------------------
// CFV (CFF Vector) + Derived Scores
// -----------------------------

export type CFV = {
  aas: number;
  ctf: number;
  rmd: number;
  rdx: number;
  eds: number;
  hi: number;
  tps_h: number;
  ifd: number;
};

function safeArr(nums: unknown): number[] | null {
  if (!Array.isArray(nums)) return null;
  const out: number[] = [];
  for (const v of nums) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out.length ? out : null;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = nums.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, nums.length);
  return Math.sqrt(Math.max(0, v));
}

function coeffVar(nums: number[]): number {
  const m = mean(nums);
  if (m === 0) return 0;
  return stdev(nums) / Math.abs(m);
}

// CFV(T) = [aas, ctf, rmd, rdx, eds, hi, tps_h, ifd]
export function computeCFVFromIndicatorScores(ind: any): CFV {
  const aas = clamp01(Number(ind?.AAS ?? 0));
  const ctf = clamp01(Number(ind?.CTF ?? 0));
  const rmd = clamp01(Number(ind?.RMD ?? 0));
  const rdx = clamp01(Number(ind?.RDX ?? 0));
  const eds = clamp01(Number(ind?.EDS ?? 0));
  const ifd = clamp01(Number(ind?.IFD ?? 0));

  // HI is not part of current CFF indicator_scores; derive a conservative proxy from IFD & RDX.
  // If your schema already provides backend.cff.indicator_scores.HI, it will be respected.
  const hi0 = ind?.HI;
  const hi = hi0 == null ? clamp01(0.55 * ifd + 0.45 * rdx) : clamp01(Number(hi0));

  // TPS-H is history-based; MVP: 0.5 if missing / null.
  const tps0 = ind?.TPS_H;
  const tps_h = tps0 == null ? 0.5 : clamp01(Number(tps0));

  return { aas, ctf, rmd, rdx, eds, hi, tps_h, ifd };
}

export function computeStructuralControlSignals(raw: RawFeatures, cfv: CFV) {
  // 3.1 structural_variance
  // If we have per-section structure vectors: SV = mean ||si - sbar||, then normalize.
  let structural_variance: number | null = null;
  const vectors = raw.section_level_structure_vectors;
  if (Array.isArray(vectors) && vectors.length > 1 && Array.isArray(vectors[0])) {
    const dims = Math.max(1, vectors[0].length);
    const m = new Array(dims).fill(0);
    for (const v of vectors) {
      for (let j = 0; j < dims; j++) m[j] += Number(v?.[j] ?? 0);
    }
    for (let j = 0; j < dims; j++) m[j] /= vectors.length;

    const dists: number[] = [];
    for (const v of vectors) {
      let s = 0;
      for (let j = 0; j < dims; j++) {
        const x = Number(v?.[j] ?? 0) - m[j];
        s += x * x;
      }
      dists.push(Math.sqrt(s));
    }
    const SV = mean(dists);
    const SVmax = 0.35; // scale reference (계산용.xlsx Sheet18)
    structural_variance = clamp01(SV / SVmax);
  } else if (raw.cross_section_variation != null) {
    structural_variance = clamp01(Number(raw.cross_section_variation));
  }

  // 3.2 human_rhythm_index: CV / CVref
  let human_rhythm_index: number | null = null;
  const unitLens = safeArr(raw.unit_lengths);
  const gaps = safeArr(raw.transition_gaps);
  const revPos = safeArr(raw.revision_positions);

  const cvs: number[] = [];
  if (unitLens) cvs.push(coeffVar(unitLens));
  if (gaps) cvs.push(coeffVar(gaps));
  if (revPos) cvs.push(coeffVar(revPos));

  if (cvs.length) {
    const CV = mean(cvs);
    const CVref = 0.6; // scale reference (계산용.xlsx Sheet18)
    human_rhythm_index = clamp01(CV / CVref);
  }

  // 3.3 transition_flow = (valid/total) * log(1 + avg_chain_length)
  const T = Math.max(0, Math.floor(Number(raw.transitions ?? 0)));
  const Tok = Math.max(0, Math.floor(Number(raw.transition_ok ?? 0)));
  const avgChain = Math.max(0, Number(raw.transition_chain_length_avg ?? 0));
  const tf = safeDiv(Tok, T) * Math.log(1 + avgChain);
  const transition_flow = clamp01(tf);

  // 3.4 revision_depth (계산용.xlsx Sheet18): min(1, revision_depth_sum / 3)
  let revision_depth: number | null = null;
  const DEPTH_DEN = 3.0;

  const explicitSum = (raw.revision_depth_sum != null && Number.isFinite(Number(raw.revision_depth_sum)))
    ? Number(raw.revision_depth_sum)
    : null;

  const revDepths = safeArr(raw.revision_depths);
  const listSum = revDepths ? revDepths.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : null;

  const useSum = explicitSum != null ? explicitSum : (listSum != null ? listSum : null);
  if (useSum != null) {
    revision_depth = clamp01(useSum / DEPTH_DEN);
  } else {
    // Fallback: use RDX as a proxy when revision depth inputs are absent.
    revision_depth = clamp01(cfv.rdx);
  }

  return {
    structural_variance: structural_variance == null ? clamp01(1 - cfv.aas) : structural_variance,
    human_rhythm_index: human_rhythm_index == null ? clamp01(cfv.hi * cfv.rmd) : human_rhythm_index,
    transition_flow,
    revision_depth,
  };
}

// Deterministic control vector (A,D,R) used by inference.ts
export function computeControlVector(cfv: CFV, signals: any, rslLevel01: number) {
  const sv = clamp01(Number(signals?.structural_variance ?? 0));
  const hri = clamp01(Number(signals?.human_rhythm_index ?? 0));
  const tf = clamp01(Number(signals?.transition_flow ?? 0));
  const rdx = clamp01(Number(signals?.revision_depth ?? 0));

  // Agency score A: same fallback weights used in inference.ts for consistency
  const A = clamp01(0.30 * sv + 0.25 * hri + 0.20 * tf + 0.25 * rdx);

  // Depth score D: prefer RSL level (0..1)
  const D = clamp01(rslLevel01);

  // Reflection score R: proxy from IFD (intent friction) and HI (human intervention)
  const R = clamp01(0.65 * cfv.ifd + 0.35 * cfv.hi);

  return { A_agency: A, D_depth: D, R_reflection: R };
}


/**
 * CFF indicator scores (v1.0) from Raw Features
 *
 * IMPORTANT: MVP rule
 * - KPF_SIM, TPS_H are backend-only and currently unused -> always null.
 */
export function computeCffIndicatorScoresV1(raw: RawFeatures, meta?: Report["meta"]): BackendReport["cff"]["indicator_scores"] {
  /**
   * Source of truth: 계산용.xlsx (Sheet2, "2. CFF 8 계산식")
   * All scores are normalized to 0..1 and clamped.
   *
   * Notes:
   * - KPF_SIM, TPS_H are optional. If absent, default 0.5 (neutral) to avoid
   *   unintentionally biasing the forensic layer.
   * - HI is not explicitly defined in the Excel spec. We compute a conservative
   *   proxy from intent_markers and transition stability. If you later define
   *   HI formally in the spreadsheet, replace this block.
   */
  const sat = (x: number, k: number) => {
    const xx = Math.max(0, Number.isFinite(x) ? x : 0);
    const kk = Math.max(1e-9, k);
    // 1 - exp(-x/k) gives diminishing returns and stays in [0,1)
    return 1 - Math.exp(-xx / kk);
  };

  const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

  const claims = raw.claims || 0;
  const reasons = raw.reasons || 0;
  const warrants = raw.warrants || 0;
  const counterpoints = raw.counterpoints || 0;
  const refutations = raw.refutations || 0;
  const crossLinks = raw.cross_links || 0;

  const transitions = raw.transitions || 0;
  const transitionOk = raw.transition_ok || 0;

  const revisions = raw.revisions || 0;
  const revisionDepthSum = raw.revision_depth_sum != null ? raw.revision_depth_sum : 0;

  const evidenceTypes = raw.evidence_types || 0;
  const citations = raw.citations || 0;
  const adjacencyLinks = raw.adjacency_links || 0;

  const hedges = raw.hedges || 0;
  const intentMarkers = raw.intent_markers || 0;

  // AAS
  const complexity = claims + reasons + warrants + counterpoints + refutations;
  const aas = clamp01(0.65 * sat(complexity, 6) + 0.35 * sat(crossLinks, 3));

  // CTF
  const ctf = clamp01(0.60 * sat(transitions, 8) + 0.40 * sat(transitionOk, 6));

  // RMD
  const rmd = clamp01(0.70 * sat(transitions, 6) + 0.30 * sat(crossLinks, 4));

  // RDX
  const rdx = clamp01(0.65 * sat(revisions, 6) + 0.35 * sat(revisionDepthSum, 3));

  // EDS
  const entropy = clamp01(0.50 * sat(evidenceTypes, 4) + 0.50 * sat(citations, 6));
  const connect = clamp01(adjacencyLinks / Math.max(1, claims + reasons + warrants));
  const eds = clamp01(0.65 * entropy + 0.35 * connect);

  // IFD (friction)
  const transitionBreaks = Math.max(0, transitions - transitionOk);
  const friction = sat(hedges + revisions + transitionBreaks, 6);
  const intentSat = sat(intentMarkers, 3);
  const ifd = clamp01(0.60 * friction + 0.40 * (1 - intentSat));

  // KPF_SIM (optional)
  const kpfSim = (() => {
    const vCur = (raw as any).kpf_current_vector as number[] | undefined;
    const vRef = (raw as any).kpf_ref_vector as number[] | undefined;
    if (!Array.isArray(vCur) || !Array.isArray(vRef) || vCur.length === 0 || vCur.length !== vRef.length) return 0.5;

    const dot = vCur.reduce((s, v, i) => s + v * vRef[i], 0);
    const n1 = Math.sqrt(vCur.reduce((s, v) => s + v * v, 0));
    const n2 = Math.sqrt(vRef.reduce((s, v) => s + v * v, 0));
    if (n1 <= 0 || n2 <= 0) return 0.5;

    const cos = dot / (n1 * n2);
    return clamp01((cos + 1) / 2); // map [-1,1] -> [0,1]
  })();

  // TPS_H (optional)
  const tpsH = (() => {
    // If a historical CFV vector is present (e.g., meta.history.cfv_hist),
    // compute cosine similarity. Otherwise return neutral 0.5.
    const cur = [aas, ctf, rmd, rdx, eds, ifd].map(clamp01);
    const hist = (meta as any)?.history?.cfv_hist as number[] | undefined;
    if (!Array.isArray(hist) || hist.length !== cur.length) return 0.5;

    const dot = cur.reduce((s, v, i) => s + v * hist[i], 0);
    const n1 = Math.sqrt(cur.reduce((s, v) => s + v * v, 0));
    const n2 = Math.sqrt(hist.reduce((s, v) => s + v * v, 0));
    if (n1 <= 0 || n2 <= 0) return 0.5;

    const cos = dot / (n1 * n2);
    return clamp01((cos + 1) / 2);
  })();

  // HI (not in Excel: conservative proxy)
  const hi = (() => {
    const stability = sat(transitionOk, 6);
    const intent = sat(intentMarkers, 3);
    return clamp01(0.70 * intent + 0.30 * stability);
  })();

  return {
    AAS: round4(aas),
    CTF: round4(ctf),
    RMD: round4(rmd),
    RDX: round4(rdx),
    EDS: round4(eds),
    HI: round4(hi),
    IFD: round4(ifd),
    KPF_SIM: round4(kpfSim),
    TPS_H: round4(tpsH),
  };
}

/**
 * Apply derived values into report.backend
 */
export function deriveBackendRequiredCalcs(report: any, opts: DeriveOptions = {}): any {
  const out = { ...(report || {}) };
  out.backend = { ...(out.backend || {}) };

  const raw: RawFeatures = (out.gpt_raw?.raw_features || {}) as RawFeatures;

  // -----------------------------
  // CFF indicator scores (v1.0)
  // -----------------------------
  const cffIndicators = computeCffIndicatorScoresV1(raw);
  out.backend.cff = { ...(out.backend.cff || {}) };
  out.backend.cff.indicator_scores = { ...(out.backend.cff.indicator_scores || {}), ...cffIndicators };
  // -----------------------------
  // CFV + derived scores (from 계산용.xlsx)
  // -----------------------------
  const cfv = computeCFVFromIndicatorScores(out.backend.cff.indicator_scores);

  // derived_scores are UI-facing helpers (0..1)
  // - structure/exploration are used by Cognitive Style 1-9 mapping (Sheet20)
  const structure = clamp01((cfv.aas + cfv.ctf + cfv.rdx) / 3);
  const exploration = clamp01((cfv.rmd + cfv.eds + (1 - cfv.ifd)) / 3);

  const structuralSignals = computeStructuralControlSignals(raw, cfv);

  out.backend.cff.derived_scores = {
    ...(out.backend.cff.derived_scores || {}),
    structure,
    exploration,
    structural_variance: structuralSignals.structural_variance,
    human_rhythm_index: structuralSignals.human_rhythm_index,
    transition_flow: structuralSignals.transition_flow,
    revision_depth: structuralSignals.revision_depth,
  };

  // Keep a compact CFV for downstream deterministic inference (optional)
  out.backend.cff.cfv = { ...(out.backend.cff.cfv || {}), ...cfv };

  // -----------------------------
  // -----------------------------
// CFF observed_patterns (RE/IE/EW/AR/SI/RR/HE/MD)
// Source: 계산용.xlsx Sheet15 (Observed Pattern scoring + selection) and catalog text.
// IMPORTANT: We do NOT use legacy score keys like S_CE/S_LR/S_PT. Those keys are treated as deprecated.
//
// We compute deterministic pattern scores from indicator_scores (0..1) and select primary/secondary.
const ind = out.backend.cff.indicator_scores || {};
const AAS = safeNum(ind.AAS);
const CTF = safeNum(ind.CTF);
const RMD = safeNum(ind.RMD);
const RDX = safeNum(ind.RDX);
const EDS = safeNum(ind.EDS);
const HI  = safeNum(ind.HI);
const IFD = safeNum(ind.IFD);

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// If core indicators are missing, keep observed_patterns empty but stable.
const hasCore =
  AAS != null && CTF != null && RMD != null && RDX != null && EDS != null && IFD != null;

// Pattern score definitions (0..1)
// Source of truth: 계산용.xlsx (Sheet15, "4) Pattern score 계산...")
// Core helper aggregates from Sheet15.
const Analyticity = !hasCore ? null : clamp01((AAS! + EDS!) / 2);
const Flow = !hasCore ? null : clamp01((CTF! + RMD!) / 2);
const Metacog_raw = !hasCore ? null : clamp01((RDX! + (1 - IFD!)) / 2);

// Canonical pattern scores used for primary/secondary selection.
const S_RE = !hasCore ? null : clamp01(0.45 * RDX! + 0.30 * CTF! + 0.25 * RMD!); // Reflective Explorer
const S_IE = !hasCore ? null : clamp01(0.60 * Flow! + 0.40 * (1 - Analyticity!)); // Intuitive Explorer
const S_EW = !hasCore ? null : clamp01(0.55 * EDS! + 0.45 * AAS!); // Evidence Weaver
const S_AR = !hasCore ? null : clamp01((0.65 * AAS! + 0.35 * EDS!) - 0.20 * CTF!); // Analytical Reasoner
const S_SI = !hasCore ? null : clamp01(Math.min(Analyticity!, Flow!, Metacog_raw!)); // Strategic Integrator
const S_RR = !hasCore ? null : clamp01(0.60 * RDX! + 0.40 * (1 - IFD!)); // Regulation Reviser

// Additional pattern slots required by all.field.json (Excel does not define formulas explicitly)
// If you later define these in a sheet, replace these proxies.
const S_CE = !hasCore ? null : clamp01(0.50 * Flow! + 0.30 * EDS! + 0.20 * (1 - AAS!)); // Creative Explorer (proxy)
const S_LR = !hasCore ? null : clamp01(0.60 * AAS! + 0.30 * CTF! + 0.10 * (1 - RDX!)); // Linear Responder (proxy)
const S_PT = !hasCore ? null : clamp01(0.50 * CTF! + 0.30 * AAS! + 0.20 * (1 - EDS!)); // Procedural Thinker (proxy)

const allScores: Record<string, number> = {};
const scored: Array<{ code: string; score: number }> = [];
const pushScore = (code: string, s: number | null) => {
  if (s == null) return;
  allScores[code] = round4(s);
  scored.push({ code, score: s });
};

pushScore("S_RE", S_RE);
pushScore("S_IE", S_IE);
pushScore("S_AR", S_AR);
pushScore("S_CE", S_CE);
pushScore("S_LR", S_LR);
pushScore("S_PT", S_PT);

// Optional extras (not required by the current schema, but useful for internal QA)
pushScore("S_EW", S_EW);
pushScore("S_SI", S_SI);
pushScore("S_RR", S_RR);

scored.sort((a, b) => b.score - a.score);
const top1 = scored[0] || null;
const top2 = scored[1] || null;

const delta = (top1 && top2) ? clamp01(top1.score - top2.score) : 0;
const confidence = clamp01(sigmoid(delta * 6));
const OBS_CATALOG: Record<string, { label: string; description: string }> = {
  S_RE: {
    label: "Reflective Explorer",
    description:
      "Reflective Explorer shows active self-revision and exploratory restructuring during reasoning. Thought progresses through reflection, reassessment, and adaptive refinement.",
  },
  S_IE: {
    label: "Intuitive Explorer",
    description:
      "Intuitive Explorer advances reasoning through associative exploration. Structure emerges progressively rather than being fully pre-defined at the start.",
  },
  S_AR: {
    label: "Analytical Reasoner",
    description:
      "Analytical Reasoner demonstrates clear argument architecture and evidence-linked structure. Reasoning proceeds with explicit decomposition and stable logical scaffolding.",
  },
  S_CE: {
    label: "Creative Explorer",
    description:
      "Creative Explorer emphasizes generative exploration and perspective shifting, while still maintaining a navigable structure. This is a proxy pattern until an explicit spreadsheet definition is provided.",
  },
  S_LR: {
    label: "Linear Responder",
    description:
      "Linear Responder follows a straightforward, stepwise progression with limited backtracking. This is a proxy pattern until an explicit spreadsheet definition is provided.",
  },
  S_PT: {
    label: "Procedural Thinker",
    description:
      "Procedural Thinker applies a consistent procedure or checklist-like structure. This is a proxy pattern until an explicit spreadsheet definition is provided.",
  },

  // Optional extras (not required by the current schema)
  S_EW: {
    label: "Evidence Weaver",
    description:
      "Evidence Weaver integrates diverse evidence signals into a coherent argument. Evidence variety and linkage are consistently present across reasoning transitions.",
  },
  S_SI: {
    label: "Strategic Integrator",
    description:
      "Strategic Integrator balances analytic structure, flow, and self-regulation. Reasoning integrates multiple constraints while maintaining coherence under uncertainty.",
  },
  S_RR: {
    label: "Regulation Reviser",
    description:
      "Regulation Reviser shows strong revision-driven regulation and correction loops, especially when encountering inconsistencies or insufficient support.",
  },
};


const mk = (t: { code: string; score: number } | null) => {
  if (!t) return null;
  const c = OBS_CATALOG[t.code] || { label: t.code, description: "" };
  return { code: t.code, label: c.label, description: c.description, score: round4(t.score) };
};

out.backend.cff.observed_patterns = {
  ...(out.backend.cff.observed_patterns || {}),
  all_pattern_scores: {
    ...(out.backend.cff.observed_patterns?.all_pattern_scores || {}),
    ...allScores,
  },
  pattern_confidence: {
    ...(out.backend.cff.observed_patterns?.pattern_confidence || {}),
    delta_top1_top2: round4(delta),
    confidence: round4(confidence),
  },
  primary: mk(top1),
  secondary: mk(top2),
};
// -----------------------------
  // Control distribution labels (from 11.xlsx cat_control_dist_labels)
  // -----------------------------
  out.backend.control = { ...(out.backend.control || {}) };
  (out.backend.control as any).distribution_label_display = {
    ...(out.backend.control as any).distribution_label_display,
    human: { display_name: "Human", notes: null },
    hybrid: { display_name: "Hybrid", notes: null },
    ai: { display_name: "AI", notes: null },
  };



  // -----------------------------
  // RSL chart helpers (existing)
  // -----------------------------
  // NOTE: For cohort percentile & distribution you can inject a cohort_percentile_fn,
  // otherwise we fallback to a safe heuristic so the UI does not break.
  out.backend.rsl = { ...(out.backend.rsl || {}) };
  const rslOverall = out.backend.rsl.overall || {};
  const levelScore0to5 = Number(rslOverall.level_score_0to5 ?? 0);
  const levelCode = String(rslOverall.level_code ?? "");
  if (levelCode) {
    const lvl = lookupRslLevel(levelCode);
    if (lvl) {
      out.backend.rsl.overall = { ...rslOverall, level_short_name: out.backend.rsl.overall?.level_short_name ?? String(lvl.level_short_name), level_full_name: out.backend.rsl.overall?.level_full_name ?? String(lvl.level_full_name), level_description: out.backend.rsl.overall?.level_description ?? String(lvl.level_description) };
    }
  }
  const levelScore01 = clamp01(levelScore0to5 / 5);
  // -----------------------------
  // Control vector (A,D,R) for inference.ts
  // -----------------------------
  out.backend.control = { ...(out.backend.control || {}) };
  const controlVec = computeControlVector(out.backend.cff.cfv || computeCFVFromIndicatorScores(out.backend.cff.indicator_scores), out.backend.cff.derived_scores, levelScore01);
  out.backend.control.control_vector = { ...(out.backend.control.control_vector || {}), ...controlVec };


  // radar.values[] = clamp01(dimension_scores.Ri.score_0to1)
  const dim = out.backend.rsl.dimension_scores || {};
  const radarVals: number[] = [];
  for (let i = 1; i <= 8; i++) {
    const key = `R${i}`;
    const v = Number(dim?.[key]?.score_0to1 ?? 0);
    radarVals.push(clamp01(v));
  }
  out.backend.rsl.charts = { ...(out.backend.rsl.charts || {}) };
  out.backend.rsl.charts.radar = { ...(out.backend.rsl.charts.radar || {}), values: radarVals };

  // Cohort positioning: minimal safe default distribution if you don't have cohort dataset.
  const DEFAULT_COHORT_DISTRIBUTION = [
    { bin_min: 0.0, bin_max: 0.2, share: 0.12 },
    { bin_min: 0.2, bin_max: 0.4, share: 0.26 },
    { bin_min: 0.4, bin_max: 0.6, share: 0.32 },
    { bin_min: 0.6, bin_max: 0.8, share: 0.22 },
    { bin_min: 0.8, bin_max: 1.0, share: 0.08 },
  ];

  const percentileFn = opts.cohort_percentile_fn;
  const percentile = percentileFn ? clamp01(percentileFn(levelScore0to5)) : clamp01(levelScore01); // fallback
  const placementDisplay = `Top ${Math.round((1 - percentile) * 100)}%`;

  out.backend.rsl.cohort = { ...(out.backend.rsl.cohort || {}) };
  out.backend.rsl.cohort.percentile_0to1 = percentile;
  out.backend.rsl.cohort.placement_display = placementDisplay;
  const cohortNote = lookupCohortNote(percentile);
  if (cohortNote) out.backend.rsl.cohort.note_en = out.backend.rsl.cohort.note_en ?? cohortNote;


  out.backend.rsl.charts.cohort_positioning = {
    ...(out.backend.rsl.charts.cohort_positioning || {}),
    distribution: out.backend.rsl.charts.cohort_positioning?.distribution || DEFAULT_COHORT_DISTRIBUTION,
    marker: { score_0to1: levelScore01, percentile_0to1: percentile },
  };

  // stability_index: simple proxy if not provided (can be replaced with your exact spec later)
  out.backend.rsl.stability = { ...(out.backend.rsl.stability || {}) };
  if (out.backend.rsl.stability.stability_index == null) {
    // proxy: 1 - variance(radarVals) scaled
    const mean = radarVals.reduce((a, b) => a + b, 0) / Math.max(1, radarVals.length);
    const var0 = radarVals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, radarVals.length);
    out.backend.rsl.stability.stability_index = clamp01(1 - Math.min(1, var0 * 4));
  const st = safeNum(out.backend.rsl.stability.stability_index);
  if (st != null) {
    const sn = lookupStabilityNote(st);
    if (sn) {
      out.backend.rsl.stability.band = out.backend.rsl.stability.band ?? sn.band;
      out.backend.rsl.stability.note_en = out.backend.rsl.stability.note_en ?? sn.note_en;
    }
  }

  // Role-fit (deterministic)
  computeRoleFitDeterministic(out);

  return out;
}


// -----------------------------------------------------------------------------
// Role-fit deterministic engine (from 계산용.xlsx Sheet19 + Sheet1)
// Axes: Analyticity, Flow, Metacognition, Authenticity (all 0..1)
// -----------------------------------------------------------------------------

type RoleFitAxes = {
  analyticity: number;
  flow: number;
  metacognition: number;
  authenticity: number;
};

const ROLE_GROUP_LABELS: Record<number, string> = {"1": "Strategy · Analysis · Policy", "2": "Data · AI · Intelligence", "3": "Engineering · Technology · Architecture", "4": "Product · Service · Innovation", "5": "Education · Research · Training", "6": "Psychology · Counseling · Social Care", "7": "Leadership · Executive · Public Governance", "8": "Marketing · Sales · Communication", "9": "Design · Content · Media", "10": "Healthcare · Life Science", "11": "Law · Compliance · Ethics", "12": "Operations · Quality · Safety · Logistics", "13": "Finance · Investment · Insurance", "14": "Culture · HR · Organization", "15": "Automation · Digital Agent"};

// -----------------------------
// Catalog datasets (from 11.xlsx)
// -----------------------------
const CATALOG_RSL_LEVELS = [
  {
    "level_code": "L1",
    "level_short_name": "Fragmented",
    "level_full_name": "Fragmented Reasoning",
    "level_description": "Disconnected statements without a traceable reasoning structure."
  },
  {
    "level_code": "L2",
    "level_short_name": "Linear",
    "level_full_name": "Linear Reasoning",
    "level_description": "Single-direction logic with limited perspective branching or qualification."
  },
  {
    "level_code": "L3",
    "level_short_name": "Structured",
    "level_full_name": "Structured Reasoning",
    "level_description": "Organized reasoning components with partial coordination across dimensions."
  },
  {
    "level_code": "L4",
    "level_short_name": "Integrated",
    "level_full_name": "Integrated Reasoning",
    "level_description": "Multiple reasoning dimensions coordinated into a stable, non-dominant structure."
  },
  {
    "level_code": "L5",
    "level_short_name": "Reflective",
    "level_full_name": "Reflective Reasoning",
    "level_description": "Explicit self-correction and value-based constraints applied within the reasoning flow"
  },
  {
    "level_code": "L6",
    "level_short_name": "Generative",
    "level_full_name": "Generative Reasoning",
    "level_description": "Reasoning that models, evaluates, and generates transferable cognitive frameworks."
  }
] as const;
const CATALOG_COHORT_NOTES = [
  {
    "cohort_range": "Top 50–100%",
    "note_en": "Core reasoning steps are emerging, with structure still developing compared to most peers."
  },
  {
    "cohort_range": "Top 30–50%",
    "note_en": "Developing structure, with several reasoning patterns beginning to align relative to comparable peers."
  },
  {
    "cohort_range": "Top 20–30%",
    "note_en": "Generally well-structured reasoning compared to most peers, with room for further stabilization."
  },
  {
    "cohort_range": "Top 10–20%",
    "note_en": "Consistently structured reasoning relative to comparable peers."
  },
  {
    "cohort_range": "Top 5–10%",
    "note_en": "Highly consistent reasoning structure compared to most peers, even as complexity increases."
  },
  {
    "cohort_range": "Top 1–5%",
    "note_en": "Exceptionally stable reasoning structure within the current comparison group."
  }
] as const;
const CATALOG_STABILITY_INDEX_NOTES = [
  {
    "threshold": "≥ 0.85",
    "band": "HIGH",
    "note_en": "Your reasoning structure remains stable even with minor wording changes."
  },
  {
    "threshold": "0.70–0.84",
    "band": "MEDIUM",
    "note_en": "Your reasoning structure is generally stable, with some sensitivity to wording changes."
  },
  {
    "threshold": "< 0.70",
    "band": "LOW",
    "note_en": "Your reasoning structure varies noticeably when wording changes, so results may shift across attempts."
  }
] as const;
const CATALOG_FRI_NOTES = [
  {
    "fri_range": "0.00 – 0.79",
    "note_en": "Your reasoning structure is still taking shape. Ideas often appear separately, making connections harder to follow."
  },
  {
    "fri_range": "0.80 – 1.59",
    "note_en": "Early signs of structure are beginning to appear. Some steps are present, but connections and checks are not yet consistent."
  },
  {
    "fri_range": "1.60 – 2.39",
    "note_en": "A basic reasoning structure is forming. Key steps align, though stability can drop as complexity increases."
  },
  {
    "fri_range": "2.40 – 3.19",
    "note_en": "Your reasoning structure works well overall. Most ideas connect, with occasional gaps in validation or monitoring."
  },
  {
    "fri_range": "3.20 – 3.99",
    "note_en": "Your reasoning structure is stable in most situations. Connections and evaluations usually remain consistent."
  },
  {
    "fri_range": "4.00 – 5.00",
    "note_en": "You can reason structurally even in complex situations. Your thinking stays stable and self-regulated as ideas scale."
  }
] as const;


function lookupCohortNote(percentile01: number): string | null {
  const pct = clamp01(percentile01);
  const rank = 1 - pct; // top-ness
  // Cohort notes are in 'Top X–Y%' form. We'll map by rank.
  // Ranges are inclusive; we parse numbers from strings like "Top 10–20%".
  for (const r of (CATALOG_COHORT_NOTES as any[])) {
    const s = String(r.cohort_range || "");
    const m = s.match(/Top\s*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)%/i);
    if (!m) continue;
    const a = Number(m[1]) / 100;
    const b = Number(m[2]) / 100;
    if (rank >= a && rank <= b) return String(r.note_en || "");
    const m2 = s.match(/Top\s*(\d+(?:\.\d+)?)%\s*or\s*above/i);
    if (m2 && rank <= Number(m2[1]) / 100) return String(r.note_en || "");
  }
  return null;
}

function lookupStabilityNote(stability01: number): { band: string; note_en: string } | null {
  const x = clamp01(stability01);
  // thresholds strings like "≥ 0.85"
  let best: any | null = null;
  for (const r of (CATALOG_STABILITY_INDEX_NOTES as any[])) {
    const th = String(r.threshold || "");
    const m = th.match(/≥\s*(0?\.\d+|1(?:\.0+)?)/);
    if (!m) continue;
    const t = Number(m[1]);
    if (x >= t) {
      if (!best || t > best.t) best = { t, band: String(r.band || ""), note_en: String(r.note_en || "") };
    }
  }
  return best ? { band: best.band, note_en: best.note_en } : null;
}

function lookupRslLevel(levelCode: string): any | null {
  return (CATALOG_RSL_LEVELS as any[]).find((r) => String(r.level_code) === String(levelCode)) || null;
}

const OCCUPATION_TARGET_AXES: Array<{
  occupation_id: string;
  display_name: string;
  role_group_id: number;
  target_axes: RoleFitAxes;
}> = [{"occupation_id": "STRATEGY_ANALYST", "display_name": "Strategy Analyst", "role_group_id": 1, "target_axes": {"analyticity": 0.43, "flow": 0.146, "metacognition": 0.32, "authenticity": 0.104}}, {"occupation_id": "MANAGEMENT_ANALYST", "display_name": "Management Analyst", "role_group_id": 1, "target_axes": {"analyticity": 0.43, "flow": 0.146, "metacognition": 0.32, "authenticity": 0.104}}, {"occupation_id": "POLICY_ANALYST", "display_name": "Policy Analyst", "role_group_id": 1, "target_axes": {"analyticity": 0.379, "flow": 0.117, "metacognition": 0.377, "authenticity": 0.127}}, {"occupation_id": "ECONOMIC_RESEARCHER", "display_name": "Economic Researcher", "role_group_id": 1, "target_axes": {"analyticity": 0.43, "flow": 0.146, "metacognition": 0.32, "authenticity": 0.104}}, {"occupation_id": "FINANCIAL_ANALYST", "display_name": "Financial Analyst", "role_group_id": 1, "target_axes": {"analyticity": 0.43, "flow": 0.146, "metacognition": 0.32, "authenticity": 0.104}}, {"occupation_id": "RISK_ANALYST", "display_name": "Risk Analyst", "role_group_id": 1, "target_axes": {"analyticity": 0.43, "flow": 0.146, "metacognition": 0.32, "authenticity": 0.104}}, {"occupation_id": "COMPLIANCE_OFFICER", "display_name": "Compliance Officer", "role_group_id": 1, "target_axes": {"analyticity": 0.362, "flow": 0.116, "metacognition": 0.401, "authenticity": 0.121}}, {"occupation_id": "INTERNAL_AUDITOR", "display_name": "Internal Auditor", "role_group_id": 1, "target_axes": {"analyticity": 0.362, "flow": 0.116, "metacognition": 0.401, "authenticity": 0.121}}, {"occupation_id": "DATA_ANALYST", "display_name": "Data Analyst", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "DATA_SCIENTIST", "display_name": "Data Scientist", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "BUSINESS_INTELLIGENCE_ANALYST", "display_name": "Business Intelligence Analyst", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "MACHINE_LEARNING_ANALYST", "display_name": "Machine Learning Analyst", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "STATISTICIAN", "display_name": "Statistician", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "OPERATIONS_RESEARCH_ANALYST", "display_name": "Operations Research Analyst", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "INFORMATION_SECURITY_ANALYST", "display_name": "Information Security Analyst", "role_group_id": 2, "target_axes": {"analyticity": 0.396, "flow": 0.34, "metacognition": 0.226, "authenticity": 0.038}}, {"occupation_id": "SOFTWARE_ENGINEER", "display_name": "Software Engineer", "role_group_id": 3, "target_axes": {"analyticity": 0.373, "flow": 0.402, "metacognition": 0.209, "authenticity": 0.016}}, {"occupation_id": "SYSTEMS_ARCHITECT", "display_name": "Systems Architect", "role_group_id": 3, "target_axes": {"analyticity": 0.373, "flow": 0.402, "metacognition": 0.209, "authenticity": 0.016}}, {"occupation_id": "CLOUD_ENGINEER", "display_name": "Cloud Engineer", "role_group_id": 3, "target_axes": {"analyticity": 0.373, "flow": 0.402, "metacognition": 0.209, "authenticity": 0.016}}, {"occupation_id": "DEVOPS_ENGINEER", "display_name": "DevOps Engineer", "role_group_id": 3, "target_axes": {"analyticity": 0.373, "flow": 0.402, "metacognition": 0.209, "authenticity": 0.016}}, {"occupation_id": "NETWORK_ARCHITECT", "display_name": "Network Architect", "role_group_id": 3, "target_axes": {"analyticity": 0.373, "flow": 0.402, "metacognition": 0.209, "authenticity": 0.016}}, {"occupation_id": "QA_ENGINEER", "display_name": "QA Engineer", "role_group_id": 3, "target_axes": {"analyticity": 0.373, "flow": 0.402, "metacognition": 0.209, "authenticity": 0.016}}, {"occupation_id": "SAFETY_SYSTEMS_ENGINEER", "display_name": "Safety Systems Engineer", "role_group_id": 3, "target_axes": {"analyticity": 0.332, "flow": 0.382, "metacognition": 0.271, "authenticity": 0.015}}, {"occupation_id": "PRODUCT_MANAGER", "display_name": "Product Manager", "role_group_id": 4, "target_axes": {"analyticity": 0.229, "flow": 0.167, "metacognition": 0.208, "authenticity": 0.396}}, {"occupation_id": "SERVICE_DESIGNER", "display_name": "Service Designer", "role_group_id": 4, "target_axes": {"analyticity": 0.206, "flow": 0.208, "metacognition": 0.206, "authenticity": 0.38}}, {"occupation_id": "UX_PLANNER", "display_name": "UX Planner", "role_group_id": 4, "target_axes": {"analyticity": 0.206, "flow": 0.208, "metacognition": 0.206, "authenticity": 0.38}}, {"occupation_id": "BUSINESS_DEVELOPER", "display_name": "Business Developer", "role_group_id": 4, "target_axes": {"analyticity": 0.229, "flow": 0.167, "metacognition": 0.208, "authenticity": 0.396}}, {"occupation_id": "INNOVATION_MANAGER", "display_name": "Innovation Manager", "role_group_id": 4, "target_axes": {"analyticity": 0.229, "flow": 0.167, "metacognition": 0.208, "authenticity": 0.396}}, {"occupation_id": "RD_PLANNER", "display_name": "R&D Planner", "role_group_id": 4, "target_axes": {"analyticity": 0.245, "flow": 0.167, "metacognition": 0.235, "authenticity": 0.353}}, {"occupation_id": "NEW_VENTURE_STRATEGIST", "display_name": "New Venture Strategist", "role_group_id": 4, "target_axes": {"analyticity": 0.245, "flow": 0.167, "metacognition": 0.235, "authenticity": 0.353}}, {"occupation_id": "TEACHER", "display_name": "Teacher", "role_group_id": 5, "target_axes": {"analyticity": 0.173, "flow": 0.113, "metacognition": 0.478, "authenticity": 0.236}}, {"occupation_id": "PROFESSOR", "display_name": "Professor", "role_group_id": 5, "target_axes": {"analyticity": 0.191, "flow": 0.122, "metacognition": 0.455, "authenticity": 0.232}}, {"occupation_id": "INSTRUCTIONAL_DESIGNER", "display_name": "Instructional Designer", "role_group_id": 5, "target_axes": {"analyticity": 0.173, "flow": 0.113, "metacognition": 0.478, "authenticity": 0.236}}, {"occupation_id": "EDUCATION_CONSULTANT", "display_name": "Education Consultant", "role_group_id": 5, "target_axes": {"analyticity": 0.173, "flow": 0.113, "metacognition": 0.478, "authenticity": 0.236}}, {"occupation_id": "RESEARCH_SCIENTIST", "display_name": "Research Scientist", "role_group_id": 5, "target_axes": {"analyticity": 0.224, "flow": 0.133, "metacognition": 0.429, "authenticity": 0.214}}, {"occupation_id": "RESEARCH_COORDINATOR", "display_name": "Research Coordinator", "role_group_id": 5, "target_axes": {"analyticity": 0.224, "flow": 0.133, "metacognition": 0.429, "authenticity": 0.214}}, {"occupation_id": "ACADEMIC_ADVISOR", "display_name": "Academic Advisor", "role_group_id": 5, "target_axes": {"analyticity": 0.173, "flow": 0.113, "metacognition": 0.478, "authenticity": 0.236}}, {"occupation_id": "COUNSELOR", "display_name": "Counselor", "role_group_id": 6, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "CLINICAL_PSYCHOLOGIST", "display_name": "Clinical Psychologist", "role_group_id": 6, "target_axes": {"analyticity": 0.113, "flow": 0.114, "metacognition": 0.33, "authenticity": 0.443}}, {"occupation_id": "SCHOOL_PSYCHOLOGIST", "display_name": "School Psychologist", "role_group_id": 6, "target_axes": {"analyticity": 0.113, "flow": 0.114, "metacognition": 0.33, "authenticity": 0.443}}, {"occupation_id": "SOCIAL_WORKER", "display_name": "Social Worker", "role_group_id": 6, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "BEHAVIORAL_THERAPIST", "display_name": "Behavioral Therapist", "role_group_id": 6, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "REHABILITATION_SPECIALIST", "display_name": "Rehabilitation Specialist", "role_group_id": 6, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "CEO_COO_CSO", "display_name": "CEO / COO / CSO", "role_group_id": 7, "target_axes": {"analyticity": 0.232, "flow": 0.12, "metacognition": 0.242, "authenticity": 0.406}}, {"occupation_id": "PUBLIC_POLICY_DIRECTOR", "display_name": "Public Policy Director", "role_group_id": 7, "target_axes": {"analyticity": 0.232, "flow": 0.12, "metacognition": 0.242, "authenticity": 0.406}}, {"occupation_id": "GOVERNMENT_ADMINISTRATOR", "display_name": "Government Administrator", "role_group_id": 7, "target_axes": {"analyticity": 0.232, "flow": 0.12, "metacognition": 0.242, "authenticity": 0.406}}, {"occupation_id": "PROGRAM_DIRECTOR", "display_name": "Program Director", "role_group_id": 7, "target_axes": {"analyticity": 0.232, "flow": 0.12, "metacognition": 0.242, "authenticity": 0.406}}, {"occupation_id": "PUBLIC_STRATEGY_LEAD", "display_name": "Public Strategy Lead", "role_group_id": 7, "target_axes": {"analyticity": 0.232, "flow": 0.12, "metacognition": 0.242, "authenticity": 0.406}}, {"occupation_id": "MARKETING_STRATEGIST", "display_name": "Marketing Strategist", "role_group_id": 8, "target_axes": {"analyticity": 0.103, "flow": 0.231, "metacognition": 0.184, "authenticity": 0.482}}, {"occupation_id": "BRAND_MANAGER", "display_name": "Brand Manager", "role_group_id": 8, "target_axes": {"analyticity": 0.094, "flow": 0.22, "metacognition": 0.176, "authenticity": 0.51}}, {"occupation_id": "SALES_DIRECTOR", "display_name": "Sales Director", "role_group_id": 8, "target_axes": {"analyticity": 0.094, "flow": 0.22, "metacognition": 0.176, "authenticity": 0.51}}, {"occupation_id": "PR_MANAGER", "display_name": "PR Manager", "role_group_id": 8, "target_axes": {"analyticity": 0.094, "flow": 0.22, "metacognition": 0.176, "authenticity": 0.51}}, {"occupation_id": "COMMUNICATION_MANAGER", "display_name": "Communication Manager", "role_group_id": 8, "target_axes": {"analyticity": 0.094, "flow": 0.22, "metacognition": 0.176, "authenticity": 0.51}}, {"occupation_id": "MEDIA_PLANNER", "display_name": "Media Planner", "role_group_id": 8, "target_axes": {"analyticity": 0.103, "flow": 0.231, "metacognition": 0.184, "authenticity": 0.482}}, {"occupation_id": "DIGITAL_MARKETER", "display_name": "Digital Marketer", "role_group_id": 8, "target_axes": {"analyticity": 0.103, "flow": 0.231, "metacognition": 0.184, "authenticity": 0.482}}, {"occupation_id": "UX_UI_DESIGNER", "display_name": "UX/UI Designer", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "GRAPHIC_DESIGNER", "display_name": "Graphic Designer", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "VIDEO_PRODUCER", "display_name": "Video Producer", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "CONTENT_STRATEGIST", "display_name": "Content Strategist", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "CREATIVE_DIRECTOR", "display_name": "Creative Director", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "EDITOR", "display_name": "Editor", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "MULTIMEDIA_ARTIST", "display_name": "Multimedia Artist", "role_group_id": 9, "target_axes": {"analyticity": 0.11, "flow": 0.373, "metacognition": 0.11, "authenticity": 0.407}}, {"occupation_id": "PHYSICIAN", "display_name": "Physician", "role_group_id": 10, "target_axes": {"analyticity": 0.3, "flow": 0.15, "metacognition": 0.3, "authenticity": 0.25}}, {"occupation_id": "NURSE", "display_name": "Nurse", "role_group_id": 10, "target_axes": {"analyticity": 0.278, "flow": 0.139, "metacognition": 0.3, "authenticity": 0.283}}, {"occupation_id": "MEDICAL_RESEARCHER", "display_name": "Medical Researcher", "role_group_id": 10, "target_axes": {"analyticity": 0.333, "flow": 0.167, "metacognition": 0.296, "authenticity": 0.204}}, {"occupation_id": "CLINICAL_DATA_MANAGER", "display_name": "Clinical Data Manager", "role_group_id": 10, "target_axes": {"analyticity": 0.333, "flow": 0.167, "metacognition": 0.296, "authenticity": 0.204}}, {"occupation_id": "BIOMEDICAL_SCIENTIST", "display_name": "Biomedical Scientist", "role_group_id": 10, "target_axes": {"analyticity": 0.333, "flow": 0.167, "metacognition": 0.296, "authenticity": 0.204}}, {"occupation_id": "PUBLIC_HEALTH_ANALYST", "display_name": "Public Health Analyst", "role_group_id": 10, "target_axes": {"analyticity": 0.322, "flow": 0.161, "metacognition": 0.307, "authenticity": 0.21}}, {"occupation_id": "LAWYER", "display_name": "Lawyer", "role_group_id": 11, "target_axes": {"analyticity": 0.35, "flow": 0.1, "metacognition": 0.25, "authenticity": 0.3}}, {"occupation_id": "LEGAL_RESEARCHER", "display_name": "Legal Researcher", "role_group_id": 11, "target_axes": {"analyticity": 0.372, "flow": 0.107, "metacognition": 0.267, "authenticity": 0.254}}, {"occupation_id": "COMPLIANCE_MANAGER", "display_name": "Compliance Manager", "role_group_id": 11, "target_axes": {"analyticity": 0.309, "flow": 0.088, "metacognition": 0.343, "authenticity": 0.26}}, {"occupation_id": "ETHICS_OFFICER", "display_name": "Ethics Officer", "role_group_id": 11, "target_axes": {"analyticity": 0.309, "flow": 0.088, "metacognition": 0.343, "authenticity": 0.26}}, {"occupation_id": "REGULATORY_AFFAIRS_SPECIALIST", "display_name": "Regulatory Affairs Specialist", "role_group_id": 11, "target_axes": {"analyticity": 0.309, "flow": 0.088, "metacognition": 0.343, "authenticity": 0.26}}, {"occupation_id": "CONTRACT_SPECIALIST", "display_name": "Contract Specialist", "role_group_id": 11, "target_axes": {"analyticity": 0.309, "flow": 0.088, "metacognition": 0.343, "authenticity": 0.26}}, {"occupation_id": "OPERATIONS_MANAGER", "display_name": "Operations Manager", "role_group_id": 12, "target_axes": {"analyticity": 0.224, "flow": 0.392, "metacognition": 0.196, "authenticity": 0.188}}, {"occupation_id": "QUALITY_MANAGER", "display_name": "Quality Manager", "role_group_id": 12, "target_axes": {"analyticity": 0.216, "flow": 0.378, "metacognition": 0.235, "authenticity": 0.171}}, {"occupation_id": "SAFETY_ENGINEER", "display_name": "Safety Engineer", "role_group_id": 12, "target_axes": {"analyticity": 0.216, "flow": 0.378, "metacognition": 0.235, "authenticity": 0.171}}, {"occupation_id": "PROCESS_ANALYST", "display_name": "Process Analyst", "role_group_id": 12, "target_axes": {"analyticity": 0.224, "flow": 0.392, "metacognition": 0.196, "authenticity": 0.188}}, {"occupation_id": "SUPPLY_CHAIN_ANALYST", "display_name": "Supply Chain Analyst", "role_group_id": 12, "target_axes": {"analyticity": 0.224, "flow": 0.392, "metacognition": 0.196, "authenticity": 0.188}}, {"occupation_id": "LOGISTICS_PLANNER", "display_name": "Logistics Planner", "role_group_id": 12, "target_axes": {"analyticity": 0.224, "flow": 0.392, "metacognition": 0.196, "authenticity": 0.188}}, {"occupation_id": "INVESTMENT_ANALYST", "display_name": "Investment Analyst", "role_group_id": 13, "target_axes": {"analyticity": 0.43, "flow": 0.107, "metacognition": 0.267, "authenticity": 0.196}}, {"occupation_id": "PORTFOLIO_MANAGER", "display_name": "Portfolio Manager", "role_group_id": 13, "target_axes": {"analyticity": 0.372, "flow": 0.093, "metacognition": 0.25, "authenticity": 0.285}}, {"occupation_id": "CREDIT_ANALYST", "display_name": "Credit Analyst", "role_group_id": 13, "target_axes": {"analyticity": 0.43, "flow": 0.107, "metacognition": 0.267, "authenticity": 0.196}}, {"occupation_id": "ACTUARY", "display_name": "Actuary", "role_group_id": 13, "target_axes": {"analyticity": 0.43, "flow": 0.107, "metacognition": 0.267, "authenticity": 0.196}}, {"occupation_id": "INSURANCE_UNDERWRITER", "display_name": "Insurance Underwriter", "role_group_id": 13, "target_axes": {"analyticity": 0.405, "flow": 0.101, "metacognition": 0.317, "authenticity": 0.177}}, {"occupation_id": "TREASURY_MANAGER", "display_name": "Treasury Manager", "role_group_id": 13, "target_axes": {"analyticity": 0.372, "flow": 0.093, "metacognition": 0.25, "authenticity": 0.285}}, {"occupation_id": "HR_MANAGER", "display_name": "HR Manager", "role_group_id": 14, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "TALENT_MANAGER", "display_name": "Talent Manager", "role_group_id": 14, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "ORGANIZATIONAL_DEVELOPMENT_MANAGER", "display_name": "Organizational Development Manager", "role_group_id": 14, "target_axes": {"analyticity": 0.138, "flow": 0.121, "metacognition": 0.302, "authenticity": 0.439}}, {"occupation_id": "CULTURE_MANAGER", "display_name": "Culture Manager", "role_group_id": 14, "target_axes": {"analyticity": 0.125, "flow": 0.125, "metacognition": 0.3, "authenticity": 0.45}}, {"occupation_id": "RECRUITER", "display_name": "Recruiter", "role_group_id": 14, "target_axes": {"analyticity": 0.12, "flow": 0.14, "metacognition": 0.28, "authenticity": 0.46}}, {"occupation_id": "LEARNING_DEVELOPMENT_SPECIALIST", "display_name": "Learning & Development Specialist", "role_group_id": 14, "target_axes": {"analyticity": 0.137, "flow": 0.118, "metacognition": 0.34, "authenticity": 0.405}}, {"occupation_id": "RPA_AGENT", "display_name": "RPA Agent", "role_group_id": 15, "target_axes": {"analyticity": 0.352, "flow": 0.529, "metacognition": 0.141, "authenticity": 0.0}}, {"occupation_id": "CHATBOT_OPERATOR", "display_name": "Chatbot Operator", "role_group_id": 15, "target_axes": {"analyticity": 0.352, "flow": 0.529, "metacognition": 0.141, "authenticity": 0.0}}, {"occupation_id": "AUTOMATED_QA_BOT", "display_name": "Automated QA Bot", "role_group_id": 15, "target_axes": {"analyticity": 0.352, "flow": 0.529, "metacognition": 0.141, "authenticity": 0.0}}, {"occupation_id": "REPORT_GENERATION_AGENT", "display_name": "Report Generation Agent", "role_group_id": 15, "target_axes": {"analyticity": 0.352, "flow": 0.529, "metacognition": 0.141, "authenticity": 0.0}}, {"occupation_id": "MONITORING_AI", "display_name": "Monitoring AI", "role_group_id": 15, "target_axes": {"analyticity": 0.352, "flow": 0.529, "metacognition": 0.141, "authenticity": 0.0}}];

function axesFromCFV(cfv: any, raw: any): RoleFitAxes {
  // If GPT/raw already provides axes, trust it (must be 0..1).
  const fromRaw = raw?.role_fit_axes || raw?.rolefit_axes || raw?.axes;
  if (fromRaw && typeof fromRaw === "object") {
    const a = clamp01(Number(fromRaw.analyticity ?? fromRaw.a));
    const f = clamp01(Number(fromRaw.flow ?? fromRaw.f));
    const m = clamp01(Number(fromRaw.metacognition ?? fromRaw.m));
    const au = clamp01(Number(fromRaw.authenticity ?? fromRaw.au ?? fromRaw.auth));
    if ([a, f, m, au].every(Number.isFinite)) return { analyticity: a, flow: f, metacognition: m, authenticity: au };
  }

  // Deterministic mapping from CFV(8) to 4 axes.
  // Rationale (MVP-safe, upgradeable):
  // - Analyticity: argument architecture + evidence diversity + stable evaluation pressure (inverse intent friction)
  // - Flow: transition flow + reasoning momentum
  // - Metacognition: revision depth + human intervention
  // - Authenticity: human intervention tempered by low structural variance
  const aas = clamp01(Number(cfv?.aas ?? 0));
  const ctf = clamp01(Number(cfv?.ctf ?? 0));
  const rmd = clamp01(Number(cfv?.rmd ?? 0));
  const rdx = clamp01(Number(cfv?.rdx ?? 0));
  const eds = clamp01(Number(cfv?.eds ?? 0));
  const hi  = clamp01(Number(cfv?.hi  ?? 0));
  const ifd = clamp01(Number(cfv?.ifd ?? 0));
  const sv  = clamp01(Number(cfv?.structural_variance ?? 0));

  const analyticity = clamp01((aas + eds + (1 - ifd)) / 3);
  const flow = clamp01((ctf + rmd) / 2);
  const metacognition = clamp01((rdx + hi) / 2);
  const authenticity = clamp01((hi + (1 - sv)) / 2);

  return { analyticity, flow, metacognition, authenticity };
}

function normEuclid4(a: RoleFitAxes, b: RoleFitAxes): number {
  const d2 =
    (a.analyticity - b.analyticity) ** 2 +
    (a.flow - b.flow) ** 2 +
    (a.metacognition - b.metacognition) ** 2 +
    (a.authenticity - b.authenticity) ** 2;
  // max distance is sqrt(4) when each axis differs by 1; normalize to 0..1
  return Math.min(1, Math.sqrt(d2) / 2);
}

function closenessScore(me: RoleFitAxes, target: RoleFitAxes): number {
  return clamp01(1 - normEuclid4(me, target));
}

function meanAxes(items: RoleFitAxes[]): RoleFitAxes {
  const n = Math.max(1, items.length);
  const sum = items.reduce(
    (acc, x) => {
      acc.analyticity += x.analyticity;
      acc.flow += x.flow;
      acc.metacognition += x.metacognition;
      acc.authenticity += x.authenticity;
      return acc;
    },
    { analyticity: 0, flow: 0, metacognition: 0, authenticity: 0 } as RoleFitAxes
  );
  return {
    analyticity: clamp01(sum.analyticity / n),
    flow: clamp01(sum.flow / n),
    metacognition: clamp01(sum.metacognition / n),
    authenticity: clamp01(sum.authenticity / n),
  };
}

function computeRoleFitDeterministic(out: any): void {
  out.backend = out.backend ?? {};
  out.backend.role_fit = out.backend.role_fit ?? {};

  const raw = out.gpt_raw?.raw_features ?? out.gpt_raw ?? {};

  const cfv = out.backend?.cff?.cfv ?? null;
  if (!cfv) return;

  const signals = out.backend?.cff?.derived_scores ?? {};
  const cfvPlus = { ...cfv, structural_variance: signals.structural_variance ?? 0 };

  const meAxes = axesFromCFV(cfvPlus, raw);
  out.backend.role_fit.me_axes = meAxes;

  // 1) Occupation scores (all occupations)
  const jobs_all = OCCUPATION_TARGET_AXES.map((o) => {
    const distance = normEuclid4(meAxes, o.target_axes);
    const occupation_score = clamp01(1 - distance);
    return {
      occupation_id: o.occupation_id,
      display_name: o.display_name,
      role_group_id: o.role_group_id,
      target_axes: o.target_axes,
      distance_0to1: distance,
      occupation_score,
    };
  }).sort((a, b) => (b.occupation_score - a.occupation_score));

  out.backend.role_fit.jobs_all = jobs_all;

  // 2) Role group scores (centroid closeness per group)
  const groupIds = Array.from(new Set(OCCUPATION_TARGET_AXES.map(o => o.role_group_id))).sort((a,b)=>a-b);
  const role_groups_all = groupIds.map((gid) => {
    const occs = OCCUPATION_TARGET_AXES.filter(o => o.role_group_id === gid).map(o => o.target_axes);
    const centroid = meanAxes(occs);
    const score = closenessScore(meAxes, centroid);
    return {
      id: gid,
      label: ROLE_GROUP_LABELS[gid] ?? ("Group " + String(gid)),
      centroid_axes: centroid,
      score,
    };
  }).sort((a,b)=>b.score-a.score);

  out.backend.role_fit.role_groups_all = role_groups_all;

  // 3) Track scores: MVP alignment (use role groups as tracks)
  out.backend.role_fit.track_scores = role_groups_all.map(g => ({
    track_id: String(g.id),
    track_label: g.label,
    score: g.score,
  }));

  // 4) Convenience top lists (inference.ts will sort again, but we set defaults)
  out.backend.role_fit.top_role_groups = role_groups_all.slice(0, 3);
  out.backend.role_fit.top_jobs = jobs_all.slice(0, 3);
}

