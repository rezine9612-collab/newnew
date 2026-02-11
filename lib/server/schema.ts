// lib/server/schema.ts
// Zod schema fixed to the structure of "최종 JSON.txt" (sample report JSON).
// Strict objects: unknown keys are rejected.
// Notes:
// - Fields that are null in the sample are typed as `z.any().nullable()` to avoid over-constraining
//   (since the sample alone cannot prove the intended non-null type).
// - If you want those nullables to be strongly typed (e.g., string|null), tell me which fields.

import { z } from "zod";

export const ReportSchema = z
  .object({
    engine_version: z.string(),
    assessment_id: z.string(),
    input_language: z.string(),
    generated_at_utc: z.string(),

    _schema: z
      .object({
        meta: z.string(),
        hero: z.string(),
        rsl: z.string(),
        cff: z.string(),
        agency: z.string(),
        role_fit: z.string(),
      })
      .strict(),

    meta: z
      .object({
        product_name: z.string(),
        engine_label: z.string(),
        signed_note: z.string(),
        verify_url: z.string(),
        verification_anchor_note: z.string(),
        verification_id: z.string(),
        qr_alt: z.string(),
        qr_src: z.string(),
      })
      .strict(),

    hero: z
      .object({
        title: z.string(),
        description: z.string(),
        chips: z
          .object({
            rsl_level: z.string(),
            determination: z.string(),
            fri: z.number(),
            control: z.string(),
            role_fit: z.string(),
            confidence_index: z.number(),
          })
          .strict(),
        decision_compression_quote: z.string(),
      })
      .strict(),

    rsl: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),
        overall_level: z.string(),
        overall_level_short: z.string(),
        overall_level_description: z.string(),
        overall_level_score_0to1: z.number(),
        percentile_0to1: z.number(),
        cohort_note: z.string(),
        radar: z
          .object({
            labels: z.array(z.string()),
            values_0to1: z.array(z.number()),
          })
          .strict(),
        cohort_chart: z
          .object({
            labels: z.array(z.string()),
            values_0to1: z.array(z.number()),
            highlight_index: z.number(),
          })
          .strict(),
        dimension_table: z.array(
          z
            .object({
              id: z.string(),
              label: z.string(),
              score_0to1: z.number(),
              note: z.string(),
            })
            .strict()
        ),
      })
      .strict(),

    cff: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),

        indicator_radar: z
          .object({
            labels: z.array(z.string()),
            values_0to1: z.array(z.any().nullable()),
          })
          .strict(),

        indicator_table: z.array(
          z
            .object({
              id: z.string(),
              label: z.string(),
              score_0to1: z.any().nullable(),
              note: z.any().nullable(),
            })
            .strict()
        ),

        observed_patterns: z
          .object({
            primary: z
              .object({
                code: z.string(),
                label: z.string(),
                score_0to1: z.number(),
                description: z.string(),
              })
              .strict(),
            secondary: z
              .object({
                code: z.string(),
                label: z.string(),
                score_0to1: z.number(),
                description: z.string(),
              })
              .strict(),
            all_scores: z.array(
              z
                .object({
                  code: z.string(),
                  label: z.string(),
                  score_0to1: z.number(),
                })
                .strict()
            ),
            confidence: z
              .object({
                delta_top1_top2: z.number(),
                confidence_0to1: z.number(),
              })
              .strict(),
          })
          .strict(),

        axes: z
          .object({
            stability_axis: z
              .object({
                structure_0to1: z.number(),
                label: z.string(),
              })
              .strict(),
            expansion_axis: z
              .object({
                exploration_0to1: z.number(),
                label: z.string(),
              })
              .strict(),
          })
          .strict(),

        final_determination: z
          .object({
            type_code: z.string(),
            display_name: z.string(),
            confidence_0to1: z.number(),
            lead_text: z.string(),
            explanation_text: z.string(),
          })
          .strict(),
      })
      .strict(),

    agency: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),
        distribution: z
          .object({
            human_share_0to1: z.number(),
            hybrid_share_0to1: z.number(),
            ai_share_0to1: z.number(),
            dominant_label: z.string(),
          })
          .strict(),
        reliability: z
          .object({
            band: z.string(),
            score_0to1: z.number(),
            method: z.string(),
            params: z
              .object({
                alpha: z.number(),
                beta: z.number(),
                mu: z.number(),
                tau: z.number(),
              })
              .strict(),
            band_note: z.string(),
          })
          .strict(),
        control_vector: z
          .object({
            A_agency_0to1: z.number(),
            R_reflection_0to1: z.number(),
            D_depth_0to1: z.number(),
          })
          .strict(),
        best_pattern: z
          .object({
            pattern_code: z.string(),
            pattern_description: z.string(),
            distribution_interpretation: z.string(),
            observed_struct_signals: z.array(z.string()),
          })
          .strict(),
      })
      .strict(),

    role_fit: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),

        structure_level: z.string(),
        exploration_level: z.string(),

        primary_metrics: z
          .object({
            analyticity_0to1: z.number(),
            metacognition_0to1: z.number(),
            flow_0to1: z.number(),
            authenticity_0to1: z.number(),
          })
          .strict(),

        track_scores: z.array(
          z
            .object({
              track_id: z.string(),
              track_label: z.string(),
              score_0to1: z.number(),
            })
            .strict()
        ),

        top_role_groups: z.array(
          z
            .object({
              group_id: z.string(),
              group_label: z.string(),
              score_0to1: z.number(),
            })
            .strict()
        ),

        top_jobs: z.array(
          z
            .object({
              job_id: z.string(),
              job_label: z.string(),
              occupation_score_0to1: z.number(),
              why_text: z.string(),
              fit_band: z.string(),
            })
            .strict()
        ),

        explanation_template_key: z.string(),
        explanation_text: z.string(),
      })
      .strict(),

    ai: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),
        note: z.string(),
      })
      .strict(),

    footer: z
      .object({
        disclosure: z.string(),
        disclaimer: z.string(),
      })
      .strict(),

    stability: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),
        structural_variance_0to1: z.number(),
        human_rhythm_index_0to1: z.number(),
        transition_flow_0to1: z.number(),
        revision_depth_0to1: z.number(),
      })
      .strict(),

    reasoning_control: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),
        result_label: z.string(),
        signals: z.array(z.string()),
        summary: z.string(),
      })
      .strict(),

    reasoning_map: z
      .object({
        section_title: z.string(),
        section_lead: z.string(),
        x_label: z.string(),
        y_label: z.string(),
        point: z
          .object({
            x_0to1: z.number(),
            y_0to1: z.number(),
          })
          .strict(),
        quadrant_note: z.string(),
      })
      .strict(),

    topic_tags: z.array(z.string()),

    top: z
      .object({
        hero_quote: z.string(),
      })
      .strict(),

    bottom: z
      .object({
        notes: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type Report = z.infer<typeof ReportSchema>;

export function parseReport(input: unknown): Report {
  return ReportSchema.parse(input);
}

export function safeParseReport(input: unknown) {
  return ReportSchema.safeParse(input);
}
