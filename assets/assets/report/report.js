(function(){
  let chart, dataSeries = [], current = 0, minW = 0, maxW = 0;
  const el = (id) => document.getElementById(id);

  // Flutter(Dart) → JS
  window.addEventListener('message', (e) => {
    try {
      const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (msg.type === 'data') {
        const p = msg.payload;
        dataSeries = p.series || [];
        current = p.current || 0;
        minW = p.min || 0;
        maxW = p.max || 0;
        render();
      }
    } catch(_) {}
  });

  function render() {
    el('currentW').textContent = current.toFixed(0);
    el('minW').textContent = minW.toFixed(0);
    el('maxW').textContent = maxW.toFixed(0);

    const ctx = el('chart').getContext('2d');
    const labels = dataSeries.map(d => d.date.substring(5,10).replace('-','/'));
    const values = dataSeries.map(d => d.kg);

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          fill: true,
          borderColor: '#4DA3FF',
          backgroundColor: ctx.createLinearGradient(0,0,0,180),
          pointRadius: 0,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: {display:false}, tooltip: {enabled:false}},
        scales: {
          x: { grid: {display:false}, ticks: {color:'#bbb'} },
          y: { grid: {color:'#ffffff1a'}, ticks: {color:'#bbb'} }
        }
      }
    });

    setupRuler(40, 120, current, 0.1);
  }

  // ==== 記録シート ====
  const sheet = el('sheet');
  el('btnRecord').addEventListener('click', () => {
    sheet.classList.add('open');
    el('dateLabel').textContent = new Date().toLocaleDateString('ja-JP', {month:'long', day:'numeric', year:'numeric'});
  });
  el('cancel').addEventListener('click', () => sheet.classList.remove('open'));

  let isKg = true, kgVal = 60.0;
  el('segKg').addEventListener('click', ()=>{ isKg=true; updateNum(); toggleSeg(); });
  el('segLb').addEventListener('click', ()=>{ isKg=false; updateNum(); toggleSeg(); });

  function toggleSeg(){
    el('segKg').classList.toggle('on', isKg);
    el('segLb').classList.toggle('on', !isKg);
    el('unit').textContent = isKg ? ' kg' : ' lbs';
  }

  el('save').addEventListener('click', () => {
    const msg = JSON.stringify({
      type: 'saveWeight',
      date: new Date().toISOString().substring(0,10),
      kg: kgVal
    });
    if (window.fromJS) {
      window.fromJS.postMessage(msg);        // Android/iOS (WebView)
    } else {
      window.parent.postMessage(msg, '*');   // Web (iframe)
    }
    sheet.classList.remove('open');
  });

  // ==== ルーラー（タップ一発 + 横ドラッグ）====
  function setupRuler(min, max, value, step){
    kgVal = value;
    updateNum();

    const r = el('ruler');
    r.innerHTML = '';

    function buildTicks(){
      r.innerHTML = '';
      const w = r.clientWidth;
      const minorStep = 1;
      const count = Math.round((max - min) / minorStep);

      for (let i=0;i<=count;i++){
        const x = (i / count) * w;
        const v = min + i*minorStep;
        const major = v % 5 === 0;
        const t = document.createElement('div');
        t.className = 'tick ' + (major ? 'major' : 'minor');
        t.style.left = (x-0.5)+'px';
        t.style.height = major ? '22px' : '10px';
        r.appendChild(t);
        if (major){
          const lab = document.createElement('div');
          lab.className = 'label';
          lab.style.left = x +'px';
          lab.textContent = v.toFixed(0);
          r.appendChild(lab);
        }
      }
      const mid = document.createElement('div');
      mid.className = 'mid';
      r.appendChild(mid);
    }
    buildTicks();

    function snap(v){
      const s = Math.round(v/step)*step;
      return Math.max(min, Math.min(max, s));
    }
    function setFromDx(dx){
      const w = r.clientWidth;
      const ratio = Math.max(0, Math.min(1, dx / w));
      kgVal = snap(min + ratio * (max - min));
      updateNum();
    }

    // --- Pointer Events (PC/Android/iOS) ---
    let dragging = false;
    r.addEventListener('pointerdown', (e)=>{
      dragging = true;
      r.setPointerCapture?.(e.pointerId);
      setFromDx(e.offsetX);
      // 横の意図的な操作なので既定のジェスチャを抑止
      e.preventDefault();
    });
    r.addEventListener('pointermove', (e)=>{
      if (!dragging) return;
      const rect = r.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setFromDx(x);
      e.preventDefault();
    });
    const end = ()=>{
      dragging = false;
    };
    r.addEventListener('pointerup', end);
    r.addEventListener('pointercancel', end);
    r.addEventListener('pointerleave', end);

    // --- iOS Safari 対策（パッシブ false で既定スクロールを抑止） ---
    r.addEventListener('touchmove', (e)=>{
      if (!dragging) return;
      const rect = r.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      setFromDx(x);
      e.preventDefault();
    }, {passive:false});

    // 画面サイズが変わったら目盛りを再構築（横幅依存のため）
    window.addEventListener('resize', buildTicks);
    window.addEventListener('orientationchange', buildTicks);
  }

  function updateNum(){
    el('num').textContent = (isKg ? kgVal : kgVal*2.20462262).toFixed(1);
  }

  document.addEventListener('DOMContentLoaded', ()=>{});
})();
