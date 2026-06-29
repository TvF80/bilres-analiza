import { useMemo, useState, type ReactNode } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend, ReferenceLine, Cell,
} from 'recharts';
import grpRaw from '../data/grpData.json';
import type { GrpData, GroupRow, GroupKosztPrac } from '../types';
import { useLang } from '../i18n/LanguageContext';
import { MONTHS_SHORT as I18N_MONTHS_SHORT, MONTHS_FULL as I18N_MONTHS_FULL, t as i18nT } from '../i18n';
import { useCompanies } from '../store/CompaniesContext';

const staticGrpData = (grpRaw && (grpRaw as unknown as GrpData).groups?.length)
  ? grpRaw as unknown as GrpData
  : null;

// ── Kontur Polski — GPS→SVG, vp 480×520
// Projekcja: x=(lon-14.0)/10.2*440+20  y=(55.0-lat)/6.0*480+20
// Punkty wyznaczone z Natural Earth / OpenStreetMap (ok. 50 pkt granicznych)
// 51 punktów granicznych (Natural Earth / OSM), projekcja: x=(lon-14)/10.2*440+20  y=(55-lat)/6*480+20
const POLAND_PATH = 'M25.6,111.2 L29.5,86.4 L44.6,97.6 L75.2,86.4 L113.9,72.0 L150.1,52.0 L172.5,58.4 L206.5,33.6 L221.1,28.0 L227.6,32.0 L215.9,46.4 L221.0,72.0 L252.5,73.6 L277.9,69.6 L299.9,66.4 L334.0,66.4 L399.0,69.6 L402.9,77.6 L429.1,89.6 L448.5,102.4 L446.3,141.6 L437.7,177.6 L448.5,202.4 L455.8,213.6 L450.2,249.6 L455.8,274.4 L444.1,320.0 L435.5,348.0 L455.0,389.6 L435.5,414.4 L411.8,452.0 L394.6,484.0 L373.1,496.0 L349.4,468.0 L320.9,476.0 L284.3,484.0 L256.4,468.0 L230.7,457.6 L202.7,433.6 L179.0,398.4 L155.3,382.4 L140.2,366.4 L122.1,366.4 L105.7,354.4 L76.0,338.4 L64.8,328.0 L56.2,296.0 L47.5,253.6 L37.2,202.4 L32.9,160.0 L27.3,136.0 Z';

// Tłumaczenia PL / FR / EN
type Lang = 'pl'|'fr'|'en';
const T: Record<Lang, Record<string,string>> = {
  pl: {
    title:'Raport Grupy Pracy', grupy:'Tabela grup', trend:'Trend', koszty:'Koszt prac', mapa:'Mapa Polski',
    activeGroups:'Aktywne grupy', revenue:'Przychód YTD', cost:'Koszt YTD', margin:'Marża brutto',
    avgMB:'Avg MB%', bestGroup:'Best group', city:'Miasto', dept:'Dział', type:'Typ',
    citySummary:'Podsumowanie wg miast', groups:'grup', clickDetails:'kliknij → szczegóły',
    collapseBtn:'▲ zwiń', expandBtn:'▼ rozwiń dane',
    heatTitle:'Heatmapa MB% — Miasto × Miesiąc', avg:'Avg',
    inactive:'Grupy bez wyników', noData:'Brak danych',
    laborCost:'Koszt prac', totalCost:'Koszt całkowity', share:'Udział w kosztach',
    grpsWithCost:'Grup z kosztem prac', lider:'Lider', trendKP:'Trend KP',
    // tabele
    colLider:'Lider', colDept:'Dział', colRevenue:'Przychód', colMB:'MB%', colMargin:'Marża',
    colCost:'Koszt', colGroups:'Grup', colShare:'Udział', colCity:'Miasto', colType:'Typ',
    colLaborCost:'Koszt prac', colLaborShare:'KP/K', colTrend:'Trend',
    // wykresy
    chartMBTrend:'MB% — trend miesięczny', chartClickMonth:'Kliknij słupek → szczegóły miesiąca',
    chartRevCostMB:'Przychód · Koszt · MB', chartTop15:'Top 15 grup — MB YTD',
    chartBottom15:'Najsłabsze 15 grup — MB YTD', chartFlipHint:'kliknij tytuł → odwróć ranking',
    chartClickGroup:'Kliknij słupek → szczegóły grupy', chartBubble:'Przychód vs MB% — scatter',
    chartBubbleSub:'Kolor = miasto · Kliknij → szczegóły', chartDept:'Marża wg działu',
    chartDeptSub:'Kliknij → drawer działu', chartKPTrend:'Koszt prac vs Koszt całkowity — trend',
    chartKPTrendSub:'Kliknij słupek → relacje kosztów i przychodu w tym miesiącu',
    chartKPPerCity:'Koszt prac per lider — wg miasta', chartKPSort:'sortowanie wg wolumenu sprzedaży',
    chartMapSub:'Rozmiar = przychód · Pierścień = MB% · Kliknij → szczegóły',
    chartCityRank:'Ranking miast — kliknij → drawer',
    sumAll:'SUMA WSZYSTKICH MIAST', sum:'Suma', sumCity:'Suma',
    kpiLaborTotal:'Koszt prac (ogółem)', kpiLaborFiltered:'Koszt prac (filtr.)',
    kpiShare:'Udział w kosztach', kpiGrpsWithCost:'Grup z kosztem prac',
    inactiveBtn:'Grupy bez wyników — kliknij aby rozwinąć',
    all:'Wszystkie', allM:'Wszyscy',
    // drawer keys
    results:'Wyniki', costs:'Koszty', org:'Org',
    hierarchy:'Hierarchia', employees:'Pracownicy',
    laborTotal:'Koszt prac RAZEM', month:'Mies.',
    mbMonthly:'MB% miesięcznie', monthlyTable:'Tabela miesięczna',
    laborVsTotal:'Koszt prac vs Koszt całkowity',
    filteredResults:'Wyniki filtrowanych grup',
    topGroupsClick:'Top grup — kliknij → szczegóły',
    groups2:'Grup',
    mbTrend:'MB% trend',
    revenueVsMB:'Przychód vs MB',
    deptGroups:'Grupy działu — kliknij → szczegóły',
    kpiTitlePrzychod:'Przychód — szczegóły', kpiTitleKoszt:'Koszty — szczegóły',
    kpiTitleMB:'Marża brutto', kpiTitleMBPct:'MB% — rozkład', kpiTitleGrupy:'Przegląd grup',
    kpiDetails:'Szczegóły',
    monthlyTrend:'Trend miesięczny', topGroups:'Top grupy',
    mbDistribution:'Rozkład MB% per lider', allActiveGroups:'Wszystkie aktywne grupy',
    laborCostMonth:'Koszty prac — {month}',
    costRelations:'Relacje kosztów',
    statLaborCost:'Koszt prac', statCostPct:'% kosztów', statRevPct:'% przychodu',
    costStructure:'Struktura kosztów',
    waterfallMonthly:'Waterfall — relacje miesięczne',
    labelLaborCost:'Koszt prac:', labelOther:'Pozostałe:', labelRevenue:'Przychód:',
    topLeadersByCost:'Top liderzy wg kosztu prac',
  },
  fr: {
    title:'Rapport Groupe de Travail', grupy:'Tableau des groupes', trend:'Tendance', koszty:'Coût du travail', mapa:'Carte de la Pologne',
    activeGroups:'Groupes actifs', revenue:'CA YTD', cost:'Coût YTD', margin:'Marge brute',
    avgMB:'MB% moy.', bestGroup:'Meilleur groupe', city:'Ville', dept:'Département', type:'Type',
    citySummary:'Résumé par ville', groups:'groupes', clickDetails:'cliquez → détails',
    collapseBtn:'▲ réduire', expandBtn:'▼ afficher les données',
    heatTitle:'Heatmap MB% — Ville × Mois', avg:'Moy.',
    inactive:'Groupes sans résultats', noData:'Aucune donnée',
    laborCost:'Coût du travail', totalCost:'Coût total', share:'Part dans les coûts',
    grpsWithCost:'Groupes avec coût', lider:'Responsable', trendKP:'Tend. CT',
    colLider:'Responsable', colDept:'Département', colRevenue:'CA', colMB:'MB%', colMargin:'Marge',
    colCost:'Coût', colGroups:'Groupes', colShare:'Part', colCity:'Ville', colType:'Type',
    colLaborCost:'Coût trav.', colLaborShare:'CT/C', colTrend:'Tend.',
    chartMBTrend:'MB% — tendance mensuelle', chartClickMonth:'Cliquez sur la barre → détails du mois',
    chartRevCostMB:'CA · Coût · Marge', chartTop15:'Top 15 groupes — Marge YTD',
    chartBottom15:'15 pires groupes — Marge YTD', chartFlipHint:'cliquez titre → inverser',
    chartClickGroup:'Cliquez sur la barre → détails du groupe', chartBubble:'CA vs MB% — scatter',
    chartBubbleSub:'Couleur = ville · Cliquez → détails', chartDept:'Marge par département',
    chartDeptSub:'Cliquez → tiroir département', chartKPTrend:'Coût trav. vs Coût total — tendance',
    chartKPTrendSub:'Cliquez sur la barre → relations coûts/CA mensuel',
    chartKPPerCity:'Coût trav. par responsable — par ville', chartKPSort:'tri par volume de CA',
    chartMapSub:'Taille = CA · Anneau = MB% · Cliquez → détails',
    chartCityRank:'Classement des villes — cliquez → tiroir',
    sumAll:'TOTAL TOUTES VILLES', sum:'Total', sumCity:'Total',
    kpiLaborTotal:'Coût trav. (total)', kpiLaborFiltered:'Coût trav. (filtre)',
    kpiShare:'Part dans les coûts', kpiGrpsWithCost:'Groupes avec coût trav.',
    inactiveBtn:'Groupes sans résultats — cliquez pour afficher',
    all:'Toutes', allM:'Tous',
    // drawer keys
    results:'Résultats', costs:'Coûts', org:'Org',
    hierarchy:'Hiérarchie', employees:'Employés',
    laborTotal:'Coût trav. TOTAL', month:'Mois',
    mbMonthly:'MB% mensuel', monthlyTable:'Tableau mensuel',
    laborVsTotal:'Coût trav. vs Coût total',
    filteredResults:'Résultats des groupes filtrés',
    topGroupsClick:'Top groupes — cliquez → détails',
    groups2:'Groupes',
    mbTrend:'Tendance MB%',
    revenueVsMB:'CA vs Marge',
    deptGroups:'Groupes du département — cliquez → détails',
    kpiTitlePrzychod:'CA — détails', kpiTitleKoszt:'Coûts — détails',
    kpiTitleMB:'Marge brute', kpiTitleMBPct:'MB% — répartition', kpiTitleGrupy:'Aperçu des groupes',
    kpiDetails:'Détails',
    monthlyTrend:'Tendance mensuelle', topGroups:'Top groupes',
    mbDistribution:'Répartition MB% par responsable', allActiveGroups:'Tous les groupes actifs',
    laborCostMonth:'Coûts trav. — {month}',
    costRelations:'Relations de coûts',
    statLaborCost:'Coût trav.', statCostPct:'% des coûts', statRevPct:'% du CA',
    costStructure:'Structure des coûts',
    waterfallMonthly:'Waterfall — relations mensuelles',
    labelLaborCost:'Coût trav. :', labelOther:'Autres :', labelRevenue:'CA :',
    topLeadersByCost:'Top responsables par coût trav.',
  },
  en: {
    title:'Work Group Report', grupy:'Group table', trend:'Trend', koszty:'Labor costs', mapa:'Poland Map',
    activeGroups:'Active groups', revenue:'Revenue YTD', cost:'Cost YTD', margin:'Gross margin',
    avgMB:'Avg GM%', bestGroup:'Best group', city:'City', dept:'Dept', type:'Type',
    citySummary:'City summary', groups:'groups', clickDetails:'click → details',
    collapseBtn:'▲ collapse', expandBtn:'▼ expand data',
    heatTitle:'Heatmap GM% — City × Month', avg:'Avg',
    inactive:'Groups without results', noData:'No data',
    laborCost:'Labor cost', totalCost:'Total cost', share:'Share in costs',
    grpsWithCost:'Groups with labor cost', lider:'Leader', trendKP:'Labor trend',
    colLider:'Leader', colDept:'Dept', colRevenue:'Revenue', colMB:'GM%', colMargin:'Margin',
    colCost:'Cost', colGroups:'Groups', colShare:'Share', colCity:'City', colType:'Type',
    colLaborCost:'Labor cost', colLaborShare:'LC/C', colTrend:'Trend',
    chartMBTrend:'GM% — monthly trend', chartClickMonth:'Click bar → month details',
    chartRevCostMB:'Revenue · Cost · Margin', chartTop15:'Top 15 groups — Margin YTD',
    chartBottom15:'Bottom 15 groups — Margin YTD', chartFlipHint:'click title → flip ranking',
    chartClickGroup:'Click bar → group details', chartBubble:'Revenue vs GM% — scatter',
    chartBubbleSub:'Color = city · Click → details', chartDept:'Margin by department',
    chartDeptSub:'Click → dept drawer', chartKPTrend:'Labor cost vs Total cost — trend',
    chartKPTrendSub:'Click bar → cost/revenue ratio for that month',
    chartKPPerCity:'Labor cost per leader — by city', chartKPSort:'sorted by revenue volume',
    chartMapSub:'Size = revenue · Ring = GM% · Click → details',
    chartCityRank:'City ranking — click → drawer',
    sumAll:'TOTAL ALL CITIES', sum:'Total', sumCity:'Total',
    kpiLaborTotal:'Labor cost (total)', kpiLaborFiltered:'Labor cost (filtered)',
    kpiShare:'Share in costs', kpiGrpsWithCost:'Groups with labor cost',
    inactiveBtn:'Groups without results — click to expand',
    all:'All', allM:'All',
    // drawer keys
    results:'Results', costs:'Costs', org:'Org',
    hierarchy:'Hierarchy', employees:'Employees',
    laborTotal:'Labor cost TOTAL', month:'Mo.',
    mbMonthly:'GM% monthly', monthlyTable:'Monthly table',
    laborVsTotal:'Labor cost vs Total cost',
    filteredResults:'Filtered groups results',
    topGroupsClick:'Top groups — click → details',
    groups2:'Groups',
    mbTrend:'GM% trend',
    revenueVsMB:'Revenue vs Margin',
    deptGroups:'Dept groups — click → details',
    kpiTitlePrzychod:'Revenue — details', kpiTitleKoszt:'Costs — details',
    kpiTitleMB:'Gross margin', kpiTitleMBPct:'GM% — distribution', kpiTitleGrupy:'Groups overview',
    kpiDetails:'Details',
    monthlyTrend:'Monthly trend', topGroups:'Top groups',
    mbDistribution:'GM% distribution per leader', allActiveGroups:'All active groups',
    laborCostMonth:'Labor costs — {month}',
    costRelations:'Cost relations',
    statLaborCost:'Labor cost', statCostPct:'% of costs', statRevPct:'% of revenue',
    costStructure:'Cost structure',
    waterfallMonthly:'Waterfall — monthly relations',
    labelLaborCost:'Labor cost:', labelOther:'Other:', labelRevenue:'Revenue:',
    topLeadersByCost:'Top leaders by labor cost',
  },
};

