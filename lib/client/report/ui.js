/* ================================
     모바일 판별 + 딜레이 값 (맨 위!)
  ================================ */
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


};
