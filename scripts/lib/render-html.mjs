// Renders the self-contained, single-file interactive page. All data is inlined
// as JSON; the page does search / theme filtering / sort / expandable cards with
// vanilla JS and makes zero network requests (open it by double-click, offline).
//
// Per the export spec the page holds excerpt + one-line summary only; the full
// post text lives exclusively in the spreadsheet.

function embedJson(payload) {
  // Inside a <script type="application/json"> block the only thing that can end
  // it early is the sequence "</script>"; escaping "<" fully neutralizes it.
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

export function renderHtml(payload) {
  const data = embedJson(payload);
  const title = "LinkedIn Saved Posts";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{
  --bg:#f4f6f9; --panel:#ffffff; --ink:#0d1b2a; --muted:#5b6b7c; --faint:#8a98a8;
  --line:#e3e8ef; --line-strong:#d3dae3; --accent:#0a66c2; --accent-ink:#fff;
  --radius:14px; --shadow:0 1px 2px rgba(13,27,42,.04),0 6px 20px rgba(13,27,42,.06);
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  background:var(--bg); color:var(--ink); line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent); text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1180px; margin:0 auto; padding:0 20px}

header.top{
  position:sticky; top:0; z-index:20; background:rgba(244,246,249,.85);
  backdrop-filter:saturate(150%) blur(8px); border-bottom:1px solid var(--line);
}
.top-inner{padding:18px 0 14px}
.title{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap}
.title h1{font-size:21px; margin:0; letter-spacing:-.01em}
.title .meta{color:var(--muted); font-size:13px}

.controls{display:flex; gap:10px; align-items:center; margin-top:14px; flex-wrap:wrap}
.search{flex:1 1 260px; position:relative}
.search input{
  width:100%; padding:10px 12px 10px 36px; font-size:14px; color:var(--ink);
  background:var(--panel); border:1px solid var(--line-strong); border-radius:10px; outline:none;
}
.search input:focus{border-color:var(--accent); box-shadow:0 0 0 3px rgba(10,102,194,.12)}
.search svg{position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--faint)}
select{
  padding:10px 12px; font-size:14px; background:var(--panel); color:var(--ink);
  border:1px solid var(--line-strong); border-radius:10px; outline:none; cursor:pointer;
}
.count{color:var(--muted); font-size:13px; white-space:nowrap}

.themes{display:flex; gap:8px; flex-wrap:wrap; margin:14px 0 4px}
.chip{
  font-size:12.5px; padding:5px 11px; border-radius:999px; cursor:pointer; user-select:none;
  border:1px solid var(--line-strong); background:var(--panel); color:var(--muted);
  transition:background .12s,border-color .12s,color .12s;
}
.chip:hover{border-color:var(--accent)}
.chip .n{opacity:.6; margin-left:5px; font-variant-numeric:tabular-nums}
.chip.active{background:var(--accent); border-color:var(--accent); color:var(--accent-ink)}
.chip.active .n{opacity:.8}