const DZIALY_LABEL: Record<string,string> = {
  KAD:'Kadry',KON:'Konsulting',AUD:'Audyt',ADM:'Administracja',TLU:'Tłumaczenia',
  KSI:'Księgowość',PRA:'Prawo',MAR:'Marketing',RAP:'Raportowanie',OPE:'Operacje',ZAR:'Zarząd',ITE:'IT',
};
const MIASTO_LABEL: Record<string,string> = {WAR:'Warszawa',KRA:'Kraków',GDA:'Gdańsk',KAT:'Katowice',WRO:'Wrocław',POZ:'Poznań',RAD:'Radom'};
const CITY_COLORS: Record<string,string> = {WAR:'#3b82f6',KRA:'#8b5cf6',GDA:'#06b6d4',WRO:'#f59e0b',RAD:'#10b981',KAT:'#f97316',POZ:'#ec4899'};
const C={pos:'#10b981',neg:'#f43f5e',orange:'#f97316',blue:'#3b82f6',slate:'#64748b',amber:'#f59e0b'};
const TT={fontSize:11,borderRadius:8,border:'1px solid #e2e8f0',boxShadow:'0 2px 8px rgba(0,0,0,.06)'};

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLN=new Intl.NumberFormat('pl-PL',{minimumFractionDigits:0,maximumFractionDigits:0});
const fmt=(v:number)=>PLN.format(v);
const fmtM=(v:number)=>Math.abs(v)>=1_000_000?`${(v/1_000_000).toFixed(2)} M`:Math.abs(v)>=1_000?`${(v/1_000).toFixed(0)} k`:fmt(v);
const fmtPct=(v:number)=>`${(v*100).toFixed(1)}%`;
const mbp=(g:GroupRow)=>g.total.przychod>0?g.total.mb/g.total.przychod:0;
const mbColor=(v:number)=>v>0.3?'text-emerald-600':v>0.1?'text-amber-600':v>0?'text-orange-500':'text-red-600';
const mbBadge=(v:number)=>v>0.3?'bg-emerald-100 text-emerald-700':v>0.1?'bg-amber-100 text-amber-700':v>0?'bg-orange-100 text-orange-700':'bg-red-100 text-red-700';
const mbFill=(v:number)=>v>0.3?C.pos:v>0.1?C.amber:v>0?C.orange:C.neg;
function aggGroups(gs:GroupRow[]){const p=gs.reduce((s,g)=>s+g.total.przychod,0);const k=gs.reduce((s,g)=>s+g.total.koszt,0);const m=gs.reduce((s,g)=>s+g.total.mb,0);return{p,k,m,pct:p>0?m/p:0};}
const hier=(d:GrpData,l:string)=>d.hierarchyMap?.[l]??null;

