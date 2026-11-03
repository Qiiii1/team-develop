const renderBeforeTimeline=render;
function localDay(value){const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?null:d}
function dayText(d){return `${d.getMonth()+1}/${d.getDate()}`}
function timeline(){
  const items=shown(), stage=current(), valid=items.map(t=>localDay(t.due)).filter(Boolean);
  const end=localDay(stage.end)||new Date();
  const min=valid.length?new Date(Math.min(...valid.map(d=>d.getTime()),end.getTime())):new Date(end);
  const max=valid.length?new Date(Math.max(...valid.map(d=>d.getTime()),end.getTime())):new Date(end);
  min.setDate(min.getDate()-4);max.setDate(max.getDate()+4);
  const length=Math.max(10,Math.round((max-min)/86400000));
  const pct=d=>Math.max(0,Math.min(100,((d-min)/86400000)/length*100));
  const ticks=Array.from({length:Math.min(8,Math.floor(length/2)+1)},(_,i)=>{const d=new Date(min);d.setDate(d.getDate()+Math.round(i*length/Math.min(7,Math.floor(length/2))));return `<span style="left:${pct(d)}%">${dayText(d)}</span>`}).join('');
  const stageLine=`<i class="timeline-stage-line" style="left:${pct(end)}%" title="阶段截止：${date(stage.end)}"></i>`;
  const rows=items.map(t=>{
    const due=localDay(t.due),start=localDay(t.start);
    const deps=(t.depends||[]).map(id=>task(id)).filter(Boolean);
    const external=deps.filter(x=>x.stage!==t.stage);
    const pending=deps.filter(x=>x.status!=='done');
    let mark=due?`<span class="timeline-due ${t.status==='done'?'complete':''}" style="left:${pct(due)}%" title="截止：${date(t.due)}"></span>`:'<span class="timeline-undated">未设置截止</span>';
    if(start&&due){const left=pct(start),right=pct(due);mark=`<span class="timeline-bar ${t.status}" style="left:${left}%;width:${Math.max(1,right-left)}%">${esc(t.progress||labels[t.status])}</span>${mark}`}
    return `<div class="timeline-row" data-task="${t.id}" tabindex="0"><div class="timeline-task"><b>${esc(t.title)}</b><small>${esc(t.owner||'未分配')} · ${labels[t.status]}${t.block?' · 阻塞':''}</small>${external.length?`<small class="timeline-cross">跨阶段前置：${external.map(x=>esc(x.title)+'（'+esc(data.stages.find(s=>s.id===x.stage)?.name||'其他阶段')+'）').join('、')}</small>`:pending.length?`<small>等待：${pending.map(x=>esc(x.title)).join('、')}</small>`:''}</div><div class="timeline-track">${stageLine}${mark}</div></div>`
  }).join('');
  $('#view-title').textContent=scope==='stage'?`${esc(stage.name)} · 时间安排`:'全项目时间安排';
  $('#view-subtitle').textContent=`${items.length} 项任务 · 时间点取自任务截止时间；设置开始时间后显示持续区间`;
  $('#view-content').className='timeline';
  $('#view-content').innerHTML=`<div class="timeline-head"><span>任务 / 负责人</span><div class="timeline-ruler">${stageLine}${ticks}</div></div>${rows||'<div class="empty">该范围内暂无任务</div>'}<div class="timeline-foot">竖线为阶段截止 · 点击任务查看或编辑日期 · 跨阶段前置任务仅提示，不混入当前阶段</div>`;
}
render=function(){renderBeforeTimeline();if(view==='time')timeline()};
render();

