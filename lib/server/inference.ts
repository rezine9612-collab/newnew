// lib/server/inference.ts
// NeuPrint v4.0 inference (deterministic)
// Focus:
// - Control Pattern selection (centroid argmin)
// - Reliability score and band
// - CFF final_determination (type_code, display_name, type_confidence)
// - Role-fit primary pattern and top lists selection (by suitability score)
//
// IMPORTANT RULES (project-fixed):
// - GPT does NOT compute scores or confidence.
// - All numeric and confidence outputs are computed on backend.
// - This file must NOT call GPT. Pure deterministic inference only.

export type ReliabilityBand = "HIGH" | "MEDIUM" | "LOW";

export type ControlPattern =
  | "deep_reflective_human"
  | "moderate_reflective_human"
  | "moderate_procedural_human"
  | "shallow_procedural_human"
  | "moderate_reflective_hybrid"
  | "shallow_procedural_hybrid"
  | "shallow_procedural_ai"
  | "moderate_procedural_ai"
  | "deep_procedural_ai";

type Vec3 = [number, number, number];

type InferenceParams = {
  // centroid distance weights
  wA: number;
  wD: number;
  wR: number;

  // reliability sigmoid params
  tau: number;
  mu: number;
  alpha: number;
  beta: number;

  // reliability band thresholds from score r
  bandHighGte: number; // 0.70
  bandMediumGte: number; // 0.45

  // reliability method
  method: "sigmoid" | "rule";

  // role-fit defaults
  roleFitTopJobsN: number;       // default 8
  roleFitTopGroupsN: number;     // default 2
};

const DEFAULT_PARAMS: InferenceParams = {
  wA: 1.2,
  wD: 1.0,
  wR: 1.1,

  tau: 0.18,
  mu: 0.06,
  alpha: 18.0,
  beta: 20.0,

  bandHighGte: 0.7,
  bandMediumGte: 0.45,

  method: "sigmoid",

  roleFitTopJobsN: 8,
  roleFitTopGroupsN: 2,
};

// Centroids (A, D, R)
const CONTROL_CENTROIDS: Record<ControlPattern, Vec3> = {
  deep_reflective_human: [0.85, 0.8, 0.8],
  moderate_reflective_human: [0.8, 0.55, 0.6],
  moderate_procedural_human: [0.75, 0.55, 0.25],
  shallow_procedural_human: [0.7, 0.3, 0.2],
  moderate_reflective_hybrid: [0.55, 0.55, 0.55],
  shallow_procedural_hybrid: [0.5, 0.3, 0.2],
  shallow_procedural_ai: [0.2, 0.3, 0.15],
  moderate_procedural_ai: [0.15, 0.55, 0.15],
  deep_procedural_ai: [0.1, 0.8, 0.1],
};

const CONTROL_DISTRIBUTION_INTERPRETATION: Record<ControlPattern, string> = {
  deep_reflective_human:
    "A high human proportion indicates stable human-led control at structural decision boundaries across the task.",
  moderate_reflective_human:
    "A high human proportion indicates largely human-led control, with reflective adjustment appearing in localized segments.",
  moderate_procedural_human:
    "A high human proportion indicates human-led control under a procedural sequence, with limited reflective intervention.",
  shallow_procedural_human:
    "A high human proportion indicates human-led control, though structural decisions tend to follow shallow continuation patterns.",
  moderate_reflective_hybrid:
    "A mixed distribution indicates shared control, where human intent is present but transitions partially reflect assisted continuation.",
  shallow_procedural_hybrid:
    "A mixed distribution indicates assisted procedural flow, with limited human-led structural revision at decision boundaries.",
  shallow_procedural_ai:
    "A low human proportion indicates control signals are dominated by automated continuation rather than human-led structural decisions.",
  moderate_procedural_ai:
    "A low human proportion indicates stable automated continuation patterns with minimal evidence of human-originated structural control.",
  deep_procedural_ai:
    "A low human proportion indicates deep automated procedural expansion, with minimal evidence of reflective human regulation at decision boundaries.",
};

const CONTROL_BAND_NOTES: Record<ReliabilityBand, string> = {
  HIGH: "This placement is supported by a stable margin to adjacent patterns.",
  MEDIUM: "This placement shows moderate overlap with adjacent patterns.",
  LOW: "This placement is near a boundary region and should be interpreted with caution.",
};

const CONTROL_PATTERN_RATIONALE: Record<ControlPattern, string> = {
  deep_reflective_human:
    "Reasoning decisions originate from explicit human-driven revision and counter-evaluative judgment rather than automated continuation flow.",
  moderate_reflective_human:
    "Reasoning decisions include limited human revision but do not extend to full structural reconfiguration.",
  moderate_procedural_human:
    "Reasoning decisions follow a predefined structural sequence with minimal reflective intervention.",
  shallow_procedural_human:
    "Reasoning decisions rely on surface-level continuation rather than deliberate structural control.",
  moderate_reflective_hybrid:
    "Reasoning decisions reflect human intent but are partially influenced by assisted continuation patterns.",
  shallow_procedural_hybrid:
    "Reasoning decisions follow assisted procedural flow with minimal human structural revision.",
  shallow_procedural_ai:
    "Reasoning decisions primarily arise from automated continuation without observable human control signals.",
  moderate_procedural_ai:
    "Reasoning decisions follow internally consistent continuation patterns without human-originated revision.",
  deep_procedural_ai:
    "Reasoning decisions reflect layered procedural expansion rather than intentional evaluative judgment.",
};


// -----------------------------
// Catalog datasets (from 11.xlsx)
// -----------------------------
const CAT_DECISION_OUTPUT = [
  {
    "decision_code": "human",
    "decision_label": "Human",
    "sentence_en": "The combined signal profile supports classification as human-controlled reasoning."
  },
  {
    "decision_code": "hybrid",
    "decision_label": "Hybrid",
    "sentence_en": "The combined signal profile suggests a mixed or assisted reasoning control pattern."
  },
  {
    "decision_code": "ai",
    "decision_label": "AI",
    "sentence_en": "The combined signal profile aligns with automated reasoning control patterns."
  }
] as const;

