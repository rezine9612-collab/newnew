/* ================================
     모바일 판별 + 딜레이 값 (맨 위!)
  ================================ */
            window.NP_DISABLE_INTERNAL_CHARTS = false
const IS_MOBILE = window.matchMedia('(max-width: 680px)').matches
      const MOBILE_CHART_START_DELAY = 10
      const NP_DEBUG = false
      /* =========================================================
     RSL table responsive behavior (reversible)
     - Mobile: show observation under Dimension, keep Score column
              and display "Score 4" right-aligned.
     - Desktop: restore original 3-column table.
     Why: the previous mobile transform was destructive (removed cells)
          so resizing back to desktop could not recover.
  ========================================================= */
      function __np_setArcTableLayout() {
        try {
          const isMobile = window.matchMedia('(max-width: 680px)').matches
          const tbody = document.getElementById('rslResultsByDimension')
          if (!tbody) return

          const rows = Array.from(tbody.querySelectorAll('tr'))
          rows.forEach((tr) => {
            if (!tr.dataset.npArcOrig) {
              tr.dataset.npArcOrig = tr.innerHTML
            }

            if (isMobile) {
              if (tr.dataset.npArcMode === 'mobile') return
              tr.innerHTML = tr.dataset.npArcOrig

              const tds = tr.querySelectorAll('td')
              if (tds.length < 3) {
                tr.dataset.npArcMode = 'mobile'
                return
              }

              const dimTd = tds[0]
              const scoreTd = tds[1]
              const obsTd = tds[2]

              const dimText = (dimTd.textContent || '').trim()
              const scoreText = (scoreTd.textContent || '').trim()
              const obsText = (obsTd.textContent || '').trim()

              dimTd.colSpan = 2
              scoreTd.remove()

              dimTd.innerHTML = ''

              const head = document.createElement('div')
              head.className = 'arcHeadLine'

              const label = document.createElement('span')
              label.className = 'arcDimLabel'
              label.textContent = dimText

              const scoreWrap = document.createElement('span')
              scoreWrap.className = 'arcScoreWrap'

              const scoreWord = document.createElement('span')
              scoreWord.className = 'arcScoreWord'
              scoreWord.textContent = 'Score '

              const scoreDot = document.createElement('span')
              scoreDot.className = 'arcScoreDot'
              scoreDot.textContent = scoreText

              scoreWrap.appendChild(scoreWord)
              scoreWrap.appendChild(scoreDot)

              head.appendChild(label)
              head.appendChild(scoreWrap)
              dimTd.appendChild(head)

              if (obsText) {
                const obs = document.createElement('div')
                obs.className = 'arcObsMobile'
                obs.textContent = obsText
                dimTd.appendChild(obs)
              }

              obsTd.textContent = obsText

              tr.dataset.npArcMode = 'mobile'
            } else {
              if (tr.dataset.npArcMode === 'desktop' || !tr.dataset.npArcOrig) return
              tr.innerHTML = tr.dataset.npArcOrig
              tr.dataset.npArcMode = 'desktop'
            }
          })
        } catch (e) {
          NP_DEBUG && console.warn('[NeuPrint] RSL responsive layout failed:', e)
        }
      }
      window.addEventListener(
        'resize',
        () => {
          __np_setArcTableLayout()
        },
        { passive: true },
      )
      window.addEventListener(
        'orientationchange',
        () => {
          __np_setArcTableLayout()
        },
        { passive: true },
      )
      

      /* =========================================================
         Role Fit Inference Flow (1~6)
         - Start animation ONLY when #tab-hr enters viewport
         - Run ONCE (no repeat on scroll)
         - Enforce strict 1→6 sequential delays
      ========================================================= */
      function __np_initRoleFitFlowOnView(){
        try{
          const sec = document.getElementById('tab-hr');
          const flow = sec ? sec.querySelector('.rfFlow.is-animated') : null;
          if(!sec || !flow) return;

          // Prepare deterministic per-row delays (do NOT start yet)
          const rows = Array.from(flow.querySelectorAll('.rfRow'));
          // Use CSS variable if present, otherwise fallback to existing defaults
          const baseDelay = 210; // ms between boxes (2x faster) // ms between boxes (already doubled vs earlier)
          rows.forEach((row, i)=>{
            row.style.animationDelay = (i*baseDelay) + 'ms';
          });

          // Safety: ensure not started by default
          flow.classList.remove('rf-start');

          // Start once when visible
          let started = false;
          const start = ()=>{
            if(started) return;
            started = true;
            flow.classList.add('rf-start');
          };

          if('IntersectionObserver' in window){
            const io = new IntersectionObserver((entries)=>{
              for(const e of entries){
                if(e.isIntersecting){
                  start();
                  io.disconnect();
                  break;
                }
              }
            },{ root:null, threshold:0.12, rootMargin:'0px 0px -10% 0px' });
            io.observe(flow);
          }else{
            // Fallback: start after 1s delay
            window.setTimeout(()=>{ start(); }, 0);
          }
        }catch(e){
          // keep silent in production
        }
      }
