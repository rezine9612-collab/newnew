/* RSL Radar (chartRslRadar) */
(function(){
  'use strict';
  var NPCharts = (window.NPCharts = window.NPCharts || {});
  NPCharts.register('renderRslRadar', function(report){
    var rsl = (report && report.backend && report.backend.rsl) ? report.backend.rsl : (report && report.rsl ? report.rsl : null);
    if (!rsl) return;
    var vec = rsl.vector || rsl.scores || rsl;
    // prefer R1..R8 order
    var keys = ['R1','R2','R3','R4','R5','R6','R7','R8'];
    var vals = keys.map(function(k){
      var v = vec[k];
      if (v == null && vec.scores && vec.scores[k]!=null) v = vec.scores[k];
      if (v == null) return 0;
      return NPCharts.clamp(v, 0, 1);
    });

    NPCharts.ensureChartJs().then(function(){
      var T = NPCharts.theme();
      NPCharts.make('chartRslRadar', {
        type: 'radar',
        data: {
          labels: keys,
          datasets: [{
            label: 'RSL',
            data: vals,
            fill: true,
            backgroundColor: NPCharts.rgba(T.accentB, 0.12, {r:77,g:124,b:255}),
            borderColor: T.accentB,
            borderWidth: 2,
            pointRadius: 2
          }]
        },
        options: {
          scales: { r: { min: 0, max: 1 } },
          plugins: { legend: { display: false } }
        }
      }, true);
    }).catch(function(e){ console.error(e); });
  });
})();
