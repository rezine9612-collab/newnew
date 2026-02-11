/* CFF Radar (chartCffRadar) */
(function(){
  'use strict';
  var NPCharts = (window.NPCharts = window.NPCharts || {});
  NPCharts.register('renderCffRadar', function(report){
    var cff = (report && report.backend && report.backend.cff) ? report.backend.cff : (report && report.cff ? report.cff : null);
    if (!cff) return;
    var vec = cff.cfv || cff.vector || cff.scores || cff;
    var labels = ['AAS','CTF','RMD','RDX','EDS','IFD','KPF-Sim','TPS-H'];
    var vals = labels.map(function(k){
      var v = vec[k];
      if (v == null && vec.scores && vec.scores[k]!=null) v = vec.scores[k];
      if (v == null) return 0;
      return NPCharts.clamp(v, 0, 1);
    });

    NPCharts.ensureChartJs().then(function(){
      var T = NPCharts.theme();
      NPCharts.make('chartCffRadar', {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [{
            label: 'CFF Indicator',
            data: vals,
            fill: true,
            backgroundColor: NPCharts.rgba(T.accentC, 0.14, {r:32,g:203,b:194}),
            borderColor: T.accentC,
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