window.renderNeuPrint = function (reportObject) {
        'use strict'

        const NP_DEBUG = false
        window.onerror = function (msg, src, line, col, err) {
          try {
            NP_DEBUG && console.error('SCRIPT ERROR:', msg, 'at', line + ':' + col)
          } catch (e) {}
        }
        const REPORT = reportObject || window.report || window.DEV_REPORT || null
        if (!REPORT) {
          NP_DEBUG && console.warn('[NeuPrint] No report data found. Provide window.report or DEV JSON.')
          return
        }

        /* =========================================================
       Module 0) Data (REPORT)
    ========================================================= */
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


        /* =========================================================
       Theme tokens to JS (from CSS)
    ========================================================= */
        const css = getComputedStyle(document.documentElement)
        const THEME = {
          text: css.getPropertyValue('--text').trim(),
          accentA: css.getPropertyValue('--accentA').trim(),
          accentB: css.getPropertyValue('--accentB').trim(),
          accentC: css.getPropertyValue('--accentC').trim(),
          accentD: css.getPropertyValue('--accentD').trim(),
          accentE: css.getPropertyValue('--accentE').trim(),
          pillB: css.getPropertyValue('--pillB').trim(),
          pillD: css.getPropertyValue('--pillD').trim(),
          pillN: css.getPropertyValue('--pillN').trim(),
        }

        const CHART_ANIM_MS = parseInt(css.getPropertyValue('--chartAnimDuration'), 10) || 1400
        const CHART_DELAY_MS = parseInt(css.getPropertyValue('--chartAnimDelay'), 10) || 180

        if (window.Chart) {
          Chart.defaults.font.family =
            '"Barlow", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
          Chart.defaults.font.size = 11
          Chart.defaults.color = THEME.text || '#0f172a'
        }

        /* =========================================================
       Plugin helpers (white background label boxes)
    ========================================================= */
        function roundRectPath(ctx, x, y, w, h, r) {
          const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
          ctx.beginPath()
          ctx.moveTo(x + rr, y)
          ctx.arcTo(x + w, y, x + w, y + h, rr)
          ctx.arcTo(x + w, y + h, x, y + h, rr)
          ctx.arcTo(x, y + h, x, y, rr)
          ctx.arcTo(x, y, x + w, y, rr)
          ctx.closePath()
        }

        function drawLabelBox(ctx, x, y, text, opt) {
          const padX = opt && opt.padX != null ? opt.padX : 6
          const padY = opt && opt.padY != null ? opt.padY : 3
          const radius = opt && opt.radius != null ? opt.radius : 6
          const font = opt && opt.font ? opt.font : '500 11px Barlow, system-ui, sans-serif'
          const textColor = opt && opt.textColor ? opt.textColor : '#0f172a'
          const bg = opt && opt.bg ? opt.bg : '#ffffff'
          const stroke = opt && opt.stroke ? opt.stroke : 'rgba(226,232,240,.95)'
          const centerX = !!(opt && opt.centerX)

          ctx.save()
          ctx.font = font
          ctx.textBaseline = 'middle'

          const m = ctx.measureText(text)
          const w = Math.ceil(m.width + padX * 2)
          const h = Math.ceil(12 + padY * 2)

          const rx = centerX ? Math.round(x - w / 2) : x

          roundRectPath(ctx, rx, y, w, h, radius)
          ctx.fillStyle = bg
          ctx.fill()
          ctx.strokeStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--_sigToneC')
            .trim()
          ctx.lineWidth = 1
          /* ctx.stroke(); */

          ctx.fillStyle = textColor
          ctx.fillText(text, rx + padX, y + h / 2)

          ctx.restore()
          return { w, h }
        }

        function drawLabelDot(ctx, cx, cy, text, opt) {
          const font = opt && opt.font ? opt.font : '600 10px Barlow, system-ui, sans-serif'
          const textColor = opt && opt.textColor ? opt.textColor : '#0f172a'
          const bg = opt && opt.bg ? opt.bg : '#ffffff'
          const stroke = opt && opt.stroke ? opt.stroke : 'rgba(226,232,240,.95)'
          const minR = opt && opt.minR != null ? opt.minR : 12
          const pad = opt && opt.pad != null ? opt.pad : 6

          ctx.save()
          ctx.font = font
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'

          const m = ctx.measureText(text)
          const r = max2(minR, intceil(m.width / 2) + pad)

          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.closePath()
          ctx.fillStyle = bg
          ctx.fill()

          const tok = getComputedStyle(document.documentElement)
            .getPropertyValue('--_sigToneC')
            .trim()
          ctx.strokeStyle = tok || stroke
          ctx.lineWidth = 1
          ctx.stroke()

          ctx.fillStyle = textColor
          ctx.fillText(text, cx, cy + 0.5)

          ctx.restore()
          return r
        }

        function max2(a, b) {
          return a > b ? a : b
        }
        function intceil(x) {
          return Math.ceil(x)
        }

        /* =========================================================
       2-1) Donut center text plugin
    ========================================================= */
        const centerTextPlugin = {
          id: 'centerTextPlugin',
          afterDraw(chart) {
            const opts =
              (chart.options && chart.options.plugins && chart.options.plugins.centerText) || null
            if (!opts) return

            const ctx = chart.ctx
            const meta = chart.getDatasetMeta(0)
            if (!meta || !meta.data || !meta.data.length) return

            const arc = meta.data[0]
            const x = arc.x
            const y = arc.y

            const top = String(opts.top || '')
            const bottom = String(opts.bottom || '')
            const yOffset = Number(opts.yOffset || 0)

            const topFont = opts.topFont || '500 14px Barlow, system-ui, sans-serif'
            const bottomFont = opts.bottomFont || '500 14px Barlow, system-ui, sans-serif'

            ctx.save()
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            ctx.fillStyle = THEME.text || '#0f172a'
            ctx.font = topFont
            ctx.fillText(top, x, y - 8 + yOffset)

            ctx.font = bottomFont
            ctx.fillText(bottom, x, y + 12 + yOffset)

            ctx.restore()
          },
        }

        /* =========================================================
       2-2) Bar value labels
    ========================================================= */
        const barValueLabelsPlugin = {
          id: 'barValueLabelsPlugin',
          afterDatasetsDraw(chart) {
            const opts =
              (chart.options && chart.options.plugins && chart.options.plugins.barValueLabels) ||
              null
            if (!opts) return

            const ctx = chart.ctx
            const indexAxis = (chart.options && chart.options.indexAxis) || 'x'
            const fmt = opts.format || 'float2'
            const color = opts.textColor || THEME.text || '#0f172a'

            const dsIndex = opts.datasetIndex != null ? opts.datasetIndex : 0
            const meta = chart.getDatasetMeta(dsIndex)
            if (!meta || meta.hidden) return

            const data = chart.data.datasets[dsIndex].data || []
            ctx.save()

            for (let i = 0; i < meta.data.length; i++) {
              const el = meta.data[i]
              const v = data[i]
              if (v == null) continue

              let text = ''
              if (fmt === 'pct') {
                text = Math.round(Number(v)) + '%'
              } else if (fmt === 'float1') {
                text = Number(v).toFixed(1)
              } else if (fmt === 'float2') {
                text = Number(v).toFixed(2)
              } else {
                text = String(v)
              }

              if (indexAxis === 'y') {
                const x = el.x + 8
                const y = el.y - 10
                drawLabelBox(ctx, x, y, text, {
                  textColor: color,
                  bg: '#fff',
                  stroke: 'rgba(226,232,240,.95)',
                  radius: 6,
                })
              } else {
                const x = el.x
                const y = el.y - 24
                drawLabelBox(ctx, x, y, text, {
                  textColor: color,
                  bg: '#fff',
                  stroke: 'rgba(226,232,240,.95)',
                  radius: 6,
                  centerX: true,
                })
              }
            }

            ctx.restore()
          },
        }

        /* =========================================================
       2-3) Radar value labels
    ========================================================= */
        const radarValueLabelsPlugin = {
          id: 'radarValueLabelsPlugin',
          afterDatasetsDraw(chart) {
            const opts =
              (chart.options && chart.options.plugins && chart.options.plugins.radarValueLabels) ||
              null
            if (!opts) return

            const dsIndex = opts.datasetIndex != null ? opts.datasetIndex : 0
            const meta = chart.getDatasetMeta(dsIndex)
            if (!meta || meta.hidden) return

            const scale = chart.scales && chart.scales.r
            if (!scale) return

            const labels = chart.data.labels || []
            const values = chart.data.datasets[dsIndex].data || []

            const ctx = chart.ctx
            ctx.save()
            ctx.font = '500 10px Barlow, system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            const maxV = typeof scale.max === 'number' ? scale.max : 1

            const outV = maxV * Number(opts.outFactor || 1.15)
            const extraPx = Number(opts.extraPx || 10)

            for (let i = 0; i < labels.length; i++) {
              const v = Number(values[i] ?? 0)
              const txt = fmt2(v)

              const pt = scale.getPointPositionForValue(i, outV)

              const cx = scale.xCenter
              const cy = scale.yCenter
              const dx = pt.x - cx
              const dy = pt.y - cy
              const len = Math.hypot(dx, dy) || 1
              const ox = pt.x + (dx / len) * extraPx
              const oy = pt.y + (dy / len) * extraPx

              drawLabelDot(ctx, ox, oy - 2, txt, {
                font: '600 10px Barlow, system-ui, sans-serif',
                textColor: THEME.text || '#0f172a',
                bg: '#fff',
                stroke: 'rgba(226,232,240,.95)',
                minR: 12,
                pad: 6,
              })
            }

            ctx.restore()
          },
        }

        /* =========================================================
       2-4) Pulsing ring animation for Structural Position Map
    ========================================================= */

        /* Color helpers for pulse rings (supports hex/rgb/rgba) */
        function _parseColorToRgb(color) {
          if (!color) return null
          const c = String(color).trim()
          let m = c.match(/^rgba?\(([^)]+)\)$/i)
          if (m) {
            const parts = m[1].split(',').map((s) => s.trim())
            const r = parseFloat(parts[0])
            const g = parseFloat(parts[1])
            const b = parseFloat(parts[2])
            if ([r, g, b].every(Number.isFinite)) return { r, g, b }
          }
          m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
          if (m) {
            let hex = m[1]
            if (hex.length === 3) {
              hex = hex
                .split('')
                .map((ch) => ch + ch)
                .join('')
            }
            const n = parseInt(hex, 16)
            const r = (n >> 16) & 255
            const g = (n >> 8) & 255
            const b = n & 255
            return { r, g, b }
          }
          return null
        }

        function _rgba(color, alpha, fallbackRgb) {
          const a = Math.max(0, Math.min(1, Number(alpha)))
          const fb =
            fallbackRgb && String(fallbackRgb).trim() ? String(fallbackRgb).trim() : '249,123,23'
          const rgb = _parseColorToRgb(color)
          if (rgb) {
            return (
              'rgba(' +
              Math.round(rgb.r) +
              ',' +
              Math.round(rgb.g) +
              ',' +
              Math.round(rgb.b) +
              ',' +
              a.toFixed(3) +
              ')'
            )
          }
          return 'rgba(' + fb + ',' + a.toFixed(3) + ')'
        }
        const pulseCurrentPointPlugin = {
          id: 'pulseCurrentPointPlugin',
          afterDatasetsDraw(chart) {
            const opts =
              (chart.options && chart.options.plugins && chart.options.plugins.pulseCurrentPoint) ||
              null
            if (!opts) return

            const dsIndex = opts.datasetIndex != null ? opts.datasetIndex : 3
            const meta = chart.getDatasetMeta(dsIndex)
            if (!meta || meta.hidden || !meta.data || !meta.data.length) return

            const point = meta.data[0]
            if (!point) return

            const pr = point.getProps ? point.getProps(['radius', 'x', 'y'], false) : null

            const px = pr && Number.isFinite(pr.x) ? pr.x : point.x
            const py = pr && Number.isFinite(pr.y) ? pr.y : point.y
            const curRadius =
              pr && Number.isFinite(pr.radius) ? pr.radius : (point.options?.radius ?? 0)

            if (curRadius < 0.5) {
              return
            }

            const ctx = chart.ctx
            const now = performance.now()

            if (!chart.$pulse) {
              chart.$pulse = { start: now, raf: null, started: false }
            }

            const startDelayMs = Number(opts.startDelayMs || 0)

            if (!chart.$pulse.startedAt) {
              chart.$pulse.startedAt = now
              chart.$pulse.start = now
              chart.$pulse.started = false
            }

            if (!chart.$pulse.started) {
              if (now - chart.$pulse.startedAt < startDelayMs) {
                return
              }
              chart.$pulse.started = true
              chart.$pulse.start = now
            }

            const delayMs = Number(opts.delayMs ?? 0)
            const fadeInMs = Number(opts.fadeInMs ?? 450)
            const period = Number(opts.periodMs || 1200)

            const elapsed = now - chart.$pulse.start
            if (elapsed < delayMs) return

            const t2 = elapsed - delayMs
            const base = (t2 % period) / period

            const rings = Number(opts.rings ?? 4)
            const baseR = 0
            const maxR = Math.max(Number(opts.maxR || 52), curRadius + 18)

            const smoothAlpha = (p) => Math.sin(Math.PI * p)
            const smoothGrow = (p) => 1 - Math.cos((Math.PI / 2) * p)

            const globalFade = Math.max(0, Math.min(1, t2 / fadeInMs))

            for (let j = 0; j < rings; j++) {
              const phase = (base + j / rings) % 1

              const r = baseR + (maxR - baseR) * smoothGrow(phase)
              const aMax = Number(opts.maxAlpha ?? 0.22)
              const a = aMax * smoothAlpha(phase) * globalFade

              if (a < 0.003) continue

              ctx.save()
              ctx.beginPath()
              ctx.arc(px, py, r, 0, Math.PI * 2)
              ctx.strokeStyle = _rgba(opts.color || THEME.accentE || '#f59e0b', a, '249,123,23')
              ctx.lineWidth = 2
              ctx.stroke()
              ctx.restore()
            }

            if (!chart.$pulse.raf) {
              const tick = () => {
                if (chart && chart.ctx) {
                  try {
                    chart.draw()
                  } catch (_e) {}
                }
                chart.$pulse.raf = requestAnimationFrame(tick)
              }
              chart.$pulse.raf = requestAnimationFrame(tick)
            }
          },
          beforeDestroy(chart) {
            if (chart && chart.$pulse && chart.$pulse.raf) {
              cancelAnimationFrame(chart.$pulse.raf)
              chart.$pulse.raf = null
            }
          },
        }

        /* =========================================================
   plugin: stacked horizontal bar inner labels (robust)
   - 최대 구간: "Label 88%"
   - 나머지: ""
   - 글자: 14px, 흰색
   - (핵심) onComplete 누락/덮어쓰기에도 라벨이 반드시 뜨도록,
            chart.$labelsReady 또는 chart.animating === false 에서 출력
========================================================= */
        const STACKBAR_LABELS_AFTER_ANIM = {
          id: 'stackBarLabelsAfterAnim',
          afterDatasetsDraw(chart, args, pluginOptions) {
            if (!chart) return

            const isDone = chart.$labelsReady === true || chart.animating === false
            if (!isDone) return

            const ctx = chart.ctx
            const ds = chart.data && chart.data.datasets ? chart.data.datasets : []
            if (!ds.length) return

            const values = ds.map((d) => Number((d.data && d.data[0]) ?? 0))
            const maxVal = Math.max(...values)
            const maxIdx = values.indexOf(maxVal)

            const font =
              pluginOptions && pluginOptions.font
                ? pluginOptions.font
                : '700 14px Barlow, system-ui, sans-serif'
            const color = pluginOptions && pluginOptions.color ? pluginOptions.color : '#ffffff'

            ctx.save()
            ctx.font = font
            ctx.fillStyle = color
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            for (let i = 0; i < ds.length; i++) {
              const meta = chart.getDatasetMeta(i)
              const el = meta && meta.data ? meta.data[0] : null
              if (!el) continue

              const v = values[i]
              if (!Number.isFinite(v) || v <= 0) continue

              const x1 = Number(el.base)
              const x2 = Number(el.x)
              const y = Number(el.y)

              if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y)) continue

              const xCenter = (x1 + x2) / 2

              const name = ds[i].label || ''
              const text = i === maxIdx ? (name ? name + ' ' + v + '%' : v + '%') : v + '%'

              ctx.fillText(text, xCenter, y)
            }

            ctx.restore()
          },
        }

        /* =========================================================
       Register plugins
       (수정) Chart 존재할 때만 register 하도록 고정
    ========================================================= */
        if (window.Chart) {
          Chart.register(
            centerTextPlugin,
            barValueLabelsPlugin,
            radarValueLabelsPlugin,
            pulseCurrentPointPlugin,
            STACKBAR_LABELS_AFTER_ANIM,
          )
        }

        /* =========================================================
       Render: DOM binding
    ========================================================= */

        function renderReport(r) {
          renderHero(r)
          renderHeaderPills(r)
          renderExecutiveMetrics(r)
          renderSummaryPanels(r)
          renderAuthorshipPanels(r)
          renderCffPanels(r)
          renderCffTable(r)
          renderArcPanels(r)
          renderArcTable(r)
          renderMapPanels(r)
          renderStabilityPanels(r)
          renderIdentityPanels(r)
          renderAgencySignals(r)
          renderRoleFit(r)
          renderMetadata(r)
        }

        function renderHero(r) {
          const meta = r.meta || {}
          const hero = r.hero || {}

          setText('heroTitle', hero.title || '')
          setText('heroDesc', hero.description || '')

          setText('verifyUrlText', meta.verify_url || meta.verifyUrl || '')
          setText(
            'verifyIdText',
            meta.verification_id || meta.assessment_id || r.assessment_id || '',
          )

          setText(
            'heroDecisionQuote',
            hero.decision_compression_quote ||
              hero.decision_quote ||
              hero.decisionQuote ||
              'Demonstrates exploratory reasoning that converts observation into cross-domain conceptual inquiry, but prioritizes ideational expansion over evaluative convergence, indicating the need to reinforce counterfactual testing and disciplined conclusion consolidation.',
          )

          setText(
            'rslOneLine',
            r.rsl?.summary?.one_line || r.rsl?.summary_one_line || r.rsl?.one_liner || '',
          )
          setText(
            'rslSummaryText',
            r.rsl?.summary?.paragraph || r.rsl?.summary_paragraph || r.rsl?.summary_text || '',
          )

          const qr = $('qrImg')
          if (qr) {
            if (meta.qr_src) qr.src = meta.qr_src
            qr.alt = meta.qr_alt || 'QR'
          }
        }

        function setPill(id, value, toneClass) {
          const el = $(id)
          if (!el) return
          if (el.dataset && el.dataset.static === 'true') return
          el.textContent = String(value)
          el.className = 'pill ' + (toneClass || 'toneN')
        }

        function bestTrackName(trackScores) {
          if (!trackScores || typeof trackScores !== 'object') return ''
          let bestName = ''
          let bestVal = -1
          for (const [k, v] of Object.entries(trackScores)) {
            const n = Number(v)
            if (Number.isFinite(n) && n > bestVal) {
              bestVal = n
              bestName = k
            }
          }
          return bestName
        }

        function renderHeaderPills(r) {
          const chips = r.hero && r.hero.chips ? r.hero.chips : {}

          const fri = chips.fri != null ? Number(chips.fri) : Number(r?.rsl?.fri ?? 0)
          const rslLevel = chips.rsl_level || r?.rsl?.overall_level_display || ''
          const det =
            chips.determination ||
            r.ai?.final_determination_label ||
            r.cff?.final_determination_label ||
            r.ai?.final_classification ||
            ''
          const control =
            chips.control ||
            r.agency?.control_label ||
            r.agency?.control ||
            r.ai?.control_label ||
            ''
          const roleFit = chips.role_fit || bestTrackName(r.role_fit?.track_scores) || ''

          setPill('reasoningIndexPill', fmt2(Math.max(0, Math.min(5, fri))), 'toneC')
          setPill('rslPill', rslLevel || '-', 'toneB')
          setPill('finalDetPill', det || '-', 'toneE')
          setPill('controlPill', control || '-', 'toneN')
          setPill('jobFitPill', roleFit || '-', 'toneD')
        }

        function renderExecutiveMetrics(r) {
          const decision = r.ai?.final_classification || 'Unknown'
          const confIdx = getConfidenceIndex01(r)

          setText('mRslMean', fmt2(Number(r.rsl?.fri ?? 0)))
          const p01 = Number(r.rsl?.percentile_0to1 ?? 0)
          const top = Math.max(0, Math.min(100, Math.round((1 - p01) * 100)))

          const rb = riskBandFromReliability(r.ai?.detection_reliability_band)
        }

        function renderSummaryPanels(r) {
          const tags = $('topicTags')
          if (tags) {
            tags.innerHTML = ''
            ;(r.topic_tags || []).forEach((t) => {
              const s = document.createElement('span')
              s.className = 'kpi'
              s.textContent = t
              tags.appendChild(s)
            })
          }
        }

        function renderAuthorshipPanels(r) {
          const mapNote = r.reasoning_map?.note ? ' ' + r.reasoning_map.note : ''
          setText('aiInterpretation', (r.ai?.interpretation || '') + '. ' + mapNote)
          setText('aiPatternLabel', r.ai?.pattern_label || '')
          setText('aiReliability', r.ai?.detection_reliability_band || '')

          const mix = getMixFromReport(r)
          const mixKpis = $('mixKpis')
          if (mixKpis) {
            mixKpis.innerHTML = ''
            ;[
              ['human', mix.human],
              ['hybrid', mix.hybrid],
              ['ai', mix.ai],
            ].forEach(([k, v]) => {
              const span = document.createElement('span')
              span.className = 'kpi'
              span.innerHTML = k + ': <span class="code">' + formatPct01(v) + '</span>'
              mixKpis.appendChild(span)
            })
          }
        }

        function renderCffPanels(r) {
          const cff = r.cff || {}
          const fd = cff.final_determination || {}
          const op = cff.observed_patterns || {}

          const finalLabel = fd.label || ''
          const finalConf = fd.type_confidence == null ? '' : fmt2(fd.type_confidence)
          setText('cffFinalLabel', finalLabel)
          setText('cffFinalLabel2', finalLabel)
          setText('cffFinalConf', finalConf)
          setText('cffFinalConf2', finalConf)
          setText('cffFinalMeaning', fd.explanation || fd.meaning || '')

          const p1 = op.primary_pattern || op.primary || op.primary_label || ''
          const p2 = op.secondary_pattern || op.secondary || op.secondary_label || ''
          const opConf = op.type_confidence == null ? '' : fmt2(op.type_confidence)
          setText('cffPrimary', p1)
          setText('cffPrimary2', p1)
          setText('cffSecondary', p2)
          setText('cffSecondary2', p2)
          setText('cffTypeConfidence', opConf)
          setText('cffTypeConfidence2', opConf)
          setText('cffPatternMeaning', op.explanation || op.meaning || '')

          setText('signatureNote', cff.signature_fingerprint?.description || '')
        }

        function renderCffTable(r) {
          const body = $('cffTableBody')
          if (!body) return
          body.innerHTML = ''

          const names = {
            AAS: 'Argument Architecture Style',
            CTF: 'Cognitive Transition Flow',
            RMD: 'Reasoning Momentum Delta',
            RDX: 'Revision Depth Index',
            EDS: 'Evidence Diversity Score',
            IFD: 'Intent Friction Delta',
            'KPF-Sim': 'Keystroke Pattern Fingerprint Similarity',
            'TPS-H': 'Thought Pattern Similarity (History-based)',
          }

          const order = ['AAS', 'CTF', 'RMD', 'RDX', 'EDS', 'IFD', 'KPF-Sim', 'TPS-H']
          const ind = r.cff?.indicators || {}

          function getVal(code) {
            if (code === 'KPF-Sim') {
              return (
                ind['KPF-Sim'] ?? ind.KPF_SIM ?? ind.KPFSim ?? ind.kpf_sim ?? ind.kpfSim ?? null
              )
            }
            if (code === 'TPS-H') {
              return ind['TPS-H'] ?? ind.TPS_H ?? ind.TPSH ?? ind.tps_h ?? ind.tpsH ?? null
            }
            return ind[code] ?? null
          }

          function fmtScore(code, raw) {
            if (raw == null) return 'N/A'
            if (typeof raw === 'number') {
              if (code === 'TPS-H' && raw > 1) return String(Math.round(raw))
              return fmt2(raw)
            }
            return String(raw)
          }

          order.forEach((code) => {
            const raw = getVal(code)
            const isNA = raw == null

            const tr = document.createElement('tr')

            const tdCode = document.createElement('td')
            tdCode.className = 'code'
            tdCode.textContent = code

            const tdName = document.createElement('td')
            tdName.textContent = names[code] || code

            const tdScore = document.createElement('td')
            tdScore.textContent = fmtScore(code, raw)

            const tdStatus = document.createElement('td')
            tdStatus.textContent = isNA ? 'Excluded' : 'Active'

            tr.appendChild(tdCode)
            tr.appendChild(tdScore)
            tr.appendChild(tdName)
            tr.appendChild(tdStatus)
            body.appendChild(tr)
          })
        }

        function renderArcPanels(r) {
          const levelText = (
            (r.rsl?.overall_level || '?') +
            ' ' +
            (r.rsl?.overall_label || '')
          ).trim()
          const fri = Number(r.rsl?.fri ?? 0)
          const rel = Number(r.rsl?.stability_index ?? 0)
          const p01 = Number(r.rsl?.percentile_0to1 ?? 0)
          const top = Math.max(0, Math.min(100, Math.round(100 - p01 * 100)))

          setText('mRslLevel', r.rsl?.overall_level_display || levelText)
          setText('mRslLevelNote', String(r.rsl?.overall_level_note || '').trim())
          setText('mRslMean', fmt2(fri))
          setText('mRslMeanNote', String(r.rsl?.fri_note || '').trim())
          setText('mRslCohort', 'Top ' + String(top) + '%')
          setText('mRslCohortNote', String(r.rsl?.cohort_note || '').trim())
          setText('mRslStability', fmt2(rel))
          setText('mRslStabilityNote', String(r.rsl?.stability_note || '').trim())

          const arcKpis = $('arcKpis')
          if (arcKpis) {
            arcKpis.innerHTML = ''

            const k1 = document.createElement('span')
            k1.className = 'kpi kpiLabel'
            k1.innerHTML = `Level: <span class="code">${esc(r.rsl?.overall_level || '?')}</span>`

            const k2 = document.createElement('span')
            k2.className = 'kpi kpiLabel'
            k2.innerHTML = `FRI: <span class="code">${esc(fri.toFixed(2))}</span>`

            const k3 = document.createElement('span')
            k3.className = 'kpi kpiLabel'
            k3.innerHTML = `Reliability: <span class="code">${esc(fmt2(rel))}</span>`

            const k4 = document.createElement('span')
            k4.className = 'kpi kpiLabel'
            k4.innerHTML = `Cohort: <span class="code">Top ${esc(String(top))}%</span>`

            arcKpis.appendChild(k1)
            arcKpis.appendChild(k2)
            arcKpis.appendChild(k3)
            arcKpis.appendChild(k4)
          }
        }
        function renderArcTable(r) {
          const body = $('rslResultsByDimension') || $('arcTableBody')
          if (!body) return
          body.innerHTML = ''

          const rows = Array.isArray(r.rsl?.dimensions) ? r.rsl.dimensions : []
          rows.forEach((d) => {
            const tr = document.createElement('tr')
            const code = d.code ?? ''
            const name = d.name ?? ''
            const score = d.score == null ? '' : String(d.score)
            const obs = d.observation ?? d.comment ?? ''

            tr.innerHTML =
              '<td><span class="code">' +
              esc(code) +
              '</span> ' +
              esc(name) +
              '</td>' +
              '<td>' +
              esc(score) +
              '</td>' +
              '<td>' +
              esc(obs) +
              '</td>'

            body.appendChild(tr)
          })

          __np_setArcTableLayout()
        }

        function renderMapPanels(r) {
          const rm = r.reasoning_map || {}
          const mapKpis = $('mapKpis')
          if (mapKpis) {
            mapKpis.innerHTML = ''

            const sd = document.createElement('span')
            sd.className = 'kpi'
            sd.innerHTML =
              'distance_to_human_center: <span class="code">' +
              Number(rm.distance_to_human_center_sd ?? 0).toFixed(2) +
              ' SD</span>'

            const pt = document.createElement('span')
            pt.className = 'kpi'
            const cx = Number(rm.current?.x ?? 0).toFixed(2)
            const cy = Number(rm.current?.y ?? 0).toFixed(2)
            pt.innerHTML = 'current_point: <span class="code">(' + cx + ', ' + cy + ')</span>'

            mapKpis.appendChild(sd)
            mapKpis.appendChild(pt)
          }
        }

        function renderStabilityPanels(r) {
          setText(
            r.stability?.history_status === 'None'
              ? 'None'
              : fmt2(r.stability?.type_consistency ?? 0),
          )
        }

        function renderIdentityPanels(r) {}

        function renderRoleFit(r) {
          const rf = r.role_fit || {}

          setText('hrProfile1', rf.cognitive_style_summary || '')

          const hrKpis = $('hrKpis')
          if (hrKpis) {
            hrKpis.innerHTML = ''
            ;(rf.track_scores || []).forEach((t) => {
              const span = document.createElement('span')
              span.className = 'kpi'
              const pct = typeof t.pct === 'number' ? t.pct + '%' : t.pct || '-'
              span.innerHTML =
                '<span class="kpiLabel">' +
                esc(t.track || '') +
                '</span>: <span class="code">' +
                esc(pct) +
                '</span>'
              hrKpis.appendChild(span)
            })
          }

          setText('hrProfile2', rf.profile_statement || '')

          const el3 = $('hrProfile3')
          if (el3) {
            const blocks = (rf.job_role_fit || [])
              .map((grp) => {
                const label = grp.track || ''
                const roles = Array.isArray(grp.roles) ? grp.roles.join(', ') : ''
                return '<span class="kpiLabel">' + esc(label) + '</span> : ' + esc(roles)
              })
              .join('<br><br>')
            el3.innerHTML = blocks
          }

          // Role Fit Inference Flow: closing statement
          setText('rfClosing', rf.inference_flow?.closing || '')
        }

        
    
    function renderAgencySignals(r) {
      const ul = document.getElementById('agencySignalsList')
      const noteEl = document.getElementById('agencySignalsNote')
      if (!ul) return
      ul.innerHTML = ''

      const raw = r && r.agency ? r.agency.observed_structural_signals : null
      let arr = []
      if (Array.isArray(raw)) arr = raw
      else if (raw && Array.isArray(raw.bullets)) arr = raw.bullets

      if (noteEl && raw && typeof raw.note === 'string' && raw.note.trim()) {
        noteEl.textContent = raw.note.trim()
      }

      const fallback = [
        'Revision activity occurs at semantic decision boundaries.',
        'Argument order adjustments correspond to logical correction.',
        'Consistency checks appear across structural transitions.',
        'No sustained automated propagation is detected at reasoning boundaries.',
      ]
      const items = arr.length ? arr : fallback
      items.forEach((s) => {
        const li = document.createElement('li')
        li.textContent = String(s)
        ul.appendChild(li)
      })
    }


