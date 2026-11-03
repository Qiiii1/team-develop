// One shared scope model for task, time and people views.
const stageEyebrowLabels=[null,'阶段进度','阶段日期','需要关注'];
const projectEyebrowLabels=['项目范围','总体进度','最近截止','需要关注'];
const localToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
function scopeTasks(){return scope==='all'?data.tasks:data.tasks.filter(t=>t.stage===current().id)}
function activeFilterCount(){return Number(Boolean(filter.owner))+Number(Boolean(filter.due))+Number(Boolean(filter.blocked))+Number(Boolean(filter.mine))}
function restoreStageCard(){
 document.querySelector('.stage-wrap').classList.remove('project-summary');
 document.querySelectorAll('.stage-card .eyebrow').forEach((node,index)=>{if(stageEyebrowLabels[index])node.textContent=stageEyebrowLabels[index]});
 $('#stage-name').disabled=false;
}
function renderProjectCard(){
 const tasks=data.tasks,done=tasks.filter(t=>t.status==='done').length,active=tasks.filter(t=>t.status!=='done');
 const blocked=active.filter(t=>t.block),review=active.filter(t=>t.status==='review'),due=active.filter(t=>t.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
 const pct=tasks.length?Math.round(done/tasks.length*100):0,currentStage=data.stages.find(s=>s.status==='current');
 document.querySelector('.stage-wrap').classList.add('project-summary');
 document.querySelectorAll('.stage-card .eyebrow').forEach((node,index)=>node.textContent=projectEyebrowLabels[index]||node.textContent);
 $('#stage-index').textContent='项目总览';$('#stage-name').textContent='小组管理项目';$('#stage-name').disabled=true;
 $('#stage-status').textContent=currentStage?`当前阶段：${currentStage.name}`:'全部阶段已结束';
 $('#stage-percent').textContent=pct+'%';$('#stage-bar').style.width=pct+'%';$('#stage-count').textContent=`已完成 ${done} / ${tasks.length}`;
 $('#stage-date').textContent=due?date(due.due):'暂无';$('#stage-attention').textContent=due?due.title:'没有未完成任务';
 $('#stage-risk').textContent=`${blocked.length} 项阻塞`;$('#stage-review').textContent=`${review.length} 项待确认`;
}
function renderDynamicNotice(){
 const tasks=scopeTasks(),active=tasks.filter(t=>t.status!=='done'),today=localToday();
 const blocked=active.filter(t=>t.block),overdue=active.filter(t=>t.due&&t.due<today),review=active.filter(t=>t.status==='review');
 let message='当前范围内没有需要关注的延期或阻塞。AI 只提供建议。';
 if(blocked.length){const affected=data.tasks.filter(t=>(t.depends||[]).includes(blocked[0].id)).length;message=affected?`“${blocked[0].title}”存在阻塞，可能影响 ${affected} 项后续任务。AI 只提供建议。`:`“${blocked[0].title}”存在阻塞，需要成员处理。AI 只提供建议。`}
 else if(overdue.length)message=`当前有 ${overdue.length} 项任务逾期，建议成员确认新的完成时间。AI 不会自动修改。`;
 else if(review.length)message=`当前有 ${review.length} 项任务等待确认，请由验收人处理。AI 不代替成员确认。`;
 $('#notice-text').textContent=message;
}
function renderToolbarState(){
 $('#scope').textContent=scope==='stage'?'当前阶段':'全项目';
 const count=activeFilterCount();$('#filter-open').textContent=count?`筛选 ${count}`:'筛选';$('#filter-open').classList.toggle('has-filter',count>0);
 if(view==='tasks'){$('#view-title').textContent=scope==='stage'?`${current().name} · 阶段任务`:'全项目任务';$('#view-subtitle').textContent=scope==='stage'?`${shown().length} 项任务 · 状态由成员更新`:`跨 ${data.stages.length} 个阶段 · ${shown().length} 项任务`}
}
function showScopeImpact(){
 const tasks=scopeTasks(),today=localToday(),items=tasks.filter(t=>t.status!=='done'&&(t.block||(t.due&&t.due<today)||t.status==='review'));
 modal(scope==='all'?'全项目影响':'当前阶段影响',`${items.length?items.map(t=>`<div class="suggestion"><b>${esc(t.title)}</b><p>${t.block?'阻塞：'+esc(t.block):t.due&&t.due<today?'已逾期，截止 '+date(t.due):'等待验收人确认'}</p></div>`).join(''):'<div class="empty">当前没有需要处理的风险</div>'}<p class="hint">AI 仅整理影响，任务时间、状态和分工仍由成员确认。</p><div class="dialog-actions"><button class="button" data-close>关闭</button></div>`)
}
const renderBeforeScopeSummary=render;
render=function(){renderBeforeScopeSummary();if(scope==='all')renderProjectCard();else restoreStageCard();renderDynamicNotice();renderToolbarState()};
$('#impact-open').onclick=showScopeImpact;
render();

