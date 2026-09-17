(() => {
 const steps=[
  ['你好，欢迎来读。','不用一次学会所有功能。先在这里试一试，再回到你想读的网页。','开始'],
  ['让两种语言，一起出现。','点击右下角的翻译胶囊，或下方“体验网页翻译”。保留原文，随时比较。','网页翻译','translate','体验网页翻译'],
  ['把原文与译文，放在两边。','长篇文字适合分栏阅读。试着点击右侧译文段落，回到它对应的原文。','分栏对照','sidebar','体验分栏对照'],
  ['给文章，一个安静的空间。','这篇文章有标题、大纲和配图。打开阅读模式，试试左侧大纲与右侧排版设置；退出后可继续引导。','沉浸阅读','reader','进入阅读模式'],
  ['留住一句话，也留住想法。','在下方示例文章划选一句话，点击“高亮”。在阅读模式中，还可以添加笔记和截图。','高亮笔记','reader','试试阅读笔记'],
  ['按你的需要，慢慢添一点。','基础阅读已经准备好了。词典和 AI 都是可选项，之后也能从设置页重新打开本指南。','更多工具']
 ];
 let current=0;const q=s=>document.querySelector(s),dispatch=action=>document.dispatchEvent(new CustomEvent('jijian-welcome-action',{detail:action}));
 const openSettings=tab=>chrome.runtime.sendMessage({action:'OPEN_OPTIONS_PAGE',tab:tab||'tab-api'});
 const nav=q('#guide-steps');steps.forEach((step,index)=>{const li=document.createElement('li'),button=document.createElement('button');button.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span>${step[2]}`;button.addEventListener('click',()=>show(index));li.append(button);nav.append(li);});
 function show(index){q('#guide-next').hidden=false;dispatch('reset');current=index;document.body.dataset.guideStep=index;const step=steps[index];q('#step-number').textContent=`${String(index+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')}`;q('#step-title').textContent=step[0];q('#step-description').textContent=step[1];q('#welcome-start').hidden=index!==0;q('#welcome-extras').hidden=index!==5;q('#welcome-article').hidden=index===0||index===5;q('#demo-disclosure').hidden=index===0||index===5;q('.welcome-stage').dataset.step=index;
  q('#step-actions').replaceChildren();if(step[3]){const button=document.createElement('button');button.textContent=step[4];button.addEventListener('click',()=>dispatch(step[3]));q('#step-actions').append(button);}
  [...nav.querySelectorAll('button')].forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});q('#guide-prev').disabled=index===0;q('#guide-next').textContent=index===5?'完成，开始阅读 ✓':'下一步 →';q('#guide-progress').textContent=`${index+1} / ${steps.length}`;chrome.storage.local.set({welcomeProgress:index}).catch(()=>{});if(!matchMedia('(prefers-reduced-motion: reduce)').matches)q('.welcome-stage').animate([{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240});
 }
 async function finish(){dispatch('reset');document.body.dataset.guideStep='5';await chrome.storage.local.set({welcomeCompleted:true,welcomeProgress:0});q('#step-title').textContent='准备好了，去读点什么吧。';q('#step-description').textContent='打开任意外文文章，从翻译胶囊或扩展菜单开始。你可以关闭这个标签页，也可以随时从设置重新打开指南。';q('#step-actions').replaceChildren();q('#welcome-article').hidden=true;q('#welcome-start').hidden=true;q('#welcome-extras').hidden=false;q('#demo-disclosure').hidden=true;q('#guide-next').hidden=true;}
 q('#guide-prev').addEventListener('click',()=>{q('#guide-next').hidden=false;show(Math.max(0,current-1));});q('#guide-next').addEventListener('click',()=>current===5?finish():show(current+1));q('#skip-guide').addEventListener('click',finish);q('#guide-settings').addEventListener('click',()=>openSettings());q('.brand').addEventListener('click',event=>{event.preventDefault();q('#guide-next').hidden=false;show(0);});document.querySelectorAll('[data-settings]').forEach(button=>button.addEventListener('click',()=>openSettings(button.dataset.settings)));
 chrome.storage.local.get('welcomeProgress').then(data=>show(Math.max(0,Math.min(5,Number(data.welcomeProgress)||0))));
})();