const CAT_CONTROL_PATTERNS = [
  {
    "control_pattern": "deep_reflective_human",
    "pattern_description_en": "Human-led reasoning with sustained reflective control and stable structural revision. The current position is centered within the human reasoning cluster.",
    "default_reliability_band": "HIGH",
    "band_rationale_en": "Reasoning decisions originate from explicit human-driven revision and counter-evaluative judgment rather than automated continuation flow."
  },
  {
    "control_pattern": "moderate_reflective_human",
    "pattern_description_en": "Human-led reasoning with localized reflective adjustment and generally stable structure. The current position remains within the human cluster with moderate dispersion.",
    "default_reliability_band": "MEDIUM–HIGH",
    "band_rationale_en": "Reasoning decisions include limited human revision but do not extend to full structural reconfiguration."
  },
  {
    "control_pattern": "moderate_procedural_human",
    "pattern_description_en": "Human-authored reasoning following a stable procedural structure. The current position lies within the human cluster but closer to the procedural boundary.",
    "default_reliability_band": "MEDIUM",
    "band_rationale_en": "Reasoning decisions follow a predefined structural sequence with minimal reflective intervention."
  },
  {
    "control_pattern": "shallow_procedural_human",
    "pattern_description_en": "Human-generated reasoning with shallow procedural progression and limited structural depth. The current position is weakly anchored within the human cluster.",
    "default_reliability_band": "MEDIUM–LOW",
    "band_rationale_en": "Reasoning decisions rely on surface-level continuation rather than deliberate structural control."
  },
  {
    "control_pattern": "moderate_reflective_hybrid",
    "pattern_description_en": "Mixed-agency reasoning with partial human reflection and assisted structural development. The current position spans the boundary between human and hybrid clusters.",
    "default_reliability_band": "MEDIUM",
    "band_rationale_en": "Reasoning decisions reflect human intent but are partially influenced by assisted continuation patterns."
  },
  {
    "control_pattern": "shallow_procedural_hybrid",
    "pattern_description_en": "Hybrid reasoning with procedural structure and limited reflective control. The current position trends toward the hybrid procedural region.",
    "default_reliability_band": "MEDIUM–LOW",
    "band_rationale_en": "Reasoning decisions follow assisted procedural flow with minimal human structural revision."
  },
  {
    "control_pattern": "shallow_procedural_ai",
    "pattern_description_en": "AI-dominant reasoning with shallow procedural expansion. The current position is located near the automated cluster perimeter.",
    "default_reliability_band": "LOW",
    "band_rationale_en": "Reasoning decisions primarily arise from automated continuation without observable human control signals."
  },
  {
    "control_pattern": "moderate_procedural_ai",
    "pattern_description_en": "AI-generated reasoning with stable but non-reflective procedural structure. The current position is centered within the automated reasoning cluster.",
    "default_reliability_band": "LOW",
    "band_rationale_en": "Reasoning decisions follow internally consistent continuation patterns without human-originated revision."
  },
  {
    "control_pattern": "deep_procedural_ai",
    "pattern_description_en": "AI-generated reasoning exhibiting high structural complexity without reflective control. The current position is deeply embedded within the automated procedural cluster.",
    "default_reliability_band": "LOW",
    "band_rationale_en": "Reasoning decisions reflect layered procedural expansion rather than intentional evaluative judgment."
  }
] as const;

const CAT_CONTROL_DIST_INTERPRET = [
  {
    "control_pattern": "deep_reflective_human",
    "distribution_interpretation_en": "A high human proportion indicates stable human-led control at structural decision boundaries across the task."
  },
  {
    "control_pattern": "moderate_reflective_human",
    "distribution_interpretation_en": "A high human proportion indicates largely human-led control, with reflective adjustment appearing in localized segments."
  },
  {
    "control_pattern": "moderate_procedural_human",
    "distribution_interpretation_en": "A high human proportion indicates human-led control under a procedural sequence, with limited reflective intervention."
  },
  {
    "control_pattern": "shallow_procedural_human",
    "distribution_interpretation_en": "A high human proportion indicates human-led control, though structural decisions tend to follow shallow continuation patterns."
  },
  {
    "control_pattern": "moderate_reflective_hybrid",
    "distribution_interpretation_en": "A mixed distribution indicates shared control, where human intent is present but transitions partially reflect assisted continuation."
  },
  {
    "control_pattern": "shallow_procedural_hybrid",
    "distribution_interpretation_en": "A mixed distribution indicates assisted procedural flow, with limited human-led structural revision at decision boundaries."
  },
  {
    "control_pattern": "shallow_procedural_ai",
    "distribution_interpretation_en": "A low human proportion indicates control signals are dominated by automated continuation rather than human-led structural decisions."
  },
  {
    "control_pattern": "moderate_procedural_ai",
    "distribution_interpretation_en": "A low human proportion indicates stable automated continuation patterns with minimal evidence of human-originated structural control."
  },
  {
    "control_pattern": "deep_procedural_ai",
    "distribution_interpretation_en": "A low human proportion indicates layered procedural expansion without consistent reflective control signals originating from the individual."
  }
] as const;

const CAT_CONTROL_BAND_NOTES = [
  {
    "reliability_band": "HIGH",
    "note_en": "This placement is supported by a stable margin to adjacent patterns."
  },
  {
    "reliability_band": "MEDIUM",
    "note_en": "This placement shows moderate overlap with adjacent patterns."
  },
  {
    "reliability_band": "LOW",
    "note_en": "This placement is near a boundary region and should be interpreted with caution."
  }
] as const;

