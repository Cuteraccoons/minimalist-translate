async page=>{
 const worker=page.context().serviceWorkers()[0];
 const open=async(tab,url,html)=>{
  await tab.route('https://**/*',route=>route.fulfill({contentType:route.request().url().endsWith('.svg')?'image/svg+xml':'text/html',body:route.request().url().endsWith('.svg')?'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="60"><rect width="1200" height="60" fill="gray"/></svg>':html}));
  await tab.goto(url);
  await worker.evaluate(async url=>{const t=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<10;i++){try{await chrome.tabs.sendMessage(t.id,{action:'TOGGLE_READER_MODE'});return;}catch(e){if(i===9)throw e;await new Promise(r=>setTimeout(r,200));}}},url);
  await tab.waitForSelector('#reader-content');
 };
 const tab=await page.context().newPage();const results={};
 try{
  await open(tab,'https://reader-fixture.example/feedback','<main><article><h1>Reader regression</h1><h2>Section</h2><h3>'+('A long outline heading with multiple lines ').repeat(8)+'</h3><p>Article introduction with sufficient plain text to retain the article as the best content container.</p><figure><img src="https://reader-fixture.example/banner.svg" width="1000" height="50"></figure><pre><code><table class="hljs-ln"><tr><td class="hljs-ln-numbers">1</td><td class="hljs-ln-code">.grid {</td></tr><tr><td class="hljs-ln-numbers">2</td><td class="hljs-ln-code">  display: grid;</td></tr><tr><td class="hljs-ln-numbers">3</td><td class="hljs-ln-code">}</td></tr></table></code></pre><blockquote><p>A quoted paragraph is formatted with a small quotation mark and no vertical rule.</p></blockquote></article></main>');
  results.structure=await tab.evaluate(()=>{const r=document.querySelector('#raccoon-reader-root'),p=r.querySelector('.reader-code-block .reader-orig-p'),label=r.querySelectorAll('.reader-outline-label')[1];return {code:p?.textContent,codeColor:p&&getComputedStyle(p).color,tables:r.querySelectorAll('#reader-content table').length,images:r.querySelectorAll('.reader-img-wrap img').length,clamp:label&&getComputedStyle(label).webkitLineClamp,quoteBorder:getComputedStyle(r.querySelector('.reader-blockquote')).borderLeftWidth};});
  if(!results.structure.code?.includes('.grid {\n  display: grid;\n}')||results.structure.tables||results.structure.images!==1||results.structure.clamp!=='none'||results.structure.quoteBorder!=='0px')throw Error(JSON.stringify(results));
  await tab.close();
  const forum=await page.context().newPage();
  try{
   await open(forum,'https://www.reddit.com/r/test/comments/fixture','<main><shreddit-post><h1>A discussion</h1><p>The initial discussion post has enough text to remain readable in the reader view.</p></shreddit-post><shreddit-comment author="Parent"><img src="https://reader-fixture.example/avatar.svg" alt="avatar"><div slot="comment"><p>A parent reply with meaningful content and a clear author header.</p></div><shreddit-comment author="Child"><div slot="comment"><p>A nested response remains collapsible independently.</p></div></shreddit-comment></shreddit-comment></main>');
   results.forum={replies:await forum.locator('.reader-forum-reply').count(),avatars:await forum.locator('.reader-forum-avatar').count()};
   await forum.locator('.reader-forum-reply>summary').first().click();results.forum.collapsed=await forum.locator('.reader-forum-reply').first().evaluate(x=>!x.open);
   if(results.forum.replies!==2||results.forum.avatars!==1||!results.forum.collapsed)throw Error(JSON.stringify(results));
  }finally{await forum.close()}
 }finally{if(!tab.isClosed())await tab.close()}
 return results;
}
