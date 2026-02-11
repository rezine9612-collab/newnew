/* Agency / Control (chartMixAgency or chartAgencyBars if present)
   - Your HTML may have a specific canvas id. We support common ones.
*/
(function(){
  'use strict';
  var NPCharts = (window.NPCharts = window.NPCharts || {});
  NPCharts.register('renderAgency', function(report){
    var ctl = (report && report.backend && report.backend.control) ? report.backend.control : (report && report.control ? report.control : null);
    if (!ctl) return;

    var dist = ctl.distribution || ctl.agency_distribution || ctl;
    var human = dist.human_pct != null ? dist.human_pct : dist.human;
    var hybrid = dist.hybrid_pct != null ? dist.hybrid_pct : dist.hybrid;
    var ai = dist.ai_pct != null ? dist.ai_pct : dist.ai;

    // if stored as 0..1, convert
    function norm(x){
      if (x == null) return null;
      x = Number(x);
      if (!Number.isFinite(x)) return null;
      if (x <= 1) return x*100;
      return x;
    }
    human = norm(human); hybrid = norm(hybrid); ai = norm(ai);
    if (human==null && hybrid==null && ai==null) return;

    var donutId = document.getElementById('chartMixAgency') ? 'chartMixAgency'
               : document.getElementById('chartAgency') ? 'chartAgency'
               : null;

    NPCharts.ensureChartJs().then(function(){
      var T = NPCharts.theme();
      if (donutId) {
        NPCharts.make(donutId, {
          type: 'doughnut',
          data: {
            labels: ['Human','Hybrid','AI'],
            datasets: [{
              data: [human||0, hybrid||0, ai||0],
              backgroundColor: [
                NPCharts.rgba(T.accentB, 0.75, {r:77,g:124,b:255}),
                NPCharts.rgba(T.accentC, 0.75, {r:32,g:203,b:194}),
                NPCharts.rgba(T.accentD, 0.75, {r:140,g:92,b:255})
              ],
              borderColor: '#ffffff',
              borderWidth: 2
            }]
          },
          options: { plugins: { legend: { position: 'bottom' } } }
        }, true);
      }
    }).catch(function(e){ console.error(e); });
  });
})();