const CAT_OBSERVED_STRUCT_SIGNALS = [
  {
    "signal_id": 1,
    "signal_text_en": "Revision activity occurs at semantic decision boundaries."
  },
  {
    "signal_id": 2,
    "signal_text_en": "Argument order adjustments correspond to logical correction."
  },
  {
    "signal_id": 3,
    "signal_text_en": "Claim scope or conditions are refined through explicit revision."
  },
  {
    "signal_id": 4,
    "signal_text_en": "Prior assumptions are explicitly re-evaluated during reasoning progression."
  },
  {
    "signal_id": 5,
    "signal_text_en": "Consistency checks appear across structural transitions."
  },
  {
    "signal_id": 6,
    "signal_text_en": "Logical transitions between claims and supporting reasons are explicitly maintained."
  },
  {
    "signal_id": 7,
    "signal_text_en": "Structural continuity is preserved across multi-step reasoning transitions."
  },
  {
    "signal_id": 8,
    "signal_text_en": "Alternative viewpoints are introduced and structurally examined."
  },
  {
    "signal_id": 9,
    "signal_text_en": "Counter-arguments are explicitly addressed through refutational reasoning."
  },
  {
    "signal_id": 10,
    "signal_text_en": "Evidence is evaluated against potential contradictions rather than accepted at face value."
  },
  {
    "signal_id": 11,
    "signal_text_en": "Multiple evidence types are integrated within the reasoning structure."
  },
  {
    "signal_id": 12,
    "signal_text_en": "Evidence placement aligns with the logical role it serves within the argument."
  },
  {
    "signal_id": 13,
    "signal_text_en": "Supporting evidence is selectively introduced at structurally relevant points."
  },
  {
    "signal_id": 14,
    "signal_text_en": "No sustained repetitive propagation is observed across reasoning segments."
  },
  {
    "signal_id": 15,
    "signal_text_en": "Structural variation is maintained without reliance on template-like repetition."
  },
  {
    "signal_id": 16,
    "signal_text_en": "Reasoning progression avoids uniform continuation patterns across sections."
  },
  {
    "signal_id": 17,
    "signal_text_en": "Structural behavior reflects document-specific reasoning rather than generic composition patterns."
  },
  {
    "signal_id": 18,
    "signal_text_en": "Observed structural signals vary across sections in response to local reasoning demands."
  },
  {
    "signal_id": 19,
    "signal_text_en": "These signals reflect document-specific structural behavior and are independent of surface-level writing style.",
    "priority_tag": "CORE"
  },
  {
    "signal_id": 20,
    "signal_text_en": "Structural signals exhibit overlap across competing patterns, limiting definitive attribution."
  }
] as const;

const CAT_ROLEFIT_EXPL_TEMPLATES = [
  {
    "template_key": "A-4-1. HIGH x HIGH (CS_HH)",
    "template_en": "This profile indicates highly structured reasoning with active exploration, aligning with roles that require {role_demands}."
  },
  {
    "template_key": "A-4-2. HIGH x MEDIUM (CS_HM)",
    "template_en": "This profile indicates structured reasoning with selective exploration, aligning with roles that require {role_demands}."
  },
  {
    "template_key": "A-4-3. HIGH x LOW (CS_HL)",
    "template_en": "This profile reflects highly structured and deliberate reasoning with minimal exploration, supporting fit for roles that emphasize {role_demands}."
  },
  {
    "template_key": "A-4-4. MEDIUM x HIGH (CS_MH)",
    "template_en": "This profile reflects exploration-led reasoning with emerging structure, supporting fit for roles that emphasize {role_demands}."
  },
  {
    "template_key": "A-4-5. MEDIUM x MEDIUM (CS_MM)",
    "template_en": "This profile reflects balanced and adaptive reasoning with measured exploration, supporting fit for roles that emphasize {role_demands}."
  },
  {
    "template_key": "A-4-6. MEDIUM x LOW (CS_ML)",
    "template_en": "This profile reflects moderately structured and steady reasoning with limited exploration, supporting fit for roles that emphasize {role_demands}."
  },
  {
    "template_key": "A-4-7. LOW x HIGH (CS_LH)",
    "template_en": "This profile shows highly exploratory and fluid reasoning with minimal structure, suggesting limited alignment with roles focused on {role_demands}."
  },
  {
    "template_key": "A-4-8. LOW x MEDIUM (CS_LM)",
    "template_en": "This profile shows loosely structured reasoning with ongoing exploration, suggesting limited alignment with roles focused on {role_demands}."
  },
  {
    "template_key": "A-4-9. LOW x LOW (CS_LL)",
    "template_en": "This profile shows unstructured and linear reasoning with low exploration, suggesting limited alignment with roles focused on {role_demands}."
  }
] as const;

const CAT_ROLEFIT_WHY_TEMPLATES = [
  {
    "fit_band": "HIGH FIT",
    "template_en": "{job} is recommended because your profile closely matches this role on {best1} and {best2}, producing a high proximity score of {score}."
  },
  {
    "fit_band": "MEDIUM FIT",
    "template_en": "{job} shows solid fit due to similarities in {best1} and {best2}, while {gap} differs more from the role’s target ({score})."
  },
  {
    "fit_band": "LOW FIT",
    "template_en": "{job} appears in the top list because it is the closest available option, but the overall proximity is limited by larger differences across multiple dimensions ({score})."
  }
] as const;

const CAT_OBSERVED_PATTERNS = [
  {
    "code": "RE",
    "label": "Reflective Explorer",
    "description": "Reflective Explorer shows active self-revision and exploratory restructuring during reasoning. Thought progresses through reflection, reassessment, and adaptive refinement."
  },
  {
    "code": "IE",
    "label": "Intuitive Explorer",
    "description": "Intuitive Explorer advances reasoning through associative leaps and conceptual exploration. Structure emerges gradually rather than being predefined."
  },
  {
    "code": "EW",
    "label": "Evidence Weaver",
    "description": "Evidence Weaver emphasizes linking claims with supporting material. Reasoning strength lies in evidence connectivity rather than abstract inference."
  },
  {
    "code": "AR",
    "label": "Analytical Reasoner",
    "description": "Analytical Reasoner breaks a problem into explicit components and evaluates them through stepwise logic. Reasoning emphasizes clear structure, rule-based validation, and consistency across claims and supporting points."
  },
  {
    "code": "SI",
    "label": "Strategic Integrator",
    "description": "Strategic Integrator aligns multiple reasoning strands into a unified direction. Decision-making reflects coordination and long-term framing."
  },
  {
    "code": "RR",
    "label": "Reflective Regulator",
    "description": "Reflective Regulator actively monitors and controls reasoning boundaries. This type prioritizes balance, restraint, and intentional stopping points."
  },
  {
    "code": "HE",
    "label": "Human Expressionist",
    "description": "Human Expressionist expresses reasoning through narrative and contextual meaning. Communication clarity and human resonance are central."
  },
  {
    "code": "MD",
    "label": "Machine-Dominant",
    "description": "Machine-Dominant pattern reflects heavy dependence on automated or system-driven reasoning flow. Human agency signals are limited."
  }
] as const;


function lookupDecisionSentence(decisionCode: string): { decision_label: string; sentence_en: string } | null {
  const hit = (CAT_DECISION_OUTPUT as any[]).find((r) => String(r.decision_code) === String(decisionCode));
  if (!hit) return null;
  return { decision_label: String(hit.decision_label), sentence_en: String(hit.sentence_en) };
}

function lookupControlPatternMeta(controlPattern: string): any | null {
  return (CAT_CONTROL_PATTERNS as any[]).find((r) => String(r.control_pattern) === String(controlPattern)) || null;
}

