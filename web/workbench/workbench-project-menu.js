$('#project-manage').onclick=()=>{
  const status={ended:'已结束',current:'当前阶段',upcoming:'未开始'};
  modal('项目阶段管理',`<div class="project-stage-list">${data.stages.map((s,i)=>`<div class="project-stage-row"><span>${i+1}. ${esc(s.name)}</span><small>${status[s.status]}</small></div>`).join('')}</div><div class="dialog-actions"><button class="button" id="manage-create">＋ 新建阶段</button><button class="button dark" id="manage-end" ${data.stages.some(s=>s.status==='current')?'':'disabled'}>结束当前阶段</button></div>`);
  $('#manage-create').onclick=()=>$('#add-stage').click();
  $('#manage-end').onclick=()=>{stageIndex=data.stages.findIndex(s=>s.status==='current');render();$('#end-stage').click()};
};
const originalStageRender=render;
render=function(){originalStageRender();const tasks=data.tasks.filter(t=>t.stage===current().id);$('#stage-risk').textContent=`${tasks.filter(t=>t.block).length} 项阻塞`;$('#stage-review').textContent=`${tasks.filter(t=>t.status==='review').length} 项待确认`};
render();