function renderMetadata(r) {
          const raw = $('rawJson')
          if (raw) raw.textContent = JSON.stringify(r, null, 2)
        }

        /* =========================================================
       Cognitive Fingerprint (canvas)
    ========================================================= */
        const SIGNATURE_KEYS = ['AAS', 'CTF', 'RMD', 'RDX', 'EDS', 'IFD']
        const SIGNATURE_OPTS = {
          resampleStepPx: 2.5,
          preChaikin: true,
          padPx: 14,
          overscan: 0.96,
          strokeRGBA: 'rgba(12,12,12,0.86)',
          strokeWidth: 1.2,
          animMs: parseInt(css.getPropertyValue('--sigAnimMs'), 10) || 1900,
          colorCycle: false,
          colorCycleMs: 2600,
        }

        function hashStr(s) {
          let h = 2166136261
          for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i)
            h = Math.imul(h, 16777619)
          }
          return h >>> 0
        }

        function mulberry32(a) {
          return function () {
            let t = (a += 0x6d2b79f5)
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
          }
        }

        function setupHiDPICanvas(canvas) {
          const dpr = window.devicePixelRatio || 1
          const rect = canvas.getBoundingClientRect()
          const w = Math.max(1, Math.floor(rect.width))
          const h = Math.max(1, Math.floor(rect.height))
          canvas.width = Math.floor(w * dpr)
          canvas.height = Math.floor(h * dpr)
          const ctx = canvas.getContext('2d')
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          return { ctx, width: w, height: h }
        }

        function bboxOfPoints(pts) {
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
          for (const p of pts) {
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
          }
          if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 1, h: 1 }
          const w = Math.max(1, maxX - minX)
          const h = Math.max(1, maxY - minY)
          return { minX, minY, maxX, maxY, w, h }
        }

        function fitRectToCanvas(bbox, canvasW, canvasH, pad, overscan) {
          const innerW = Math.max(1, canvasW - pad * 2)
          const innerH = Math.max(1, canvasH - pad * 2)
          let scale = Math.min(innerW / bbox.w, innerH / bbox.h)
          scale *= Math.max(1, Number.isFinite(overscan) ? overscan : 1)
          const tx = pad + (innerW - bbox.w * scale) / 2 - bbox.minX * scale
          const ty = pad + (innerH - bbox.h * scale) / 2 - bbox.minY * scale
          return { scale, tx, ty }
        }

        function lerp(a, b, t) {
          return a + (b - a) * t
        }

        function generateSignatureVectorFromReport(r) {
          const ind = Object.assign({}, r.cff?.indicators || {})
          const v = {}
          for (const k of SIGNATURE_KEYS) {
            v[k] = clamp01(Number(ind[k] ?? 0))
          }
          const seedStr = JSON.stringify(v, SIGNATURE_KEYS)
          const rng = mulberry32(hashStr(seedStr))
          return { v, rng }
        }

        function generateRawPolyline(v, rng) {
          const W = 1080,
            H = 1080
          const margin = 110
          const cx = W / 2,
            cy = H / 2

          const pseudoHI = clamp01(v.CTF * 0.45 + v.RMD * 0.35 + v.RDX * 0.2)

          const bandW = lerp(560, 880, 1 - v.IFD)
          const bandH = lerp(170, 380, v.IFD)
          const bandX1 = cx - bandW / 2,
            bandX2 = cx + bandW / 2
          const bandY1 = cy - bandH / 2,
            bandY2 = cy + bandH / 2

          const steps = Math.floor(lerp(2400, 9000, v.RDX))
          const baseStep = lerp(0.95, 2.75, v.CTF)
          const turnGain = lerp(0.006, 0.08, v.AAS)
          const loopP = lerp(0.01, 0.12, v.RMD)
          const cohesion = lerp(0.12, 0.74, pseudoHI)
          const switchP = lerp(0.001, 0.011, v.EDS)
          const jitter = lerp(0.05, 1.3, pseudoHI)

          function softClamp(nx, ny) {
            if (nx < bandX1) nx = lerp(nx, bandX1, 0.55)
            if (nx > bandX2) nx = lerp(nx, bandX2, 0.55)
            if (ny < bandY1) ny = lerp(ny, bandY1, 0.55)
            if (ny > bandY2) ny = lerp(ny, bandY2, 0.55)
            nx = Math.max(margin, Math.min(W - margin, nx))
            ny = Math.max(margin, Math.min(H - margin, ny))
            return [nx, ny]
          }

          const baselineAngle = lerp(-0.2, 0.12, rng())
          const baselineLen = bandW * 0.84
          const bx1 = cx - (Math.cos(baselineAngle) * baselineLen) / 2
          const by1 = cy - (Math.sin(baselineAngle) * baselineLen) / 2
          const bx2 = cx + (Math.cos(baselineAngle) * baselineLen) / 2
          const by2 = cy + (Math.sin(baselineAngle) * baselineLen) / 2

          const coresN = 3 + Math.floor(rng() * 3)
          const cores = []
          for (let i = 0; i < coresN; i++) {
            const t = coresN === 1 ? 0 : i / (coresN - 1)
            const px = bx1 + (bx2 - bx1) * t
            const py = by1 + (by2 - by1) * t
            const n = Math.hypot(bx2 - bx1, by2 - by1) || 1
            const nx = -(by2 - by1) / n
            const ny = (bx2 - bx1) / n
            const off = (rng() - 0.5) * bandH * 0.62
            cores.push({
              x: px + nx * off,
              y: py + ny * off,
              pull: lerp(0.05, 0.4, rng()) * cohesion,
            })
          }

          let x = lerp(bandX1, bandX1 + bandW * 0.12, rng())
          let y = lerp(bandY1, bandY2, rng())
          let ang = lerp(-0.16, 0.16, rng())
          let mode = 0

          const history = []
          const historyCap = 80 + Math.floor(v.RMD * 260)
          const pts = [{ x, y }]

          for (let i = 0; i < steps; i++) {
            if (rng() < switchP) mode = (mode + 1 + Math.floor(rng() * 2)) % 3

            let target = cores[Math.floor(rng() * cores.length)]
            if (history.length > 18 && rng() < loopP) {
              const h = history[Math.floor(rng() * history.length)]
              target = { x: h.x, y: h.y, pull: lerp(0.06, 0.48, rng()) * cohesion }
            }

            const dx = target.x - x,
              dy = target.y - y
            const dist = Math.hypot(dx, dy) || 1
            const tx = (dx / dist) * target.pull
            const ty = (dy / dist) * target.pull

            const pullAngle = Math.atan2(ty, tx)
            const delta = Math.atan2(Math.sin(pullAngle - ang), Math.cos(pullAngle - ang))

            const drift = (rng() - 0.5) * (0.02 + 0.028 * v.CTF)
            const modeGain = mode === 0 ? 0.85 : mode === 1 ? 1.25 : 1.05

            const flick =
              mode === 1 && rng() < 0.018 ? (rng() < 0.5 ? -1 : 1) * (0.28 + rng() * 0.75) : 0

            ang += drift + delta * turnGain * modeGain + flick

            const breathe = 0.8 + 0.45 * Math.sin(i * 0.01 + rng() * 0.6)
            let stepLen = baseStep * breathe * (0.9 + rng() * 0.28)

            if (mode === 2) {
              stepLen *= 0.92
              ang += (rng() - 0.5) * 0.1
            }

            let nx2 = x + Math.cos(ang) * stepLen + (rng() - 0.5) * 2 * jitter
            let ny2 = y + Math.sin(ang) * stepLen + (rng() - 0.5) * 2 * jitter
            ;[nx2, ny2] = softClamp(nx2, ny2)
            x = nx2
            y = ny2
            pts.push({ x, y })

            if (i % 48 === 0) {
              history.push({ x, y })
              if (history.length > historyCap) history.shift()
            }
          }

          return pts
        }

        function resamplePolyline(pts, step) {
          if (pts.length < 2) return pts.slice()
          const out = [pts[0]]
          let acc = 0
          for (let i = 1; i < pts.length; i++) {
            let p0 = pts[i - 1]
            let p1 = pts[i]
            let dx = p1.x - p0.x,
              dy = p1.y - p0.y
            let seg = Math.hypot(dx, dy)
            if (seg === 0) continue

            while (acc + seg >= step) {
              const t = (step - acc) / seg
              const nx = p0.x + dx * t
              const ny = p0.y + dy * t
              out.push({ x: nx, y: ny })
              p0 = { x: nx, y: ny }
              dx = p1.x - p0.x
              dy = p1.y - p0.y
              seg = Math.hypot(dx, dy) || 1
              acc = 0
            }
            acc += seg
          }
          out.push(pts[pts.length - 1])
          return out
        }

        function chaikinOnce(pts) {
          if (pts.length < 3) return pts.slice()
          const fixed = []
          fixed.push(pts[0])
          for (let i = 0; i < pts.length - 1; i++) {
            const p = pts[i],
              q = pts[i + 1]
            fixed.push(
              { x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y },
              { x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y },
            )
          }
          fixed.push(pts[pts.length - 1])
          return fixed
        }

        let sigAnimRAF = null
        let sigHasAnimatedOnce = false
        function drawSignatureFingerprintStatic(r) {
          const canvas = $('signatureCanvas')
          if (!canvas) return
          const rect = canvas.getBoundingClientRect()
          if (rect.width < 4 || rect.height < 4) return
          const out = setupHiDPICanvas(canvas)
          const ctx = out.ctx
          const width = out.width
          const height = out.height
          ctx.clearRect(0, 0, width, height)
          ctx.save()
          // draw full path immediately (no animation)
          renderSignaturePath(ctx, width, height, r, 1)
          ctx.restore()
        }

        function drawSignatureFingerprintAnimated(r) {
                    if (sigHasAnimatedOnce) return
          sigHasAnimatedOnce = true
const canvas = $('signatureCanvas')
          if (!canvas) return

          const rect = canvas.getBoundingClientRect()
          if (rect.width < 4 || rect.height < 4) return

          const out = setupHiDPICanvas(canvas)
          const ctx = out.ctx
          const width = out.width
          const height = out.height

          ctx.clearRect(0, 0, width, height)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)

          const gen = generateSignatureVectorFromReport(r)
          const v = gen.v
          const rng = gen.rng
          const raw = generateRawPolyline(v, rng)

          let pts = resamplePolyline(raw, Number(SIGNATURE_OPTS.resampleStepPx))
          if (SIGNATURE_OPTS.preChaikin) pts = chaikinOnce(pts)

          const bb = bboxOfPoints(pts)
          const padRatio = 0.028
          const basePad = Number(SIGNATURE_OPTS.padPx)
          const PAD = Math.max(basePad, Math.floor(Math.min(width, height) * padRatio))
          const fit = fitRectToCanvas(bb, width, height, PAD, Number(SIGNATURE_OPTS.overscan))

          const mapped = pts.map((p) => ({
            x: Math.max(1, Math.min(width - 1, p.x * fit.scale + fit.tx)),
            y: Math.max(1, Math.min(height - 1, p.y * fit.scale + fit.ty)),
          }))
          ctx.lineWidth = Number(SIGNATURE_OPTS.strokeWidth)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          const start = performance.now()
          const dur = Math.max(240, Number(SIGNATURE_OPTS.animMs) || 1200)

          if (sigAnimRAF) cancelAnimationFrame(sigAnimRAF)

          function frame(now) {
            const t = Math.min(1, (now - start) / dur)
            const count = Math.max(2, Math.floor(mapped.length * t))

            ctx.clearRect(0, 0, width, height)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, width, height)

            ctx.globalAlpha = 1
            const ORANGE =
              getComputedStyle(document.documentElement).getPropertyValue('--accentE').trim() ||
              getComputedStyle(document.documentElement).getPropertyValue('--accentD').trim() ||
              '#f97b17'
            const YELLOW = '#ffd34a'

            // Fuse-style burn rendering (identity-safe):
            // - The path/seed/timing are unchanged.
            // - We only change stroke styling to look like a burning fuse.

            const FUSE_BASE = '#3b2f2a'   // unburnt fuse rope
            const FUSE_BURNT = '#1f1b17'  // charred trail
            const GLOW_A = '#ffb33b'      // ember core
            const GLOW_B = '#ff6a1a'      // ember edge

            // draw ONLY a short "unburnt" fuse segment right ahead of the burn head
            // (so the fuse does not look fully pre-drawn on frame 1)
            const lookAhead = Math.max(10, Math.floor(mapped.length * 0.03))
            const startAhead = Math.max(0, count - 1)
            const endAhead = Math.min(mapped.length, count + lookAhead)

            const baseW = Number(SIGNATURE_OPTS.strokeWidth) || 1.2

            ctx.lineWidth = Math.max(0.9, baseW * 1.05)
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            ctx.globalAlpha = 0.88
            ctx.strokeStyle = FUSE_BASE
            ctx.beginPath()
            ctx.moveTo(mapped[startAhead].x, mapped[startAhead].y)
            for (let i = startAhead + 1; i < endAhead; i++) ctx.lineTo(mapped[i].x, mapped[i].y)
            ctx.stroke()

            // draw burnt segment (from start to current burn head)
            ctx.globalAlpha = 1
            ctx.strokeStyle = FUSE_BURNT
            ctx.lineWidth = Math.max(0.8, baseW * 0.92)
            ctx.beginPath()
            ctx.moveTo(mapped[0].x, mapped[0].y)
            for (let i = 1; i < count; i++) ctx.lineTo(mapped[i].x, mapped[i].y)
            ctx.stroke()

            // burn head position
            const tip = mapped[Math.max(0, count - 1)]
            const tipX = tip.x
            const tipY = tip.y

            // "ember" at the burn head (tip)
            if (t < 1) {
                          // "ember" at the burn head (tip)
                          const emberR = 4.0
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            const grd = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, emberR * 6)
            grd.addColorStop(0, GLOW_A)
            grd.addColorStop(0.35, GLOW_B)
            grd.addColorStop(1, 'rgba(255,106,26,0)')
            ctx.fillStyle = grd
            ctx.beginPath()
            ctx.arc(tipX, tipY, emberR * 6, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            }

            // Sparkler effect at the drawing tip (Pen Tip)
            // IMPLEMENTATION NOTE (v35 identity-safe):
            // - This does NOT touch path generation, seed, timing, or coordinate accumulation.
            // - It only uses the *current tip* position already produced by the v35 draw loop.
            //
            // Visual goal:
            // - Not a soft circle, but a short, bright streak that flashes 1–2 frames
            // - Additive only at the flash moment (no lingering glow)
            // - Few sparks (4–7) in warm palette
            // - Exists ONLY while drawing, then fully disappears

            if (!frame.__sparks) {
              frame.__sparks = []
              frame.__sparkTick = 0
              // deterministic-ish RNG anchored to the signature vector (doesn't affect the line)
              frame.__sparkRng = mulberry32(hashStr('spark:' + JSON.stringify(v, SIGNATURE_KEYS)))
            }

            const sparks = frame.__sparks
            if (t >= 1) sparks.length = 0
            const rand = frame.__sparkRng

            // Spawn a tiny radial burst EVERY frame while drawing.
            // Keeping it sparse ensures it reads as a pen-tip tool, not decoration.
            if (t < 1) {
              frame.__sparkTick++
              const burstN = 2 + Math.floor(rand() * 5) // 2..6 (2x density)
              for (let k = 0; k < burstN; k++) {
                const ang = rand() * Math.PI * 2
                const spd = 2.2 + rand() * 3.2
                const vx = Math.cos(ang) * spd
                const vy = Math.sin(ang) * spd

                // life is intentionally very short; flash is handled below
                const life = 220 + rand() * 180 // 220..400ms (shorter, calmer)

                // Varied travel lengths (some short, some long) so sparks don't read as identical dots.
                // NOTE: this does NOT touch the signature path/seed logic; it only affects spark rendering.
                const baseLen = 7
                let len = baseLen * (0.70 + rand() * 1.60) // base streak length

                // (REQUEST 1) long-flyer ratio: 22% -> 50%
                // Half of particles become long flyers so "dot" perception drops sharply.
                const isLong = rand() < 0.50
                if (isLong) len *= 1.05 + rand() * 0.25

                // (REQUEST 2) per-particle thickness: all different
                // - short sparks: relatively thicker
                // - long sparks: relatively thinner
                // - even within the same type, add micro variation to avoid repeating patterns
                const wShort = 0.70 + rand() * 0.55 // ~0.70..1.25
                const wLong = 0.30 + rand() * 0.30  // ~0.30..0.60
                const wJit = 0.90 + rand() * 0.22   // +/- ~11%
                const w = (isLong ? wLong : wShort) * wJit

                // per-particle subtle length jitter so it's not uniform over its lifetime
                const lenJ = 0.85 + rand() * 0.30

                // hard cap so long streaks never feel \"too long\" (max ~50% of previous visual)
                len = Math.min(len, 12.5)

                const pick = rand()
                const palette = [
                  '#3b82f6', // blue
                  '#60a5fa', // light blue
                  '#22d3ee', // cyan
                  '#ffd34a', // yellow
                  '#ff7a1a', // orange
                  '#ff2a2a', // red
                  '#b90d11', // deep red
                  '#c026d3', // purple
                  '#ff4fd8', // magenta
                ]

                // two-tone spark colors (head/tail) for richer multi-color feel
                const col = palette[Math.floor(rand() * palette.length)]
                const col2 = palette[Math.floor(rand() * palette.length)]

                // minimal jitter so it never becomes a perfect ring
                const jx = (rand() - 0.5) * 0.8
                const jy = (rand() - 0.5) * 0.8

                sparks.push({
                  x: tipX + jx,
                  y: tipY + jy,
                  px: tipX + jx,
                  py: tipY + jy,
                  vx,
                  vy,
                  born: now,
                  life,
                  w,
                  len,
                  lenJ,
                  col,
                  col2,
                })
              }
            }

            // Central tip flash (1-frame)
            // - reinforces the perception: spark passes, line remains
            if (t < 1) {
              ctx.save()
              ctx.globalCompositeOperation = 'lighter'
              ctx.globalAlpha = 0.92
              // deterministic color pick per frame
              const fp = rand()
              const fcol = fp < 0.20 ? '#ffd34a' : fp < 0.40 ? '#ff7a1a' : fp < 0.60 ? '#ff2a2a' : fp < 0.80 ? '#3b82f6' : '#22d3ee'
              ctx.strokeStyle = fcol
              ctx.lineCap = 'round'
              ctx.lineWidth = 1.25
              // tiny star-like burst: 4 short rays
              const rr = 7
              ctx.beginPath()
              ctx.moveTo(tipX - rr, tipY)
              ctx.lineTo(tipX + rr, tipY)
              ctx.moveTo(tipX, tipY - rr)
              ctx.lineTo(tipX, tipY + rr)
              ctx.stroke()
              ctx.restore()
            }