function lookupControlDistInterpret(controlPattern: string): string | null {
  const hit = (CAT_CONTROL_DIST_INTERPRET as any[]).find((r) => String(r.control_pattern) === String(controlPattern));
  return hit ? String(hit.distribution_interpretation_en) : null;
}

function lookupControlBandNote(band: string): string | null {
  const hit = (CAT_CONTROL_BAND_NOTES as any[]).find((r) => String(r.reliability_band).toUpperCase() === String(band).toUpperCase());
  return hit ? String(hit.note_en) : null;
}

function classifyTri(x01: number): "HIGH" | "MEDIUM" | "LOW" {
  if (x01 >= 0.67) return "HIGH";
  if (x01 >= 0.34) return "MEDIUM";
  return "LOW";
}

function pickRolefitExplanation(structure01: number | null, exploration01: number | null): string | null {
  if (structure01 == null || exploration01 == null) return null;
  const s = classifyTri(clamp01(structure01));
  const e = classifyTri(clamp01(exploration01));
  const key = `CS_${s[0]}${e[0]}`; // HH, HM, HL, MH, MM, ML, LH, LM, LL
  const hit = (CAT_ROLEFIT_EXPL_TEMPLATES as any[]).find((r) => String(r.template_key).includes(`(${key})`));
  return hit ? String(hit.template_en) : null;
}

function pickRolefitWhy(fitBand: "HIGH FIT" | "MODERATE FIT" | "LOW FIT", jobName: string, score01: number): string | null {
  const hit = (CAT_ROLEFIT_WHY_TEMPLATES as any[]).find((r) => String(r.fit_band).toUpperCase() === fitBand.toUpperCase());
  if (!hit) return null;
  return String(hit.template_en)
    .replaceAll("{job_name}", jobName)
    .replaceAll("{score}", String(Math.round(score01 * 100)));
}

function fitBandFromScore(score01: number): "HIGH FIT" | "MODERATE FIT" | "LOW FIT" {
  if (score01 >= 0.75) return "HIGH FIT";
  if (score01 >= 0.55) return "MODERATE FIT";
  return "LOW FIT";
}

