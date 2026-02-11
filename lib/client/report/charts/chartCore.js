/* NeuPrint charts core (browser-only)
   - Provides window.NPCharts namespace
   - Loads Chart.js (UMD) from CDN if missing
   - Shared helpers: theme tokens, clamp, rgba, chart lifecycle
*/

(function () {
  'use strict';

  var NPCharts = (window.NPCharts = window.NPCharts || {});
  NPCharts._registry = NPCharts._registry || {};

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    var h = String(hex).trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length !== 6) return null;
    var r = parseInt(h.slice(0,2), 16);
    var g = parseInt(h.slice(2,4), 16);
    var b = parseInt(h.slice(4,6), 16);
    if (![r,g,b].every(Number.isFinite)) return null;
    return { r:r, g:g, b:b };
  }

  function rgba(hex, a, fallbackRgb) {
    var rgb = hexToRgb(hex);
    if (!rgb && fallbackRgb) rgb = fallbackRgb;
    if (!rgb) return 'rgba(0,0,0,' + a + ')';
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }

  function theme() {
    // keep same variable names as your CSS tokens
    var t = {
      text: cssVar('--text', '#0b1220'),
      muted: cssVar('--muted', '#56647a'),
      line: cssVar('--line', '#e6ebf2'),
      accentA: cssVar('--accentA', '#ff8a00'),
      accentB: cssVar('--accentB', '#4d7cff'),
      accentC: cssVar('--accentC', '#20cbc2'),
      accentD: cssVar('--accentD', '#8c5cff'),
      chartAnimDuration: parseInt(cssVar('--chartAnimDuration', '1400'), 10) || 1400
    };
    return t;
  }

  NPCharts.theme = theme;
  NPCharts.clamp = clamp;
  NPCharts.rgba = rgba;

  NPCharts.ensureChartJs = function ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (NPCharts._chartPromise) return NPCharts._chartPromise;

    NPCharts._chartPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Chart.js load failed')); };
      document.head.appendChild(s);
    });

    return NPCharts._chartPromise;
  };

  NPCharts.destroy = function destroy(id) {
    var inst = NPCharts._registry[id];
    if (inst && typeof inst.destroy === 'function') {
      try { inst.destroy(); } catch (e) {}
    }
    delete NPCharts._registry[id];
  };

  function baseOptions(animate) {
    var T = theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: animate ? { duration: T.chartAnimDuration } : { duration: 0 },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, color: T.muted }
        },
        tooltip: { enabled: true }
      },
      scales: {
        r: {
          angleLines: { color: T.line },
          grid: { color: T.line },
          pointLabels: { color: T.muted, font: { size: 12 } },
          ticks: { display: false }
        },
        x: { grid: { color: T.line }, ticks: { color: T.muted } },
        y: { grid: { color: T.line }, ticks: { color: T.muted } }
      }
    };
  }

  NPCharts.make = function make(id, config, animate) {
    var el = document.getElementById(id);
    if (!el || !window.Chart) return null;
    NPCharts.destroy(id);
    var ctx = el.getContext('2d');
    var opt = config.options || {};
    var merged = Object.assign({}, baseOptions(animate), opt);
    config.options = merged;

    var inst = new window.Chart(ctx, config);
    NPCharts._registry[id] = inst;
    return inst;
  };

  NPCharts.register = function register(name, fn) {
    NPCharts[name] = fn;
  };

  NPCharts.renderAll = function renderAll(report) {
    // called from hydrate.js after renderNeuPrint(report)
    var fns = ['renderRslRadar','renderCffRadar','renderRslCohort','renderAgency'];
    for (var i=0;i<fns.length;i++){
      var k=fns[i];
      if (typeof NPCharts[k] === 'function') {
        try { NPCharts[k](report); } catch(e) { console.error('[NeuPrint] chart error:', k, e); }
      }
    }
  };
})();