// Update + draw sparks
            // Key difference vs the failed "yellow circles":
            // - We draw streak segments (short line segments)
            // - We use additive blending ONLY in the first 1–2 frames of each particle
            // - No persistent shadow blur or large gradients
            ctx.save()
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            for (let i = sparks.length - 1; i >= 0; i--) {
              const p = sparks[i]
              const age = now - p.born
              if (age >= p.life) {
                sparks.splice(i, 1)
                continue
              }

              const u = age / p.life

              // motion (spark flies outward, then fades)
              // store previous position to draw a true travel streak (not a static line)
              p.px = p.x
              p.py = p.y

              const drag = 0.90
              p.vx *= drag
              p.vy = p.vy * drag + 0.004
              p.x += p.vx
              p.y += p.vy

              // flash window: first ~1–2 frames at 60Hz
              const flash = age < 42

              // blend mode: additive ONLY during flash
              ctx.globalCompositeOperation = flash ? 'lighter' : 'source-over'

              // alpha drops extremely fast; after flash it's faint and dying
              const a = flash ? 0.88 : Math.max(0, Math.pow(1 - u, 0.85) * 0.46)
              if (a <= 0.01) continue
              ctx.globalAlpha = a              // draw TRAVEL streak (spark whooshes from tip outward)
              // 1) a short motion streak from previous -> current position
              const dxm = p.x - p.px
              const dym = p.y - p.py
              const mmag = (dxm * dxm + dym * dym) ** 0.5 || 1

              // Build a visible travel streak even when per-frame movement is tiny.
              // If dx/dy is too small (appears as a dot), fall back to velocity direction.
              let dirx = dxm
              let diry = dym
              if (mmag < 0.35) {
                dirx = p.vx
                diry = p.vy
              }
              const dmag = Math.hypot(dirx, diry) || 1
              const ux = dirx / dmag
              const uy = diry / dmag

              // Use particle-specific streak length (with slight jitter) so some sparks fly longer.
              const tailLen = p.len * (p.lenJ || 1)
              const x1t = p.x - ux * tailLen
              const y1t = p.y - uy * tailLen

              // multi-color travel streak using a small linear gradient (more color separation)
              const g = ctx.createLinearGradient(x1t, y1t, p.x, p.y)
              g.addColorStop(0, 'rgba(0,0,0,0)')
              g.addColorStop(0.15, p.col2)
              g.addColorStop(0.65, p.col)
              g.addColorStop(1, p.col)
              ctx.strokeStyle = g
              ctx.lineWidth = flash ? p.w * 1.00 : p.w * 0.88
              ctx.beginPath()
              ctx.moveTo(x1t, y1t)
              ctx.lineTo(p.x, p.y)
              ctx.stroke()

              // 2) a tiny bright head flash for 1–2 frames, makes motion obvious on white background
              if (flash) {
                ctx.fillStyle = p.col
                ctx.globalAlpha = Math.min(1, a + 0.10)
                ctx.beginPath()
                ctx.arc(p.x, p.y, 1.15 + p.w * 0.45, 0, Math.PI * 2)
                ctx.fill()
              }
            }
            ctx.restore()

            // Stop cleanly at the end (no lingering ember or sparks on the last frame).
            if (t < 1) {
              sigAnimRAF = requestAnimationFrame(frame)
            }
          }
          sigAnimRAF = requestAnimationFrame(frame)
        }

        /* =========================================================
       Charts setup
    ========================================================= */
        const chartsById = Object.create(null)
        const chartAnimators = Object.create(null)
        const chartAnimatedOnce = Object.create(null)

        const chartIO =
          'IntersectionObserver' in window
            ? new IntersectionObserver(onChartEnter, {
                root: null,
                threshold: 0.18,
                rootMargin: '120px 0px',
              })
            : null
        // Charts

        function safeChart(id, config) {
          const el = $(id)
          if (!el || !window.Chart) return null
          if (chartsById[id]) {
            try {
              chartsById[id].destroy()
            } catch (_e) {}
            delete chartsById[id]
          }
          const c = new Chart(el, config)
          chartsById[id] = c
          return c
        }

        function baseChartOptions(animate) {
          return {
            responsive: true,
            maintainAspectRatio: false,
            animation: animate ? { duration: CHART_ANIM_MS } : { duration: 0 },
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 },
              },
              tooltip: { enabled: true },
            },
          }
        }

        function doughnutOptions(animate) {
          const base = baseChartOptions(animate)
          return {
            ...base,
            rotation: -90,
            circumference: 360,
            animation: animate
              ? { duration: CHART_ANIM_MS, delay: 0, animateRotate: true, animateScale: false }
              : { duration: 0 },
            plugins: { ...base.plugins, legend: { ...base.plugins.legend, position: 'bottom' } },
          }
        }

        const BAR_FIXED_VERTICAL = {
          barThickness: 14,
          maxBarThickness: 14,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
          borderWidth: 0,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
        }

        const BAR_FIXED_HORIZONTAL = {
          barThickness: 14,
          maxBarThickness: 14,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
          borderWidth: 0,
          borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 },
          borderSkipped: false,
        }

        const DONUT_FIXED = {
          cutout: '62%',
          radius: '92%',
          borderWidth: 0,
          hoverOffset: 0,
        }

        function mountChartDeferred(id, makeBaseConfig, animateNow) {
          if (window.NP_DISABLE_INTERNAL_CHARTS) {
            return
          }

          const el = $(id)
          if (!el) return

          safeChart(id, makeBaseConfig(false))

          if (chartIO) {
            chartAnimators[id] = animateNow
            chartIO.observe(el)
          } else {
            setTimeout(
              () => animateNow(),
              (IS_MOBILE ? MOBILE_CHART_START_DELAY : 0) + CHART_DELAY_MS,
            )
          }
        }

        function onChartEnter(entries) {
          entries.forEach((ent) => {
            if (!ent.isIntersecting) return
            const canvas = ent.target
            const id = canvas && canvas.id
            if (!id) return
            if (chartAnimatedOnce[id]) return

            chartAnimatedOnce[id] = true
            chartIO.unobserve(canvas)

            const fn = chartAnimators[id]
            if (typeof fn === 'function') {
              setTimeout(() => fn(), (IS_MOBILE ? MOBILE_CHART_START_DELAY : 0) + CHART_DELAY_MS)
            }
          })
        }

        function animateChartData(id, applyRealData) {
          const c = chartsById[id]
          if (!c) return
          applyRealData(c)
          c.options.animation = { duration: CHART_ANIM_MS, delay: 0 }
          c.update()
        }

        const RADAR_VALUE_IN_POINT_LABEL = false

        function registerAllCharts(r) {
          const mix = getMixFromReport(r)
          const conf = getConfidenceIndex01(r)

          const relMapped =
            r.ai?.detection_reliability_band === 'HIGH'
              ? 0.9
              : r.ai?.detection_reliability_band === 'MEDIUM'
                ? 0.6
                : 0.35

          const decision = r.ai?.final_classification || r.ai?.determination || 'Human'

          const arcDims = Array.isArray(r.rsl?.dimensions) ? r.rsl.dimensions : []
          const arcLabels = arcDims.map((d) => String(d.code || '').trim()).filter(Boolean)
          const arcVals = arcDims.map((d) => Number(d.score ?? 0))

          const cffOrder = ['AAS', 'CTF', 'RMD', 'RDX', 'EDS', 'IFD']
          const cffInd = r.cff?.indicators || {}

          const DONUT_SPIN_ANIM = {
            circumference: { duration: CHART_ANIM_MS, from: 0 },
            rotation: { duration: CHART_ANIM_MS, from: -450 },
          }

          /* =========================================================
         chartMixAgency -> Reasoning Control Distribution
         NOTE: center label should show HUMAN SHARE (not confidence).
      ========================================================= */

          mountChartDeferred(
            'chartMixAgency',
            (animate) => ({
              type: 'doughnut',
              data: {
                labels: ['Human', 'Hybrid', 'AI'],
                datasets: [
                  {
                    data: [0, 0, 0],
                    ...DONUT_FIXED,
                    backgroundColor: [THEME.accentA, THEME.accentC, THEME.accentD],
                  },
                ],
              },
              options: {
                ...doughnutOptions(animate),
                plugins: {
                  ...doughnutOptions(animate).plugins,
                  // Top: determination label (e.g., Human)
                  // Bottom: Human share from mix_ratio/distribution (e.g., 82%)
                  centerText: { top: decision, bottom: (pctTripletFromMix(mix)[0] + '%') },
                },
              },
            }),
            () =>
              animateChartData('chartMixAgency', (c) => {
                const mix = getMixFromReport(r)
                const decision = String(r.ai?.final_classification ?? r.ai?.determination ?? 'Human')
                c.data.datasets[0].data = pctTripletFromMix(mix)
                // Keep center label aligned to the chart's Human portion.
                c.options.plugins.centerText = { top: decision, bottom: (pctTripletFromMix(mix)[0] + '%') }
              }),
          )

          /* =========================================================
         2-2) Structural Control Signals (Agency Indicators)
         - Keeps the page resilient: prevents ReferenceError when rendering charts.
      ========================================================= */
          const contribKeys = [
            'structural_variance',
            'human_rhythm_index',
            'transition_flow',
            'revision_depth',
          ]
          const contribLabels = [
            'Structural variance',
            'Human rhythm index',
            'Transition flow integrity',
            'Revision depth signal',
          ]
          const contribSrc = r && r.ai && r.ai.signal_contributions ? r.ai.signal_contributions : {}
          const contribVals = contribKeys.map((k) => clamp01(Number(contribSrc[k] ?? 0)))

          mountChartDeferred(
            'chartAuthSignals',
            (animate) => ({
              type: 'bar',
              data: {
                labels: contribLabels,
                datasets: [
                  {
                    label: 'contribution (0 to 1)',
                    data: contribLabels.map(() => 0),
                    ...BAR_FIXED_HORIZONTAL,
                    backgroundColor: THEME.accentB,
                  },
                ],
              },
              options: {
                ...baseChartOptions(animate),
                indexAxis: 'y',
                animation: animate
                  ? {
                      duration: CHART_ANIM_MS,
                      delay: (ctx) => (ctx.type === 'data' ? 140 + ctx.dataIndex * 90 : 0),
                    }
                  : { duration: 0 },
                plugins: {
                  ...baseChartOptions(animate).plugins,
                  barValueLabels: { format: 'float2', textColor: THEME.text || '#0f172a' },
                },
                scales: {
                  x: { min: 0, max: 0.4, grid: { color: 'rgba(148,163,184,.22)' } },
                  y: {
                    grid: { display: false },
                  },
                },
              },
            }),
            () =>
              animateChartData('chartAuthSignals', (c) => {
                c.data.datasets[0].data = contribVals.slice()
              }),
          )

          mountChartDeferred(
            'chartCffRadar',
            (animate) => ({
              type: 'radar',
              data: {
                labels: cffOrder,
                datasets: [
                  {
                    label: 'CFF Indicator',
                    data: cffOrder.map(() => 0),
                    fill: true,
                    backgroundColor: _rgba(THEME.accentC, 0.14, '32,203,194'),
                    borderColor: THEME.accentC,
                    pointBackgroundColor: THEME.accentC,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 3,
                    pointBorderWidth: 0,
                  },
                ],
              },
              options: {
                ...baseChartOptions(animate),
                plugins: {
                  ...baseChartOptions(animate).plugins,
                  legend: { ...baseChartOptions(animate).plugins.legend, position: 'bottom' },
                  radarValueLabels: false,
                },
                scales: {
                  r: {
                    min: 0,
                    max: 1,
                    ticks: { display: false, backdropColor: 'transparent' },
                    pointLabels: {
                      padding: 8,
                      font: { size: 10, weight: '500' },
                      color: THEME.text || '#0f172a',
                    },
                    grid: { color: 'rgba(148,163,184,.22)' },
                    angleLines: { color: 'rgba(148,163,184,.22)' },
                  },
                },
              },
            }),
            () =>
              animateChartData('chartCffRadar', (c) => {
                const vals = cffOrder.map((k) => Number(cffInd[k] ?? 0))
                c.data.datasets[0].data = vals.slice()
                c.data.labels = cffOrder.slice()
                c.options.plugins.radarValueLabels = false
              }),
          )

          mountChartDeferred(
            'chartRslBars',
            (animate) => ({
              type: 'line',
              data: {
                datasets: (() => {
                  const curvePts =
                    r?.rsl?.charts?.cohort_positioning?.curve_points &&
                    Array.isArray(r.rsl.charts.cohort_positioning.curve_points)
                      ? r.rsl.charts.cohort_positioning.curve_points
                      : [
                          { x: 0.0, y: 2 },
                          { x: 0.5, y: 6 },
                          { x: 1.0, y: 14 },
                          { x: 1.5, y: 26 },
                          { x: 2.0, y: 30 },
                          { x: 2.5, y: 45 },
                          { x: 3.0, y: 58 },
                          { x: 3.5, y: 42 },
                          { x: 4.0, y: 22 },
                          { x: 4.5, y: 10 },
                          { x: 5.0, y: 4 },
                        ]

                  const fri = Math.max(0, Math.min(5, Number(r?.rsl?.fri ?? 0)))

                  const yAtX = (x) => {
                    if (!curvePts.length) return 0
                    if (x <= curvePts[0].x) return Number(curvePts[0].y ?? 0)
                    for (let i = 1; i < curvePts.length; i++) {
                      const a = curvePts[i - 1],
                        b = curvePts[i]
                      if (x <= b.x) {
                        const t = (x - a.x) / (b.x - a.x || 1)
                        return a.y + (b.y - a.y) * t
                      }
                    }
                    return Number(curvePts[curvePts.length - 1].y ?? 0)
                  }

                  const curPt = { x: fri, y: yAtX(fri) }

                  const baseCurve = animate ? curvePts : curvePts.map((p) => ({ x: p.x, y: 0 }))

                  return [
                    {
                      label: 'Cohort distribution',
                      data: baseCurve,
                      parsing: false,
                      borderColor: THEME.accentD || 'rgba(250,187,5,0.95)',
                      backgroundColor: _rgba(THEME.accentD || '#fabb05', 0.1, '250,187,5'),
                      fill: true,
                      tension: 0.45,
                      borderWidth: 2,
                      pointRadius: 0,
                      pointHoverRadius: 0,
                    },

                    {
                      label: 'Current',
                      data: [curPt],
                      parsing: false,
                      showLine: false,
                      pointRadius: 0 /* revealed after delay */,
                      pointHoverRadius: 6,
                      pointBackgroundColor: THEME.accentD || '#fabb05',
                      pointBorderColor: '#fabb05',
                      pointBorderWidth: 0,
                    },
                  ]
                })(),
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
                animation: animate ? { duration: CHART_ANIM_MS, delay: 0 } : { duration: 0 },
                layout: { padding: { top: 10, right: 14, bottom: 12, left: 14 } },

                interaction: { mode: 'nearest', intersect: true },

                scales: {
                  x: {
                    type: 'linear',
                    min: 0,
                    max: 5,
                    grid: { color: 'rgba(226,232,240,0.55)' },
                    ticks: {
                      stepSize: 1,
                      color: THEME.text || '#0f172a',
                    },
                  },
                  y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(226,232,240,0.55)' },
                    ticks: {
                      stepSize: 20,
                      callback: (v) => `${v}%`,
                      color: THEME.text || '#0f172a',
                    },
                  },
                },
                elements: {
                  line: { borderJoinStyle: 'round' },
                },
                plugins: {
                  ...baseChartOptions(animate).plugins,

                  pulseCurrentPoint: {
                    datasetIndex: 1,
                    rings: 4,
                    maxR: 52,
                    periodMs: 2500,
                    startDelayMs: 0,
                    fadeInMs: 420,
                    maxAlpha: 0.26,
                    lineWidth: 2,
                  },
                  legend: {
                    display: true,
                    position: 'bottom',
                    align: 'center',
                    labels: {
                      filter: (item) => item.datasetIndex === 1,
                      usePointStyle: true,
                      pointStyle: 'circle',
                      boxWidth: 8,
                      boxHeight: 8,
                      padding: 10,
                      font: { size: 11, weight: '500' },
                      color: THEME.muted || '#0F172A',
                    },
                  },
                  tooltip: {
                    enabled: true,
                    displayColors: false,
                    filter: (ctx) => ctx.datasetIndex === 1,
                    callbacks: {
                      title: () => '',
                      label: (ctx) => {
                        const x = Number(ctx.parsed?.x ?? 0)
                        const p = Number(r?.rsl?.percentile ?? r?.rsl?.percentile_0to1 ?? 0)
                        const top = Math.max(0, Math.min(100, Math.round((1 - p) * 100)))
                        const topTxt = `Top ${top}%`
                        return [`● Current · ${topTxt}`, `FRI · ${x.toFixed(2)} / 5`]
                      },
                    },
                  },
                },
              },
            }),
            () => {
              animateChartData('chartRslBars', (c) => {
                if (!c) return

                const curvePts =
                  r?.rsl?.charts?.cohort_positioning?.curve_points &&
                  Array.isArray(r.rsl.charts.cohort_positioning.curve_points)
                    ? r.rsl.charts.cohort_positioning.curve_points
                    : c.data?.datasets?.[0]?.data || []

                const fri = Math.max(0, Math.min(5, Number(r?.rsl?.fri ?? 0)))

                const yAtX = (x) => {
                  if (!curvePts.length) return 0
                  if (x <= curvePts[0].x) return Number(curvePts[0].y ?? 0)
                  for (let i = 1; i < curvePts.length; i++) {
                    const a = curvePts[i - 1],
                      b = curvePts[i]
                    if (x <= b.x) {
                      const t = (x - a.x) / (b.x - a.x || 1)
                      return a.y + (b.y - a.y) * t
                    }
                  }
                  return Number(curvePts[curvePts.length - 1].y ?? 0)
                }

                const curPt = { x: fri, y: yAtX(fri) }

                if (c.data?.datasets?.[0]) c.data.datasets[0].data = curvePts
                if (c.data?.datasets?.[1]) {
                  c.data.datasets[1].data = [curPt]
                  c.data.datasets[1].pointRadius = 6
                }

                try {
                  if (c && c.data && c.data.datasets && c.data.datasets[1]) {
                    c.data.datasets[1].pointRadius = 0
                    c.$currentRevealTimer && clearTimeout(c.$currentRevealTimer)
                    c.$currentRevealTimer = setTimeout(() => {
                      try {
                        c.data.datasets[1].pointRadius = 6
                        c.update()
                      } catch (_e) {}
                    }, 1000)
                  }
                } catch (_e) {}
              })
            },
          )

          mountChartDeferred(
            'chartRslRadar',
            (animate) => ({
              type: 'radar',
              data: {
                labels: arcLabels,
                datasets: [
                  {
                    label: 'RSL profile',
                    data: arcLabels.map(() => 0),
                    fill: true,
                    backgroundColor: THEME.pillB,
                    borderColor: THEME.accentB,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 3,
                    pointBackgroundColor: THEME.accentB,
                    pointBorderWidth: 0,
                  },
                ],
              },
              options: {
                ...baseChartOptions(animate),
                plugins: {
                  ...baseChartOptions(animate).plugins,
                  legend: { ...baseChartOptions(animate).plugins.legend, position: 'bottom' },
                  radarValueLabels: false,
                },
                scales: {
                  r: {
                    min: 0,
                    max: 6,
                    ticks: { display: false, backdropColor: 'transparent' },
                    pointLabels: {
                      padding: 8,
                      font: { size: 10, weight: '500' },
                      color: THEME.text || '#0f172a',
                    },
                    grid: { color: 'rgba(148,163,184,.22)' },
                    angleLines: { color: 'rgba(148,163,184,.22)' },
                  },
                },
              },
            }),
            () =>
              animateChartData('chartRslRadar', (c) => {
                c.data.datasets[0].data = arcVals.slice()
                c.options.plugins.radarValueLabels = false
              }),
          )
          const tracks = Array.isArray(r.role_fit?.track_scores) ? r.role_fit.track_scores : []
          const roles = tracks.map((t) => String(t.track || ''))
          const roleVals = tracks.map((t) =>
            clamp01((typeof t.pct === 'number' ? t.pct : Number(t.pct || 0)) / 100),
          )
          mountChartDeferred(
            'chartHrFit',
            (animate) => ({
              type: 'bar',
              data: {
                labels: roles,
                datasets: [
                  {
                    label: 'fit (0 to 1)',
                    data: roles.map(() => 0),
                    ...BAR_FIXED_VERTICAL,
                    backgroundColor: THEME.accentD,
                  },
                ],
              },
              options: {
                ...baseChartOptions(animate),
                plugins: {
                  ...baseChartOptions(animate).plugins,
                  barValueLabels: { format: 'float2', textColor: THEME.text || '#0f172a' },
                },
                scales: {
                  y: { min: 0, max: 1, grid: { color: 'rgba(148,163,184,.22)' } },
                  x: { grid: { display: false } },
                },
              },
            }),
            () =>
              animateChartData('chartHrFit', (c) => {
                c.data.datasets[0].data = roleVals.slice()
              }),
          )
        }

        /* =========================================================
       Tabs: click scroll + active
    ========================================================= */

        /* =========================================================
       Role Fit Inference Flow: staged reveal (v1)
       - Reveals SVG steps from top to bottom once the flow becomes visible
       - Uses existing SVG markup: .flowStep[data-step], .flowLine[data-line]
    ========================================================= */

        function initSignatureOnceOnView(){
          if (sigHasAnimatedOnce) return;

          const target =
            document.querySelector("#signatureWrap") ||
            document.querySelector("#signatureCanvas") ||
            null;
          if(!target) return;

          const runOnce = () => {
            if (sigHasAnimatedOnce) return;
            try { drawSignatureFingerprintAnimated(REPORT); } catch(_e) {}
          };

          if ("IntersectionObserver" in window){
            const io = new IntersectionObserver((entries)=>{
              for(const ent of entries){
                if(ent.isIntersecting){
                  runOnce();
                  try{ io.disconnect(); }catch(e){}
                  break;
                }
              }
            }, { threshold: 0.35 });
            io.observe(target);
          } else {
            // fallback: first scroll into view
            const onScroll = () => {
              const r = target.getBoundingClientRect();
              const vh = window.innerHeight || document.documentElement.clientHeight;
              if(r.top < vh*0.75 && r.bottom > vh*0.25){
                runOnce();
                window.removeEventListener("scroll", onScroll);
              }
            };
            window.addEventListener("scroll", onScroll, { passive:true });
            onScroll();
          }
        }

        /* =========================================================
           Boot
        ========================================================= */

        function boot() {
          try {
            renderReport(REPORT)
            registerAllCharts(REPORT)
            initSignatureOnceOnView()
            __np_initRoleFitFlowOnView()

            let sigResizeT = null
            window.addEventListener(
              'resize',
              () => {
                if (sigResizeT) window.clearTimeout(sigResizeT)
                sigResizeT = window.setTimeout(() => {
                  // Cognitive Fingerprint: no resize-triggered replay
                }, 120)
              },
              { passive: true },
            )
          } catch (e) {
            NP_DEBUG && console.error('Boot error:', e)
          }
        }

                window.setReport = function (reportObject) {
          window.report = reportObject
          window.renderNeuPrint(reportObject)
          try {
            if (window.NPCharts && typeof window.NPCharts.renderAll === 'function') {
              window.NPCharts.renderAll(reportObject)
            }
          } catch (e) {
            NP_DEBUG && console.error('[NeuPrint] external charts error:', e)
          }
        }

        boot()
      } // end window.renderNeuPrint

      ;(function () {
    function getReportData(){
      try{
        if(typeof window !== 'undefined' && window.REPORT && typeof window.REPORT === 'object'){
          return window.REPORT;
        }
        const el = document.getElementById('dev-report-json');
        if(el && el.textContent){
          return JSON.parse(el.textContent);
        }
      }catch(e){
NP_DEBUG && console.error('[NeuPrint] Failed to load report data', e);
      }
      return null;
    }
        function run() {
          const data = getReportData() || window.report || window.DEV_REPORT || null
          if (data) {
            window.report = data
            if (!window.REPORT) window.REPORT = data
            if (typeof window.setReport === 'function') { window.setReport(data); } else { window.renderNeuPrint(data); }
          }
        }
        function ensureChartJs(){
          if(window.Chart) return Promise.resolve();
          return new Promise(function(resolve, reject){
            var s=document.createElement('script');
            s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
            s.async=true;
            s.onload=function(){resolve();};
            s.onerror=function(){reject(new Error('Chart.js load failed'));};
            document.head.appendChild(s);
          });
        }
        function boot(){
          ensureChartJs().then(run).catch(function(e){
            console.error('[NeuPrint] Chart.js load failed:', e);
            try{ run(); }catch(_e){}
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', boot)
        } else {
          boot()
        }
      })()
