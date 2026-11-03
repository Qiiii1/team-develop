// Toolbar interactions shared by task, time, and people views.
const filterPanel=$('#filter-popover'), inlineSearch=$('#inline-search');
function dismissFilter(){filterPanel.hidden=true;$('#filter-open').setAttribute('aria-expanded','false')}
$('#filter-open').onclick=e=>{e.stopPropagation();filterPanel.hidden=!filterPanel.hidden;$('#filter-open').setAttribute('aria-expanded',String(!filterPanel.hidden));if(!filterPanel.hidden){$('#filter-owner').value=filter.owner;$('#filter-due').value=filter.due||'';$('#filter-blocked').checked=filter.blocked;$('#filter-mine').checked=filter.mine}};
filterPanel.onclick=e=>e.stopPropagation();document.addEventListener('click',dismissFilter);
$('#filter-reset').onclick=()=>{filter={owner:'',due:'',blocked:false,mine:false};$('#filter-owner').value='';$('#filter-due').value='';$('#filter-blocked').checked=false;$('#filter-mine').checked=false;dismissFilter();render()};
$('#filter-apply').onclick=()=>{filter={owner:$('#filter-owner').value,due:$('#filter-due').value,blocked:$('#filter-blocked').checked,mine:$('#filter-mine').checked};dismissFilter();render()};
$('#search-open').onclick=()=>{inlineSearch.hidden=false;$('#search-open').hidden=true;$('#search-open').setAttribute('aria-expanded','true');inlineSearch.focus()};
inlineSearch.oninput=()=>{search=inlineSearch.value.trim();render()};inlineSearch.onkeydown=e=>{if(e.key==='Escape'){inlineSearch.value='';search='';inlineSearch.hidden=true;$('#search-open').hidden=false;$('#search-open').setAttribute('aria-expanded','false');render()}};
const originalShown=shown;shown=()=>originalShown().filter(t=>{if(!filter.due)return true;if(filter.due==='none')return !t.due;if(!t.due)return false;const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});const week=new Date(day+'T00:00:00+08:00');week.setDate(week.getDate()+7);if(filter.due==='today')return t.due<=day;return t.due>=day&&t.due<=week.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})});
render();

