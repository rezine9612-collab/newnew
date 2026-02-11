/* NeuPrint Chart Plugins Registry
   - Keeps a small registry of chart renderers.
   - Each chart module registers itself via NPCharts.register(name, fn).
   - hydrate.js (or any other caller) can trigger NPCharts.renderAll(report).

   This file is required because the chart modules are intentionally written
   as classic scripts (not ES modules) and share a global namespace.
*/

(function(){
  'use strict';

  var NPCharts = (window.NPCharts = window.NPCharts || {});

  // internal renderer registry
  var _renderers = (NPCharts._renderers = NPCharts._renderers || {});

  NPCharts.register = function register(name, fn){
    if(!name || typeof fn !== 'function') return;
    _renderers[String(name)] = fn;
  };

  NPCharts.unregister = function unregister(name){
    if(!name) return;
    try{ delete _renderers[String(name)]; }catch(e){}
  };

  NPCharts.renderAll = function renderAll(report){
    // Chart.js may load async; individual renderers usually call ensureChartJs()
    // but we keep this synchronous and let each renderer handle its own flow.
    for (var k in _renderers){
      if(!Object.prototype.hasOwnProperty.call(_renderers, k)) continue;
      try{ _renderers[k](report); }catch(e){ console.error('[NPCharts] renderer failed:', k, e); }
    }
  };
})();
