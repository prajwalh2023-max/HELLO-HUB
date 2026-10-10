import { useMemo, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import {
  Activity as Pulse, GitPullRequest, Users, Clock3, CircleAlert, Gauge, Zap, ChevronDown,
  ChevronRight, RefreshCw, Search, Settings, LayoutDashboard,
  GitBranch, MessageSquareText, Bug, Scale, Network, Flame, TrendingUp, Lightbulb,
  PanelLeftClose, PanelLeftOpen, ArrowRight, X, Check,
  CalendarDays, Info, MoreHorizontal, Sparkles, CircleHelp
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend
} from 'recharts';

type Developer = { id:string; name:string; role:string; avatarColor:string };
type Repository = { id:string; name:string };
type Activity = { id:string; developerId:string; repositoryId:string; type:'pr'|'review'|'issue'; createdAt:string; mergedAt?:string; reviewedAt?:string; filesChanged:string[]; linesAdded:number; linesRemoved:number; interruptionMinutes?:number };

const developers:Developer[] = [
  {id:'d1',name:'Maya Chen',role:'Staff engineer',avatarColor:'#6ea8ff'},
  {id:'d2',name:'Jonah Reed',role:'Platform engineer',avatarColor:'#a28aff'},
  {id:'d3',name:'Priya Nair',role:'Frontend engineer',avatarColor:'#55d4c3'},
  {id:'d4',name:'Theo Martin',role:'Backend engineer',avatarColor:'#f0b766'},
  {id:'d5',name:'Ari Kim',role:'Product engineer',avatarColor:'#f17da7'},
  {id:'d6',name:'Sam Okafor',role:'Engineering lead',avatarColor:'#71c2ef'},
];
const repositories:Repository[] = [
  {id:'r1',name:'platform-api'},{id:'r2',name:'web-console'},{id:'r3',name:'event-pipeline'},{id:'r4',name:'design-system'}
];
const filePool = ['src/auth/session.ts','src/api/handlers.ts','src/components/DeployPanel.tsx','src/hooks/useQuery.ts','src/jobs/consumer.ts','src/styles/tokens.css','src/routes/settings.tsx','src/db/migrations/042.sql','src/telemetry/trace.ts','src/components/ReviewQueue.tsx','src/cache/redis.ts','src/workers/scheduler.ts'];
const activity:Activity[] = (() => {
  const rows:Activity[]=[];
  const base = new Date('2025-02-01T09:00:00Z');
  for(let i=0;i<192;i++){
    const day=(i*7+Math.floor(i/6)*3)%84;
    const date=new Date(base.getTime()+day*86400000+((i*37)%10+8)*3600000);
    const type:Activity['type']=i%9===0?'issue':i%4===0?'review':'pr';
    const created=date.toISOString();
    const delay=type==='pr'?((i*13)%4+1):((i*11)%3);
    const merged=type==='pr'&&i%13!==0?new Date(date.getTime()+delay*86400000+((i*19)%8)*3600000).toISOString():undefined;
    const reviewed=type==='review'?new Date(date.getTime()+((i*17)%30+2)*3600000).toISOString():undefined;
    rows.push({
      id:`a${i+1}`,developerId:developers[(i*5+Math.floor(i/4))%developers.length].id,
      repositoryId:repositories[(i*3+Math.floor(i/7))%repositories.length].id,type,createdAt:created,
      mergedAt:merged,reviewedAt:reviewed,filesChanged:[filePool[(i*3)%filePool.length],filePool[(i*3+5)%filePool.length],...(i%3===0?[filePool[(i*3+8)%filePool.length]]:[])],
      linesAdded:(i*47)%380+18,linesRemoved:(i*23)%150+4,interruptionMinutes:i%5===0?(i*7)%58+8:(i*3)%24
    });
  }
  return rows;
})();
const nav = [
  {title:'Workspace',items:[['/','Overview',LayoutDashboard],['/developers','Developers',Users],['/pull-requests','Pull requests',GitPullRequest],['/reviews','Reviews',MessageSquareText],['/issues','Issues',Bug]]},
  {title:'Signals',items:[['/workload','Workload',Scale],['/collaboration','Collaboration',Network],['/hotspots','Hotspots',Flame],['/fss-pri','FSS & PRI',Gauge],['/trends','Trends',TrendingUp],['/insights','Insights',Lightbulb]]},
  {title:'Configure',items:[['/settings','Settings',Settings]]}
] as const;
const titles:Record<string,{title:string;sub:string}> = {
  '/':{title:'Engineering pulse',sub:'A clear read on how work is moving across your repositories.'},
  '/developers':{title:'Developer comparison',sub:'Compare work patterns in context — never as an individual scorecard.'},
  '/pull-requests':{title:'Pull request flow',sub:'Throughput, merge time and aging work across the selected window.'},
  '/reviews':{title:'Review response',sub:'Understand review latency and how attention moves through the team.'},
  '/issues':{title:'Issue activity',sub:'Issue work alongside delivery flow, from opened to resolved.'},
  '/workload':{title:'Workload distribution',sub:'See how activity and change volume are spread across the team.'},
  '/collaboration':{title:'Collaboration map',sub:'Shared work patterns across people and repositories.'},
  '/hotspots':{title:'Change hotspots',sub:'Files touched most often in this demo window.'},
  '/fss-pri':{title:'Focus & recovery',sub:'Two illustrative signals for interruption patterns, with clear limits.'},
  '/trends':{title:'Historical trends',sub:'Explore how delivery signals shift through the selected period.'},
  '/insights':{title:'Computed insights',sub:'Small, data-derived prompts for a healthier engineering system.'},
  '/settings':{title:'Demo preferences',sub:'Tune this local synthetic workspace. No external connection is configured.'}
};
const palette=['#67a5ff','#a88cff','#4cd6c4','#f2b86b','#ec7daa','#76c6ed'];
const fmtPct=(n:number)=>`${Math.round(n)}%`;
const dateLabel=(s:string)=>new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const hoursBetween=(a:string,b?:string)=>b?Math.max(1,(new Date(b).getTime()-new Date(a).getTime())/3600000):0;
const average=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const queryClient=new QueryClient();

function AppShell(){
  const [path,setPath]=useLocation();
  const [collapsed,setCollapsed]=useState(false);
  const [repo,setRepo]=useState('all');
  const [range,setRange]=useState('30');
  const [refreshing,setRefreshing]=useState(false);
  const [lastRefresh,setLastRefresh]=useState(new Date());
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [settingsSaved,setSettingsSaved]=useState(false);
  const [demoBanner,setDemoBanner]=useState(true);
  const [settingsState,setSettingsState]=useState({showDemo:true,compareMode:'team',compact:false,refresh:'manual'});
  useEffect(()=>{const saved=localStorage.getItem('devpulse-prefs');if(saved){try{const prefs=JSON.parse(saved);setSettingsState(prefs);setDemoBanner(prefs.showDemo!==false)}catch{}}},[]);
  const cutoff=useMemo(()=>new Date('2025-04-26T23:59:59Z').getTime()-Number(range)*86400000,[range]);
  const filtered=useMemo(()=>activity.filter(a=>new Date(a.createdAt).getTime()>=cutoff&&(repo==='all'||a.repositoryId===repo)),[cutoff,repo]);
  const periodText=range==='90'?'last 90 days':`last ${range} days`;
  const summary=useMemo(()=>{
    const prs=filtered.filter(a=>a.type==='pr'),merged=prs.filter(a=>a.mergedAt);
    const reviews=filtered.filter(a=>a.type==='review'&&a.reviewedAt);
    const stale=prs.filter(a=>!a.mergedAt&&hoursBetween(a.createdAt,'2025-04-26T23:59:59Z')>72);
    const allMins=filtered.map(a=>a.interruptionMinutes||0);
    const focus=allMins.length?Math.max(18,Math.min(92,100-(average(allMins)/60*100))):0;
    const pri=filtered.length?Math.max(24,Math.min(94,100-average(filtered.map(a=>a.interruptionMinutes||0))*1.15)):0;
    return {developers:new Set(filtered.map(a=>a.developerId)).size,prs:merged.length,lead:average(merged.map(a=>hoursBetween(a.createdAt,a.mergedAt)))/24,response:average(reviews.map(a=>hoursBetween(a.createdAt,a.reviewedAt))),stale:prs.length?stale.length/prs.length*100:0,fss:focus,pri,open:prs.length-merged.length, reviews:reviews.length};
  },[filtered]);
  const chartData=useMemo(()=>{
    const count=range==='7'?7:range==='30'?15:13;
    const step=Number(range)===7?1:Number(range)===30?2:7;
    return Array.from({length:count},(_,idx)=>{
      const day=new Date(cutoff+(idx*step+1)*86400000);
      const end=day.getTime()+step*86400000;
      const rows=filtered.filter(a=>new Date(a.createdAt).getTime()>=day.getTime()&&new Date(a.createdAt).getTime()<end);
      return {date:day.toLocaleDateString('en-US',{month:'short',day:'numeric'}),prs:rows.filter(a=>a.type==='pr'&&a.mergedAt).length,reviews:rows.filter(a=>a.type==='review').length,issues:rows.filter(a=>a.type==='issue').length,added:rows.reduce((n,a)=>n+a.linesAdded,0)};
    });
  },[filtered,cutoff,range]);
  const byDeveloper=useMemo(()=>developers.map(d=>{
    const rows=filtered.filter(a=>a.developerId===d.id),prs=rows.filter(a=>a.type==='pr');
    const merged=prs.filter(a=>a.mergedAt),reviews=rows.filter(a=>a.type==='review'&&a.reviewedAt);
    return {...d,activity:rows.length,prs:merged.length,reviews:reviews.length,lead:average(merged.map(a=>hoursBetween(a.createdAt,a.mergedAt)))/24,fss:rows.length?Math.max(18,100-average(rows.map(a=>a.interruptionMinutes||0))/60*100):0,added:rows.reduce((n,a)=>n+a.linesAdded,0)};
  }),[filtered]);
  const files=useMemo(()=>{
    const map=new Map<string,{name:string;touches:number;added:number}>();
    filtered.forEach(a=>a.filesChanged.forEach(f=>{const old=map.get(f)||{name:f,touches:0,added:0};old.touches++;old.added+=a.linesAdded/a.filesChanged.length;map.set(f,old)}));
    return [...map.values()].sort((a,b)=>b.touches-a.touches).slice(0,9);
  },[filtered]);
  const recommendations=useMemo(()=>{
    const picks:{id:string;title:string;body:string;kind:string}[]=[];
    if(summary.stale>13)picks.push({id:'stale',title:'Aging work is accumulating',body:`${summary.stale.toFixed(0)}% of open pull requests are older than 72 hours. Try a short queue review or split oversized work.`,kind:'Flow'});
    if(summary.response>10)picks.push({id:'response',title:'Review attention may be arriving late',body:`Median-style team average response is ${summary.response.toFixed(1)} hours in this sample. A rotating review window could make requests easier to notice.`,kind:'Reviews'});
    const busiest=byDeveloper.slice().sort((a,b)=>b.activity-a.activity)[0];
    if(busiest&&busiest.activity>filtered.length/3)picks.push({id:'concentration',title:'Activity is concentrated',body:`${busiest.name} appears in ${fmtPct(busiest.activity/Math.max(1,filtered.length)*100)} of sampled events. Check for hidden ownership dependencies — this is not a performance judgment.`,kind:'Workload'});
    if(!picks.length)picks.push({id:'steady',title:'No pronounced flow friction surfaced',body:'The selected sample is relatively balanced. Keep watching the shape over time rather than optimizing for a single number.',kind:'Signal'});
    return picks;
  },[summary,byDeveloper,filtered.length]);
  const refresh=()=>{setRefreshing(true);window.setTimeout(()=>{setRefreshing(false);setLastRefresh(new Date())},650)};
  const page=titles[path]||titles['/'];
  const collab=useMemo(()=>{
    const edges=new Map<string,number>();
    filtered.forEach(a=>{const key=`${a.developerId}:${a.repositoryId}`;edges.set(key,(edges.get(key)||0)+1)});
    return edges;
  },[filtered]);
  const dataProps={filtered,summary,chartData,byDeveloper,files,recommendations,repo,range,periodText,collab,dismissed,setDismissed,setPath,settingsSaved,setSettingsSaved,demoBanner,setDemoBanner,setRange,settingsState,setSettingsState};
  return <div className="app-shell flex">
    <aside className={`sidebar fixed z-30 inset-y-0 left-0 flex flex-col transition-all duration-300 ${collapsed?'w-[74px]':'w-[248px]'}`}>
      <div className="h-[72px] flex items-center px-5 gap-3 border-b border-white/[.07]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 flex items-center justify-center shadow-[0_0_24px_rgba(76,137,255,.26)]"><Pulse size={19} className="text-white"/></div>
        {!collapsed&&<div><div className="font-extrabold tracking-tight text-[16px]">dev<span className="text-blue-400">pulse</span></div><div className="text-[9px] tracking-[.18em] uppercase text-slate-500">Engineering observability</div></div>}
      </div>
      <div className="mx-3 mt-4 mb-2 rounded-xl border border-blue-300/10 bg-blue-400/[.07] p-2.5 flex items-center gap-2.5">
        <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-cyan-300 opacity-70 animate-ping"/><span className="relative inline-flex rounded-full w-2 h-2 bg-cyan-300"/></span>
        {!collapsed&&<div className="min-w-0"><div className="text-[11px] font-semibold text-blue-100">Demo workspace</div><div className="text-[9px] text-slate-500">Synthetic activity only</div></div>}
        {!collapsed&&<span className="ml-auto text-[8px] tracking-wider text-cyan-300 border border-cyan-300/20 rounded px-1.5 py-0.5">DEMO</span>}
      </div>
      <nav className="flex-1 px-3 py-2 overflow-y-auto soft-scroll">
        {nav.map(group=><div key={group.title} className="mb-5">
          {!collapsed&&<div className="px-3 mb-2 text-[9px] uppercase tracking-[.17em] font-bold text-slate-600">{group.title}</div>}
          <div className="space-y-1">{group.items.map(([href,label,Icon])=><Link key={href} href={href} className={`nav-link flex items-center gap-3 rounded-lg px-3 py-[9px] text-[12px] font-semibold ${path===href?'active':'text-slate-400'}`} data-testid={`nav-${href==='/'?'overview':href.slice(1)}`} title={collapsed?label:undefined}><Icon size={16} strokeWidth={1.8}/>{!collapsed&&<span>{label}</span>}{path===href&&!collapsed&&<span className="ml-auto w-1 h-1 rounded-full bg-blue-300"/>}</Link>)}</div>
        </div>)}
      </nav>
      <div className="p-3 border-t border-white/[.07]">
        {!collapsed&&<div className="flex items-center gap-2.5 px-2 py-2"><div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500/70 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">EL</div><div><div className="text-[11px] font-semibold">Engineering lead</div><div className="text-[9px] text-slate-500">Local demo session</div></div><MoreHorizontal size={16} className="ml-auto text-slate-500"/></div>}
        <button data-testid="button-collapse-sidebar" onClick={()=>setCollapsed(!collapsed)} className="w-full mt-1 text-slate-500 hover:text-slate-200 flex items-center justify-center rounded-lg hover:bg-white/[.05] h-8">{collapsed?<PanelLeftOpen size={16}/>:<><PanelLeftClose size={16}/><span className="text-[10px] ml-2">Collapse sidebar</span></>}</button>
      </div>
    </aside>
    <div className={`min-w-0 flex-1 transition-[margin] duration-300 ${collapsed?'ml-[74px]':'ml-[248px]'}`}>
      <header className="sticky top-0 z-20 h-[72px] border-b border-white/[.07] bg-[#111827]/90 backdrop-blur-xl flex items-center justify-between px-7 max-md:px-4">
        <div className="flex items-center gap-3 text-[11px] text-slate-500"><span className="text-slate-600">Workspace</span><ChevronRight size={13}/><span className="text-slate-200 font-semibold">{page.title}</span></div>
        <div className="flex items-center gap-2.5">
          <label className="hidden sm:flex items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.025] px-2.5 h-9">
            <GitBranch size={14} className="text-slate-500"/><select data-testid="select-repository" value={repo} onChange={e=>setRepo(e.target.value)} className="bg-transparent text-[11px] text-slate-300 outline-none max-w-[130px]"><option value="all">All repositories</option>{repositories.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><ChevronDown size={12} className="text-slate-600"/>
          </label>
          <label className="hidden md:flex items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.025] px-2.5 h-9"><CalendarDays size={14} className="text-slate-500"/><select data-testid="select-date-range" value={range} onChange={e=>setRange(e.target.value)} className="bg-transparent text-[11px] text-slate-300 outline-none"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><ChevronDown size={12} className="text-slate-600"/></label>
          <button data-testid="button-refresh" onClick={refresh} className="h-9 w-9 rounded-lg border border-white/[.08] hover:border-blue-300/30 hover:bg-blue-300/[.06] text-slate-400 flex items-center justify-center" title={`Updated ${lastRefresh.toLocaleTimeString()}`}><RefreshCw size={15} className={refreshing?'animate-spin':''}/></button>
          <div className="hidden lg:flex items-center gap-2 border-l border-white/[.09] pl-3 ml-1"><span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,.5)]"/><span className="text-[10px] text-slate-500">Local demo data</span></div>
        </div>
      </header>
      <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-white/[.06] bg-[#111827]/75">
        <label className="flex-1 flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.025] px-2 h-8"><GitBranch size={12} className="text-slate-500"/><select data-testid="select-repository-mobile" value={repo} onChange={e=>setRepo(e.target.value)} className="w-full bg-transparent text-[10px] text-slate-300 outline-none"><option value="all">All repositories</option>{repositories.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="flex-1 flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.025] px-2 h-8"><CalendarDays size={12} className="text-slate-500"/><select data-testid="select-date-range-mobile" value={range} onChange={e=>setRange(e.target.value)} className="w-full bg-transparent text-[10px] text-slate-300 outline-none"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
      </div>
      <main className={`max-w-[1600px] mx-auto ${settingsState.compact?'p-5 max-md:p-3':'p-7 max-md:p-4'}`}>
        {demoBanner&&<div className="mb-5 px-4 py-2.5 rounded-lg border border-blue-300/15 bg-blue-400/[.055] flex items-center gap-2.5 text-[10px] text-blue-100/80" data-testid="status-demo-banner"><Info size={14} className="text-blue-300 shrink-0"/><span><b className="text-blue-200">DEMO DATA</b> — Every value below is computed from synthetic repository activity. Nothing is connected to GitHub or a live activity source.</span><button onClick={()=>{setDemoBanner(false);setSettingsState({...settingsState,showDemo:false})}} data-testid="button-dismiss-demo-banner" className="ml-auto text-slate-500 hover:text-white"><X size={14}/></button></div>}
        <div className="mb-6 flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-[25px] max-sm:text-[21px] font-extrabold tracking-[-.04em]">{page.title}</h1><span className="text-[8px] uppercase tracking-[.12em] bg-blue-300/10 text-blue-200 border border-blue-300/15 rounded px-1.5 py-1">Synthetic</span></div><p className="mt-1.5 text-[12px] text-slate-500">{page.sub}</p></div><div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-500 bg-white/[.025] border border-white/[.06] rounded-lg px-3 py-2"><span className="font-mono text-slate-400">{filtered.length}</span> events <span className="text-slate-700">/</span> {periodText}</div></div>
        {refreshing?<LoadingState/>:<PageContent path={path} {...dataProps}/>}
      </main>
      <footer className="max-w-[1600px] mx-auto px-7 pb-7 max-md:px-4 text-[9px] text-slate-600 flex justify-between gap-3"><span>DevPulse is a demo observability surface, not a personnel evaluation tool.</span><span>Sample window ends Apr 26, 2025</span></footer>
    </div>
  </div>;
}

function LoadingState(){return <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse" data-testid="status-loading"><div className="glass rounded-xl h-28 md:col-span-4"/><div className="glass rounded-xl h-72 md:col-span-3"/><div className="glass rounded-xl h-72"/></div>}
function Panel({title,subtitle,children,action,className=''}:{title:string;subtitle?:string;children:any;action?:any;className?:string}){
  return <section className={`glass rounded-xl p-5 ${className}`}><div className="flex items-start justify-between mb-4"><div><h2 className="font-bold text-[13px]">{title}</h2>{subtitle&&<p className="text-[10px] text-slate-500 mt-1">{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function Kpi({label,value,delta,icon:Icon,color,foot}:{label:string;value:string;delta:string;icon:any;color:string;foot:string}){
  return <div className="glass rounded-xl px-4 py-4 min-h-[118px] relative overflow-hidden group hover:border-blue-300/20 transition-colors" data-testid={`metric-${label.toLowerCase().replaceAll(' ','-')}`}><div className={`absolute right-3 top-3 w-8 h-8 rounded-lg flex items-center justify-center ${color}`}><Icon size={16}/></div><div className="text-[10px] text-slate-500 font-semibold">{label}</div><div className="text-[25px] font-extrabold tracking-[-.04em] mt-2">{value}</div><div className="mt-1.5 flex items-center gap-1.5 text-[9px]"><span className="text-cyan-300">{delta}</span><span className="text-slate-600">{foot}</span></div></div>
}
function ChartTip({active,payload,label}:{active?:boolean;payload?:any[];label?:string}){if(!active||!payload?.length)return null;return <div className="rounded-lg border border-slate-600/50 bg-[#101827] shadow-xl p-3 text-[10px]"><div className="text-slate-400 mb-1.5">{label}</div>{payload.map((p,i)=><div key={i} className="flex items-center gap-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full" style={{background:p.color}}/><span className="text-slate-300">{p.name}</span><b className="ml-3 text-white">{p.value}</b></div>)}</div>}
function PageContent(p:any){
 const {path,filtered,summary,chartData,byDeveloper,files,recommendations,repo,range,periodText,collab,dismissed,setDismissed,setPath,settingsSaved,setSettingsSaved}=p;
 const [chartMode,setChartMode]=useState<'activity'|'code'>('activity');
 const [selectedDevs,setSelectedDevs]=useState<string[]>(['d1','d2','d3']);
 const [trendMetric,setTrendMetric]=useState('prs');
 const settings=p.settingsState;
 const setSettings=p.setSettingsState;
 const [search,setSearch]=useState('');
 const [expanded,setExpanded]=useState<string|null>(null);
 const toggleDev=(id:string)=>setSelectedDevs(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 const metrics=[
  {label:'Developers active',value:String(summary.developers),delta:'in window',icon:Users,color:'bg-blue-400/10 text-blue-300',foot:'contributing'},
  {label:'Merged PRs',value:String(summary.prs),delta:'synthetic',icon:GitPullRequest,color:'bg-violet-400/10 text-violet-300',foot:'throughput'},
  {label:'Lead time',value:`${summary.lead.toFixed(1)}d`,delta:'created → merged',icon:Clock3,color:'bg-cyan-400/10 text-cyan-300',foot:'average duration'},
  {label:'Review response',value:`${summary.response.toFixed(1)}h`,delta:'created → reviewed',icon:MessageSquareText,color:'bg-amber-400/10 text-amber-300',foot:'average delay'},
  {label:'Stale work ratio',value:fmtPct(summary.stale),delta:'open > 72 hours',icon:CircleAlert,color:'bg-rose-400/10 text-rose-300',foot:`${summary.open} open PRs`},
  {label:'Focus stability',value:fmtPct(summary.fss),delta:'illustrative FSS',icon:Gauge,color:'bg-sky-400/10 text-sky-300',foot:'focus-time share'},
  {label:'Recovery index',value:fmtPct(summary.pri),delta:'illustrative PRI',icon:Zap,color:'bg-teal-400/10 text-teal-300',foot:'recovery proxy'},
 ];
 const visibleRecs=recommendations.filter((r:any)=>!dismissed.includes(r.id));
 const issueRows=filtered.filter((a:Activity)=>a.type==='issue').slice().sort((a:Activity,b:Activity)=>b.createdAt.localeCompare(a.createdAt));
 const prRows=filtered.filter((a:Activity)=>a.type==='pr').slice().sort((a:Activity,b:Activity)=>b.createdAt.localeCompare(a.createdAt));
 const reviews=filtered.filter((a:Activity)=>a.type==='review').slice().sort((a:Activity,b:Activity)=>b.createdAt.localeCompare(a.createdAt));
 const options=(key:string)=>{setExpanded(expanded===key?null:key)};
  if(filtered.length===0&&path!=='/settings'&&path!=='/fss-pri')return <div className="glass rounded-2xl py-16 px-6 text-center enter" data-testid="status-empty"><div className="w-12 h-12 mx-auto rounded-xl bg-blue-400/10 flex items-center justify-center text-blue-300"><Search size={21}/></div><h2 className="font-bold mt-4">No sample activity in this slice</h2><p className="text-[11px] text-slate-500 mt-2">Try another repository or a wider date range. This demo window contains activity between February and April 2025.</p><button onClick={()=>p.setRange('90')} className="mt-4 rounded-lg px-3 py-2 bg-blue-500/15 text-blue-200 text-[10px]" data-testid="button-expand-date-range">Show 90 days</button></div>;
 switch(path){
 case '/': return <div className="enter space-y-5">
   <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">{metrics.map(x=><Kpi key={x.label} {...x}/>)}</div>
   <div className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-4">
    <Panel title="Work moving through the system" subtitle={`Synthetic pull requests and reviews · ${periodText}`} className="min-h-[330px]" action={<div className="flex rounded-lg border border-white/[.08] bg-[#101725] p-1"><button data-testid="chart-control-activity" onClick={()=>setChartMode('activity')} className={`text-[9px] px-2.5 py-1 rounded-md ${chartMode==='activity'?'bg-blue-400/15 text-blue-200':'text-slate-500'}`}>Activity</button><button data-testid="chart-control-code" onClick={()=>setChartMode('code')} className={`text-[9px] px-2.5 py-1 rounded-md ${chartMode==='code'?'bg-blue-400/15 text-blue-200':'text-slate-500'}`}>Code volume</button></div>}>
      <div className="flex gap-4 mb-2 text-[9px] text-slate-400"><span className="flex items-center gap-1.5"><i className="w-2 h-2 bg-blue-400 rounded-full"/>{chartMode==='activity'?'Merged PRs':'Lines added'}</span>{chartMode==='activity'&&<span className="flex items-center gap-1.5"><i className="w-2 h-2 bg-violet-400 rounded-full"/>Reviews</span>}</div>
      <div className="h-[235px] w-full"><ResponsiveContainer width="100%" height="100%">{chartMode==='activity'?<AreaChart data={chartData} margin={{top:10,right:8,left:-22,bottom:0}}><defs><linearGradient id="prsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#67a5ff" stopOpacity={.28}/><stop offset="100%" stopColor="#67a5ff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="date" tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Area type="monotone" dataKey="prs" name="Merged PRs" stroke="#67a5ff" strokeWidth={2} fill="url(#prsFill)" activeDot={{r:4}}/><Area type="monotone" dataKey="reviews" name="Reviews" stroke="#a88cff" strokeWidth={1.8} fill="transparent" activeDot={{r:3}}/></AreaChart>:<BarChart data={chartData} margin={{top:10,right:8,left:-22,bottom:0}}><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="date" tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Bar dataKey="added" name="Lines added" fill="#4cd6c4" radius={[3,3,0,0]}/></BarChart>}</ResponsiveContainer></div>
     <div className="text-[9px] text-slate-600 mt-2">Aggregated by date bucket. Volume is not a proxy for value or individual performance.</div>
    </Panel>
    <Panel title="Signals to look at" subtitle="Computed from the same filtered sample" action={<Link href="/insights" className="text-[9px] text-blue-300 flex items-center gap-1">All insights <ArrowRight size={12}/></Link>}>
      {visibleRecs.length?<div className="space-y-2.5">{visibleRecs.slice(0,3).map((r:any)=><div key={r.id} className="rounded-lg border border-white/[.06] bg-white/[.018] p-3 group" data-testid={`insight-${r.id}`}><div className="flex gap-2"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"/><div className="min-w-0"><div className="text-[11px] font-bold">{r.title}</div><p className="text-[9px] leading-relaxed text-slate-500 mt-1">{r.body}</p><span className="mt-2 inline-flex text-[8px] text-slate-500 rounded bg-white/[.04] px-1.5 py-1">{r.kind}</span></div><button onClick={()=>setDismissed((d:string[])=>[...d,r.id])} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white" data-testid={`button-dismiss-${r.id}`} title="Dismiss"><X size={13}/></button></div></div>)}</div>:<div className="py-8 text-center text-[10px] text-slate-500">All surfaced prompts dismissed. The underlying metrics remain available.</div>}
      <div className="mt-3 pt-3 border-t border-white/[.06] flex items-center gap-2 text-[9px] text-slate-600"><Info size={12}/>Prompts describe system patterns, not people.</div>
    </Panel>
   </div>
   <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
    <Panel title="Where change is landing" subtitle="Most frequently touched paths in this sample" action={<Link href="/hotspots" className="text-[9px] text-blue-300">Explore hotspots</Link>}>
      <div className="space-y-3">{files.slice(0,5).map((f:any,i:number)=><div key={f.name} className="grid grid-cols-[22px_minmax(0,1fr)_70px_34px] items-center gap-2 text-[10px]"><span className="text-slate-600 font-mono">{String(i+1).padStart(2,'0')}</span><span className="truncate text-slate-300 font-mono">{f.name}</span><div className="h-1.5 rounded-full bg-slate-700/70 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{width:`${f.touches/Math.max(1,files[0]?.touches)*100}%`}}/></div><span className="text-right text-slate-500">{f.touches}</span></div>)}</div>
    </Panel>
    <Panel title="Team activity, in context" subtitle="Recent synthetic events">
      <div className="space-y-3">{filtered.slice().sort((a:Activity,b:Activity)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4).map((a:Activity)=><ActivityRow key={a.id} item={a}/>)}</div>
    </Panel>
   </div>
 </div>;
 case '/developers': return <div className="enter space-y-4">
   <Panel title="Compare contributors" subtitle={settings.compareMode==='none'?'Comparison hints hidden by preference. Select contributors to inspect sampled event shapes.':settings.compareMode==='events'?'Event counts only. Differences may reflect role and ownership, not performance.':'Select people to compare sampled activity. Differences may reflect role, ownership or schedule — not performance.'} action={<span className="text-[9px] text-slate-500">{selectedDevs.length} selected</span>}>
   <div className="flex gap-2 flex-wrap mb-5">{byDeveloper.map((d:any)=><button key={d.id} data-testid={`toggle-developer-${d.id}`} onClick={()=>toggleDev(d.id)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] ${selectedDevs.includes(d.id)?'border-blue-300/30 bg-blue-300/10 text-blue-100':'border-white/[.07] text-slate-500'}`}><Avatar dev={d}/>{d.name}{selectedDevs.includes(d.id)&&<Check size={11}/>}</button>)}</div>
   <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={byDeveloper.filter((d:any)=>selectedDevs.includes(d.id))} margin={{left:-18,right:8}}><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="name" tick={{fill:'#98a5ba',fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Bar dataKey="prs" name="Merged PRs" fill="#67a5ff" radius={[4,4,0,0]}/><Bar dataKey="reviews" name="Reviews" fill="#a88cff" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
  </Panel>
  <Panel title="Context table" subtitle="Sample counts are not normalized for role, project complexity, or working time"><div className="overflow-x-auto soft-scroll"><table className="w-full min-w-[620px] text-left"><thead><tr className="text-[9px] uppercase tracking-wider text-slate-600 border-b border-white/[.06]"><th className="pb-3 font-semibold">Contributor</th><th className="pb-3 font-semibold">Events</th><th className="pb-3 font-semibold">Merged PRs</th><th className="pb-3 font-semibold">Reviews</th><th className="pb-3 font-semibold">Avg lead time</th><th className="pb-3 font-semibold">Added lines*</th></tr></thead><tbody>{byDeveloper.map((d:any)=><tr key={d.id} className="border-b border-white/[.04] text-[10px]" data-testid={`row-developer-${d.id}`}><td className="py-3"><div className="flex gap-2 items-center"><Avatar dev={d}/><div><div className="font-semibold text-slate-200">{d.name}</div><div className="text-[9px] text-slate-600">{d.role}</div></div></div></td><td className="text-slate-300">{d.activity}</td><td className="text-slate-300">{d.prs}</td><td className="text-slate-300">{d.reviews}</td><td className="text-slate-300">{d.lead.toFixed(1)}d</td><td className="font-mono text-slate-400">{d.added.toLocaleString()}</td></tr>)}</tbody></table></div><p className="mt-3 text-[9px] text-slate-600">*Line counts are synthetic and intentionally shown with context; line volume is not a quality signal.</p></Panel>
 </div>;
 case '/pull-requests': return <div className="enter grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
  <Panel title="Merged pull requests" subtitle="Merge events bucketed by sampled creation date" className="xl:col-span-2"><div className="h-[270px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{left:-20,right:10}}><defs><linearGradient id="mergeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#68a6ff" stopOpacity={.3}/><stop offset="1" stopColor="#68a6ff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="date" tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Area dataKey="prs" name="Merged PRs" stroke="#67a5ff" fill="url(#mergeFill)" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></Panel>
  <Panel title="Throughput summary" subtitle="Computed over selected slice"><div className="grid grid-cols-2 gap-3">{[['Merged',summary.prs],['Still open',summary.open],['Lead time',`${summary.lead.toFixed(1)} days`],['Stale >72h',fmtPct(summary.stale)]].map(([k,v]:any)=><div key={k} className="p-3 rounded-lg bg-white/[.025] border border-white/[.05]"><div className="text-[9px] text-slate-500">{k}</div><div className="mt-1 text-[18px] font-bold">{v}</div></div>)}</div></Panel>
  <Panel title="Recent pull request activity" subtitle="The synthetic sample does not contain real PR titles"><div className="space-y-2.5 max-h-[300px] overflow-y-auto soft-scroll">{prRows.slice(0,12).map((a:Activity)=><ActivityRow key={a.id} item={a}/>)}</div></Panel>
 </div>;
 case '/reviews': return <div className="enter grid grid-cols-1 xl:grid-cols-2 gap-4">
  <Panel title="Review response over time" subtitle="Average delay by sample date bucket"><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{left:-20,right:10}}><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="date" tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Area dataKey="reviews" name="Reviews received" stroke="#a88cff" fill="#a88cff22" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></Panel>
  <Panel title="Response signals" subtitle="Averages from synthetic reviewed events"><div className="flex items-center gap-5"><div className="relative w-32 h-32 rounded-full border-[10px] border-violet-400/15 flex items-center justify-center before:absolute before:inset-[-10px] before:rounded-full before:border-[10px] before:border-violet-400 before:border-r-transparent before:border-b-transparent before:rotate-[-20deg]"><div className="text-center"><div className="text-2xl font-extrabold">{summary.response.toFixed(1)}h</div><div className="text-[9px] text-slate-500">avg response</div></div></div><div className="space-y-2 text-[10px]"><div><span className="text-slate-500">Review records</span><b className="ml-3">{summary.reviews}</b></div><div><span className="text-slate-500">Event sample</span><b className="ml-3">{filtered.length}</b></div><p className="max-w-[230px] text-[9px] leading-relaxed text-slate-600">Response intervals are illustrative event-time gaps, not an SLA or assessment of reviewer effort.</p></div></div></Panel>
  <Panel title="Recent review events" subtitle="Synthetic timestamps and assignments" className="xl:col-span-2"><div className="grid md:grid-cols-2 gap-2">{reviews.slice(0,10).map((a:Activity)=><ActivityRow key={a.id} item={a}/>)}</div></Panel>
 </div>;
 case '/issues': return <div className="enter space-y-4">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi label="Issue events" value={String(issueRows.length)} delta="synthetic" icon={Bug} color="bg-rose-400/10 text-rose-300" foot="opened"/><Kpi label="Repositories" value={String(new Set(issueRows.map((a:Activity)=>a.repositoryId)).size)} delta="in slice" icon={GitBranch} color="bg-blue-400/10 text-blue-300" foot="with activity"/><Kpi label="Avg change size" value={`${Math.round(average(issueRows.map((a:Activity)=>a.linesAdded+a.linesRemoved)))} lines`} delta="added + removed" icon={ActivityIcon} color="bg-violet-400/10 text-violet-300" foot="per event"/><Kpi label="Active contributors" value={String(new Set(issueRows.map((a:Activity)=>a.developerId)).size)} delta="in sample" icon={Users} color="bg-teal-400/10 text-teal-300" foot="participating"/></div>
  <Panel title="Issue activity cadence" subtitle="Issue events compared with merged pull request cadence"><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{left:-20,right:10}}><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="date" tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Line dataKey="issues" name="Issue events" stroke="#f17da7" strokeWidth={2} dot={false}/><Line dataKey="prs" name="Merged PRs" stroke="#67a5ff" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></Panel>
  <Panel title="Issue sample" subtitle="Activity record details; no live ticket data"><div className="grid md:grid-cols-2 gap-2">{issueRows.slice(0,12).map((a:Activity)=><ActivityRow key={a.id} item={a}/>)}</div></Panel>
 </div>;
 case '/workload': return <div className="enter grid grid-cols-1 xl:grid-cols-2 gap-4">
  <Panel title="Activity share by contributor" subtitle="Event counts normalized to this sample"><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byDeveloper.map((d:any)=>({name:d.name,value:d.activity}))} dataKey="value" nameKey="name" innerRadius={72} outerRadius={112} paddingAngle={4} stroke="none">{byDeveloper.map((d:any,i:number)=><Cell key={d.id} fill={palette[i]}/>)}</Pie><Tooltip content={<ChartTip/>}/><Legend formatter={(v)=><span className="text-[10px] text-slate-400">{v}</span>}/></PieChart></ResponsiveContainer></div></Panel>
  <Panel title="Distribution by person" subtitle="Counts show visible work records, not effort"><div className="space-y-4">{byDeveloper.map((d:any,i:number)=><div key={d.id}><div className="flex items-center gap-2 mb-1.5"><Avatar dev={d}/><span className="text-[10px] text-slate-300">{d.name}</span><span className="ml-auto font-mono text-[10px] text-slate-400">{d.activity} events</span></div><div className="ml-7 h-1.5 rounded-full bg-slate-700/70"><div className="h-full rounded-full" style={{width:`${d.activity/Math.max(1,Math.max(...byDeveloper.map((x:any)=>x.activity)))*100}%`,background:palette[i]}}/></div></div>)}</div><div className="mt-5 rounded-lg bg-amber-300/[.06] border border-amber-300/10 p-3 text-[9px] text-amber-100/70"><Info size={12} className="inline mr-1.5"/>Distribution can reflect code ownership, role and event visibility. It is not a measure of individual contribution quality.</div></Panel>
  <Panel title="Repository contribution" subtitle="Synthetic events in currently selected repository" className="xl:col-span-2"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{repositories.map((r:Repository)=>{const n=filtered.filter((a:Activity)=>a.repositoryId===r.id).length;return <div className="rounded-lg border border-white/[.06] p-3" key={r.id}><div className="font-mono text-[10px] text-slate-300">{r.name}</div><div className="text-[22px] font-bold mt-2">{n}</div><div className="text-[9px] text-slate-600">activity events</div></div>})}</div></Panel>
 </div>;
 case '/collaboration': return <div className="enter space-y-4">
  <Panel title="Shared repository activity" subtitle="Presence of contributors in the same repository during the selected period — not direct communication">
   <div className="overflow-x-auto"><table className="w-full min-w-[600px] border-separate border-spacing-1"><thead><tr><th className="w-[145px]"/>{developers.map((d:any)=><th key={d.id} className="text-[9px] font-medium text-slate-500 pb-2">{d.name.split(' ')[0]}</th>)}</tr></thead><tbody>{developers.map((a:any,ai:number)=><tr key={a.id}><th className="text-left text-[10px] font-medium text-slate-300 pr-3 py-1">{a.name}</th>{developers.map((b:any,bi:number)=>{const v=ai===bi?byDeveloper.find((d:any)=>d.id===a.id)?.activity:repositories.reduce((sum,r)=>sum+Math.min(filtered.filter((x:Activity)=>x.developerId===a.id&&x.repositoryId===r.id).length,filtered.filter((x:Activity)=>x.developerId===b.id&&x.repositoryId===r.id).length),0);return <td key={b.id} className="text-center"><div className={`h-9 rounded-md flex items-center justify-center font-mono text-[9px] ${ai===bi?'bg-blue-400/15 text-blue-200':'text-slate-300'}`} style={ai===bi?{}:{background:`rgba(76,214,196,${Math.min(.38,v/14)})`}}>{ai===bi?'—':v}</div></td>})}</tr>)}</tbody></table></div>
   <div className="mt-3 flex items-center justify-between text-[9px] text-slate-600"><span>Cell intensity and value = shared repo event overlap (capped count).</span><span>Not a communication graph</span></div>
  </Panel>
  <Panel title="Repository overlap" subtitle="People with activity in each repository"><div className="grid md:grid-cols-2 gap-3">{repositories.map((r:Repository)=><div key={r.id} className="rounded-lg border border-white/[.06] p-3"><div className="font-mono text-[10px] text-cyan-200">{r.name}</div><div className="flex flex-wrap gap-2 mt-3">{developers.filter(d=>filtered.some((a:Activity)=>a.developerId===d.id&&a.repositoryId===r.id)).map(d=><span className="inline-flex gap-1.5 items-center text-[9px] px-2 py-1 rounded-full bg-white/[.04] text-slate-400" key={d.id}><Avatar dev={d}/>{d.name}</span>)}</div></div>)}</div></Panel>
 </div>;
 case '/hotspots': return <div className="enter grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
  <Panel title="Most touched files" subtitle="Touch counts computed from synthetic changed-file arrays"><div className="space-y-4">{files.map((f:any,i:number)=><div key={f.name} className="grid grid-cols-[24px_minmax(0,1fr)_75px] gap-2 items-center"><div className="text-[9px] font-mono text-slate-600">0{i+1}</div><div><div className="font-mono text-[10px] text-slate-300 truncate">{f.name}</div><div className="mt-1 h-1 rounded-full bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-blue-400" style={{width:`${f.touches/Math.max(1,files[0]?.touches)*100}%`}}/></div></div><div className="text-right"><b className="text-[11px]">{f.touches}</b><span className="text-[8px] text-slate-600 ml-1">touches</span></div></div>)}</div></Panel>
  <Panel title="Hotspot context" subtitle="Repeated changes can be expected in active ownership areas"><div className="space-y-3">{files.slice(0,4).map((f:any)=><div key={f.name} className="flex justify-between items-center py-2 border-b border-white/[.05]"><span className="font-mono text-[9px] text-slate-400 truncate max-w-[72%]">{f.name}</span><span className="text-[9px] text-cyan-200">{Math.round(f.added)} added*</span></div>)}</div><div className="mt-4 p-3 rounded-lg bg-violet-300/[.06] text-[9px] text-violet-100/65 border border-violet-300/10">Hotspot frequency may indicate important shared surfaces, not defects. Pair with change failure and ownership context before acting.</div></Panel>
  <Panel title="Changed-file event map" subtitle="Count of touches by synthetic repository" className="xl:col-span-2"><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={repositories.map((r:Repository)=>({repo:r.name,...Object.fromEntries(files.slice(0,4).map((f:any,i:number)=>[`file${i+1}`,filtered.filter((a:Activity)=>a.repositoryId===r.id&&a.filesChanged.includes(f.name)).length]))}))} margin={{left:-20,right:8}}><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="repo" tick={{fill:'#8794a9',fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/>{files.slice(0,4).map((f:any,i:number)=><Bar key={f.name} dataKey={`file${i+1}`} name={f.name.split('/').pop()} stackId="a" fill={palette[i]} />)}</BarChart></ResponsiveContainer></div></Panel>
 </div>;
 case '/fss-pri': return <div className="enter space-y-4">
  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[.055] p-4 flex gap-3 text-[10px] text-amber-100/75"><CircleHelp size={16} className="text-amber-300 shrink-0"/><div><b className="text-amber-200">Illustrative only — not validated productivity measures.</b><p className="mt-1 leading-relaxed">These demo formulas use recorded interruption minutes from synthetic activity. They cannot infer attention, quality, wellbeing, or the cause of an interruption. Do not use them to rank, evaluate, or compare people.</p></div></div>
   <div className="grid md:grid-cols-2 gap-4"><MetricFormula label="Focus Stability Score" short="FSS" value={fmtPct(summary.fss)} icon={Gauge} accent="blue" formula="clamp(18, 92, 100 × (1 − mean interruption minutes ÷ 60))" explain="Illustrative uninterrupted-focus-time share proxy. Event interruption minutes are averaged against a 60-minute reference block, then bounded to 18–92 for this demo."/><MetricFormula label="Productivity Recovery Index" short="PRI" value={fmtPct(summary.pri)} icon={Zap} accent="cyan" formula="clamp(24, 94, 100 − (mean interruption minutes × 1.15))" explain="Illustrative recovery-to-baseline proxy. Synthetic interruption minutes stand in for recovery delay; lower values raise the linear index, which does not observe real return-to-task time."/></div>
  <Panel title="Inputs behind the current values" subtitle={`${filtered.length} synthetic events · ${periodText}`}><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Mean interruption',`${average(filtered.map((a:Activity)=>a.interruptionMinutes||0)).toFixed(1)} min`],['Sample events',filtered.length],['Range cap','60 min'],['Repository filter',repo==='all'?'All repositories':repositories.find(r=>r.id===repo)?.name]].map(([k,v]:any)=><div key={k} className="p-3 rounded-lg bg-white/[.025] border border-white/[.05]"><div className="text-[9px] text-slate-500">{k}</div><div className="text-[13px] mt-1 font-semibold">{v}</div></div>)}</div><p className="text-[9px] leading-relaxed mt-4 text-slate-600">The synthetic interruption field is generated solely to demonstrate calculation behavior. Real work varies by task, schedule, role, and personal preference; simple linear proxies flatten that context.</p></Panel>
 </div>;
 case '/trends': return <div className="enter space-y-4">
  <Panel title="Signal history" subtitle="Synthetic event aggregation across the active window" action={<select data-testid="select-trend-metric" value={trendMetric} onChange={e=>setTrendMetric(e.target.value)} className="bg-[#111827] border border-white/[.08] rounded-lg px-2.5 py-2 text-[10px] text-slate-300 outline-none"><option value="prs">Merged pull requests</option><option value="reviews">Review events</option><option value="issues">Issue activity</option><option value="added">Lines added (demo)</option></select>}>
   <div className="h-[320px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{left:-20,right:12,top:8}}><CartesianGrid stroke="#ffffff0b" vertical={false}/><XAxis dataKey="date" tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#718096',fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Line type="monotone" dataKey={trendMetric} name={trendMetric==='prs'?'Merged PRs':trendMetric==='added'?'Lines added':trendMetric==='reviews'?'Reviews':'Issues'} stroke="#67a5ff" strokeWidth={2.5} dot={{r:2,fill:'#67a5ff',strokeWidth:0}} activeDot={{r:5}}/></LineChart></ResponsiveContainer></div>
  </Panel>
  <div className="grid md:grid-cols-3 gap-3"><TrendTile label="Merged PRs" value={summary.prs} note={`${periodText} · synthetic`} tone="blue"/><TrendTile label="Open work" value={summary.open} note={`${fmtPct(summary.stale)} older than 72h`} tone="rose"/><TrendTile label="Average lead time" value={`${summary.lead.toFixed(1)}d`} note="Created to merged" tone="cyan"/></div>
 </div>;
 case '/insights': return <div className="enter grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
  <Panel title="Recommendations from this sample" subtitle="Prompts are generated from current filters, not external intelligence">
   <div className="space-y-3">{recommendations.map((r:any,i:number)=><article key={r.id} className={`rounded-xl border p-4 ${dismissed.includes(r.id)?'border-white/[.05] opacity-45':'border-white/[.08] bg-white/[.02]'}`} data-testid={`card-recommendation-${r.id}`}><div className="flex items-start gap-3"><div className="w-8 h-8 shrink-0 rounded-lg bg-blue-400/10 text-blue-300 flex items-center justify-center"><Sparkles size={15}/></div><div className="flex-1"><div className="flex gap-2 items-center"><h3 className="text-[12px] font-bold">{r.title}</h3><span className="text-[8px] text-slate-500 rounded px-1.5 py-0.5 bg-white/[.05]">{r.kind}</span></div><p className="text-[10px] leading-relaxed text-slate-500 mt-1.5">{r.body}</p><div className="flex gap-2 mt-3"><button onClick={()=>setExpanded(expanded===r.id?null:r.id)} data-testid={`button-explain-${r.id}`} className="text-[9px] text-blue-300 hover:text-blue-200 flex items-center gap-1">{expanded===r.id?'Hide rationale':'Show rationale'} <ChevronDown size={11}/></button>{dismissed.includes(r.id)?<button onClick={()=>setDismissed((d:string[])=>d.filter(x=>x!==r.id))} className="text-[9px] text-slate-400">Restore</button>:<button onClick={()=>setDismissed((d:string[])=>[...d,r.id])} data-testid={`button-dismiss-rec-${r.id}`} className="text-[9px] text-slate-500 hover:text-slate-200">Dismiss</button>}</div>{expanded===r.id&&<div className="mt-3 rounded-lg p-3 bg-blue-300/[.05] border border-blue-300/10 text-[9px] text-blue-100/65">Calculated from the selected synthetic events for {periodText}. Try changing repository or window to see the prompt update. Use this as a conversation starter, never as a target.</div>}</div></div></article>)}</div>
  </Panel>
  <Panel title="How to use these signals" subtitle="System conditions over individual attribution"><div className="space-y-4">{[['01','Look for recurring patterns','A single slice is noisy. Compare across periods and pair with team context.'],['02','Ask what is hidden','Scope, ownership, review load, and on-call work are not fully represented.'],['03','Change the system','Use a prompt to explore queues, pairing, or interruption sources — not to score a person.']].map(([n,t,d])=><div key={n} className="flex gap-3"><span className="font-mono text-[10px] text-blue-300">{n}</span><div><b className="text-[10px]">{t}</b><p className="text-[9px] text-slate-500 mt-1 leading-relaxed">{d}</p></div></div>)}</div><div className="mt-5 rounded-lg p-3 border border-amber-300/10 bg-amber-300/[.045] text-[9px] text-amber-100/65">Demo-only recommendations. They do not know your team's goals or constraints.</div></Panel>
  <Panel title="Prompt status" subtitle="You can dismiss and restore prompts without changing the underlying data" className="xl:col-span-2"><div className="flex items-center gap-3"><div className="text-[22px] font-bold">{recommendations.length-dismissed.length}<span className="text-[10px] text-slate-500 font-normal ml-2">active</span></div><div className="h-1.5 flex-1 rounded-full bg-slate-700"><div className="h-full rounded-full bg-blue-400" style={{width:`${(recommendations.length-dismissed.length)/Math.max(1,recommendations.length)*100}%`}}/></div><button onClick={()=>setDismissed([])} data-testid="button-restore-insights" className="text-[9px] text-blue-300">Restore all</button></div></Panel>
 </div>;
 case '/settings': return <div className="enter max-w-[850px] space-y-4">
  <Panel title="Workspace data" subtitle="This dashboard has no GitHub integration or activity backend"><div className="flex items-center justify-between gap-4 py-2"><div><div className="text-[11px] font-semibold">Synthetic demo dataset</div><div className="text-[9px] text-slate-500 mt-1">192 generated events · 6 contributors · 4 repositories · Feb–Apr 2025</div></div><span className="text-[8px] rounded px-2 py-1 bg-cyan-300/10 text-cyan-200 border border-cyan-300/15">LOCAL ONLY</span></div><div className="mt-3 rounded-lg bg-white/[.025] p-3 font-mono text-[9px] text-slate-500">Data source: deterministic in-app seed<br/>Refresh action: recalculates view state only<br/>Persistence: preference toggles saved in this browser</div></Panel>
  <Panel title="Display preferences" subtitle="Controls apply to the current demo session">
   <div className="divide-y divide-white/[.06]">{[
    ['showDemo','Show synthetic data notice','Keep the demo disclosure visible across the dashboard.'],
    ['compact','Compact data density','Tighten list and table spacing for a denser scan.']
   ].map(([key,label,desc]:any)=><label key={key} className="flex items-center justify-between py-4 cursor-pointer"><div><div className="text-[11px] font-semibold">{label}</div><div className="text-[9px] text-slate-500 mt-1">{desc}</div></div><input data-testid={`setting-${key}`} type="checkbox" checked={settings[key as keyof typeof settings] as boolean} onChange={e=>{setSettings({...settings,[key]:e.target.checked});if(key==='showDemo')p.setDemoBanner(e.target.checked);p.setSettingsSaved(false)}} className="accent-blue-400 w-4 h-4"/></label>)}</div>
   <div className="py-4 border-t border-white/[.06] flex items-center justify-between"><div><div className="text-[11px] font-semibold">Automatic refresh</div><div className="text-[9px] text-slate-500 mt-1">There is no live source to poll in this demo.</div></div><select data-testid="setting-refresh" value={settings.refresh} onChange={e=>{setSettings({...settings,refresh:e.target.value});p.setSettingsSaved(false)}} className="rounded-lg bg-[#111827] border border-white/[.08] text-[10px] p-2 text-slate-300"><option value="manual">Manual only</option><option value="30">Every 30 minutes (demo)</option><option value="60">Every hour (demo)</option></select></div>
   <div className="py-4 border-t border-white/[.06] flex items-center justify-between"><div><div className="text-[11px] font-semibold">Comparison view</div><div className="text-[9px] text-slate-500 mt-1">Emphasize context when comparing activity.</div></div><select data-testid="setting-comparison-mode" value={settings.compareMode} onChange={e=>{setSettings({...settings,compareMode:e.target.value});p.setSettingsSaved(false)}} className="rounded-lg bg-[#111827] border border-white/[.08] text-[10px] p-2 text-slate-300"><option value="team">Team context</option><option value="events">Event counts</option><option value="none">Hide comparison hints</option></select></div>
   <div className="mt-2 flex items-center justify-between"><span className={`text-[9px] ${settingsSaved?'text-cyan-300':'text-slate-600'}`}>{settingsSaved?'Preferences saved in this browser':'Unsaved preference changes'}</span><button data-testid="button-save-settings" onClick={()=>{localStorage.setItem('devpulse-prefs',JSON.stringify(settings));setSettingsSaved(true)}} className="rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[10px] font-bold px-4 py-2.5 transition-colors">Save preferences</button></div>
  </Panel>
   <Panel title="Metric definitions" subtitle="Illustrative formulas surfaced on the FSS & PRI page"><div className="grid md:grid-cols-2 gap-3"><div className="rounded-lg border border-white/[.06] p-3"><b className="text-[10px]">FSS · Focus Stability Score</b><p className="font-mono text-[9px] text-blue-200 mt-2">clamp(18, 92, 100 × (1 − mean minutes ÷ 60))</p><p className="text-[9px] text-slate-500 mt-2">Uninterrupted focus-time share proxy; not a validated measure.</p></div><div className="rounded-lg border border-white/[.06] p-3"><b className="text-[10px]">PRI · Productivity Recovery Index</b><p className="font-mono text-[9px] text-cyan-200 mt-2">clamp(24, 94, 100 − mean minutes × 1.15)</p><p className="text-[9px] text-slate-500 mt-2">Recovery-to-baseline proxy; not a validated measure.</p></div></div></Panel>
 </div>;
 default:return <div className="glass rounded-xl p-8 text-center"><h2 className="font-bold">Unknown view</h2><p className="text-slate-500 text-xs mt-2">Choose a destination from the navigation.</p></div>;
 }
}
function ActivityIcon({size=16}:{size?:number}){return <Pulse size={size}/>}
function Avatar({dev}:{dev:any}){return <span className="inline-flex w-5 h-5 rounded-full items-center justify-center text-[7px] font-bold text-[#101522] shrink-0" style={{background:dev.avatarColor}}>{dev.name.split(' ').map((v:string)=>v[0]).join('')}</span>}
function ActivityRow({item}:{item:Activity}){
 const dev=developers.find(d=>d.id===item.developerId)!;const repo=repositories.find(r=>r.id===item.repositoryId)!;
 const label=item.type==='pr'?(item.mergedAt?'merged pull request':'opened pull request'):item.type==='review'?'submitted a review':'opened an issue';
 const Icon=item.type==='pr'?GitPullRequest:item.type==='review'?MessageSquareText:Bug;
 return <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[.025] transition-colors" data-testid={`activity-${item.id}`}><Avatar dev={dev}/><div className="min-w-0 flex-1"><div className="text-[9px] truncate"><b className="text-slate-300">{dev.name}</b><span className="text-slate-500"> {label} in </span><span className="text-blue-200">{repo.name}</span></div><div className="text-[8px] text-slate-600 mt-1">{dateLabel(item.createdAt)} · {item.filesChanged.length} files · +{item.linesAdded} / −{item.linesRemoved}</div></div><Icon size={14} className="text-slate-600 shrink-0"/></div>
}
function MetricFormula({label,short,value,icon:Icon,accent,formula,explain}:{label:string;short:string;value:string;icon:any;accent:string;formula:string;explain:string}){
 return <Panel title={label} subtitle={`Illustrative ${short}`}><div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent==='blue'?'bg-blue-400/10 text-blue-300':'bg-cyan-400/10 text-cyan-300'}`}><Icon size={22}/></div><div className="text-[36px] font-extrabold tracking-[-.05em]">{value}</div></div><div className="mt-5 rounded-lg bg-[#101725] border border-white/[.05] p-3"><div className="text-[8px] uppercase tracking-widest text-slate-600 mb-2">Demo formula</div><code className="text-[10px] text-blue-200">{formula}</code></div><p className="text-[10px] leading-relaxed text-slate-500 mt-4">{explain}</p></Panel>
}
function TrendTile({label,value,note,tone}:{label:string;value:any;note:string;tone:string}){return <div className="glass rounded-xl p-4"><div className="text-[9px] text-slate-500">{label}</div><div className={`text-[23px] font-extrabold mt-2 ${tone==='rose'?'text-rose-200':tone==='cyan'?'text-cyan-200':'text-blue-200'}`}>{value}</div><div className="text-[9px] text-slate-600 mt-1">{note}</div></div>}
function RoutedErrorBoundary({children}:{children:any}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>}
function Router(){return <RoutedErrorBoundary><Switch><Route path="/" component={AppShell}/><Route path="/developers" component={AppShell}/><Route path="/pull-requests" component={AppShell}/><Route path="/reviews" component={AppShell}/><Route path="/issues" component={AppShell}/><Route path="/workload" component={AppShell}/><Route path="/collaboration" component={AppShell}/><Route path="/hotspots" component={AppShell}/><Route path="/fss-pri" component={AppShell}/><Route path="/trends" component={AppShell}/><Route path="/insights" component={AppShell}/><Route path="/settings" component={AppShell}/><Route component={AppShell}/></Switch></RoutedErrorBoundary>}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>}
export default App;