main{padding:20px 0 64px}
.grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:16px}
.card{
  background:var(--panel); border:1px solid var(--line); border-radius:var(--radius);
  box-shadow:var(--shadow); padding:16px 16px 14px; display:flex; flex-direction:column;
}
.card-head{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px}
.theme-tag{font-size:11.5px; font-weight:600; padding:3px 9px; border-radius:999px; white-space:nowrap}
.date{font-size:12px; color:var(--faint); white-space:nowrap}
.author{font-weight:600; font-size:14.5px; line-height:1.3}
.role{font-size:12.5px; color:var(--muted); margin-top:1px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden}
.summary{margin:11px 0 8px; font-size:14px; color:var(--ink); font-weight:500}
.excerpt{font-size:13px; color:var(--muted); white-space:pre-wrap; overflow:hidden}
.excerpt.clamp{display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical}
.excerpt.empty-note{font-style:italic; color:var(--faint)}
.tags{display:flex; gap:6px; flex-wrap:wrap; margin-top:10px}
.tag{font-size:11px; color:var(--faint); background:var(--bg); border:1px solid var(--line); padding:2px 7px; border-radius:6px}
.card-foot{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; padding-top:11px; border-top:1px solid var(--line)}
.more{background:none; border:none; color:var(--accent); font-size:12.5px; cursor:pointer; padding:0; font-family:inherit}
.more:hover{text-decoration:underline}
.open{font-size:12.5px; font-weight:500}
.empty{text-align:center; color:var(--muted); padding:80px 20px}
.empty h2{font-weight:600; margin:0 0 6px; color:var(--ink)}
footer{color:var(--faint); font-size:12px; text-align:center; padding:8px 0 40px}
@media (max-width:520px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="top"><div class="wrap top-inner">
  <div class="title">
    <h1>LinkedIn Saved Posts</h1>
    <span class="meta" id="headline"></span>
  </div>
  <div class="controls">
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="q" type="search" placeholder="Search author, role, summary, hashtag…" autocomplete="off">
    </div>
    <select id="sort">
      <option value="new">Newest first</option>
      <option value="old">Oldest first</option>
      <option value="author">Author A–Z</option>
      <option value="theme">Theme</option>
    </select>
    <span class="count" id="count"></span>
  </div>
  <div class="themes" id="themes"></div>
</div></header>

<main class="wrap">
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" hidden><h2>No posts match</h2><p>Try a different search or clear the theme filters.</p></div>
</main>
<footer>Generated offline from your saved posts · full post text is in the spreadsheet.</footer>

<script id="payload" type="application/json">${data}</script>
<script>
(function(){
  const PAYLOAD = JSON.parse(document.getElementById("payload").textContent);
  const POSTS = PAYLOAD.posts;
  const THEMES = PAYLOAD.themes;

  const state = { q:"", sort:"new", themes:new Set() };

  const esc = (s)=>String(s==null?"":s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  // Deterministic color per theme name.
  function hue(name){let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;return h%360;}
  function themeStyle(name){
    if(name==="Other")return "background:#eef1f5;color:#5b6b7c";
    const h=hue(name);
    return "background:hsl("+h+",72%,95%);color:hsl("+h+",55%,32%)";
  }

  // --- theme chips ---
  const themesEl=document.getElementById("themes");
  function renderChips(){
    const all=document.createElement("span");
    all.className="chip"+(state.themes.size===0?" active":"");
    all.innerHTML='All <span class="n">'+POSTS.length+'</span>';
    all.onclick=()=>{state.themes.clear();update();};
    themesEl.appendChild(all);
    for(const t of THEMES){
      const c=document.createElement("span");
      c.className="chip"+(state.themes.has(t.name)?" active":"");
      c.innerHTML=esc(t.name)+' <span class="n">'+t.count+'</span>';
      c.onclick=()=>{state.themes.has(t.name)?state.themes.delete(t.name):state.themes.add(t.name);update();};
      themesEl.appendChild(c);
    }
  }

  function matches(p){
    if(state.themes.size && !state.themes.has(p.theme))return false;
    if(!state.q)return true;
    const q=state.q.toLowerCase();
    return [p.author,p.role,p.summary,p.excerpt,p.theme,(p.hashtags||[]).join(" ")]
      .some(v=>String(v||"").toLowerCase().includes(q));
  }

  function sortPosts(list){
    const by={
      new:(a,b)=>b.ts-a.ts,
      old:(a,b)=>a.ts-b.ts,
      author:(a,b)=>String(a.author||"~").localeCompare(String(b.author||"~")),
      theme:(a,b)=>String(a.theme).localeCompare(String(b.theme))||b.ts-a.ts,
    };
    return list.slice().sort(by[state.sort]||by.new);
  }

  function card(p){
    const tags=(p.hashtags||[]).slice(0,5).map(h=>'<span class="tag">#'+esc(h)+'</span>').join("");
    const role=p.role?'<div class="role">'+esc(p.role)+'</div>':"";
    const open=p.url?'<a class="open" href="'+esc(p.url)+'" target="_blank" rel="noopener">Open on LinkedIn ↗</a>':'<span></span>';
    const body=(p.summary||p.excerpt)
      ? (p.summary?'<div class="summary">'+esc(p.summary)+'</div>':"")+'<div class="excerpt clamp">'+esc(p.excerpt||"")+'</div>'
      : '<div class="excerpt empty-note">No text captured — open on LinkedIn.</div>';
    return '<article class="card">'
      +'<div class="card-head"><span class="theme-tag" style="'+themeStyle(p.theme)+'">'+esc(p.theme)+'</span><span class="date">'+esc(p.date||"")+'</span></div>'
      +'<div class="author">'+esc(p.author||"Unknown")+'</div>'+role
      +body
      +(tags?'<div class="tags">'+tags+'</div>':"")
      +'<div class="card-foot">'+open+(p.excerpt&&p.excerpt.length>140?'<button class="more">Show more</button>':'<span></span>')+'</div>'
      +'</article>';
  }

  const grid=document.getElementById("grid");
  const emptyEl=document.getElementById("empty");
  const countEl=document.getElementById("count");

  function update(){
    renderChipsState();
    const list=sortPosts(POSTS.filter(matches));
    countEl.textContent=list.length+(list.length===1?" post":" posts");
    if(!list.length){grid.innerHTML="";emptyEl.hidden=false;return;}
    emptyEl.hidden=true;
    grid.innerHTML=list.map(card).join("");
  }
  function renderChipsState(){
    themesEl.innerHTML="";renderChips();
  }

  // expand / collapse via delegation
  grid.addEventListener("click",(e)=>{
    if(!e.target.classList.contains("more"))return;
    const ex=e.target.closest(".card").querySelector(".excerpt");
    const open=ex.classList.toggle("clamp")===false;
    e.target.textContent=open?"Show less":"Show more";
  });

  let t;
  document.getElementById("q").addEventListener("input",(e)=>{
    clearTimeout(t);const v=e.target.value;t=setTimeout(()=>{state.q=v;update();},120);
  });
  document.getElementById("sort").addEventListener("change",(e)=>{state.sort=e.target.value;update();});

  document.getElementById("headline").textContent=
    PAYLOAD.total+" posts · "+THEMES.length+" themes · generated "+PAYLOAD.generatedAt;

  update();
})();
</script>
</body>
</html>`;
}