// ── Drawer ────────────────────────────────────────────────────────────────────
function Drawer({title,subtitle,onClose,children,w=580}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;w?:number}){
  return(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose}/>
      <div className="relative bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{width:'100%',maxWidth:w}}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-start justify-between gap-3 z-10">
          <div><p className="text-sm font-bold text-slate-800">{title}</p>{subtitle&&<p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}</div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg">×</button>
        </div>
        <div className="p-3 sm:p-5 space-y-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ── Mini komponentem ──────────────────────────────────────────────────────────
function Chip({label,active,onClick}:{label:string;active:boolean;onClick:()=>void}){
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap select-none ${active?'bg-orange-500 text-white shadow-[0_4px_0_0_#c2410c,0_2px_4px_rgba(0,0,0,0.15)] translate-y-0 hover:shadow-[0_2px_0_0_#c2410c] hover:translate-y-0.5 active:shadow-none active:translate-y-1':'bg-slate-100 text-slate-600 shadow-[0_3px_0_0_#cbd5e1,0_1px_3px_rgba(0,0,0,0.08)] hover:bg-slate-50 hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-0.5 active:shadow-none active:translate-y-1'}`}
      style={{transform:undefined}}
    >{label}</button>
  );
}
function SL({children}:{children:ReactNode}){return <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{children}</p>;}

function Sparkline({values,color='#10b981'}:{values:number[];color?:string}){
  const max=Math.max(...values,0.001);const w=100,h=26,pad=2;
  const pts=values.map((v,i)=>`${pad+i*(w-2*pad)/(values.length-1)},${h-pad-(v/max)*(h-2*pad)}`).join(' ');
  return <svg width={w} height={h} className="shrink-0"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"/></svg>;
}

function MiniDonut({pct,color='#3b82f6',size=22}:{pct:number;color?:string;size?:number}){
  const r=size/2-3,c=size/2,circ=2*Math.PI*r,d=Math.max(0,Math.min(1,pct))*circ;
  return(
    <svg width={size} height={size} style={{display:'block',flexShrink:0}}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#e2e8f0" strokeWidth={3.5}/>
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={3.5}
        strokeDasharray={`${d} ${circ}`} strokeLinecap="round"
        style={{transform:'rotate(-90deg)',transformOrigin:'50% 50%'}}/>
    </svg>
  );
}

function KpiCard({label,value,sub,color='slate',onClick}:{label:string;value:string;sub?:string;color?:string;onClick?:()=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const clr:Record<string,string>={slate:'text-slate-800',green:'text-emerald-600',red:'text-red-600',orange:'text-orange-600',amber:'text-amber-600',blue:'text-blue-600'};
  return(
    <div onClick={onClick} className={`bg-white rounded-xl border border-slate-200 px-4 py-3 min-w-0 shadow-[0_4px_0_0_#e2e8f0,0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-100 ${onClick?'cursor-pointer hover:border-orange-300 hover:shadow-[0_2px_0_0_#e2e8f0,0_1px_4px_rgba(0,0,0,0.08)] hover:translate-y-0.5 active:shadow-none active:translate-y-1':''}`}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${clr[color]??'text-slate-800'}`}>{value}</p>
      {sub&&<p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      {onClick&&<p className="text-[9px] text-orange-400 mt-1">{tr('clickDetails')}</p>}
    </div>
  );
}

function GroupMiniTable({groups,onSelect}:{groups:GroupRow[];onSelect:(g:GroupRow)=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const headers=[{k:'colLider',left:true},{k:'colDept',left:true},{k:'colRevenue',left:false},{k:'colMB',left:false}];
  return(
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {headers.map(h=><th key={h.k} className={`px-2 py-1.5 font-semibold text-slate-500 ${h.left?'text-left':'text-right'}`}>{tr(h.k)}</th>)}
        </tr></thead>
        <tbody>{groups.map((g,i)=>{const m=mbp(g);return(
          <tr key={g.lider+i} className="border-b border-slate-100 hover:bg-orange-50 cursor-pointer" onClick={()=>onSelect(g)}>
            <td className="px-2 py-1.5 font-semibold text-slate-800">{g.lider}</td>
            <td className="px-2 py-1.5"><span className="bg-violet-50 text-violet-700 px-1 py-0.5 rounded text-[10px]">{g.dzial}</span></td>
            <td className="px-2 py-1.5 text-right text-slate-600">{fmtM(g.total.przychod)}</td>
            <td className="px-2 py-1.5 text-right"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(m)}`}>{fmtPct(m)}</span></td>
          </tr>
        );})}</tbody>
      </table>
    </div>
  );
}

// ── DRAWER: Grupa ─────────────────────────────────────────────────────────────
function GroupDrawer({group,data,onClose}:{group:GroupRow;data:GrpData;onClose:()=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const months = I18N_MONTHS_SHORT[lang];
  const [tab,setTab]=useState<'wyniki'|'koszty'|'org'>('wyniki');
  const kp=useMemo(()=>data.kosztPrac.find(k=>k.name===group.lider)??null,[group.lider,data.kosztPrac]);
  const h=hier(data,group.lider);const emps=data.employees.filter(e=>e.lider===group.lider);
  const m=mbp(group);
  const cd=useMemo(()=>months.map((_,i)=>({month:months[i],Przychód:group.monthly.przychod[i],Koszt:group.monthly.koszt[i],MB:group.monthly.mb[i],mbPct:group.monthly.mbPct[i],kosztPrac:kp?kp.monthly[i]:0})),[months,group,kp]);
  return(
    <Drawer title={`${group.lider} · Gr. ${group.groupNr}`} subtitle={`${MIASTO_LABEL[group.miasto]??group.miasto} · ${DZIALY_LABEL[group.dzial]??group.dzial}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {([[tr('colRevenue'),fmtM(group.total.przychod),'slate'],[tr('colMB'),fmtPct(m),m>0.3?'green':m>0.1?'amber':'red'],[tr('colMargin'),fmtM(group.total.mb),m>0?'green':'red'],[tr('colCost'),fmtM(group.total.koszt),'slate']] as const).map(([l,v,c])=>(
          <div key={l} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">{l}</p>
            <p className={`text-base font-bold mt-0.5 ${c==='green'?'text-emerald-600':c==='red'?'text-red-600':c==='amber'?'text-amber-600':'text-slate-800'}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 border-b border-slate-100">
        {(['wyniki','koszty','org'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg ${tab===t?'bg-orange-600 text-white':'text-slate-500 hover:text-slate-800'}`}>
            {t==='wyniki'?tr('results'):t==='koszty'?tr('costs'):tr('org')}
          </button>
        ))}
      </div>
      {tab==='wyniki'&&(<>
        <div><SL>{tr('mbMonthly')}</SL><ResponsiveContainer width="100%" height={140}><BarChart data={cd} margin={{top:4,right:4,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number)=>[`${(v*100).toFixed(1)}%`,'MB%']) as any}/><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3"/><Bar dataKey="mbPct" radius={[3,3,0,0]}>{cd.map((d,i)=><Cell key={i} fill={mbFill(d.mbPct)}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <div><SL>{tr('monthlyTable')}</SL><div className="mt-2 overflow-x-auto"><table className="w-full text-[11px] border-collapse"><thead><tr className="bg-slate-50">{[tr('month'),tr('colRevenue'),tr('colCost'),'MB',tr('colMB')].map((h,hi)=><th key={h+hi} className={`px-2 py-1.5 font-semibold text-slate-500 border-b border-slate-200 ${hi===0?'text-left':'text-right'}`}>{h}</th>)}</tr></thead><tbody>{months.map((_,i)=>{const mv=group.monthly.mbPct[i];return(<tr key={i} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-2 py-1.5 font-medium text-slate-600">{months[i]}</td><td className="px-2 py-1.5 text-right">{fmt(group.monthly.przychod[i])}</td><td className="px-2 py-1.5 text-right text-slate-500">{fmt(group.monthly.koszt[i])}</td><td className={`px-2 py-1.5 text-right font-medium ${mbColor(mv)}`}>{fmt(group.monthly.mb[i])}</td><td className="px-2 py-1.5 text-right"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(mv)}`}>{fmtPct(mv)}</span></td></tr>);})}</tbody></table></div></div>
      </>)}
      {tab==='koszty'&&kp&&(<>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5"><p className="text-[10px] text-blue-600 font-semibold uppercase">{tr('laborTotal')}</p><p className="text-base font-bold text-blue-800">{fmtM(kp.razem)}</p></div>
        <div><SL>{tr('laborVsTotal')}</SL><ResponsiveContainer width="100%" height={140}><BarChart data={cd} margin={{top:4,right:4,left:-10,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>fmtM(v)} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number,n:string)=>[fmtM(v),n]) as any}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="Koszt" name={i18nT(lang,'trend.cost')} fill={C.slate} radius={[3,3,0,0]}/><Bar dataKey="kosztPrac" name={tr('statLaborCost')} fill={C.blue} radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>
      </>)}
      {tab==='org'&&(<>
        {h&&<div><SL>{tr('hierarchy')}</SL><div className="flex items-center gap-2 flex-wrap text-xs mt-2"><span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono">{h.rootParent}</span><span className="text-slate-400">→</span><span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono">{h.directParent}</span><span className="text-slate-400">→</span><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-semibold">{group.lider}</span></div></div>}
        <div><SL>{tr('employees')} ({emps.length})</SL><div className="mt-2 space-y-1.5">{emps.map(e=><div key={e.akronim+e.centrum} className="flex items-center gap-2 text-[11px]"><span className="bg-orange-50 text-orange-700 font-semibold px-2 py-0.5 rounded w-12 text-center shrink-0">{e.akronim}</span><span className="text-slate-400 font-mono text-[10px] truncate">{e.centrum}</span></div>)}</div></div>
      </>)}
    </Drawer>
  );
}

// ── DRAWER: Miesiąc ───────────────────────────────────────────────────────────
function MonthDrawer({idx,groups,onClose,onGroup}:{idx:number;groups:GroupRow[];onClose:()=>void;onGroup:(g:GroupRow)=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const monthsFull = I18N_MONTHS_FULL[lang];
  const sorted=[...groups].filter(g=>g.monthly.przychod[idx]>0||g.monthly.koszt[idx]>0).sort((a,b)=>b.monthly.mb[idx]-a.monthly.mb[idx]);
  const totalP=groups.reduce((s,g)=>s+g.monthly.przychod[idx],0);const totalMB=groups.reduce((s,g)=>s+g.monthly.mb[idx],0);const avgM=totalP>0?totalMB/totalP:0;
  return(
    <Drawer title={`${monthsFull[idx]} ${idx<3?'2024':'2025'}`} subtitle={tr('filteredResults')} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">{[[tr('colRevenue'),fmtM(totalP),'slate'],[tr('colMargin'),fmtM(totalMB),totalMB>0?'green':'red'],[tr('colMB'),fmtPct(avgM),avgM>0.3?'green':avgM>0.1?'amber':'red'],[tr('groups2'),String(sorted.length),'slate']].map(([l,v,c])=><div key={l as string} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-[10px] text-slate-400 font-semibold uppercase">{l}</p><p className={`text-base font-bold mt-0.5 ${c==='green'?'text-emerald-600':c==='red'?'text-red-600':c==='amber'?'text-amber-600':'text-slate-800'}`}>{v}</p></div>)}</div>
      <div><SL>{tr('topGroupsClick')}</SL><div className="mt-2"><GroupMiniTable groups={sorted} onSelect={onGroup}/></div></div>
    </Drawer>
  );
}

// ── DRAWER: Miasto ────────────────────────────────────────────────────────────
function CityDrawer({miasto,groups,onClose,onGroup}:{miasto:string;groups:GroupRow[];onClose:()=>void;onGroup:(g:GroupRow)=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const months = I18N_MONTHS_SHORT[lang];
  const gs=[...groups].filter(g=>g.miasto===miasto).sort((a,b)=>b.total.mb-a.total.mb);
  const{p,m,pct}=aggGroups(gs);
  const trend=months.map((_,i)=>({month:months[i],Przychód:gs.reduce((s,g)=>s+g.monthly.przychod[i],0),MB:gs.reduce((s,g)=>s+g.monthly.mb[i],0),mbPct:0})).map(d=>({...d,mbPct:d.Przychód>0?d.MB/d.Przychód:0}));
  return(
    <Drawer title={MIASTO_LABEL[miasto]??miasto} subtitle={`${gs.length} ${tr('groups')} · ${fmtM(p)} · MB ${fmtPct(pct)}`} onClose={onClose}>
      <div><SL>{tr('mbTrend')}</SL><ResponsiveContainer width="100%" height={130}><BarChart data={trend} margin={{top:4,right:4,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number)=>[`${(v*100).toFixed(1)}%`,'MB%']) as any}/><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3"/><Bar dataKey="mbPct" radius={[3,3,0,0]}>{trend.map((d,i)=><Cell key={i} fill={mbFill(d.mbPct)}/>)}</Bar></BarChart></ResponsiveContainer></div>
      <div><SL>{tr('revenueVsMB')} · {fmtM(m)}</SL><div className="mt-2 flex flex-col gap-1.5">{gs.map(g=>{const mp2=mbp(g);const share=p>0?g.total.przychod/p:0;return(<div key={g.lider} className="flex items-center gap-2 cursor-pointer hover:bg-orange-50 rounded px-1" onClick={()=>onGroup(g)}><span className="text-[11px] font-semibold text-slate-700 w-10 shrink-0">{g.lider}</span><div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="h-full rounded-full" style={{width:`${share*100}%`,backgroundColor:CITY_COLORS[miasto]??'#64748b'}}/></div><span className={`text-[10px] font-bold w-12 text-right ${mbColor(mp2)}`}>{fmtPct(mp2)}</span></div>);})}</div></div>
    </Drawer>
  );
}

// ── DRAWER: Dział ─────────────────────────────────────────────────────────────
function DeptDrawer({dzial,groups,onClose,onGroup}:{dzial:string;groups:GroupRow[];onClose:()=>void;onGroup:(g:GroupRow)=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const gs=[...groups].filter(g=>g.dzial===dzial).sort((a,b)=>b.total.mb-a.total.mb);
  const{p,pct}=aggGroups(gs);
  return(
    <Drawer title={`${DZIALY_LABEL[dzial]??dzial}`} subtitle={`${gs.length} ${tr('groups')} · ${fmtM(p)} · MB ${fmtPct(pct)}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3"><div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-[10px] text-slate-400 font-semibold uppercase">{tr('colRevenue')}</p><p className="text-base font-bold">{fmtM(p)}</p></div><div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-[10px] text-slate-400 font-semibold uppercase">{tr('colMB')}</p><p className={`text-base font-bold ${pct>0.3?'text-emerald-600':pct>0.1?'text-amber-600':'text-red-600'}`}>{fmtPct(pct)}</p></div></div>
      <div><SL>{tr('deptGroups')}</SL><div className="mt-2"><GroupMiniTable groups={gs} onSelect={onGroup}/></div></div>
    </Drawer>
  );
}

// ── DRAWER: KPI ───────────────────────────────────────────────────────────────
function KpiDrawer({type,groups,onClose,onGroup}:{type:'przychod'|'koszt'|'mb'|'mbpct'|'grupy';groups:GroupRow[];onClose:()=>void;onGroup:(g:GroupRow)=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const months = I18N_MONTHS_SHORT[lang];
  const sorted=useMemo(()=>[...groups].sort((a,b)=>b.total.mb-a.total.mb),[groups]);
  const trend=useMemo(()=>months.map((_,i)=>({month:months[i],Przychód:groups.reduce((s,g)=>s+g.monthly.przychod[i],0),Koszt:groups.reduce((s,g)=>s+g.monthly.koszt[i],0),MB:groups.reduce((s,g)=>s+g.monthly.mb[i],0),mbPct:0})).map(d=>({...d,mbPct:d.Przychód>0?d.MB/d.Przychód:0})),[months,groups]);
  const titles:Record<string,string>={przychod:tr('kpiTitlePrzychod'),koszt:tr('kpiTitleKoszt'),mb:tr('kpiTitleMB'),mbpct:tr('kpiTitleMBPct'),grupy:tr('kpiTitleGrupy')};
  return(
    <Drawer title={titles[type]??tr('kpiDetails')} subtitle={`${groups.length} ${tr('groups')}`} onClose={onClose}>
      {(type==='przychod'||type==='mb'||type==='koszt')&&(<>
        <div><SL>{tr('monthlyTrend')}</SL><ResponsiveContainer width="100%" height={155}><LineChart data={trend} margin={{top:4,right:4,left:-10,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>fmtM(v)} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number,n:string)=>[fmtM(v),n]) as any}/><Legend wrapperStyle={{fontSize:10}}/>{type!=='koszt'&&<Line dataKey="Przychód" name={i18nT(lang,'trend.revenue')} stroke={C.blue} dot={{r:2}} strokeWidth={2}/>}{type!=='przychod'&&<Line dataKey="Koszt" name={i18nT(lang,'trend.cost')} stroke={C.neg} dot={{r:2}} strokeWidth={2}/>}{type==='mb'&&<Line dataKey="MB" name={i18nT(lang,'trend.margin')} stroke={C.pos} dot={{r:2}} strokeWidth={2} strokeDasharray="4 2"/>}</LineChart></ResponsiveContainer></div>
        <div><SL>{tr('topGroups')}</SL><div className="mt-2"><GroupMiniTable groups={type==='koszt'?[...sorted].sort((a,b)=>b.total.koszt-a.total.koszt):sorted} onSelect={onGroup}/></div></div>
      </>)}
      {type==='mbpct'&&(<>
        <div><SL>{tr('mbTrend')}</SL><ResponsiveContainer width="100%" height={140}><BarChart data={trend} margin={{top:4,right:4,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number)=>[`${(v*100).toFixed(1)}%`,'MB%']) as any}/><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3"/><Bar dataKey="mbPct" radius={[3,3,0,0]}>{trend.map((d,i)=><Cell key={i} fill={mbFill(d.mbPct)}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <div><SL>{tr('mbDistribution')}</SL><div className="mt-2 space-y-1.5">{sorted.map(g=>{const m2=mbp(g);return(<div key={g.lider} className="flex items-center gap-2 cursor-pointer hover:bg-orange-50 rounded px-1" onClick={()=>onGroup(g)}><span className="text-[11px] font-semibold text-slate-700 w-10 shrink-0">{g.lider}</span><div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.max(0,m2)*150}%`,backgroundColor:mbFill(m2),maxWidth:'100%'}}/></div><span className={`text-[10px] font-bold w-12 text-right ${mbColor(m2)}`}>{fmtPct(m2)}</span></div>);})}</div></div>
      </>)}
      {type==='grupy'&&<div><SL>{tr('allActiveGroups')}</SL><div className="mt-2"><GroupMiniTable groups={sorted} onSelect={onGroup}/></div></div>}
    </Drawer>
  );
}

// ── DRAWER: Koszt miesiąc ─────────────────────────────────────────────────────
function KosztMonthDrawer({idx,kosztData,trendData,onClose,onGroup,filtered}:{idx:number;kosztData:GroupKosztPrac[];trendData:{month:string;Przychód:number;Koszt:number;MB:number;mbPct:number}[];onClose:()=>void;onGroup:(g:GroupRow)=>void;filtered:GroupRow[]}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const monthsFull = I18N_MONTHS_FULL[lang];
  const months = I18N_MONTHS_SHORT[lang];
  const kpTotal=kosztData.reduce((s,kp)=>s+kp.monthly[idx],0);
  const {Przychód:P,Koszt:K}=trendData[idx];
  const kpPct=K>0?kpTotal/K:0;const kpRevPct=P>0?kpTotal/P:0;
  const topLiders=[...kosztData].sort((a,b)=>b.monthly[idx]-a.monthly[idx]).slice(0,10);
  const barData=[{name:tr('statLaborCost'),v:kpTotal},{name:tr('labelOther').replace(':',''),v:Math.max(0,K-kpTotal)}];
  return(
    <Drawer title={tr('laborCostMonth').replace('{month}',monthsFull[idx])} subtitle={`${idx<3?'2024':'2025'} · ${tr('costRelations')}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {[[tr('statLaborCost'),fmtM(kpTotal),'blue'],[tr('statCostPct'),fmtPct(kpPct),'slate'],[tr('statRevPct'),fmtPct(kpRevPct),kpRevPct>0.5?'red':kpRevPct>0.3?'amber':'green']].map(([l,v,c])=>(
          <div key={l} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-[10px] text-slate-400 font-semibold uppercase">{l}</p><p className={`text-base font-bold ${c==='blue'?'text-blue-700':c==='red'?'text-red-600':c==='amber'?'text-amber-600':c==='green'?'text-emerald-600':'text-slate-800'}`}>{v}</p></div>
        ))}
      </div>
      <div><SL>{tr('costStructure')}</SL><div className="mt-2 flex items-center gap-4">
        <MiniDonut pct={kpPct} color={C.blue} size={64}/>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"/><span className="text-slate-600">{tr('labelLaborCost')} <span className="font-bold text-blue-700">{fmtM(kpTotal)}</span> ({fmtPct(kpPct)})</span></div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"/><span className="text-slate-600">{tr('labelOther')} <span className="font-semibold">{fmtM(Math.max(0,K-kpTotal))}</span></span></div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0"/><span className="text-slate-600">{tr('labelRevenue')} <span className="font-semibold">{fmtM(P)}</span></span></div>
        </div>
      </div></div>
      <div><SL>{tr('waterfallMonthly')}</SL>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={barData} layout="vertical" margin={{top:4,right:8,left:4,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
            <XAxis type="number" tickFormatter={v=>fmtM(v)} tick={{fontSize:9}}/>
            <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={60}/>
            <Tooltip contentStyle={TT} formatter={((v:number)=>[fmtM(v)]) as any}/>
            <Bar dataKey="v" radius={[0,4,4,0]}><Cell fill={C.blue}/><Cell fill={C.slate}/></Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div><SL>{tr('topLeadersByCost')} — {months[idx]}</SL>
        <div className="mt-2 space-y-1.5">
          {topLiders.map(kp=>{const g=filtered.find(x=>x.lider===kp.name);const pct2=kpTotal>0?kp.monthly[idx]/kpTotal:0;return(
            <div key={kp.name} className="flex items-center gap-2 cursor-pointer hover:bg-orange-50 rounded px-1.5 py-0.5" onClick={()=>{if(g)onGroup(g);}}>
              <span className="text-[11px] font-semibold text-slate-700 w-10 shrink-0">{kp.name}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="h-full rounded-full bg-blue-400" style={{width:`${pct2*100}%`}}/></div>
              <span className="text-[10px] text-slate-500 w-16 text-right shrink-0">{fmtM(kp.monthly[idx])}</span>
            </div>
          );})}
        </div>
      </div>
    </Drawer>
  );
}

// ── Tabela grup — sekcje miast ────────────────────────────────────────────────
function CitySection({miasto,groups,onGroup,activeGroup}:{miasto:string;groups:GroupRow[];onGroup:(g:GroupRow)=>void;activeGroup:GroupRow|null}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const [open,setOpen]=useState(true);const{p,k,m,pct}=aggGroups(groups);const color=CITY_COLORS[miasto]??'#64748b';
  return(
    <div className="border border-slate-200 rounded-xl bg-white">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
        <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:color}}/>
        <span className="text-sm font-bold text-slate-800">{MIASTO_LABEL[miasto]??miasto}</span>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{groups.length} {tr('groups')}</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-slate-500 hidden sm:inline">{fmtM(p)}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${mbBadge(pct)}`}>{fmtPct(pct)}</span>
          <span className="text-slate-400 text-xs">{open?'▲':'▼'}</span>
        </div>
      </button>
      {open&&(<div className="border-t border-slate-100 overflow-x-auto"><table className="w-full text-xs border-collapse min-w-[320px]">
        <thead><tr className="bg-slate-50/80 border-b border-slate-100">
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-left">{tr('colLider')}</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-left hidden sm:table-cell">{tr('colDept')}</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-left hidden sm:table-cell">B/K</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-right">{tr('colRevenue')}</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-right hidden sm:table-cell">{tr('colCost')}</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-right hidden sm:table-cell">{tr('colMargin')}</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-right">{tr('colMB')}</th>
          <th className="px-3 py-1.5 font-semibold text-slate-400 text-[10px] text-left hidden sm:table-cell">{tr('colTrend')}</th>
        </tr></thead>
        <tbody>
          {groups.map((g,idx)=>{const m2=mbp(g);const isSel=activeGroup?.lider===g.lider;return(
            <tr key={g.lider} onClick={()=>onGroup(g)} className={`border-b border-slate-100 cursor-pointer transition-colors ${isSel?'bg-orange-50 border-l-2 border-l-orange-500':idx%2===0?'hover:bg-slate-50':'bg-slate-50/30 hover:bg-slate-50'}`}>
              <td className="px-3 py-1.5 font-semibold text-slate-800">{g.lider}</td>
              <td className="px-3 py-1.5 hidden sm:table-cell"><span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded text-[10px]">{DZIALY_LABEL[g.dzial]??g.dzial}</span></td>
              <td className="px-3 py-1.5 hidden sm:table-cell"><span className={`px-1.5 py-0.5 rounded text-[10px] ${g.bk==='K_'?'bg-slate-100 text-slate-600':'bg-amber-50 text-amber-700'}`}>{g.bk==='K_'?'K':'B'}</span></td>
              <td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmtM(g.total.przychod)}</td>
              <td className="px-3 py-1.5 text-right text-slate-500 hidden sm:table-cell">{fmtM(g.total.koszt)}</td>
              <td className={`px-3 py-1.5 text-right font-semibold hidden sm:table-cell ${mbColor(m2)}`}>{fmtM(g.total.mb)}</td>
              <td className="px-3 py-1.5 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(m2)}`}>{fmtPct(m2)}</span></td>
              <td className="px-3 py-1.5 hidden sm:table-cell"><Sparkline values={g.monthly.mb} color={mbFill(m2)}/></td>
            </tr>
          );})}
          <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-[10px]">
            <td className="px-3 py-1.5 text-slate-500">{tr('sumCity')} {MIASTO_LABEL[miasto]}</td>
            <td className="hidden sm:table-cell"/><td className="hidden sm:table-cell"/>
            <td className="px-3 py-1.5 text-right text-slate-700">{fmtM(p)}</td>
            <td className="px-3 py-1.5 text-right text-slate-500 hidden sm:table-cell">{fmtM(k)}</td>
            <td className={`px-3 py-1.5 text-right hidden sm:table-cell ${mbColor(pct)}`}>{fmtM(m)}</td>
            <td className="px-3 py-1.5 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(pct)}`}>{fmtPct(pct)}</span></td>
            <td className="hidden sm:table-cell"/>
          </tr>
        </tbody>
      </table></div>)}
    </div>
  );
}

// ── Koszt prac — sekcja per miasto z liderami ─────────────────────────────────
function CityCostSection({miasto,kosztItems,filtered,onGroup}:{miasto:string;kosztItems:GroupKosztPrac[];filtered:GroupRow[];onGroup:(g:GroupRow)=>void}){
  const { lang } = useLang();
  const tr = (k: string) => T[lang][k] ?? T.pl[k] ?? k;
  const [open,setOpen]=useState(false);
  const color=CITY_COLORS[miasto]??'#64748b';
  const totalKP=kosztItems.reduce((s,kp)=>s+kp.razem,0);
  const gs=filtered.filter(g=>g.miasto===miasto);
  const {p:totalP,pct:avgMB}=aggGroups(gs);
  const rows=kosztItems.map(kp=>{
    const g=gs.find(x=>x.lider===kp.name);
    return{kp,g,mb:g?mbp(g):0,przychod:g?.total.przychod??0,koszt:g?.total.koszt??0};
  }).sort((a,b)=>b.przychod-a.przychod);
  return(
    <div className="border border-slate-200 rounded-xl bg-white">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
        <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:color}}/>
        <span className="text-sm font-bold text-slate-800">{MIASTO_LABEL[miasto]??miasto}</span>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{rows.length} {tr('groups')}</span>
        <div className="flex items-center gap-3 ml-auto text-xs">
          <span className="text-slate-500 hidden sm:inline">{fmtM(totalP)}</span>
          <span className="font-semibold text-blue-700">{fmtM(totalKP)} KP</span>
          <span className={`font-bold px-2 py-0.5 rounded-full ${mbBadge(avgMB)}`}>{fmtPct(avgMB)}</span>
          <span className="text-slate-400">{open?'▲':'▼'}</span>
        </div>
      </button>
      {open&&(<div className="border-t border-slate-100 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead><tr className="bg-slate-50/80 border-b border-slate-100">
            <th className="text-left px-3 py-1.5 font-semibold text-slate-400 text-[10px]">{tr('colLider')}</th>
            <th className="text-left px-3 py-1.5 font-semibold text-slate-400 text-[10px]">{tr('colLaborShare')}</th>
            <th className="text-left px-2 py-1.5 font-semibold text-slate-400 text-[10px] hidden sm:table-cell">{tr('trendKP')}</th>
            <th className="text-right px-3 py-1.5 font-semibold text-slate-400 text-[10px]">{tr('colRevenue')}</th>
            <th className="text-right px-3 py-1.5 font-semibold text-slate-400 text-[10px]">{tr('colMB')}</th>
            <th className="text-right px-3 py-1.5 font-semibold text-slate-400 text-[10px]">{tr('colLaborCost')}</th>
          </tr></thead>
          <tbody>
            {rows.map(({kp,g,mb,przychod,koszt},i)=>{
              const kpPct=koszt>0?kp.razem/koszt:0;
              return(
                <tr key={kp.name} onClick={()=>{if(g)onGroup(g);}} className={`border-b border-slate-100 cursor-pointer transition-colors ${i%2===0?'hover:bg-orange-50':'bg-slate-50/20 hover:bg-orange-50'}`}>
                  <td className="px-3 py-1.5 font-semibold text-slate-800">{kp.name}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <MiniDonut pct={kpPct} color={kpPct>0.6?C.neg:kpPct>0.4?C.amber:C.blue}/>
                      <span className="text-[10px] text-slate-500">{fmtPct(kpPct)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 hidden sm:table-cell"><Sparkline values={kp.monthly} color={C.blue}/></td>
                  <td className="px-3 py-1.5 text-right text-slate-700">{przychod>0?fmtM(przychod):'—'}</td>
                  <td className="px-3 py-1.5 text-right">{g?<span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(mb)}`}>{fmtPct(mb)}</span>:'—'}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-blue-700">{fmtM(kp.razem)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-200 bg-blue-50/40 font-semibold text-[10px]">
              <td className="px-3 py-1.5 text-slate-600" colSpan={3}>{tr('sumCity')} {MIASTO_LABEL[miasto]}</td>
              <td className="px-3 py-1.5 text-right text-slate-700">{fmtM(totalP)}</td>
              <td className="px-3 py-1.5 text-right"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(avgMB)}`}>{fmtPct(avgMB)}</span></td>
              <td className="px-3 py-1.5 text-right text-blue-800">{fmtM(totalKP)}</td>
            </tr>
          </tbody>
        </table>
      </div>)}
    </div>
  );
}

// ── Heatmapa (zwijana, klikalna) ──────────────────────────────────────────────
function Heatmap({groups,tr,onCellClick,selectedCell}:{
  groups:GroupRow[];
  tr:(k:string)=>string;
  onCellClick:(miasto:string,monthIdx:number)=>void;
  selectedCell:{miasto:string;monthIdx:number}|null;
}){
  const { lang } = useLang();
  const months = I18N_MONTHS_SHORT[lang];
  const [open,setOpen]=useState(true);
  const cities=Object.keys(CITY_SVG).filter(m=>groups.some(g=>g.miasto===m));
  const cells=cities.map(miasto=>{
    const gs=groups.filter(g=>g.miasto===miasto);
    return{miasto,monthly:months.map((_,i)=>{const p=gs.reduce((s,g)=>s+g.monthly.przychod[i],0);const mb=gs.reduce((s,g)=>s+g.monthly.mb[i],0);return{pct:p>0?mb/p:0,p,mb};})};
  });
  return(
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left">
        <p className="text-sm font-semibold text-slate-700">{tr('heatTitle')}</p>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{tr('clickDetails')}</span>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-auto">{open?tr('collapseBtn'):tr('expandBtn')}</span>
      </button>
      {open&&(<div className="px-3 py-3 overflow-x-auto">
        <table className="text-[11px] border-collapse w-full min-w-[400px]">
          <thead><tr>
            <th className="text-left px-3 py-2 font-semibold text-slate-500 border-b border-slate-200">{tr('colCity')}</th>
            {months.map((m,i)=><th key={m+i} className="text-center px-1 py-2 font-semibold text-slate-400 border-b border-slate-200 text-[10px]">{m}<br/><span className="font-normal text-slate-300">{i<3?'\'24':'\'25'}</span></th>)}
            <th className="text-right px-3 py-2 font-semibold text-slate-500 border-b border-slate-200">{tr('avg')}</th>
          </tr></thead>
          <tbody>
            {cells.map(({miasto,monthly})=>{
              const avg=monthly.filter(d=>d.p>0).reduce((s,d)=>s+d.pct,0)/Math.max(1,monthly.filter(d=>d.p>0).length);
              return(<tr key={miasto} className="border-b border-slate-100 hover:bg-slate-50/30">
                <td className="px-3 py-1.5 font-semibold text-slate-700 whitespace-nowrap"><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor:CITY_COLORS[miasto]??'#64748b'}}/>{MIASTO_LABEL[miasto]??miasto}</div></td>
                {monthly.map((d,i)=>{
                  const isSel=selectedCell?.miasto===miasto&&selectedCell?.monthIdx===i;
                  return(<td key={i} className="px-0.5 py-1 text-center">
                    {d.p>0?(
                      <button
                        onClick={()=>onCellClick(miasto,i)}
                        className={`rounded mx-auto w-7 h-6 flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer ${isSel?'ring-2 ring-orange-400 scale-110':''} hover:scale-110 hover:shadow-md`}
                        style={{
                          backgroundColor:isSel?'#f97316':d.pct>0.3?'#d1fae5':d.pct>0.2?'#fef3c7':d.pct>0.1?'#fed7aa':d.pct>0?'#fee2e2':'#f1f5f9',
                          color:isSel?'white':d.pct>0.3?'#065f46':d.pct>0.2?'#92400e':d.pct>0.1?'#c2410c':d.pct>0?'#991b1b':'#94a3b8',
                        }}
                        title={`${MIASTO_LABEL[miasto]} · ${months[i]} · ${fmtPct(d.pct)} · kliknij → szczegóły`}
                      >{(d.pct*100).toFixed(0)}%</button>
                    ):<div className="w-7 h-6 mx-auto rounded bg-slate-50 flex items-center justify-center text-slate-300 text-[9px]">—</div>}
                  </td>);
                })}
                <td className="px-3 py-1.5 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(avg)}`}>{fmtPct(avg)}</span></td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>)}
    </div>
  );
}

// ── Drawer szczegółów komórki heatmapy ────────────────────────────────────────
function HeatmapCellDrawer({groups,miasto,monthIdx,onClose,tr}:{
  groups:GroupRow[];
  miasto:string;
  monthIdx:number;
  onClose:()=>void;
  tr:(k:string)=>string;
}){
  const { lang } = useLang();
  const months = I18N_MONTHS_FULL[lang] ?? I18N_MONTHS_SHORT[lang];
  const monthsShort = I18N_MONTHS_SHORT[lang];
  const cityGroups=groups.filter(g=>g.miasto===miasto&&g.monthly.przychod[monthIdx]>0);
  const totalP=cityGroups.reduce((s,g)=>s+g.monthly.przychod[monthIdx],0);
  const totalMB=cityGroups.reduce((s,g)=>s+g.monthly.mb[monthIdx],0);
  const avgPct=totalP>0?totalMB/totalP:0;
  const yearLabel=monthIdx<3?'\'24':'\'25';

  // Porównanie z innymi miesiącami tego samego miasta (do wykresu)
  const cityAllGroups=groups.filter(g=>g.miasto===miasto);
  const monthlyTrend=monthsShort.map((_,i)=>{
    const p=cityAllGroups.reduce((s,g)=>s+g.monthly.przychod[i],0);
    const mb=cityAllGroups.reduce((s,g)=>s+g.monthly.mb[i],0);
    return{month:monthsShort[i],pct:p>0?mb/p:0,p,selected:i===monthIdx};
  });

  const sorted=[...cityGroups].sort((a,b)=>b.monthly.mb[monthIdx]-a.monthly.mb[monthIdx]);

  return(
    <Drawer
      title={`${MIASTO_LABEL[miasto]??miasto} · ${months[monthIdx]} ${yearLabel}`}
      subtitle={`MB: ${fmtPct(avgPct)} · Przychód: ${fmtM(totalP)} · ${cityGroups.length} grup`}
      onClose={onClose}
      w={500}
    >
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {([
          ['Przychód',fmtM(totalP),'blue'],
          ['Marża brutto',fmtM(totalMB),totalMB>0?'green':'red'],
          ['MB%',fmtPct(avgPct),avgPct>0.3?'green':avgPct>0.1?'amber':'red'],
        ] as const).map(([l,v,c])=>(
          <div key={l} className={`rounded-lg p-3 border ${c==='green'?'bg-emerald-50 border-emerald-200':c==='red'?'bg-rose-50 border-rose-200':c==='amber'?'bg-amber-50 border-amber-200':'bg-blue-50 border-blue-200'}`}>
            <p className="text-[10px] text-slate-400 font-semibold uppercase">{l}</p>
            <p className={`text-base font-bold mt-0.5 ${c==='green'?'text-emerald-700':c==='red'?'text-rose-700':c==='amber'?'text-amber-700':'text-blue-700'}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Wykres trendu MB% — wszystkie miesiące tego miasta z zaznaczonym */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">MB% — trend miesięczny (to miasto)</p>
        <div className="flex items-end gap-0.5 h-16">
          {monthlyTrend.map((d,i)=>{
            const h=d.p>0?Math.max(4,Math.abs(d.pct)*160):2;
            return(
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full rounded-sm" style={{
                  height:h,
                  backgroundColor:d.selected?'#f97316':d.pct>0.3?'#10b981':d.pct>0.1?'#f59e0b':d.pct>0?'#f97316':'#f43f5e',
                  opacity:d.p>0?1:0.2,
                  minHeight:2,
                }}/>
                <span className={`text-[7px] font-medium ${d.selected?'text-orange-500':'text-slate-300'}`}>{monthsShort[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela grup */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Grupy · {months[monthIdx]} — wyliczenia</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-semibold text-slate-500">{tr('colLider')}</th>
              <th className="text-right px-2 py-2 font-semibold text-slate-500">{tr('colRevenue')}</th>
              <th className="text-right px-2 py-2 font-semibold text-slate-500">{tr('colMargin')}</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500">{tr('colMB')}</th>
            </tr></thead>
            <tbody>
              {sorted.map((g,i)=>{
                const p=g.monthly.przychod[monthIdx];
                const mb=g.monthly.mb[monthIdx];
                const pct=p>0?mb/p:0;
                const shareP=totalP>0?p/totalP:0;
                return(
                  <tr key={i} className={`border-b border-slate-100 ${i%2===0?'':'bg-slate-50/40'}`}>
                    <td className="px-3 py-1.5">
                      <div className="font-semibold text-slate-800">{g.lider}</div>
                      {/* pasek udziału w przychodzie */}
                      <div className="w-full bg-slate-100 rounded-full h-1 mt-1">
                        <div className="h-1 rounded-full bg-blue-400" style={{width:`${shareP*100}%`}}/>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-700">{fmtM(p)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${mb>=0?'text-emerald-600':'text-rose-600'}`}>{fmtM(mb)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(pct)}`}>{fmtPct(pct)}</span>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-orange-50 border-t border-orange-200 font-semibold">
                <td className="px-3 py-1.5 text-slate-700 text-[10px] uppercase">Suma</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-800">{fmtM(totalP)}</td>
                <td className={`px-2 py-1.5 text-right font-mono font-bold ${totalMB>=0?'text-emerald-700':'text-rose-700'}`}>{fmtM(totalMB)}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(avgPct)}`}>{fmtPct(avgPct)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}

// ── Mapa Polski (GPS-accurate SVG) ───────────────────────────────────────────
// Projekcja: x=(lon-14.0)/10.2*440+20  y=(55.0-lat)/6.0*480+20  vp:480×520
const CITY_SVG: Record<string,[number,number]> = {
  GDA:[221,72],POZ:[147,227],WAR:[323,242],
  WRO:[151,331],RAD:[329,308],KAT:[237,399],KRA:[277,415],
};

function PolandMap({groups,onCity}:{groups:GroupRow[];onCity:(m:string)=>void}){
  const [hov,setHov]=useState<string|null>(null);
  const stats=useMemo(()=>{
    const s:{[k:string]:{p:number;mb:number;n:number}}={};
    for(const g of groups){
      if(!CITY_SVG[g.miasto])continue;
      if(!s[g.miasto])s[g.miasto]={p:0,mb:0,n:0};
      s[g.miasto].p+=g.total.przychod;s[g.miasto].mb+=g.total.mb;s[g.miasto].n++;
    }
    return s;
  },[groups]);
  const maxP=Math.max(...Object.values(stats).map(s=>s.p),1);
  const bR=(p:number)=>10+Math.sqrt(p/maxP)*30;
  return(
    <div>
      <svg viewBox="0 0 480 520" className="w-full max-w-[440px] mx-auto">
        {/* cień */}
        <path d={POLAND_PATH} fill="rgba(0,0,0,0.05)" transform="translate(3,5)"/>
        {/* wypełnienie */}
        <path d={POLAND_PATH} fill="#dbeafe" stroke="#93c5fd" strokeWidth="2" strokeLinejoin="round"/>
        {/* siatka pomocnicza */}
        {[50,51,52,53,54].map(lat=>{
          const y=(55.0-lat)/6.0*480+20;
          return <line key={lat} x1="20" y1={y} x2="460" y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4 8"/>;
        })}
        {/* miasta */}
        {Object.entries(CITY_SVG).map(([miasto,[cx,cy]])=>{
          const s=stats[miasto];if(!s)return null;
          const r=bR(s.p);const mp2=s.p>0?s.mb/s.p:0;
          const fill=CITY_COLORS[miasto]??'#64748b';const isH=hov===miasto;
          return(
            <g key={miasto} className="cursor-pointer"
              onClick={()=>onCity(miasto)}
              onMouseEnter={()=>setHov(miasto)}
              onMouseLeave={()=>setHov(null)}>
              {isH&&<circle cx={cx} cy={cy} r={r+10} fill={fill} fillOpacity={0.12}/>}
              {/* pierścień MB% */}
              <circle cx={cx} cy={cy} r={r+4} fill="none" stroke={mbFill(mp2)} strokeWidth={2.5} opacity={0.75}/>
              {/* cień bąbelka */}
              <circle cx={cx+2} cy={cy+3} r={r} fill="rgba(0,0,0,0.12)"/>
              {/* bąbelek */}
              <circle cx={cx} cy={cy} r={r}
                fill={fill} fillOpacity={isH?0.95:0.82}
                stroke="white" strokeWidth={isH?2.5:1.5}
                style={{transition:'all 0.15s ease'}}/>
              <text x={cx} y={cy-3} textAnchor="middle" dominantBaseline="middle"
                fontSize={isH?11:10} fontWeight="700" fill="white" pointerEvents="none"
                style={{userSelect:'none'}}>{miasto}</text>
              <text x={cx} y={cy+8} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fontWeight="600" fill="white" fillOpacity={0.9} pointerEvents="none"
                style={{userSelect:'none'}}>{fmtPct(mp2)}</text>
              {/* tooltip hover */}
              {isH&&(
                <g>
                  <rect x={cx-80} y={cy-r-68} width={160} height={58} rx={8}
                    fill="white" stroke="#e2e8f0" strokeWidth={1.5}
                    filter="drop-shadow(0 4px 10px rgba(0,0,0,.15))"/>
                  <text x={cx} y={cy-r-54} textAnchor="middle" fontSize={12} fontWeight="800" fill="#1e293b">
                    {MIASTO_LABEL[miasto]??miasto}
                  </text>
                  <text x={cx} y={cy-r-38} textAnchor="middle" fontSize={10} fill="#64748b">
                    {s.n} grup · {fmtM(s.p)} przych.
                  </text>
                  <text x={cx} y={cy-r-22} textAnchor="middle" fontSize={10} fontWeight="700" fill={mbFill(mp2)}>
                    MB: {fmtM(s.mb)} · {fmtPct(mp2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 justify-center mt-3">
        {[['> 30% MB','#10b981'],['10–30% MB','#f59e0b'],['0–10% MB','#f97316'],['< 0% MB','#f43f5e']].map(([l,c])=>(
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{backgroundColor:c as string}}/>
            <span className="text-[10px] text-slate-500">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Aggregacja ────────────────────────────────────────────────────────────────
function agg(gs:GroupRow[]){const p=Array(12).fill(0),k=Array(12).fill(0),m=Array(12).fill(0);for(const g of gs)for(let i=0;i<12;i++){p[i]+=g.monthly.przychod[i];k[i]+=g.monthly.koszt[i];m[i]+=g.monthly.mb[i];}return{p,k,m};}

// ── CSS Scatter (replaces recharts ScatterChart — tree-shaking safe) ──────────
function CssScatter({ groups, onGroup, tr }: { groups: GroupRow[]; onGroup: (g: GroupRow) => void; tr: (k: string) => string }) {
  if (!groups.length) return <div className="h-48 flex items-center justify-center text-xs text-slate-400">—</div>;

  const xs = groups.map(g => g.total.przychod);
  const ys = groups.map(g => mbp(g));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const rangeX = maxX - minX || 1;

  // Zoom Y — clip outliers poniżej -15% lub > 5pkt ponad 90-percentyl
  const sortedY = [...ys].sort((a, b) => a - b);
  const p05 = sortedY[Math.max(0, Math.floor(sortedY.length * 0.05))];
  const p95 = sortedY[Math.min(sortedY.length - 1, Math.ceil(sortedY.length * 0.95) - 1)];
  const spread = p95 - p05 || 0.1;
  const yMin = Math.max(p05 - spread * 0.15, Math.min(...ys));  // lekki padding poniżej
  const yMax = p95 + spread * 0.15;                              // lekki padding powyżej
  const rangeY = yMax - yMin || 0.01;

  // Outliers: poniżej skali i powyżej 100%
  const outliersLow = groups.filter(g => mbp(g) < yMin);
  const outliersHigh = groups.filter(g => mbp(g) > 1.0);

  const PAD_X = 10; // % padding poziomy
  const PAD_Y = 8;  // % padding pionowy

  // Konwersja wartości Y → % od góry w obszarze wykresu
  const yToPct = (v: number) => 100 - PAD_Y - ((v - yMin) / rangeY) * (100 - 2 * PAD_Y);

  const zero0 = yMin < 0 && yMax > 0 ? yToPct(0) : null;

  // Pomocnik stref tła: [lo, hi] w Y → div z top/height w %
  const renderZone = (lo: number, hi: number, cls: string) => {
    const visLo = Math.max(lo, yMin);
    const visHi = Math.min(hi, yMax);
    if (visLo >= visHi) return null;
    const screenTop = yToPct(visHi);
    const screenBot = yToPct(visLo);
    return <div key={`z${lo}-${hi}`} className={`absolute left-0 right-0 pointer-events-none ${cls}`} style={{ top: `${screenTop}%`, height: `${screenBot - screenTop}%` }} />;
  };

  return (
    <div className="space-y-1">
      {/* outliers powyżej skali — etykiety zielone nad wykresem */}
      {outliersHigh.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-1">
          <span className="text-[9px] text-emerald-600 font-semibold">Powyżej skali:</span>
          {outliersHigh.map((g, i) => (
            <button
              key={i}
              onClick={() => onGroup(g)}
              className="text-[9px] bg-emerald-50 border border-emerald-300 text-emerald-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-emerald-100 transition-colors"
              title={`${g.lider} · MB: ${fmtPct(mbp(g))} · ${fmtM(g.total.przychod)}`}
            >
              {g.lider} <span className="font-bold">{fmtPct(mbp(g))}</span>
            </button>
          ))}
        </div>
      )}

      {/* scatter area */}
      <div className="relative rounded-lg border border-slate-100 overflow-hidden" style={{ height: 290 }}>
        {/* Kolorowe strefy tła */}
        {renderZone(0.3, Infinity, 'bg-emerald-50 opacity-60')}
        {renderZone(0.1, 0.3, 'bg-amber-50 opacity-60')}
        {renderZone(0, 0.1, 'bg-orange-50 opacity-40')}
        {renderZone(-Infinity, 0, 'bg-rose-50 opacity-40')}

        {/* oś Y=0 */}
        {zero0 !== null && (
          <div className="absolute left-0 right-0 border-t border-dashed border-rose-300 opacity-60 pointer-events-none" style={{ top: `${zero0}%` }}>
            <span className="absolute right-1 -top-3 text-[8px] text-rose-400">0%</span>
          </div>
        )}

        {/* linie siatki Y — rozszerzone, z wyróżnieniem strefowym */}
        {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4].map(v => {
          if (v < yMin || v > yMax) return null;
          const py = yToPct(v);
          const isKey = v === 0.1 || v === 0.2 || v === 0.3;
          return (
            <div key={v} className={`absolute left-0 right-0 border-t pointer-events-none ${isKey ? 'border-slate-300 opacity-70' : 'border-slate-200 opacity-40'}`} style={{ top: `${py}%` }}>
              <span className={`absolute right-1 -top-3 text-[8px] ${isKey ? 'text-slate-400' : 'text-slate-300'}`}>{(v * 100).toFixed(0)}%</span>
            </div>
          );
        })}

        {/* punkty */}
        {groups.map((g, i) => {
          const my = mbp(g);
          if (my < yMin || my > 1.0) return null; // outliers pokazane osobno
          const px = ((g.total.przychod - minX) / rangeX) * (100 - 2 * PAD_X) + PAD_X;
          const py = yToPct(my);
          const color = (CITY_COLORS as Record<string, string>)[g.miasto] ?? '#64748b';
          return (
            <div
              key={i}
              className="absolute w-3.5 h-3.5 rounded-full cursor-pointer hover:scale-150 transition-all hover:z-10 border-2 border-white shadow-sm hover:ring-2 hover:ring-white hover:ring-offset-1"
              style={{ left: `${px}%`, top: `${py}%`, backgroundColor: color, transform: 'translate(-50%,-50%)' }}
              title={`${g.lider} · ${(my * 100).toFixed(1)}% MB · ${fmtM(g.total.przychod)}`}
              onClick={() => onGroup(g)}
            />
          );
        })}

        <div className="absolute bottom-1 left-0 right-0 text-center text-[8px] text-slate-400 pointer-events-none">{tr('revenue')} →</div>
        <div className="absolute top-1 left-1 text-[8px] text-slate-400 pointer-events-none">MB%↑</div>
      </div>

      {/* outliers poniżej wykresu jako etykiety inline */}
      {outliersLow.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pt-1">
          <span className="text-[9px] text-slate-400 font-semibold">Poza skalą:</span>
          {outliersLow.map((g, i) => (
            <button
              key={i}
              onClick={() => onGroup(g)}
              className="text-[9px] bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-100 transition-colors"
              title={`${g.lider} · MB: ${fmtPct(mbp(g))} · ${fmtM(g.total.przychod)}`}
            >
              {g.lider} <span className="font-bold">{fmtPct(mbp(g))}</span>
            </button>
          ))}
        </div>
      )}

      {/* legenda miast */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1">
        {Object.entries(CITY_COLORS).filter(([m]) => groups.some(g => g.miasto === m)).map(([m, color]) => (
          <div key={m} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-slate-500">{MIASTO_LABEL[m] ?? m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GŁÓWNY KOMPONENT ──────────────────────────────────────────────────────────
export default function RaportGrupy({lang='pl'}:{lang?:Lang}){
  const { activeCompany } = useCompanies();
  const data: GrpData | null = activeCompany?.grpData ?? staticGrpData;
  const tr=(k:string)=>T[lang][k]??T.pl[k]??k;
  const months = I18N_MONTHS_SHORT[lang];
  const [selMiasta,setSelMiasta]=useState<Set<string>>(new Set());
  const [selDzialy,setSelDzialy]=useState<Set<string>>(new Set());
  const [selBK,setSelBK]=useState<'all'|'B_'|'K_'>('all');
  const [search,setSearch]=useState('');
  const [activeTab,setActiveTab]=useState<'grupy'|'trend'|'koszty'|'mapa'>('trend');

  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm p-8 text-center">
        <div className="text-3xl">👥</div>
        <p className="font-semibold text-slate-600">Brak danych raportu grup pracy</p>
        <p className="text-xs text-slate-400 max-w-xs">Zaimportuj plik <em>B_RAP_GP</em> podczas dodawania firmy lub podmiana danych.</p>
      </div>
    );
  }

  const [dGroup,setDGroup]=useState<GroupRow|null>(null);
  const [dMonthIdx,setDMonthIdx]=useState<number|null>(null);
  const [dCity,setDCity]=useState<string|null>(null);
  const [dDept,setDDept]=useState<string|null>(null);
  const [dKpi,setDKpi]=useState<'przychod'|'koszt'|'mb'|'mbpct'|'grupy'|null>(null);
  const [dKosztMonth,setDKosztMonth]=useState<number|null>(null);
  const [dHeatCell,setDHeatCell]=useState<{miasto:string;monthIdx:number}|null>(null);
  const [showWorst,setShowWorst]=useState(false);
  const [top15Flipping,setTop15Flipping]=useState(false);

  function closeAll(){setDGroup(null);setDMonthIdx(null);setDCity(null);setDDept(null);setDKpi(null);setDKosztMonth(null);setDHeatCell(null);}
  function openGroup(g:GroupRow){setDGroup(g);setDMonthIdx(null);setDCity(null);setDDept(null);setDKpi(null);setDKosztMonth(null);setDHeatCell(null);}
  function openMonth(i:number){setDMonthIdx(i);setDGroup(null);setDCity(null);setDDept(null);setDKpi(null);setDKosztMonth(null);setDHeatCell(null);}
  function openCity(m:string){setDCity(m);setDGroup(null);setDMonthIdx(null);setDDept(null);setDKpi(null);setDKosztMonth(null);setDHeatCell(null);}
  function openDept(d:string){setDDept(d);setDGroup(null);setDMonthIdx(null);setDCity(null);setDKpi(null);setDKosztMonth(null);setDHeatCell(null);}
  function openKpi(t:'przychod'|'koszt'|'mb'|'mbpct'|'grupy'){setDKpi(t);setDGroup(null);setDMonthIdx(null);setDCity(null);setDDept(null);setDKosztMonth(null);setDHeatCell(null);}
  function openKosztMonth(i:number){setDKosztMonth(i);setDGroup(null);setDMonthIdx(null);setDCity(null);setDDept(null);setDKpi(null);setDHeatCell(null);}
  function openHeatCell(miasto:string,monthIdx:number){setDHeatCell({miasto,monthIdx});setDGroup(null);setDMonthIdx(null);setDCity(null);setDDept(null);setDKpi(null);setDKosztMonth(null);}
  function flipTop15(){
    setTop15Flipping(true);
    setTimeout(()=>{setShowWorst(w=>!w);setTop15Flipping(false);},250);
  }

  const allMiasta=useMemo(()=>[...new Set(data.groups.map(g=>g.miasto))].filter(m=>m&&m!=='0').sort(),[]);
  const allDzialy=useMemo(()=>[...new Set(data.groups.map(g=>g.dzial))].filter(d=>d&&d!=='0').sort(),[]);
  const allGroups=useMemo(()=>data.groups.filter(g=>g.lider!=='0'&&g.miasto!=='0'),[]);
  const activeGroups=useMemo(()=>allGroups.filter(g=>g.total.przychod>0),[allGroups]);
  const inactiveGroups=useMemo(()=>allGroups.filter(g=>g.total.przychod===0),[allGroups]);

  const filtered=useMemo(()=>{
    let g=activeGroups;
    if(selMiasta.size>0)g=g.filter(x=>selMiasta.has(x.miasto));
    if(selDzialy.size>0)g=g.filter(x=>selDzialy.has(x.dzial));
    if(selBK!=='all')g=g.filter(x=>x.bk===selBK);
    if(search.trim()){const q=search.toLowerCase();g=g.filter(x=>x.lider.toLowerCase().includes(q)||x.groupNr.includes(q));}
    return g;
  },[activeGroups,selMiasta,selDzialy,selBK,search]);

  const kpi=useMemo(()=>{const{p,k,m}=aggGroups(filtered);const best=[...filtered].sort((a,b)=>b.total.mb-a.total.mb)[0];return{p,k,m,pct:p>0?m/p:0,best,count:filtered.length};},[filtered]);
  const trendData=useMemo(()=>{const a=agg(filtered);return months.map((mo,i)=>({month:mo,Przychód:a.p[i],Koszt:a.k[i],MB:a.m[i],mbPct:a.p[i]>0?a.m[i]/a.p[i]:0}));},[filtered,months]);
  const top15=useMemo(()=>{
    const sorted=[...filtered].sort((a,b)=>showWorst?a.total.mb-b.total.mb:b.total.mb-a.total.mb);
    return sorted.slice(0,15).map(g=>({name:g.lider,MB:g.total.mb,mbPct:mbp(g)}));
  },[filtered,showWorst]);
  // Koszt prac — scalamy duplikaty tego samego lidera (różne groupNr → suma narastająca)
  const kosztData=useMemo(()=>{
    const ls=new Set(filtered.map(g=>g.lider));
    const raw=data.kosztPrac.filter(kp=>ls.has(kp.name));
    // Agregacja per name: sumuj monthly i razem
    const agg2:{[n:string]:GroupKosztPrac}={};
    for(const kp of raw){
      if(!agg2[kp.name]){
        agg2[kp.name]={groupNr:kp.groupNr,name:kp.name,monthly:[...kp.monthly],razem:kp.razem};
      } else {
        agg2[kp.name].monthly=agg2[kp.name].monthly.map((v,i)=>v+kp.monthly[i]);
        agg2[kp.name].razem+=kp.razem;
      }
    }
    return Object.values(agg2).sort((a,b)=>b.razem-a.razem);
  },[filtered]);
  const laborCostLabel = tr('laborCost');
  const totalCostLabel = tr('totalCost');
  const kosztTrend=useMemo(()=>months.map((_,i)=>({month:months[i],[laborCostLabel]:kosztData.reduce((s,kp)=>s+kp.monthly[i],0),[totalCostLabel]:trendData[i].Koszt})),[kosztData,trendData,months,laborCostLabel,totalCostLabel]);

  const byCity=useMemo(()=>{const m:{[k:string]:GroupRow[]}={};for(const g of filtered){if(!m[g.miasto])m[g.miasto]=[];m[g.miasto].push(g);}Object.keys(m).forEach(k=>m[k].sort((a,b)=>b.total.mb-a.total.mb));return Object.entries(m).sort(([,a],[,b])=>aggGroups(b).p-aggGroups(a).p);},[filtered]);

  // Koszt prac per miasto
  const kosztByCity=useMemo(()=>{
    const cityMap:{[m:string]:GroupKosztPrac[]}={};
    for(const kp of kosztData){
      const g=filtered.find(x=>x.lider===kp.name);
      if(g){if(!cityMap[g.miasto])cityMap[g.miasto]=[];cityMap[g.miasto].push(kp);}
    }
    return Object.entries(cityMap).sort(([,a],[,b])=>b.reduce((s,k)=>s+k.razem,0)-a.reduce((s,k)=>s+k.razem,0));
  },[kosztData,filtered]);

  const TABS=[
    {id:'trend',l:tr('trend')},{id:'grupy',l:tr('grupy')},
    {id:'koszty',l:tr('koszty')},{id:'mapa',l:tr('mapa')},
  ] as const;

  return(
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50">
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">

        {/* Filtry */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide w-auto min-w-[56px] shrink-0">{tr('city')}</span>
            <Chip label={tr('all')} active={selMiasta.size===0} onClick={()=>setSelMiasta(new Set())}/>
            {allMiasta.map(m=><Chip key={m} label={MIASTO_LABEL[m]??m} active={selMiasta.has(m)} onClick={()=>setSelMiasta(p=>{const s=new Set(p);s.has(m)?s.delete(m):s.add(m);return s;})}/>)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide w-auto min-w-[56px] shrink-0">{tr('dept')}</span>
            <Chip label={tr('all')} active={selDzialy.size===0} onClick={()=>setSelDzialy(new Set())}/>
            {allDzialy.map(d=><Chip key={d} label={DZIALY_LABEL[d]??d} active={selDzialy.has(d)} onClick={()=>setSelDzialy(p=>{const s=new Set(p);s.has(d)?s.delete(d):s.add(d);return s;})}/>)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide w-auto min-w-[56px] shrink-0">{tr('type')}</span>
            {(['all','K_','B_'] as const).map(bk=><Chip key={bk} label={bk==='all'?tr('allM'):bk==='K_'?(lang==='pl'?'Konsultanci':lang==='fr'?'Consultants':'Consultants'):(lang==='pl'?'Biuro':lang==='fr'?'Bureau':'Office')} active={selBK===bk} onClick={()=>setSelBK(bk)}/>)}
            <div className="flex-1"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={lang==='pl'?'Szukaj…':lang==='fr'?'Chercher…':'Search…'} className="w-36 px-3 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-orange-400 focus:bg-white transition-colors"/>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label={tr('activeGroups')} value={String(kpi.count)} sub={`/ ${activeGroups.length}`} onClick={()=>openKpi('grupy')}/>
          <KpiCard label={tr('revenue')} value={fmtM(kpi.p)} onClick={()=>openKpi('przychod')}/>
          <KpiCard label={tr('cost')} value={fmtM(kpi.k)} onClick={()=>openKpi('koszt')}/>
          <KpiCard label={tr('margin')} value={fmtM(kpi.m)} color={kpi.m>0?'green':'red'} onClick={()=>openKpi('mb')}/>
          <KpiCard label={tr('avgMB')} value={fmtPct(kpi.pct)} color={kpi.pct>0.3?'green':kpi.pct>0.1?'amber':'red'} onClick={()=>openKpi('mbpct')}/>
          <KpiCard label={tr('bestGroup')} value={kpi.best?.lider??'—'} sub={kpi.best?fmtM(kpi.best.total.mb):undefined} color="green" onClick={kpi.best?()=>openGroup(kpi.best!):undefined}/>
        </div>

        {/* Zakładki */}
        <div className="flex gap-1 flex-wrap">
          {TABS.map(t=><button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab===t.id?'bg-orange-600 text-white shadow-sm':'bg-white text-slate-600 border border-slate-200 hover:border-orange-300 hover:text-orange-600'}`}>{t.l}</button>)}
        </div>

        {/* ── GRUPY ─────────────────────────────────────────────────────────── */}
        {activeTab==='grupy'&&(
          <div className="space-y-3">
            {/* Tabela podsumowania wg miast */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-700">{tr('citySummary')}</p>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{tr('clickDetails')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">{tr('colCity')}</th>
                    <th className="text-center px-2 py-2 font-semibold text-slate-500 hidden sm:table-cell">{tr('colGroups')}</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500">{tr('colRevenue')}</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500 hidden sm:table-cell">{tr('colMargin')}</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500">{tr('colMB')}</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-500 hidden sm:table-cell">{tr('colShare')} %</th>
                  </tr></thead>
                  <tbody>
                    {(()=>{const totalP=byCity.reduce((s,[,gs2])=>s+aggGroups(gs2).p,0);return byCity.map(([miasto,gs2],i)=>{const{p,m,pct}=aggGroups(gs2);const share=totalP>0?p/totalP:0;const isSel=dCity===miasto;return(
                      <tr key={miasto} onClick={()=>isSel?closeAll():openCity(miasto)} className={`border-b border-slate-100 cursor-pointer transition-colors ${isSel?'bg-orange-50 border-l-2 border-l-orange-500':'hover:bg-slate-50'} ${i%2===0?'':'bg-slate-50/30'}`}>
                        <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:CITY_COLORS[miasto]??'#64748b'}}/><span className="font-semibold text-slate-800">{MIASTO_LABEL[miasto]??miasto}</span></div></td>
                        <td className="px-2 py-2 text-center hidden sm:table-cell"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium">{gs2.length}</span></td>
                        <td className="px-3 py-2 text-right font-medium text-slate-700">{fmtM(p)}</td>
                        <td className={`px-3 py-2 text-right font-semibold hidden sm:table-cell ${mbColor(pct)}`}>{fmtM(m)}</td>
                        <td className="px-3 py-2 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(pct)}`}>{fmtPct(pct)}</span></td>
                        <td className="px-3 py-2 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${share*100}%`,backgroundColor:CITY_COLORS[miasto]??'#64748b'}}/></div>
                            <span className="text-[10px] text-slate-500 w-7 text-right">{(share*100).toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );})})()}
                    <tr className="bg-orange-50 border-t border-orange-200 font-semibold text-[10px]">
                      <td className="px-3 py-2 text-slate-700 uppercase tracking-wide">{tr('sum')}</td>
                      <td className="px-2 py-2 text-center text-slate-600 hidden sm:table-cell">{filtered.length}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{fmtM(kpi.p)}</td>
                      <td className={`px-3 py-2 text-right font-bold hidden sm:table-cell ${mbColor(kpi.pct)}`}>{fmtM(kpi.m)}</td>
                      <td className="px-3 py-2 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(kpi.pct)}`}>{fmtPct(kpi.pct)}</span></td>
                      <td className="px-3 py-2 text-right text-slate-500 hidden sm:table-cell">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {byCity.map(([miasto,gs])=><CitySection key={miasto} miasto={miasto} groups={gs} onGroup={openGroup} activeGroup={dGroup}/>)}
            {inactiveGroups.length>0&&(
              <details className="bg-slate-50 rounded-xl border border-slate-200">
                <summary className="px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer select-none">
                  <span className="bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full mr-2">{inactiveGroups.length}</span>
                  {tr('inactiveBtn')}
                </summary>
                <div className="px-4 pb-3 flex flex-wrap gap-2 mt-2">
                  {inactiveGroups.map(g=>(
                    <button key={g.lider} onClick={()=>openGroup(g)} className="text-[11px] bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-orange-50 hover:text-orange-700 border border-slate-200 transition-colors">
                      <span className="font-semibold">{g.lider}</span><span className="text-slate-400 ml-1">· {MIASTO_LABEL[g.miasto]??g.miasto} · {g.dzial}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── TREND ─────────────────────────────────────────────────────────── */}
        {activeTab==='trend'&&(
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tr('chartMBTrend')}</p>
                <p className="text-[10px] text-slate-400 mb-3">{tr('chartClickMonth')}</p>
                <ResponsiveContainer width="100%" height={195}><BarChart data={trendData} margin={{top:4,right:4,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number)=>[`${(v*100).toFixed(1)}%`,'MB%']) as any}/><ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3"/><Bar dataKey="mbPct" radius={[3,3,0,0]} cursor="pointer" onClick={(_:any,i:number)=>openMonth(i)}>{trendData.map((d,i)=><Cell key={i} fill={dMonthIdx===i?'#ea580c':mbFill(d.mbPct)}/>)}</Bar></BarChart></ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tr('chartRevCostMB')}</p>
                <ResponsiveContainer width="100%" height={195}><LineChart data={trendData} margin={{top:4,right:4,left:-10,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tickFormatter={v=>fmtM(v)} tick={{fontSize:10}}/><Tooltip contentStyle={TT} formatter={((v:number,n:string)=>[fmtM(v),n]) as any}/><Legend wrapperStyle={{fontSize:10}}/><Line dataKey="Przychód" name={i18nT(lang,'trend.revenue')} stroke={C.blue} dot={{r:3}} strokeWidth={2}/><Line dataKey="Koszt" name={i18nT(lang,'trend.cost')} stroke={C.neg} dot={{r:3}} strokeWidth={2}/><Line dataKey="MB" name={i18nT(lang,'trend.margin')} stroke={C.pos} dot={{r:3}} strokeWidth={2} strokeDasharray="4 2"/></LineChart></ResponsiveContainer>
              </div>
            </div>

            {/* Top / Worst 15 — klikalny tytuł z animacją flip */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-0.5">
                <button
                  onClick={flipTop15}
                  className="text-[10px] font-semibold uppercase tracking-wide transition-colors cursor-pointer hover:text-orange-500 flex items-center gap-1.5"
                  style={{color: showWorst?'#dc2626':'#94a3b8'}}
                  title={tr('chartFlipHint')}
                >
                  <span style={{display:'inline-block',transition:'transform 0.25s',transform:showWorst?'rotate(180deg)':'rotate(0deg)'}}>⟳</span>
                  {showWorst ? tr('chartBottom15') : tr('chartTop15')}
                </button>
                <span className="text-[9px] text-slate-300 ml-auto">{tr('chartFlipHint')}</span>
              </div>
              <p className="text-[10px] text-slate-400 mb-3">{tr('chartClickGroup')}</p>
              <div style={{
                transition:'transform 0.25s ease, opacity 0.25s ease',
                transform: top15Flipping ? 'rotateY(90deg) scaleX(0.1)' : 'rotateY(0deg) scaleX(1)',
                opacity: top15Flipping ? 0 : 1,
                transformOrigin: 'center',
              }}>
                <ResponsiveContainer width="100%" height={Math.max(340, top15.length * 26 + 20)}>
                  <BarChart data={top15} layout="vertical" margin={{top:0,right:52,left:4,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                    <XAxis type="number" tickFormatter={v=>fmtM(v)} tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis
                      type="category" dataKey="name" interval={0}
                      width={110}
                      tick={({x,y,payload})=>(
                        <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill="#475569" style={{userSelect:'none'}}>
                          {payload.value.length>14?payload.value.slice(0,13)+'…':payload.value}
                        </text>
                      )}
                    />
                    <Tooltip contentStyle={TT} formatter={((v:number)=>[fmtM(v),'MB']) as any}/>
                    <ReferenceLine x={0} stroke="#94a3b8"/>
                    <Bar dataKey="MB" radius={[0,4,4,0]} cursor="pointer" maxBarSize={18}
                      label={{position:'right',formatter:((v:number)=>fmtM(v)) as any,fontSize:9,fill:'#64748b'}}
                      onClick={(d:any)=>{const g=filtered.find(x=>x.lider===d.name);if(g)openGroup(g);}}>
                      {top15.map((d,i)=><Cell key={i} fill={dGroup?.lider===d.name?'#ea580c':d.MB>0?C.pos:C.neg}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Scatter + dział */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tr('chartBubble')}</p>
                <p className="text-[10px] text-slate-400 mb-2">{tr('chartBubbleSub')}</p>
                <CssScatter groups={filtered} onGroup={openGroup} tr={tr} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100"><p className="text-sm font-semibold text-slate-700">{tr('chartDept')}</p><p className="text-[10px] text-slate-400 mt-0.5">{tr('chartDeptSub')}</p></div>
                <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="bg-slate-50 border-b border-slate-200">{[tr('colDept'),'×',tr('colRevenue'),tr('colMB')].map(h=><th key={h} className={`px-3 py-2 font-semibold text-slate-500 ${h===tr('colDept')?'text-left':'text-right'}`}>{h}</th>)}</tr></thead>
                  <tbody>{(()=>{const bd:{[k:string]:{p:number;mb:number;n:number}}={};for(const g of filtered){if(!bd[g.dzial])bd[g.dzial]={p:0,mb:0,n:0};bd[g.dzial].p+=g.total.przychod;bd[g.dzial].mb+=g.total.mb;bd[g.dzial].n++;}return Object.entries(bd).sort(([,a],[,b])=>b.mb-a.mb).map(([dz,a])=>{const mp2=a.p>0?a.mb/a.p:0;const isSel=dDept===dz;return(<tr key={dz} onClick={()=>isSel?closeAll():openDept(dz)} className={`border-b border-slate-100 cursor-pointer transition-colors ${isSel?'bg-orange-50 border-l-2 border-l-orange-500':'hover:bg-slate-50'}`}><td className="px-3 py-2"><span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5">{dz}</span>{DZIALY_LABEL[dz]??dz}</td><td className="px-3 py-2 text-right text-slate-400">{a.n}</td><td className="px-3 py-2 text-right text-slate-700">{fmtM(a.p)}</td><td className="px-3 py-2 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mbBadge(mp2)}`}>{fmtPct(mp2)}</span></td></tr>);})})()}</tbody>
                </table></div>
              </div>
            </div>

            {/* Heatmapa — zwijana */}
            <Heatmap groups={filtered} tr={tr} onCellClick={openHeatCell} selectedCell={dHeatCell}/>
          </div>
        )}

        {/* ── KOSZT PRAC ────────────────────────────────────────────────────── */}
        {activeTab==='koszty'&&(
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label={tr('kpiLaborFiltered')} value={fmtM(kosztData.reduce((s,k)=>s+k.razem,0))} color="blue" onClick={()=>openKpi('koszt')}/>
              <KpiCard label={tr('kpiLaborTotal')} value={data.sumaKosztPrac?fmtM(data.sumaKosztPrac.razem):'—'}/>
              <KpiCard label={tr('kpiShare')} value={kpi.k>0?fmtPct(kosztData.reduce((s,k)=>s+k.razem,0)/kpi.k):'—'} color="amber"/>
              <KpiCard label={tr('kpiGrpsWithCost')} value={String(kosztData.length)} sub={`/ ${kpi.count}`}/>
            </div>

            {/* Trend — klikalny */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tr('chartKPTrend')}</p>
              <p className="text-[10px] text-slate-400 mb-3">{tr('chartKPTrendSub')}</p>
              <ResponsiveContainer width="100%" height={185}>
                <BarChart data={kosztTrend} margin={{top:4,right:4,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="month" tick={{fontSize:10}}/>
                  <YAxis tickFormatter={v=>fmtM(v)} tick={{fontSize:10}}/>
                  <Tooltip contentStyle={TT} formatter={((v:number,n:string)=>[fmtM(v),n]) as any}/>
                  <Legend wrapperStyle={{fontSize:10}}/>
                  <Bar dataKey={totalCostLabel} fill={C.slate} radius={[3,3,0,0]} cursor="pointer" onClick={(_:any,i:number)=>openKosztMonth(i)}>
                    {kosztTrend.map((_,i)=><Cell key={i} fill={dKosztMonth===i?'#7c3aed':C.slate}/>)}
                  </Bar>
                  <Bar dataKey={laborCostLabel} fill={C.blue} radius={[3,3,0,0]} cursor="pointer" onClick={(_:any,i:number)=>openKosztMonth(i)}>
                    {kosztTrend.map((_,i)=><Cell key={i} fill={dKosztMonth===i?'#1d4ed8':C.blue}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Koszt per lider — po miastach */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <p className="text-sm font-semibold text-slate-700">{tr('chartKPPerCity')}</p>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-auto">{tr('chartKPSort')}</span>
              </div>
              {kosztByCity.map(([miasto,kpItems])=>(
                <CityCostSection key={miasto} miasto={miasto} kosztItems={kpItems} filtered={filtered} onGroup={openGroup}/>
              ))}
              {/* Suma ogólna */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs font-semibold">
                <span className="text-slate-600">{tr('sumAll')}</span>
                <span className="ml-auto text-blue-800">{fmtM(kosztData.reduce((s,k)=>s+k.razem,0))}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── MAPA ──────────────────────────────────────────────────────────── */}
        {activeTab==='mapa'&&(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{tr('revenue')} & {tr('avgMB')}</p>
              <p className="text-[10px] text-slate-400 mb-4">{tr('chartMapSub')}</p>
              <PolandMap groups={filtered} onCity={openCity}/>
            </div>
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">{tr('chartCityRank')}</p>
                <div className="space-y-2">
                  {(()=>{const bc:{[k:string]:{p:number;mb:number;n:number}}={};for(const g of filtered){if(!bc[g.miasto])bc[g.miasto]={p:0,mb:0,n:0};bc[g.miasto].p+=g.total.przychod;bc[g.miasto].mb+=g.total.mb;bc[g.miasto].n++;}const maxP2=Math.max(...Object.values(bc).map(s=>s.p),1);return Object.entries(bc).sort(([,a],[,b])=>b.p-a.p).map(([miasto,s])=>{const mp2=s.p>0?s.mb/s.p:0;const isSel=dCity===miasto;return(<div key={miasto} onClick={()=>isSel?closeAll():openCity(miasto)} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border transition-all ${isSel?'bg-orange-50 border-orange-300':'bg-slate-50 border-transparent hover:border-orange-200 hover:bg-orange-50/40'}`}><div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:CITY_COLORS[miasto]??'#64748b'}}/><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-slate-700">{MIASTO_LABEL[miasto]??miasto}</span><span className="text-[10px] text-slate-400">×{s.n}</span></div><div className="flex items-center gap-2"><div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${s.p/maxP2*100}%`,backgroundColor:CITY_COLORS[miasto]??'#64748b'}}/></div><span className="text-[10px] text-slate-500 shrink-0 w-16 text-right">{fmtM(s.p)}</span></div></div><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${mbBadge(mp2)}`}>{fmtPct(mp2)}</span></div>);})})()}
                </div>
              </div>
              <Heatmap groups={filtered} tr={tr} onCellClick={openHeatCell} selectedCell={dHeatCell}/>
            </div>
          </div>
        )}
      </div>

      {/* Drawery */}
      {dGroup&&data&&<GroupDrawer group={dGroup} data={data} onClose={closeAll}/>}
      {dMonthIdx!==null&&<MonthDrawer idx={dMonthIdx} groups={filtered} onClose={closeAll} onGroup={openGroup}/>}
      {dCity&&<CityDrawer miasto={dCity} groups={filtered} onClose={closeAll} onGroup={openGroup}/>}
      {dDept&&<DeptDrawer dzial={dDept} groups={filtered} onClose={closeAll} onGroup={openGroup}/>}
      {dKpi&&<KpiDrawer type={dKpi} groups={filtered} onClose={closeAll} onGroup={openGroup}/>}
      {dKosztMonth!==null&&<KosztMonthDrawer idx={dKosztMonth} kosztData={kosztData} trendData={trendData} filtered={filtered} onClose={closeAll} onGroup={openGroup}/>}
      {dHeatCell&&<HeatmapCellDrawer groups={filtered} miasto={dHeatCell.miasto} monthIdx={dHeatCell.monthIdx} onClose={closeAll} tr={tr}/>}
    </div>
  );
}
