// app/api/analyze/route.ts
import { NextResponse } from "next/server";
import { buildGptRawExtractorMessages, RELIABILITY_FIXED } from "@/lib/blueprints";
import { deriveBackendRequiredCalcs } from "@/lib/server/derive";
import { infer } from "@/lib/server/inference";

type AnalyzeRequest = {
  text: string;
  input_language?: "EN" | "KO" | "AR" | "AUTO";
  assessment_id?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function clamp01(x: any): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampPct(x: any): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeJsonParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}$/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    return null;
  }
}

// Minimal OpenAI call (no SDK). If you already use SDK elsewhere, swap it later.
async function callOpenAIJson(args: { system: string; user: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in env");

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error("Failed to parse JSON from model output");
  return parsed;
}

/**
 * DEFAULT REPORT BASE
 * This is aligned to the structure of the user's "최종 JSON.txt".
 * Values here are safe placeholders and are meant to be overwritten by backend results when available.
 */
function defaultReportBase() {
  return {
    engine_version: "1.1",
    assessment_id: "NP-YYYYMMDD-XXXX",
    input_language: "EN",
    generated_at_utc: nowIso(),
    _schema: {
      meta: "Branding, verification, and header metadata used across the page.",
      hero: "Top summary area chips and hero quote. Values populate the header and KPI chips.",
      rsl: "Reasoning Structure Layer. percentile_0to1 (0-1) used to compute Top (100 - pct*100)%.",
      cff: "Cognitive Fingerprint Framework. observed_patterns.primary/secondary show the two patterns.",
      agency: "Reasoning Control / Structural Agency section and charts.",
      role_fit: "Role Fit section including track scores and inference flow labels.",
    },
    meta: {
      product_name: "NeuPrint",
      engine_label: "NeuPrint Cognitive Forensics Engine v1.1",
      signed_note: "This determination is structurally signed and referenceable.",
      verify_url: "https://neuprint.ai/verify",
      verification_anchor_note: "QR code shown represents the verification anchor.",
      verification_id: "NP-YYYYMMDD-XXXX",
      qr_alt: "QR placeholder",
      qr_src: "",
    },
    hero: {
      title: "Structural Reference for Human Reasoning",
      description:
        "NeuPrint provides a decision-grade structural reference that determines whether reasoning control remained with the human under AI-assisted conditions.",
      chips: {
        rsl_level: "L4 Integrated",
        determination: "Reasoning Simulator",
        fri: 3.72,
        control: "Human",
        role_fit: "Strategy·Analysis·Policy",
        confidence_index: 0.88,
      },
      decision_compression_quote:
        "Demonstrates exploratory reasoning that converts observation into cross-domain conceptual inquiry, but prioritizes ideational expansion over evaluative convergence, indicating the need to reinforce counterfactual testing and disciplined conclusion consolidation.",
    },
    rsl: {
      section_title: "1. Reasoning Structure Layer (RSL)",
      section_lead:
        "This section shows how your thinking was organized in this writing, and what you can improve next.",
      overall_level: "L4",
      overall_label: "Integrated",
      overall_level_display: "L4 Integrated",
      overall_level_note:
        "Multiple reasoning dimensions coordinated into a stable, non-dominant structure.",
      fri_label: "Final Reasoning Index",
      fri: 3.72,
      fri_note:
        "Your reasoning structure is stable in most situations. Connections and evaluations usually remain consistent.",
      percentile_0to1: 0.76,
      cohort_placement_display: "Top 24%",
      cohort_note:
        "This position reflects consistently structured reasoning relative to comparable peers.",
      stability_index: 0.89,
      stability_note:
        "Your reasoning structure remains stable even with minor wording changes.",
      summary: {
        one_line:
          "Connects writers, history, and ideas over time but stops short of fully tracing one line to its end.",
        paragraph:
          "Thinking moves by linking personal reflection with historical patterns and named examples. Attention shifts across time, returning to earlier ideas with added nuance. Values shape how claims are framed and occasionally redirect the line of thought. Some paths pause after comparison rather than being fully followed through.",
      },
      dimensions: [],
      charts: {
        cohort_positioning: {
          curve_points: [],
          current: { fri: 3.72, pct: 0.0 },
        },
        rsl_radar: { labels: ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"], values_1to5: [] },
      },
    },
    cff: {
      section_title: "2. Cognitive Fingerprint Framework (CFF)",
      section_lead:
        "This section summarizes your cognitive fingerprint and the structural style of your reasoning.",
      final_determination_label: "Ax-4. Reasoning Simulator",
      observed_patterns: {
        primary: "Reflective Explorer",
        secondary: "Evidence Weaver",
        primary_summary:
          "Reflective Explorer shows active self-revision and exploratory restructuring during reasoning. Thought progresses through reflection, reassessment, and adaptive refinement.",
        secondary_summary:
          "Evidence Weaver emphasizes linking claims with supporting material. Reasoning strength lies in evidence connectivity rather than abstract inference.",
      },
      signature_fingerprint: {
        label: "Signature Fingerprint",
        note:
          "Visual signature is rendered locally based on structural vectors and is not a biometric identifier.",
      },
      radar: {
        labels: ["AAS", "CTF", "RMD", "RDX", "EDS", "IFD"],
        values_0to1: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      },
      indicator_summary: { headline: "CFF Derived Signals", items: [] },
      indicators: [
        { code: "AAS", label: "Argument Architecture Style", value_0to1: 0.5 },
        { code: "CTF", label: "Cognitive Transition Flow", value_0to1: 0.5 },
        { code: "RMD", label: "Reasoning Momentum Delta", value_0to1: 0.5 },
        { code: "RDX", label: "Revision Depth Index", value_0to1: 0.5 },
        { code: "EDS", label: "Evidence Diversity Score", value_0to1: 0.5 },
        { code: "IFD", label: "Intent Friction Delta", value_0to1: 0.5 },
        { code: "KPF-Sim", label: "Keystroke Pattern Fingerprint Similarity", value_0to1: null },
        { code: "TPS-H", label: "Thought Pattern Similarity (History-based)", value_0to1: null },
      ],
    },
    agency: {
      section_title: "3. Reasoning Control and Structural Signals",
      section_lead:
        "This section estimates where control was exercised during structural decision points across the task.",
      summary:
        "A high human proportion indicates that primary reasoning control remained with the individual throughout the task.",
      observed_structural_signals: [],
      control_label: "Human",
      distribution: {
        title: "Reasoning Control Distribution",
        help:
          "The distribution shows the proportion of ownership of reasoning decisions across structural decision points. Values reflect where control was exercised during reasoning transitions, not authorship attribution, model usage, or stylistic origin. A high human proportion indicates that primary reasoning control remained with the individual throughout the task.",
        human_pct: 82,
        hybrid_pct: 9,
        ai_pct: 9,
      },
      signals: [],
      signal_contributions: { human: 0.82, hybrid: 0.09, ai: 0.09 },
    },
    role_fit: {
      section_title: "4. Role Fit",
      section_lead:
        "This section maps structural reasoning signals to role clusters that reward consistent, evidence-linked reasoning.",
      cognitive_style_summary: "Reflective Explorer, structured but exploratory.",
      track_scores: { "Strategy·Analysis·Policy": 78, "Data·AI·Intelligence": 74 },
      profile_statement:
        "This profile indicates consistent evidence of structured reasoning, hypothesis exploration, and deliberate evaluation patterns, which align with roles requiring analytical depth, research-driven inquiry, and strategic framing.",
      job_role_fit: { "Strategy·Analysis·Policy": [], "Data·AI·Intelligence": [] },
      inference_flow: [],
    },
    ai: {
      final_classification: "Ax-4. Reasoning Simulator",
      final_determination_label: "Reasoning Simulator",
      type_confidence: 0.81,
      control_label: "Human",
      determination: "Reasoning Simulator",
      mix_ratio: { human: 0.82, hybrid: 0.09, ai: 0.09 },
      signal_contributions: { human: 0.82, hybrid: 0.09, ai: 0.09 },
      interpretation:
        "Reasoning decisions originate from human-driven structural revision rather than automated continuation flow.",
      pattern_label: "deep_reflective_human",
      detection_reliability_band: "HIGH",
    },
    footer: { closing_note: "" },
    stability: { history_status: "N/A", type_consistency: "N/A", notes: "" },
    reasoning_control: {
      title: "Reasoning Control Distribution",
      help:
        "The distribution shows the proportion of ownership of reasoning decisions across structural decision points. Values reflect where control was exercised during reasoning transitions, not authorship attribution, model usage, or stylistic origin. A high human proportion indicates that primary reasoning control remained with the individual throughout the task.",
      human_pct: 82,
      hybrid_pct: 9,
      ai_pct: 9,
    },
    reasoning_map: { note: "" },
    topic_tags: [],
    top: {},
    bottom: {},

    // backend/gpt_raw/ui_text live here (not shown in 최종 JSON.txt, but required for derive/infer)
    gpt_raw: { extraction_rules_version: "raw_features_v1", raw_features: { units: 1 } },
    backend: {
      control: {
        reliability_score: {
          method: RELIABILITY_FIXED.method,
          params: { ...RELIABILITY_FIXED.params },
        },
      },
    },
    ui_text: {},
  };
}

function applyBackendToUi(report: any) {
  // Map backend.cff.indicator_scores -> cff radar/indicators
  const ind = report?.backend?.cff?.indicator_scores ?? {};
  const AAS = clamp01(ind.AAS);
  const CTF = clamp01(ind.CTF);
  const RMD = clamp01(ind.RMD);
  const RDX = clamp01(ind.RDX);
  const EDS = clamp01(ind.EDS);
  const IFD = clamp01(ind.IFD);

  report.cff = report.cff ?? {};
  report.cff.radar = report.cff.radar ?? {};
  report.cff.radar.labels = ["AAS", "CTF", "RMD", "RDX", "EDS", "IFD"];
  report.cff.radar.values_0to1 = [AAS, CTF, RMD, RDX, EDS, IFD];

  // Update indicators list (keep label text stable)
  const list = report.cff.indicators ?? [];
  const byCode = new Map<string, any>();
  for (const it of list) byCode.set(String(it.code), it);

  const set = (code: string, v: any) => {
    const it = byCode.get(code);
    if (it) it.value_0to1 = v;
  };

  set("AAS", AAS);
  set("CTF", CTF);
  set("RMD", RMD);
  set("RDX", RDX);
  set("EDS", EDS);
  set("IFD", IFD);

  // KPF/TPS are MVP-unused -> keep null
  set("KPF-Sim", null);
  set("TPS-H", null);

  report.cff.indicators = list;

  // backend.cff.final_determination -> cff label + ai section
  const fd = report?.backend?.cff?.final_determination ?? {};
  if (fd.display_name) {
    report.cff.final_determination_label = String(fd.display_name);
    report.ai.final_classification = String(fd.display_name);
    report.ai.final_determination_label = String(fd.display_name).split(". ").slice(1).join(". ") || String(fd.display_name);
    report.ai.determination = report.ai.final_determination_label;
  }
  if (fd.type_confidence != null) {
    report.ai.type_confidence = clamp01(fd.type_confidence);
    report.hero.chips.confidence_index = report.ai.type_confidence;
  }

  // backend.control -> agency distribution and ai fields
  const dist = report?.backend?.control?.distribution ?? {};
  if (dist.human_pct != null || dist.hybrid_pct != null || dist.ai_pct != null) {
    const hp = clampPct(dist.human_pct);
    const hy = clampPct(dist.hybrid_pct);
    const ap = clampPct(dist.ai_pct);
    report.agency.distribution.human_pct = hp;
    report.agency.distribution.hybrid_pct = hy;
    report.agency.distribution.ai_pct = ap;
    report.reasoning_control.human_pct = hp;
    report.reasoning_control.hybrid_pct = hy;
    report.reasoning_control.ai_pct = ap;

    report.agency.signal_contributions = {
      human: clamp01(hp / 100),
      hybrid: clamp01(hy / 100),
      ai: clamp01(ap / 100),
    };
    report.ai.mix_ratio = { ...report.agency.signal_contributions };
    report.ai.signal_contributions = { ...report.agency.signal_contributions };
  }

  // backend.control.selected pattern/band -> ai + agency
  const sel = report?.backend?.control?.selected_pattern ?? {};
  if (sel.pattern_label) report.ai.pattern_label = String(sel.pattern_label);
  if (sel.detection_reliability_band) report.ai.detection_reliability_band = String(sel.detection_reliability_band);
  if (sel.control_label) {
    report.agency.control_label = String(sel.control_label);
    report.ai.control_label = String(sel.control_label);
    report.hero.chips.control = String(sel.control_label);
  }

  // backend.role_fit -> role_fit
  const rf = report?.backend?.role_fit ?? {};
  if (rf.track_scores) report.role_fit.track_scores = { ...(report.role_fit.track_scores || {}), ...(rf.track_scores || {}) };
  if (rf.profile_statement) report.role_fit.profile_statement = String(rf.profile_statement);
  if (rf.cognitive_style_summary) report.role_fit.cognitive_style_summary = String(rf.cognitive_style_summary);

  // hero wiring
  if (report.rsl?.overall_level_display) report.hero.chips.rsl_level = String(report.rsl.overall_level_display);
  if (report.role_fit?.track_scores) {
    // keep existing hero.role_fit unless you want computed best-track later
    // placeholder: do nothing
  }
  return report;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AnalyzeRequest>;
    const text = String(body.text ?? "").trim();
    const input_language = (body.input_language ?? "AUTO") as AnalyzeRequest["input_language"];
    const assessment_id = String(body.assessment_id ?? "").trim();

    if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

    // 1) base template with defaults
    const report = defaultReportBase();

    // meta fill
    report.generated_at_utc = nowIso();
    report.input_language = input_language === "AUTO" ? report.input_language : input_language;

    if (assessment_id) {
      report.assessment_id = assessment_id;
      report.meta.verification_id = assessment_id;
      report.meta.verification_anchor_note = report.meta.verification_anchor_note;
    }

    // 2) GPT extraction (gpt_raw only)
    const { system, user } = buildGptRawExtractorMessages({
      inputText: text,
      inputLanguage: input_language,
    });

    const extracted = await callOpenAIJson({ system, user });
    if (extracted?.gpt_raw) {
      report.gpt_raw = { ...(report.gpt_raw || {}), ...(extracted.gpt_raw || {}) };
    }

    // Ensure units exists (derive.ts contract expects units >= 1)
    const u = Number(report.gpt_raw?.raw_features?.units ?? 1);
    report.gpt_raw.raw_features.units = Number.isFinite(u) && u >= 1 ? Math.floor(u) : 1;

    // 3) Derive backend required calcs
    const afterDerive = deriveBackendRequiredCalcs(report);

    // 4) Inference (deterministic labels, patterns, bands, role-fit)
    const afterInfer = infer(afterDerive);

    // 5) Map backend outputs back onto UI-level JSON sections (hero/rsl/cff/agency/role_fit/ai)
    const final = applyBackendToUi(deepClone(afterInfer));

    return NextResponse.json(final, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
