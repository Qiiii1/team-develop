const originalTaskForm=form;
form=function(t={}){
  originalTaskForm(t);
  const panel=$('#ai-panel');
  panel.innerHTML=`<div class="ai-context"><label for="ai-overview">工作概况</label><div class="ai-context-row"><textarea id="ai-overview" placeholder="例如：完成访谈并整理报告初稿"></textarea><label class="ai-file-button" for="ai-files">＋ 添加参考文件</label><input id="ai-files" type="file" multiple hidden></div><div class="ai-file-list" id="ai-file-list"></div></div><div id="ai-suggestions"></div><div class="ai-regenerate"><button type="button" id="regenerate-ai">↻ 生成分工建议</button></div><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button dark" id="accept-ai" disabled>确认添加</button></div>`;
  let generated=[];
  const renderSuggestions=()=>{
    $('#ai-suggestions').innerHTML=generated.map((item,i)=>`<div class="ai-suggestion"><label><input type="checkbox" class="ai-choice" checked data-index="${i}"><strong>${esc(item.title)}</strong></label><span>负责人：${esc(item.owner)}　截止：${date(item.due)}</span><small>${esc(item.reason)}</small><button type="button" class="button small" data-edit-ai="${i}">修改</button></div>`).join('');
    $('#accept-ai').disabled=!generated.length;
    $('#accept-ai').textContent=`添加 ${generated.length} 项任务`;
  };
  $('#ai-files').onchange=e=>{$('#ai-file-list').textContent=Array.from(e.target.files).map(f=>f.name).join('、')};
  $('#regenerate-ai').onclick=()=>{
    const overview=$('#ai-overview').value.trim();
    if(!overview){$('#ai-overview').focus();return toast('请先填写本次工作概况')}
    // Local prototype: examples are derived from the entered brief; no AI service is connected.
    const due=current().end||'';
    generated=overview.includes('访谈')?[
      {title:'用户访谈',owner:'枝吱',due,reason:'依据工作概况中的访谈目标'},
      {title:'整理访谈洞察',owner:'鲤鱼',due,reason:'依据工作概况中的整理交付物'},
      {title:'撰写报告初稿',owner:'背带',due,reason:'依据工作概况中的报告交付物；负责人请核对'}
    ]:[{title:overview.slice(0,28),owner:'',due,reason:'由工作概况整理；请补全负责人和完成标准'}];
    renderSuggestions();
    $('#regenerate-ai').textContent='↻ 重新生成建议';
  };
  panel.onclick=e=>{const b=e.target.closest('[data-edit-ai]');if(!b)return;const item=generated[Number(b.dataset.editAi)];const title=prompt('修改任务名称',item.title);if(title===null)return;const owner=prompt('修改负责人（枝吱、鲤鱼、蚂蚁、背带、骑驴）',item.owner);if(owner===null)return;if(owner&&!members.includes(owner))return toast('请选择团队中的成员');item.title=title.trim()||item.title;item.owner=owner;renderSuggestions()};
  $('#accept-ai').onclick=()=>{
    const chosen=Array.from(panel.querySelectorAll('.ai-choice:checked')).map(c=>generated[Number(c.dataset.index)]);
    if(!chosen.length)return toast('请先选择任务');
    const existing=new Set(data.tasks.filter(x=>x.stage===current().id).map(x=>x.title));
    const additions=chosen.filter(x=>!existing.has(x.title));
    if(!additions.length)return toast('所选任务已在当前阶段，请先修改建议');
    additions.forEach((item,i)=>data.tasks.push({id:Date.now()+i,stage:current().id,title:item.title,owner:item.owner,status:'todo',priority:'常规',due:item.due,criteria:'待成员补充完成标准',creator:'枝吱',reviewer:'枝吱'}));
    close();save();toast(`已添加 ${additions.length} 项任务`)
  };
};