function selectObservedSignalTexts(signalIds: number[]): string[] {
  const out: string[] = [];
  for (const id of signalIds) {
    const hit = (CAT_OBSERVED_STRUCT_SIGNALS as any[]).find((r) => Number(r.signal_id) === Number(id));
    if (hit?.signal_text_en) out.push(String(hit.signal_text_en));
  }
  return out;
}
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function safeNum(x: any): number | null {
  const n = typeof x === "string" ? Number(x) : x;
  if (typeof n !== "number") return null;
  if (!Number.isFinite(n)) return null;
  return n;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function weightedEuclidean(v: Vec3, c: Vec3, wA: number, wD: number, wR: number): number {
  const [A, D, R] = v;
  const [Ak, Dk, Rk] = c;
  return Math.sqrt(wA * (A - Ak) ** 2 + wD * (D - Dk) ** 2 + wR * (R - Rk) ** 2);
}

function top2Distances(
  v: Vec3,
  centroids: Record<ControlPattern, Vec3>,
  wA: number,
  wD: number,
  wR: number
): { best: ControlPattern; d1: number; second: ControlPattern; d2: number; margin: number } {
  const dists = (Object.keys(centroids) as ControlPattern[]).map((name) => ({
    name,
    dist: weightedEuclidean(v, centroids[name], wA, wD, wR),
  }));
  dists.sort((a, b) => a.dist - b.dist);
  const best = dists[0]?.name ?? "moderate_reflective_hybrid";
  const d1 = dists[0]?.dist ?? 1;
  const second = dists[1]?.name ?? best;
  const d2 = dists[1]?.dist ?? d1;
  const margin = d2 - d1;
  return { best, d1, second, d2, margin };
}

function reliabilityScore(d1: number, margin: number, p: InferenceParams): number {
  // r = sigmoid( alpha*(tau - d1) + beta*(margin - mu) )
  return sigmoid(p.alpha * (p.tau - d1) + p.beta * (margin - p.mu));
}

function reliabilityBandFromScore(r: number, p: InferenceParams): ReliabilityBand {
  if (r >= p.bandHighGte) return "HIGH";
  if (r >= p.bandMediumGte) return "MEDIUM";
  return "LOW";
}

function reliabilityBandRule(d1: number, margin: number): ReliabilityBand {
  if (d1 <= 0.16 && margin >= 0.07) return "HIGH";
  if (d1 <= 0.22 && margin >= 0.04) return "MEDIUM";
  return "LOW";
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function agencyDeterminationFromA(A: number): { label: "Human" | "Hybrid" | "AI"; statement: string } {
  const a = clamp01(A);
  if (a >= 0.65) {
    return {
      label: "Human",
      statement: "The combined signal profile supports classification as human-controlled reasoning.",
    };
  }
  if (a >= 0.45) {
    return {
      label: "Hybrid",
      statement: "The combined signal profile suggests a mixed or assisted reasoning control pattern.",
    };
  }
  return {
    label: "AI",
    statement: "The combined signal profile aligns with automated control patterns.",
  };
}

// Preferred: use derive.ts output: backend.control.control_vector.(A,D,R)
function extractControlVector(report: any): { v: Vec3; sources: { A: string; D: string; R: string } } {
  const A0 = safeNum(report?.backend?.control?.control_vector?.A_agency);
  const D0 = safeNum(report?.backend?.control?.control_vector?.D_depth);
  const R0 = safeNum(report?.backend?.control?.control_vector?.R_reflection);

  if (A0 != null && D0 != null && R0 != null) {
    return {
      v: [clamp01(A0), clamp01(D0), clamp01(R0)],
      sources: {
        A: "backend.control.control_vector.A_agency",
        D: "backend.control.control_vector.D_depth",
        R: "backend.control.control_vector.R_reflection",
      },
    };
  }

  // Fallbacks (temporary; derive.ts should fill these)
  const humanShare = safeNum(report?.backend?.control?.distribution_share?.human);
  const A_fromShare = humanShare != null ? clamp01(humanShare) : null;

  const structuralVariance = safeNum(report?.backend?.cff?.derived_scores?.structural_variance);
  const humanRhythmIndex = safeNum(report?.backend?.cff?.derived_scores?.human_rhythm_index);
  const transitionFlow = safeNum(report?.backend?.cff?.derived_scores?.transition_flow);
  const revisionDepth = safeNum(report?.backend?.cff?.derived_scores?.revision_depth);

  const A_fromIndicators =
    structuralVariance != null && humanRhythmIndex != null && transitionFlow != null && revisionDepth != null
      ? clamp01(0.30 * structuralVariance + 0.25 * humanRhythmIndex + 0.20 * transitionFlow + 0.25 * revisionDepth)
      : null;

  const A = clamp01(firstNonNull(A0, A_fromShare, A_fromIndicators, 0.55));
  const A_source =
    A0 != null
      ? "backend.control.control_vector.A_agency"
      : A_fromShare != null
      ? "backend.control.distribution_share.human"
      : A_fromIndicators != null
      ? "backend.cff.derived_scores.(SV,HRI,TF,RDX)"
      : "fallback_default";

  const rslLevelScore = safeNum(report?.backend?.rsl?.overall?.level_score);
  const cffStructureAxis = safeNum(report?.backend?.cff?.axes?.stability_axis?.structure);
  const D = clamp01(firstNonNull(D0, rslLevelScore, cffStructureAxis, 0.55));
  const D_source =
    D0 != null
      ? "backend.control.control_vector.D_depth"
      : rslLevelScore != null
      ? "backend.rsl.overall.level_score"
      : cffStructureAxis != null
      ? "backend.cff.axes.stability_axis.structure"
      : "fallback_default";

  const R_proxy =
    revisionDepth != null && humanRhythmIndex != null
      ? clamp01(0.70 * revisionDepth + 0.30 * humanRhythmIndex)
      : revisionDepth != null
      ? clamp01(revisionDepth)
      : null;

  const R = clamp01(firstNonNull(R0, R_proxy, 0.55));
  const R_source =
    R0 != null
      ? "backend.control.control_vector.R_reflection"
      : R_proxy != null
      ? "backend.cff.derived_scores.(revision_depth,human_rhythm_index)"
      : "fallback_default";

  return { v: [A, D, R], sources: { A: A_source, D: D_source, R: R_source } };
}

function firstNonNull<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function normalizeTypeString(s: string): { type_code: string; display_name: string } {
  const t = String(s || "").trim();
  const m = t.match(/^([A-Za-z]{1,3}-\d+)\.?\s*(.*)$/);
  if (m) {
    const type_code = m[1];
    const display_name = (m[2] || "").trim() || "Determination";
    return { type_code, display_name };
  }
  // If user passes only a label (e.g. "Reasoning Simulator"), fallback to Ax-4
  if (t) return { type_code: "Ax-4", display_name: t };
  return { type_code: "Ax-4", display_name: "Reasoning Simulator" };
}

// CFF final determination is backend-computed. This is a minimal v1 logic:
// - Prefer existing ai.final_classification or hero.chips.determination if present
// - Otherwise infer from control pattern family (human reflective => Ax-4 Reasoning Simulator)
// - type_confidence: derived from control reliability r, bounded to [0.35, 0.95]
function inferCffFinalDetermination(report: any): { type_code: string; display_name: string; type_confidence: number } {
  // Spreadsheet-backed deterministic rules for MVP
  // - Indicator formulas are in derive.ts (계산용.xlsx Sheet2).
  // - Type rules are in 계산용.xlsx (Sheet15: "사고유형 계산 및 2개출력").
  //
  // Track note:
  // - If KPF/TPS are missing, we default to Human track and output T1~T4 only.
  // - If KPF/TPS exist, we deterministically choose Human vs Hybrid vs AI,
  //   then choose T / Hx / Ax types.

  // If existing fields are already populated by a TPS model, keep them.
  const existingCode = report?.backend?.cff?.final_determination?.type_code;
  const existingName = report?.backend?.cff?.final_determination?.display_name;
  const existingConf = safeNum(report?.backend?.cff?.final_determination?.type_confidence);
  if (
    typeof existingCode === "string" && existingCode.trim() &&
    typeof existingName === "string" && existingName.trim() &&
    existingConf != null
  ) {
    return { type_code: existingCode, display_name: existingName, type_confidence: clamp01(existingConf) };
  }

  const cfv = report?.backend?.cff?.cfv || {};
  const ind = report?.backend?.cff?.indicator_scores || {};

  const aas = safeNum(cfv.aas) ?? safeNum(ind.AAS);
  const ctf = safeNum(cfv.ctf) ?? safeNum(ind.CTF);
  const rmd = safeNum(cfv.rmd) ?? safeNum(ind.RMD);
  const rdx = safeNum(cfv.rdx) ?? safeNum(ind.RDX);
  const eds = safeNum(cfv.eds) ?? safeNum(ind.EDS);
  const ifd = safeNum(cfv.ifd) ?? safeNum(ind.IFD);
  const hi = safeNum(ind.HI);

  const Analyticity =
    (aas != null && eds != null) ? clamp01((aas + eds) / 2) : null;
  const Flow =
    (ctf != null && rmd != null) ? clamp01((ctf + rmd) / 2) : null;

  // Authenticity / machine-dominance axis (optional)
  const kpf = safeNum(ind.KPF_SIM);
  const tps = safeNum(ind.TPS_H);
  const MachineScore = (() => {
    const hasK = kpf != null;
    const hasT = tps != null;
    if (hasK && hasT) return clamp01((kpf! + (1 - tps!)) / 2);
    if (hasK) return clamp01(kpf!);
    if (hasT) return clamp01(1 - tps!);
    return null;
  })();

  const track: "HUMAN" | "HYBRID" | "AI" = (() => {
    if (MachineScore == null) return "HUMAN";
    if (MachineScore >= 0.70) return "AI";
    if (MachineScore >= 0.40) return "HYBRID";
    return "HUMAN";
  })();

  const CATALOG: Record<string, string> = {
    // Human types
    T1: "Analytical Reasoner",
    T2: "Reflective Thinker",
    T3: "Intuitive Explorer",
    T4: "Strategic Integrator",
    T5: "Human Expressionist",
    T6: "Machine-Dominant",

    // AI (machine-dominant) types
    "Ax-1": "Template Generator",
    "Ax-2": "Evidence Synthesizer",
    "Ax-3": "Style Emulator",
    "Ax-4": "Reasoning Simulator",

    // Hybrid assist types
    "Hx-1": "Draft-Assist",
    "Hx-2": "Structure-Assist",
    "Hx-3": "Evidence-Assist",
    "Hx-4": "Reasoning-Assist",
  };

  const confFromMargin = (m: number) => clamp01(0.55 + clamp01(m) * 0.40);

  // -------------------------
  // 1) AI / Hybrid routes (when MachineScore exists)
  // -------------------------
  if (track === "AI") {
    // 계산용.xlsx Sheet15 (AI 4대 유형)
    // Priority chosen to favor more "deep reasoning simulation" signals when multiple match.
    let code = "Ax-1";
    let conf = 0.70;

    if (aas != null && rdx != null && ifd != null && aas >= 0.75 && rdx <= 0.45 && ifd <= 0.35) {
      code = "Ax-4";
      conf = confFromMargin(Math.min(aas - 0.75, 0.45 - rdx, 0.35 - ifd));
    } else if (eds != null && aas != null && ifd != null && eds >= 0.80 && aas >= 0.65 && ifd <= 0.40) {
      code = "Ax-2";
      conf = confFromMargin(Math.min(eds - 0.80, aas - 0.65, 0.40 - ifd));
    } else if (Flow != null && MachineScore != null && Flow >= 0.65 && MachineScore >= 0.70) {
      code = "Ax-3";
      conf = confFromMargin(Math.min(Flow - 0.65, MachineScore - 0.70));
    } else if (aas != null && rdx != null && rmd != null && aas >= 0.80 && rdx <= 0.40 && rmd <= 0.45) {
      code = "Ax-1";
      conf = confFromMargin(Math.min(aas - 0.80, 0.40 - rdx, 0.45 - rmd));
    }

    return { type_code: code, display_name: CATALOG[code] || code, type_confidence: conf };
  }

  if (track === "HYBRID") {
    // 계산용.xlsx Sheet15 (Hybrid 4대 유형)
    let code = "Hx-1";
    let conf = 0.65;

    if (ctf != null && rdx != null && ifd != null && ctf >= 0.62 && rdx >= 0.62 && ifd <= 0.45) {
      code = "Hx-4";
      conf = confFromMargin(Math.min(ctf - 0.62, rdx - 0.62, 0.45 - ifd));
    } else if (aas != null && eds != null && aas >= 0.62 && eds >= 0.62) {
      code = "Hx-2";
      conf = confFromMargin(Math.min(aas - 0.62, eds - 0.62));
    } else if (eds != null && ifd != null && eds >= 0.62 && ifd <= 0.45) {
      code = "Hx-3";
      conf = confFromMargin(Math.min(eds - 0.62, 0.45 - ifd));
    } else {
      code = "Hx-1";
      conf = 0.60;
    }

    return { type_code: code, display_name: CATALOG[code] || code, type_confidence: conf };
  }

  // -------------------------
  // 2) Human route (T1~T4 + optional T5)
  // -------------------------
  const cands: Array<{ code: string; pr: number; conf: number }> = [];

  if (Analyticity != null && Flow != null && Analyticity >= 0.70 && Flow >= 0.60) {
    // Strategic Integrator
    const margin = Math.min(Analyticity - 0.70, Flow - 0.60);
    cands.push({ code: "T4", pr: 4, conf: confFromMargin(margin) });
  }

  if (rdx != null && ifd != null && rdx >= 0.65 && ifd >= 0.55) {
    // Reflective Thinker
    const margin = Math.min(rdx - 0.65, ifd - 0.55);
    cands.push({ code: "T2", pr: 3, conf: confFromMargin(margin) });
  }

  if (aas != null && eds != null && aas >= 0.75 && eds >= 0.55) {
    // Analytical Reasoner
    const margin = Math.min(aas - 0.75, eds - 0.55);
    cands.push({ code: "T1", pr: 2, conf: confFromMargin(margin) });
  }

  if (Analyticity != null && Flow != null && Flow >= 0.70 && Analyticity <= 0.55) {
    // Intuitive Explorer
    const margin = Math.min(Flow - 0.70, 0.55 - Analyticity);
    cands.push({ code: "T3", pr: 2, conf: confFromMargin(margin) });
  }

  // Optional T5: Human Expressionist (Excel does not define numeric thresholds explicitly)
  // Proxy rule: high HI with moderate structure.
  if (hi != null && Flow != null && Analyticity != null && hi >= 0.78 && Flow >= 0.55 && Analyticity <= 0.60) {
    const margin = Math.min(hi - 0.78, Flow - 0.55, 0.60 - Analyticity);
    cands.push({ code: "T5", pr: 1, conf: confFromMargin(margin) });
  }

  // Priority: T4 > T2 > T1/T3 > T5 (proxy) > fallback T2
  cands.sort((a, b) => (b.pr - a.pr) || (b.conf - a.conf));
  const chosen = cands[0] || { code: "T2", pr: 0, conf: 0.60 };

  return {
    type_code: chosen.code,
    display_name: CATALOG[chosen.code] || chosen.code,
    type_confidence: clamp01(chosen.conf),
  };
}


function selectTopByScore<T extends Record<string, any>>(items: T[], scoreKey: string, n: number): T[] {
  const xs = Array.isArray(items) ? items.slice() : [];
  xs.sort((a, b) => {
    const av = safeNum(a?.[scoreKey]) ?? -1;
    const bv = safeNum(b?.[scoreKey]) ?? -1;
    return bv - av;
  });
  return xs.slice(0, Math.max(0, n));
}

// Role-fit:
// - track_scores: derive.ts should compute.
// - inference.ts selects top groups and jobs by suitability score (occupation_score / score).
// This function does NOT invent jobs. It only sorts and truncates if a full list exists.

// -----------------------------
// Cognitive Style 1–9 (Sheet20) - deterministic mapping
// -----------------------------

const DEFAULT_PRIMARY_PATTERN_BY_STYLE: Record<number, string> = {
  1: "Reflective Explorer",
  2: "Reflective Explorer",
  3: "Analytical Reasoner",
  4: "Intuitive Explorer",
  5: "Reflective Explorer",
  6: "Procedural Thinker",
  7: "Creative Explorer",
  8: "Associative Thinker",
  9: "Linear Responder",
};

const PHRASE_MAP_BY_STYLE: Record<number, string> = {
  1: "structured and exploratory",
  2: "structured but exploratory",
  3: "highly structured and deliberate",
  4: "exploratory with emerging structure",
  5: "balanced and adaptive",
  6: "moderately structured and steady",
  7: "highly exploratory and fluid",
  8: "loosely structured with exploration",
  9: "unstructured and linear",
};

function computeStyleId(structure: number, exploration: number): number {
  const S = clamp01(structure);
  const E = clamp01(exploration);

  if (S >= 0.67 && E >= 0.67) return 1;
  if (S >= 0.67 && E >= 0.45) return 2;
  if (S >= 0.67 && E < 0.45) return 3;

  if (S >= 0.45 && E >= 0.67) return 4;
  if (S >= 0.45 && E >= 0.45) return 5;
  if (S >= 0.45 && E < 0.45) return 6;

  if (S < 0.45 && E >= 0.67) return 7;
  if (S < 0.45 && E >= 0.45) return 8;
  return 9;
}

function buildCognitiveStyleSummary(styleId: number, primaryPattern: string | null = null): string {
  const pattern = primaryPattern || DEFAULT_PRIMARY_PATTERN_BY_STYLE[styleId] || "Reflective Explorer";
  const phrase = PHRASE_MAP_BY_STYLE[styleId] || "balanced and adaptive";
  return `${pattern}, ${phrase}.`;
}

function inferCognitiveStyle(report: any): void {
  report.backend.cff = report.backend.cff ?? {};
  report.backend.cff.cognitive_style = report.backend.cff.cognitive_style ?? {};

  const structure = safeNum(report?.backend?.cff?.derived_scores?.structure);
  const exploration = safeNum(report?.backend?.cff?.derived_scores?.exploration);

  if (structure == null || exploration == null) {
    // Keep nulls if derive.ts didn't populate
    report.backend.cff.cognitive_style.style_id = report.backend.cff.cognitive_style.style_id ?? null;
    report.backend.cff.cognitive_style.summary = report.backend.cff.cognitive_style.summary ?? null;
    return;
  }

  const styleId = computeStyleId(structure, exploration);

  // If a stable 'primary_pattern' exists elsewhere, you can pass it here.
  // MVP: use default mapping only.
  const summary = buildCognitiveStyleSummary(styleId, null);

  report.backend.cff.cognitive_style.style_id = styleId;
  report.backend.cff.cognitive_style.structure = round4(structure);
  report.backend.cff.cognitive_style.exploration = round4(exploration);
  report.backend.cff.cognitive_style.primary_pattern = DEFAULT_PRIMARY_PATTERN_BY_STYLE[styleId] ?? null;
  report.backend.cff.cognitive_style.phrase = PHRASE_MAP_BY_STYLE[styleId] ?? null;
  report.backend.cff.cognitive_style.summary = summary;
}

// -----------------------------
// Observed Structural Signals (Sheet8) - deterministic selection
// -----------------------------
function inferObservedStructuralSignals(report: any): void {
  const ds = report?.backend?.cff?.derived_scores;
  if (!ds) return;

  const candidates: Array<{ key: string; v: number }> = [];
  for (const key of ["structural_variance", "human_rhythm_index", "transition_flow", "revision_depth"]) {
    const v = safeNum(ds?.[key]);
    if (v != null) candidates.push({ key, v: clamp01(v) });
  }
  if (!candidates.length) return;

  candidates.sort((a, b) => b.v - a.v);

  report.backend.control = report.backend.control ?? {};
  const pickedKeys = candidates.slice(0, 4).map((x) => x.key);
  report.backend.control.observed_structural_signals = pickedKeys;

  // Map the 4 computed signal keys to catalog signal_id(s) and store human-readable texts.
  const keyToId: Record<string, number> = {
    revision_depth: 1,
    transition_flow: 6,
    human_rhythm_index: 7,
    structural_variance: 15,
  };
  const ids = pickedKeys.map((k) => keyToId[k]).filter((x) => Number.isFinite(x)) as number[];
  const texts = selectObservedSignalTexts(ids);
  if (texts.length) report.backend.control.observed_structural_signals_text_en = texts;
}

function inferRoleFit(report: any, p: InferenceParams): void {
  report.backend.role_fit = report.backend.role_fit ?? {};

  const tracks = report.backend.role_fit.track_scores;
  if (Array.isArray(tracks) && tracks.length > 0) {
    const sorted = selectTopByScore(tracks, "score", tracks.length);
    const top = sorted[0];
    // primary_pattern is a stable code; prefer track_id, fallback to track_label.
    report.backend.role_fit.primary_pattern = top?.track_id ?? top?.track_label ?? report.backend.role_fit.primary_pattern ?? null;
  } else {
    report.backend.role_fit.primary_pattern = report.backend.role_fit.primary_pattern ?? null;
  }

  // groups: prefer role_groups_all, else keep existing top_role_groups but sort
  const groupsAll = report.backend.role_fit.role_groups_all;
  if (Array.isArray(groupsAll) && groupsAll.length > 0) {
    report.backend.role_fit.top_role_groups = selectTopByScore(groupsAll, "score", p.roleFitTopGroupsN);
  } else if (Array.isArray(report.backend.role_fit.top_role_groups)) {
    report.backend.role_fit.top_role_groups = selectTopByScore(report.backend.role_fit.top_role_groups, "score", p.roleFitTopGroupsN);
  }

  // jobs: prefer jobs_all, else keep existing top_jobs but sort
  const jobsAll = report.backend.role_fit.jobs_all;
  if (Array.isArray(jobsAll) && jobsAll.length > 0) {
    report.backend.role_fit.top_jobs = selectTopByScore(jobsAll, "occupation_score", p.roleFitTopJobsN);
  } else if (Array.isArray(report.backend.role_fit.top_jobs)) {
    report.backend.role_fit.top_jobs = selectTopByScore(report.backend.role_fit.top_jobs, "occupation_score", p.roleFitTopJobsN);
  }
}

export function infer(report: any, params?: Partial<InferenceParams>): any {
  const p: InferenceParams = { ...DEFAULT_PARAMS, ...(params ?? {}) };

  report.backend = report.backend ?? {};
  report.backend.control = report.backend.control ?? {};
  report.backend.cff = report.backend.cff ?? {};
  report.backend.cff.indicator_scores = report.backend.cff.indicator_scores ?? {};
  report.backend.rsl = report.backend.rsl ?? {};
  report.backend.role_fit = report.backend.role_fit ?? {};

  report.ui_text = report.ui_text ?? {};
  report.ui_text.control = report.ui_text.control ?? {};

  // Ensure unused indicators (KPF_SIM, TPS_H) exist and are null for MVP
  if (report.backend.cff.indicator_scores.KPF_SIM === undefined) report.backend.cff.indicator_scores.KPF_SIM = null;
  if (report.backend.cff.indicator_scores.TPS_H === undefined) report.backend.cff.indicator_scores.TPS_H = null;

  // 1) Control vector
  const { v, sources } = extractControlVector(report);
  const [A, D, R] = v;

  report.backend.control.control_vector = report.backend.control.control_vector ?? {};
  report.backend.control.control_vector.A_agency = A;
  report.backend.control.control_vector.D_depth = D;
  report.backend.control.control_vector.R_reflection = R;

  // 2) Pattern selection + reliability
  const { best, d1, second, d2, margin } = top2Distances(v, CONTROL_CENTROIDS, p.wA, p.wD, p.wR);

  let r: number | null = null;
  let band: ReliabilityBand;
  if (p.method === "rule") {
    band = reliabilityBandRule(d1, margin);
  } else {
    r = reliabilityScore(d1, margin, p);
    band = reliabilityBandFromScore(r, p);
  }

  report.backend.control.ranking = {
    best_pattern: best,
    d1: round4(d1),
    second_pattern: second,
    d2: round4(d2),
    margin: round4(margin),
  };

  report.backend.control.reliability_score = {
    method: p.method,
    params: {
      tau: p.tau,
      mu: p.mu,
      alpha: p.alpha,
      beta: p.beta,
      wA: p.wA,
      wD: p.wD,
      wR: p.wR,
    },
    r: r == null ? null : round4(r),
    band,
  };


  // 2b) Catalog-enriched control texts (from 11.xlsx)
  const bestPattern = report.backend.control.ranking?.best_pattern;
  if (bestPattern) {
    const meta = lookupControlPatternMeta(String(bestPattern));
    if (meta?.pattern_description_en) report.backend.control.best_pattern_description_en = String(meta.pattern_description_en);
    if (meta?.default_reliability_band) report.backend.control.default_reliability_band = String(meta.default_reliability_band);
    if (meta?.band_rationale_en) report.backend.control.reliability_rationale_en = String(meta.band_rationale_en);
    const dist = lookupControlDistInterpret(String(bestPattern));
    if (dist) report.backend.control.distribution_interpretation_en = dist;
  }
  const bandNote = lookupControlBandNote(String(report.backend.control.reliability_score?.band || ""));
  if (bandNote) report.backend.control.reliability_note_en = bandNote;
  // 3) Distribution label and shares
  report.backend.control.distribution_share = report.backend.control.distribution_share ?? {};
  if (report.backend.control.distribution_share.human == null) report.backend.control.distribution_share.human = A;
  if (report.backend.control.distribution_share.ai == null) report.backend.control.distribution_share.ai = clamp01(1 - A);

  // Hybrid share is a soft proxy when derive.ts has not computed it.
  if (report.backend.control.distribution_share.hybrid == null) {
    report.backend.control.distribution_share.hybrid = clamp01(1 - Math.abs(A - 0.5) * 2) * 0.35;
  }

  const det = agencyDeterminationFromA(A);
  report.backend.control.distribution_pct = report.backend.control.distribution_pct ?? {};
  report.backend.control.distribution_pct.result = det.label;

  // 4) Control UI text synthesis (fixed templates)
  if (report.ui_text.control.lead_text == null) {
    report.ui_text.control.lead_text =
      "The distribution shows the proportion of ownership of reasoning decisions across structural decision points. Values reflect where control was exercised during reasoning transitions, not authorship attribution, model usage, or stylistic origin.";
  }

  const interpret = CONTROL_DISTRIBUTION_INTERPRETATION[best] ?? "";
  const bandNote = CONTROL_BAND_NOTES[band] ?? "";
  const rationale = CONTROL_PATTERN_RATIONALE[best] ?? "";
  report.ui_text.control.summary_text = [interpret, bandNote, rationale].filter(Boolean).join(" ");
  report.ui_text.control.determination_statement = det.statement;

  report.backend.control._debug = report.backend.control._debug ?? {};
  report.backend.control._debug.control_vector_sources = sources;

  // 5) CFF final_determination (type_code/display_name/type_confidence)
  report.backend.cff.final_determination = report.backend.cff.final_determination ?? {};
  const cffFinal = inferCffFinalDetermination(report);
  report.backend.cff.final_determination.type_code = cffFinal.type_code;
  report.backend.cff.final_determination.display_name = cffFinal.display_name;
  report.backend.cff.final_determination.type_confidence = round4(cffFinal.type_confidence);

  // 5b) Decision Output sentence (catalog-driven)
  const agencyCode = String(report?.backend?.control?.control_vector?.A_agency_label || report?.backend?.control?.control_pattern?.split('_')?.slice(-1)[0] || '');
  const dec = lookupDecisionSentence(agencyCode);
  if (dec) {
    report.backend.cff.final_determination.decision_label = report.backend.cff.final_determination.decision_label ?? dec.decision_label;
    report.backend.cff.final_determination.decision_sentence_en = report.backend.cff.final_determination.decision_sentence_en ?? dec.sentence_en;
  }


  // 6) Role fit inference: primary pattern + top lists (selection by suitability)
  inferRoleFit(report, p);


  // 6b) RoleFit narrative templates (from 11.xlsx)
  // Uses derived_scores.structure/exploration for the overall profile explanation,
  // and top job score for the 'why' sentence. Pure deterministic template selection.
  report.backend.role_fit = report.backend.role_fit ?? {};
  const ds = report.backend.cff?.derived_scores || {};
  const expl = pickRolefitExplanation(safeNum(ds.structure), safeNum(ds.exploration));
  if (expl && report.backend.role_fit.explanation_en == null) report.backend.role_fit.explanation_en = expl;

  const topJob = Array.isArray(report.backend.role_fit.top_jobs) ? report.backend.role_fit.top_jobs[0] : null;
  if (topJob && report.backend.role_fit.why_en == null) {
    const score01 = safeNum(topJob.occupation_score) ?? safeNum(topJob.score) ?? null;
    const jobName = String(topJob.job_name ?? topJob.job ?? topJob.name ?? "");
    if (score01 != null && jobName) {
      const band2 = fitBandFromScore(clamp01(score01));
      const why = pickRolefitWhy(band2, jobName, clamp01(score01));
      if (why) report.backend.role_fit.why_en = why;
      report.backend.role_fit.fit_band = report.backend.role_fit.fit_band ?? band2;
    }
  }
  // 7) Cognitive Style 1–9 (deterministic)
  inferCognitiveStyle(report);

  // 8) Observed Structural Signals (deterministic)
  inferObservedStructuralSignals(report);

  return report;
}

export function inferControl(report: any, params?: Partial<InferenceParams>): any {
  return infer(report, params);
}
