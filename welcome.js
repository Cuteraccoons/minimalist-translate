(() => {
 const steps=[
  ['欢迎使用极简翻译','点击右侧箭头，试一试。'],
  ['网页翻译','点击右下角的翻译胶囊，查看双语译文。','网页翻译','translate','翻译这篇文章'],
  ['分栏对照','原文与译文并排，点击段落即可对照。','分栏对照','sidebar','试试分栏对照'],
  ['沉浸阅读','试试大纲与排版设置。右侧箭头可直接进入下一步。','沉浸阅读','reader','进入阅读模式'],
  ['高亮与笔记','划选一句话，选择高亮或笔记。','高亮笔记','reader','试试阅读笔记'],
  ['更多工具','需要时再设置。']
 ];
 let current=0;const q=s=>document.querySelector(s),dispatch=action=>document.dispatchEvent(new CustomEvent('jijian-welcome-action',{detail:action}));
 const openSettings=tab=>chrome.runtime.sendMessage({action:'OPEN_OPTIONS_PAGE',tab:tab||'tab-api'});
 function show(index){q('#guide-next').hidden=false;dispatch('reset');current=index;window.scrollTo(0,0);document.body.dataset.guideStep=index;const step=steps[index];q('#step-title').textContent=step[0];q('#step-description').textContent=step[1];q('#welcome-start').hidden=index!==0;q('#welcome-extras').hidden=index!==5;q('#welcome-article').hidden=index===0||index===5;q('#demo-disclosure').hidden=index===0||index===5;q('.welcome-stage').dataset.step=index;
  q('#step-actions').replaceChildren();if(step[3]){const button=document.createElement('button');button.textContent=step[4];button.addEventListener('click',()=>dispatch(step[3]));q('#step-actions').append(button);}
  q('#guide-prev').disabled=index===0;q('#guide-next').setAttribute('aria-label',index===5?'完成指南':'下一步');q('#guide-next').title=index===5?'完成指南':'下一步';q('#guide-progress').textContent=`${index+1} / ${steps.length}`;chrome.storage.local.set({welcomeProgress:index}).catch(()=>{});if(!matchMedia('(prefers-reduced-motion: reduce)').matches)q('.welcome-stage').animate([{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240});
 }
 async function finish(){dispatch('reset');document.body.dataset.guideStep='5';await chrome.storage.local.set({welcomeCompleted:true,welcomeProgress:0});q('#step-title').textContent='指南已完成';q('#step-description').textContent='在任意网页打开极简翻译，即可开始。';q('#step-actions').replaceChildren();q('#welcome-article').hidden=true;q('#welcome-start').hidden=true;q('#welcome-extras').hidden=false;q('#demo-disclosure').hidden=true;q('#guide-next').hidden=true;}
 q('#guide-prev').addEventListener('click',()=>{q('#guide-next').hidden=false;show(Math.max(0,current-1));});q('#guide-next').addEventListener('click',()=>current===5?finish():show(current+1));q('#skip-guide').addEventListener('click',finish);q('.brand').addEventListener('click',event=>{event.preventDefault();q('#guide-next').hidden=false;show(0);});document.querySelectorAll('[data-settings]').forEach(button=>button.addEventListener('click',()=>openSettings(button.dataset.settings)));
 chrome.storage.local.get('welcomeProgress').then(data=>show(Math.max(0,Math.min(5,Number(data.welcomeProgress)||0))));
})();
