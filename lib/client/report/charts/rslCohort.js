/* RSL Cohort (chartRslBars) */
(function(){
  'use strict';
  var NPCharts = (window.NPCharts = window.NPCharts || {});
  NPCharts.register('renderRslCohort', function(report){
    var rsl = (report && report.backend && report.backend.rsl) ? report.backend.rsl : (report && report.rsl ? report.rsl : null);
    if (!rsl) return;
    // expected: cohort.percentile or cohort.percent
    var pct = null;
    if (rsl.cohort && rsl.cohort.percentile != null) pct = rsl.cohort.percentile;
    if (pct == null && rsl.cohort && rsl.cohort.percent != null) pct = rsl.cohort.percent;
    if (pct == null && report.backend && report.backend.rsl && report.backend.rsl.cohort_percentile != null) pct = report.backend.rsl.cohort_percentile;
    if (pct == null) pct = 0.5;
    pct = NPCharts.clamp(pct, 0, 1);
    var p100 = pct * 100;

    NPCharts.ensureChartJs().then(function(){
      var T = NPCharts.theme();
      // A simple horizontal bar with a marker
      NPCharts.make('chartRslBars', {
        type: 'bar',
        data: {
          labels: ['Cohort'],
          datasets: [{
            label: 'Percentile',
            data: [p100],
            backgroundColor: NPCharts.rgba(T.accentA, 0.55, {r:255,g:138,b:0}),
            borderRadius: 10,
            barThickness: 22
          }]
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: { min: 0, max: 100, ticks: { callback: function(v){ return v + '%'; } } },
            y: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      }, true);
    }).catch(function(e){ console.error(e); });
  });
})();
