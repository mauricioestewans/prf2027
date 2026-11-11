/* ============================================================
   EG Concursos - Baixador LEVE (uma materia por vez, com pausas)
   PDF da aula (resumo + material da aula) + manuscrito do professor.

   COMO USAR:
   1) Esteja LOGADO em  https://app.egconcurso.com.br
   2) (Recomendado) Pause o OneDrive por 2h durante o download.
   3) F12 -> aba "Console". Cole TODO este arquivo e aperte Enter.
      (se avisar "nao cole codigo", digite:  allow pasting  e Enter)
   4) Na caixinha, escolha a MATERIA no seletor e clique em Baixar.
   5) Selecione a pasta AULAS PRF e permita a gravacao.
   Faca UMA materia por vez, deixando o notebook respirar entre elas.
   Pode rodar de novo quando quiser: ele PULA o que ja existe.
   ============================================================ */
(() => {
  if (window.__egStop) { window.__egStop(); }
  const BASE = 'https://app.egconcurso.com.br';
  const DELAY_MS = 600;          // pausa entre cada arquivo (aumente se travar)
  const PAUSE_EVERY = 15;        // a cada N arquivos, descanso maior
  const PAUSE_MS = 2500;

  // baixa: resumo da aula + material da aula + manuscrito (pula o "detalhado")
  const KINDS = [
    ['summary',    'material_id',            'material_filename'],
    ['lesson',     'lesson_material_id',     'lesson_material_filename'],
    ['manuscript', 'manuscript_material_id', 'manuscript_material_filename'],
  ];

  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  let stopFlag = false;
  window.__egStop = () => { stopFlag = true; const b=document.getElementById('__egbox'); if(b) b.remove(); };

  function subjFolder(title){
    const map = { 'Língua Portuguesa':'PORTUGUES' };
    let t = map[title] || title || 'Outros';
    return t.replace(/[\\/:*?"<>|]+/g,' - ').replace(/\s+/g,' ').trim();
  }
  function safeName(name, fallback){
    let n = (name && String(name).trim()) ? String(name) : fallback;
    n = n.replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim();
    if(!/\.pdf$/i.test(n)) n+='.pdf';
    return n;
  }
  async function j(url){ const r=await fetch(url,{credentials:'same-origin',cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  async function exists(dir,name){ try{ await dir.getFileHandle(name); return true; }catch(e){ return false; } }

  // ---------- UI ----------
  const box=document.createElement('div'); box.id='__egbox';
  box.style.cssText='position:fixed;z-index:2147483647;right:16px;bottom:16px;width:380px;background:#0b0b0c;color:#eaeaea;font:13px/1.45 system-ui;border:1px solid #333;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:14px';
  box.innerHTML =
    '<div style="font-weight:700;margin-bottom:8px">EG Concursos — baixar materiais</div>'+
    '<select id="__egsel" style="width:100%;padding:8px;border-radius:8px;background:#141416;color:#eee;border:1px solid #333"><option>Carregando matérias...</option></select>'+
    '<div style="display:flex;gap:8px;margin-top:8px">'+
      '<button id="__egbtn" style="flex:1;padding:10px;border:0;border-radius:8px;background:#22c55e;color:#08140a;font-weight:700;cursor:pointer">Baixar</button>'+
      '<button id="__egstop" style="padding:10px;border:0;border-radius:8px;background:#444;color:#eee;cursor:pointer">Fechar</button>'+
    '</div>'+
    '<div id="__eglog" style="margin-top:10px;white-space:pre-wrap;font-size:12px;color:#bdbdbd"></div>';
  document.body.appendChild(box);
  const sel=box.querySelector('#__egsel'), btn=box.querySelector('#__egbtn'), log=box.querySelector('#__eglog');
  box.querySelector('#__egstop').onclick=()=>window.__egStop();
  const setLog=t=>{log.textContent=t;};

  let aulas=[]; // {subject,id,title}
  (async()=>{
    try{
      const cat=await j(BASE+'/api/content/catalog');
      const bySubj={}; const order=[];
      for(const c of (cat.courses||[])) for(const s of (c.subjects||[])) for(const l of (s.lessons||[])){
        if(!l.hasMaterial) continue;
        if(!bySubj[s.title]){ bySubj[s.title]=[]; order.push(s.title); }
        bySubj[s.title].push({subject:s.title,id:l.id,title:l.title});
      }
      sel.innerHTML='';
      const optAll=document.createElement('option'); optAll.value='__ALL__';
      const totalAll=order.reduce((a,t)=>a+bySubj[t].length,0);
      optAll.textContent=`TODAS as matérias (${totalAll} aulas) — devagar`; sel.appendChild(optAll);
      for(const t of order){ const o=document.createElement('option'); o.value=t; o.textContent=`${t} (${bySubj[t].length} aulas)`; sel.appendChild(o); }
      window.__egBy=bySubj; window.__egOrder=order;
      setLog('Escolha a matéria e clique em Baixar.\nDica: faça uma por vez.');
    }catch(e){ setLog('ERRO ao ler catálogo: '+e.message+'\nVocê está logado no site?'); }
  })();

  async function run(){
    const pick=sel.value;
    const list = pick==='__ALL__' ? window.__egOrder.flatMap(t=>window.__egBy[t]) : (window.__egBy[pick]||[]);
    if(!list.length){ setLog('Nada a baixar.'); return; }
    btn.disabled=true; btn.textContent='Selecione a pasta...';
    let root;
    try{ root=await window.showDirectoryPicker({mode:'readwrite'}); if(root.requestPermission) await root.requestPermission({mode:'readwrite'}); }
    catch(e){ btn.disabled=false; btn.textContent='Baixar'; setLog('Cancelado.'); return; }
    btn.textContent='Baixando...'; stopFlag=false;

    const t0=Date.now(); let ok=0,skip=0,fail=0,n=0,done=0; const total=list.length;
    const dirc={};
    async function getDir(f){ if(dirc[f])return dirc[f]; const d=await root.getDirectoryHandle(f,{create:true}); dirc[f]=d; return d; }

    for(const a of list){
      if(stopFlag){ setLog('Parado pelo usuário.\nBaixados: '+ok+'  Pulados: '+skip+'  Falhas: '+fail); return; }
      done++;
      let det; try{ det=await j(`${BASE}/api/content/lessons/${encodeURIComponent(a.id)}`); }
      catch(e){ fail++; continue; }
      let dir; try{ dir=await getDir(subjFolder(a.subject)); }catch(e){ fail++; continue; }
      for(const [kind,idf,namef] of KINDS){
        const art=det[idf]; if(!art) continue;
        const fname=safeName(det[namef],`EG_Concursos_${a.title}_${kind}`);
        const secs=Math.round((Date.now()-t0)/1000);
        setLog(`${subjFolder(a.subject)}\nAula ${done}/${total}: ${a.title}\n-> ${kind}\n\nBaixados: ${ok}  Pulados: ${skip}  Falhas: ${fail}  (${secs}s)`);
        try{
          if(await exists(dir,fname)){ skip++; continue; }
          const resp=await fetch(`${BASE}/api/content/lessons/${encodeURIComponent(a.id)}/material-file?kind=${kind}&v=${encodeURIComponent(art)}`,{credentials:'same-origin',cache:'no-store'});
          if(!resp.ok) throw new Error('HTTP '+resp.status);
          const blob=await resp.blob(); if(!blob.size) throw new Error('vazio');
          const fh=await dir.getFileHandle(fname,{create:true}); const w=await fh.createWritable(); await w.write(blob); await w.close();
          ok++; n++;
          await sleep(DELAY_MS);
          if(n%PAUSE_EVERY===0){ setLog('Descansando o notebook alguns segundos...'); await sleep(PAUSE_MS); }
        }catch(e){ fail++; }
      }
    }
    btn.textContent='✓ Concluído'; btn.style.background='#3b82f6';
    setLog(`CONCLUÍDO (${pick==='__ALL__'?'todas':pick}).\nBaixados: ${ok}\nJá existiam: ${skip}\nFalhas: ${fail}\n\nEscolha outra matéria ou feche.`);
    btn.disabled=false;
  }
  btn.onclick=run;
})();
