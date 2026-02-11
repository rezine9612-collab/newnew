// lib/blueprints.ts
// IMPORTANT: Catalog samples are imported from fields.fixed.json and parsed at runtime.
// This ensures the catalog JSON strings are NOT rewritten, re-formatted, or edited by ChatGPT.

import fixed from "@/lib/data/fields.fixed.json";
import gptSpec from "@/lib/data/fields.gpt.json";

export type ExtractorVersion = "raw_features_v1";

/**
 * Reliability fixed params (source of truth: fields.fixed.json).
 * Note: These are scalar fields, not catalog sample strings.
 */
export const RELIABILITY_FIXED = {
  method: String(fixed.fields["backend.control.reliability_score.method"]?.sample ?? "sigmoid"),
  params: {
    alpha: Number(fixed.fields["backend.control.reliability_score.params.alpha"]?.sample ?? 18.0),
    beta: Number(fixed.fields["backend.control.reliability_score.params.beta"]?.sample ?? 20.0),
    mu: Number(fixed.fields["backend.control.reliability_score.params.mu"]?.sample ?? 0.06),
    tau: Number(fixed.fields["backend.control.reliability_score.params.tau"]?.sample ?? 0.18),
  },
} as const;

/**
 * Return catalog sample STRING as-is (no modifications).
 * We only JSON.parse to produce runtime objects.
 */
function getCatalogSampleString(key: string): string {
  const row = (fixed as any)?.fields?.[key];
  const s = row?.sample;
  if (typeof s !== "string") return "[]";
  return s; // as-is
}

export function parseCatalog<T = any>(key: string): T {
  const s = getCatalogSampleString(key);
  try {
    return JSON.parse(s) as T;
  } catch {
    return [] as any;
  }
}

/**
 * Catalog datasets (complete list from fields.fixed.json keys).
 * All values are derived from the imported sample strings, untouched.
 */
export const CATALOG = {
  cat_control_band_notes: parseCatalog("catalog.cat_control_band_notes[]"),
  cat_control_dist_interpret: parseCatalog("catalog.cat_control_dist_interpret[]"),
  cat_control_dist_labels: parseCatalog("catalog.cat_control_dist_labels[]"),
  cat_control_patterns: parseCatalog("catalog.cat_control_patterns[]"),
  cat_decision_output: parseCatalog("catalog.cat_decision_output[]"),
  cat_observed_struct_signals: parseCatalog("catalog.cat_observed_struct_signals[]"),
  cat_rolefit_expl_templates: parseCatalog("catalog.cat_rolefit_expl_templates[]"),
  cat_rolefit_why_templates: parseCatalog("catalog.cat_rolefit_why_templates[]"),
  catalog_cff_final_types: parseCatalog("catalog.catalog_cff_final_types[]"),
  catalog_cohort_notes: parseCatalog("catalog.catalog_cohort_notes[]"),
  catalog_fri_notes: parseCatalog("catalog.catalog_fri_notes[]"),
  catalog_index: parseCatalog("catalog.catalog_index[]"),
  catalog_jobs: parseCatalog("catalog.catalog_jobs[]"),
  catalog_observed_patterns: parseCatalog("catalog.catalog_observed_patterns[]"),
  catalog_role_group_jobs: parseCatalog("catalog.catalog_role_group_jobs[]"),
  catalog_rsl_level: parseCatalog("catalog.catalog_rsl_level[]"),
  catalog_rsl_summary: parseCatalog("catalog.catalog_rsl_summary[]"),
  catalog_stability_index_notes: parseCatalog("catalog.catalog_stability_index_notes[]"),
} as const;

/**
 * Build GPT raw extractor prompt.
 * Source: fields.gpt.json (owner=gpt) keys under gpt_raw.*
 * GPT MUST fill only gpt_raw.* and must not compute backend scores/confidence.
 */
export function buildGptRawExtractorMessages(args: {
  inputText: string;
  inputLanguage?: "EN" | "KO" | "AR" | "AUTO";
  version?: ExtractorVersion;
}) {
  const version: ExtractorVersion = args.version ?? "raw_features_v1";
  const inputLanguage = args.inputLanguage ?? "AUTO";

  const system = [
    "You are NeuPrint's raw-feature extractor.",
    "Return ONLY valid JSON.",
    "Do NOT compute any backend scores, confidence, reliability, control, classification, or labels.",
    "Do NOT add extra keys outside the required structure.",
    "If a field cannot be computed reliably, return null for that field.",
    "",
    `Extractor rules version: ${version}`,
  ].join("\n");

  // Minimal schema is derived from gptSpec fields (we still keep a stable explicit template here)
  // because UI/derive.ts expects gpt_raw.raw_features keys to exist.
  const user = [
    `Input language hint: ${inputLanguage}`,
    "",
    "Return exactly this JSON structure (no markdown, no commentary):",
    "{",
    '  "gpt_raw": {',
    `    "extraction_rules_version": "${version}",`,
    '    "raw_features": {',
    '      "units": 0,',
    '      "claims": null,',
    '      "reasons": null,',
    '      "warrants": null,',
    '      "evidence": null,',
    '      "evidence_types": {',
    '        "authority": null,',
    '        "citation": null,',
    '        "comparison": null,',
    '        "counterevidence": null,',
    '        "definition": null,',
    '        "example": null,',
    '        "mechanism": null,',
    '        "normative": null,',
    '        "numeric": null,',
    '        "observation": null,',
    '        "other": null',
    "      },",
    '      "counterpoints": null,',
    '      "refutations": null,',
    '      "hedges": null,',
    '      "intent_markers": null,',
    '      "transitions": null,',
    '      "transition_ok": null,',
    '      "revisions": null,',
    '      "loops": null,',
    '      "adjacency_links": null,',
    '      "cross_links": null',
    "    },",
    '    "events": {',
    '      "revisions": []',
    "    },",
    '    "warnings": []',
    "  }",
    "}",
    "",
    "Text to analyze:",
    args.inputText,
  ].join("\n");

  return { system, user, _spec: gptSpec };
}
