/* =========================================================
       Module 1) Utilities (keep minimal, shared)
    ========================================================= */
        // Utilities
        function $(id) {
          return document.getElementById(id)
        }

        function esc(v) {
          return String(v ?? '').replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
          })
        }

        function setText(id, value) {
          const el = $(id)
          if (el) el.textContent = String(value)
        }
        function clamp01(x) {
          const n = Number(x)
          if (!Number.isFinite(n)) return 0
          return Math.max(0, Math.min(1, n))
        }
        function pct01ToPctInt(x) {
          return Math.round(clamp01(x) * 100)
        }

        function pctTripletFromMix(mix) {
          // Use preserved percent ints when provided so the chart matches UI expectations exactly.
          if (mix && mix._pct) {
            const h = Math.max(0, Math.min(100, Number(mix._pct.human ?? 0)))
            const y = Math.max(0, Math.min(100, Number(mix._pct.hybrid ?? 0)))
            const a = Math.max(0, Math.min(100, Number(mix._pct.ai ?? 0)))
            const s = h + y + a
            if (s === 100) return [h, y, a]
          }
          // Otherwise, round and then adjust so the sum is exactly 100.
          const raw = [clamp01(mix?.human ?? 0) * 100, clamp01(mix?.hybrid ?? 0) * 100, clamp01(mix?.ai ?? 0) * 100]
          const base = raw.map((v) => Math.floor(v))
          let rem = 100 - (base[0] + base[1] + base[2])
          const frac = raw.map((v, i) => ({ i, f: v - base[i] })).sort((a, b) => b.f - a.f)
          for (let k = 0; k < frac.length && rem > 0; k++) {
            base[frac[k].i] += 1
            rem -= 1
          }
          // Final safety
          const s2 = base[0] + base[1] + base[2]
          if (s2 !== 100) {
            base[0] += 100 - s2
          }
          return base
        }
                function formatPct01(x) {
          return pct01ToPctInt(x) + '%'
        }
        function fmt2(x) {
          const n = Number(x)
          if (!Number.isFinite(n)) return '0.00'
          return n.toFixed(2)
        }

        // =========================================================
        // mix_ratio fallback (Reasoning Control Distribution)
        // - Primary: r.ai.mix_ratio (0-1)
        // - Fallback: r.agency.distribution.*_pct (0-100)
        // =========================================================
        function getMixFromReport(r) {
          // Returns 0..1 ratios.
          // Accepts 0..1, 0..100, or strings like "82%".
          // Also preserves percent-int inputs (82) so the UI can match them exactly.

          function parse01(v) {
            if (v == null) return null
            if (typeof v === 'string') {
              const s = v.trim().replace('%', '')
              if (!s) return null
              const n = Number(s)
              if (!Number.isFinite(n)) return null
              return clamp01(n > 1 ? n / 100 : n)
            }
            const n = Number(v)
            if (!Number.isFinite(n)) return null
            return clamp01(n > 1 ? n / 100 : n)
          }

          function normTriplet(h, y, a) {
            const hh = clamp01(h)
            const yy = clamp01(y)
            const aa = clamp01(a)
            const s = hh + yy + aa
            if (s <= 0) return { human: 0, hybrid: 0, ai: 0 }
            return { human: hh / s, hybrid: yy / s, ai: aa / s }
          }

          try {
            // 1) Prefer explicit distribution percent ints (UI-facing) when available.
            const d = r && r.agency && r.agency.distribution ? r.agency.distribution : null
            if (d && (d.human_pct != null || d.hybrid_pct != null || d.ai_pct != null)) {
              // If only Hybrid/AI are provided (common in some backends), derive Human as the residual.
              // This prevents accidental pickup of unrelated confidence fields.
              const yp0 = d.hybrid_pct == null ? null : Number(d.hybrid_pct)
              const ap0 = d.ai_pct == null ? null : Number(d.ai_pct)
              let hp0 = d.human_pct == null ? null : Number(d.human_pct)

              const yp = Math.max(0, Math.min(100, Number.isFinite(yp0) ? yp0 : 0))
              const ap = Math.max(0, Math.min(100, Number.isFinite(ap0) ? ap0 : 0))
              if (hp0 == null && (d.hybrid_pct != null || d.ai_pct != null)) {
                hp0 = 100 - yp - ap
              }
              const hp = Math.max(0, Math.min(100, Number.isFinite(hp0) ? hp0 : 0))
              const out = normTriplet(hp / 100, yp / 100, ap / 100)
              out._pct = { human: Math.round(hp), hybrid: Math.round(yp), ai: Math.round(ap) }
              return out
            }

            // 2) mix_ratio object (0..1 or 0..100)
            const mix = r && r.ai && r.ai.mix_ratio ? r.ai.mix_ratio : null
            if (mix && (mix.human != null || mix.hybrid != null || mix.ai != null)) {
              const y = parse01(mix.hybrid ?? 0) ?? 0
              const a = parse01(mix.ai ?? 0) ?? 0
              let h = parse01(mix.human)

              // If Human is missing, derive it as residual.
              if (h == null && (mix.hybrid != null || mix.ai != null)) {
                h = clamp01(1 - y - a)
              }

              // If the three don't look like a valid triplet (e.g., Human accidentally stored as confidence),
              // prefer residual so Hybrid/AI remain exact.
              if (h != null && y + a > 0) {
                const s = h + y + a
                if (s > 1.001) {
                  h = clamp01(1 - y - a)
                }
              }
              return normTriplet(h ?? 0, y, a)
            }

            // 3) Alternative schema support (optional)
            const alt = r && r.reasoning_control && r.reasoning_control.distribution ? r.reasoning_control.distribution : null
            if (alt && (alt.human != null || alt.hybrid != null || alt.ai != null)) {
              const h = parse01(alt.human ?? 0) ?? 0
              const y = parse01(alt.hybrid ?? 0) ?? 0
              const a = parse01(alt.ai ?? 0) ?? 0
              return normTriplet(h, y, a)
            }

            return { human: 0, hybrid: 0, ai: 0 }
          } catch (e) {
            return { human: 0, hybrid: 0, ai: 0 }
          }
        }

        function getConfidenceIndex01(r) {
          // Goal: display the same confidence users see in the hero chips (e.g., 88%),
          // while remaining compatible with multiple backend schemas.

          function parse01(v) {
            if (v == null) return null
            if (typeof v === 'string') {
              const s = v.trim().replace('%', '')
              if (s === '') return null
              const n = Number(s)
              if (!isFinite(n)) return null
              return clamp01(n > 1 ? n / 100 : n)
            }
            const n = Number(v)
            if (!isFinite(n)) return null
            return clamp01(n > 1 ? n / 100 : n)
          }

          // 1) Most explicit / most user-facing fields first (accept 0..1, 0..100, or "88%").
          const candidates = [
            r?.hero?.chips?.confidence_index,
            r?.hero?.chips?.confidence,
            r?.hero?.chips?.confidence_pct,
            r?.hero?.confidence_index,
            r?.hero?.confidence,
            r?.hero?.confidence_pct,
            r?.classification_confidence,
            r?.confidence_index,
            r?.confidence,
            r?.forensic?.confidence,
            r?.forensic?.confidence_index,
            r?.determination?.confidence,
            r?.determination?.confidence_index,
            r?.ai?.confidence_index,
          ]

          for (const v of candidates) {
            const out = parse01(v)
            if (out != null) return out
          }

          // 2) If nothing else exists, fall back to CFF type confidences.
          const cff1 = parse01(r?.cff?.final_determination?.type_confidence)
          if (cff1 != null) return cff1
          const cff2 = parse01(r?.cff?.observed_patterns?.type_confidence)
          if (cff2 != null) return cff2

          return 0
        }



        function riskBandFromReliability(band) {
          if (band === 'HIGH')
            return { label: 'Low', note: 'High reliability band, low false-positive risk.' }
          if (band === 'MEDIUM')
            return { label: 'Medium', note: 'Medium reliability band, review recommended.' }
          if (band === 'LOW')
            return { label: 'High', note: 'Low reliability band, do not use alone.' }
          return { label: 'Unknown', note: 'Reliability band unavailable.' }
        }

        const report = REPORT
