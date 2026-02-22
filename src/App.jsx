import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { auth, db, googleProvider, appleProvider } from "./firebase.js";
import {
  signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile
} from "firebase/auth";
import { collection, doc, addDoc, deleteDoc, updateDoc, getDocs, onSnapshot, setDoc, getDoc } from "firebase/firestore";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CATS_REC = ["Salário","Freelance","Investimentos","Aluguel Recebido","Bônus","Reembolso","Pensão Recebida","Venda de Produtos","Comissão","Renda Extra","Dividendos","Aposentadoria","Outros"];
const CATS_DEP = ["Moradia","Alimentação","Transporte","Saúde","Educação","Lazer","Vestuário","Assinaturas","Pets","Beleza e Cuidados","Eletrônicos","Presentes","Impostos","Dívidas","Seguros","Academia","Farmácia","Outros"];
const FORMAS_REC = ["PIX","Transferência","Depósito","TED","Dinheiro","Automático"];
const FORMAS_DEP = ["Cartão Crédito","Cartão Débito","PIX","Dinheiro","Débito Auto","Boleto","App"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const FREQ_OPTS = [{id:"mensal",label:"Todo mês",icon:"📅"},{id:"quinzenal",label:"Quinzenal",icon:"🗓"},{id:"semanal",label:"Toda semana",icon:"📆"},{id:"anual",label:"Todo ano",icon:"📌"}];
const AREAS = ["Tecnologia","Saúde","Educação","Finanças","Direito","Marketing","Engenharia","Administração","Comércio","Indústria","Construção","Logística","Arte e Design","Comunicação","RH","Consultoria","Outro"];
const NIVEIS = [
  "Estagiário","Aprendiz","Trainee","Auxiliar","Assistente",
  "Operador","Técnico","Analista Júnior","Analista Pleno","Analista Sênior",
  "Especialista","Consultor","Líder Técnico",
  "Coordenador","Supervisor","Gerente","Gerente Sênior","Gerente Regional",
  "Diretor","VP / Vice-Presidente","C-Level (CEO, CFO, COO...)",
  "Autônomo / Freelancer","MEI / Microempreendedor","Sócio / Proprietário",
  "Funcionário Público","Servidor Público","Militar","Professor","Pesquisador"
];
const CATS_CARREIRA = ["Curso / Certificação","Livro / Material","Ferramenta / Software","Equipamento","Uniforme / Vestuário","Evento / Congresso","Transporte Trabalho","Outros"];

const CAT_COLORS = {
  "Moradia":"#60A5FA","Alimentação":"#FB923C","Transporte":"#A78BFA","Saúde":"#34D399","Educação":"#FBBF24",
  "Lazer":"#F472B6","Vestuário":"#2DD4BF","Assinaturas":"#818CF8","Outros":"#94A3B8","Pets":"#F97316",
  "Beleza e Cuidados":"#E879F9","Eletrônicos":"#38BDF8","Presentes":"#FB7185","Impostos":"#FCD34D",
  "Dívidas":"#F87171","Seguros":"#6EE7B7","Academia":"#67E8F9","Farmácia":"#86EFAC","Salário":"#34D399",
  "Freelance":"#60A5FA","Investimentos":"#FBBF24","Aluguel Recebido":"#A78BFA","Bônus":"#F472B6",
  "Reembolso":"#2DD4BF","Pensão Recebida":"#FCA5A5","Venda de Produtos":"#FDE68A","Comissão":"#6EE7B7",
  "Renda Extra":"#93C5FD","Dividendos":"#C4B5FD","Aposentadoria":"#A7F3D0",
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt    = v => "R$ "+Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtK   = v => v>=1000?`R$${(v/1000).toFixed(1).replace(".",",")}k`:`R$${Number(v).toFixed(0)}`;
const getMes = d => d?d.slice(0,7):"";
const fmtD   = d => { try{const[y,m,dd]=d.split("-");return`${dd}/${m}/${y}`;}catch{return d;} };
const today  = () => new Date().toISOString().slice(0,10);
const curMes = () => { const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; };
const mesLblFull = ma => { try{const[y,m]=ma.split("-");return`${MESES[+m-1]}/${y}`;}catch{return ma;} };
const pct = (v,t) => t>0?Math.min(100,(v/t)*100):0;

function gerarRecorrentesDoMes(recorrentes, lancs) {
  const hoje=new Date(),mes=curMes(),novos=[];
  for (const rec of recorrentes) {
    if (!rec.ativo) continue;
    const dim=new Date(hoje.getFullYear(),hoje.getMonth()+1,0).getDate();
    if (rec.freq==="mensal"||rec.freq==="quinzenal") {
      const dia=Math.min(rec.dia,dim);
      const dt=`${mes}-${String(dia).padStart(2,"0")}`;
      if (!lancs.some(l=>l.recId===rec.id&&l.data===dt))
        novos.push({recId:rec.id,tipo:rec.tipo,desc:rec.desc,cat:rec.cat,forma:rec.forma,valor:rec.valor,data:dt,auto:true});
      if (rec.freq==="quinzenal") {
        const dia2=Math.min(rec.dia+15,dim);
        const dt2=`${mes}-${String(dia2).padStart(2,"0")}`;
        if (!lancs.some(l=>l.recId===rec.id&&l.data===dt2))
          novos.push({recId:rec.id,tipo:rec.tipo,desc:rec.desc,cat:rec.cat,forma:rec.forma,valor:rec.valor,data:dt2,auto:true});
      }
    }
  }
  return novos;
}

// ─── AI ───────────────────────────────────────────────────────────────────────
const AI_SYS = `Você é assistente financeiro. Responda APENAS JSON válido.
Cats RECEITA: ${CATS_REC.join(",")}.
Cats DESPESA: ${CATS_DEP.join(",")}.
Formas: Cartão Crédito,Cartão Débito,PIX,Dinheiro,Débito Auto,Boleto,App,Transferência,TED.
1 item: {"action":"lancamento","tipo":"Despesa","desc":"X","cat":"Y","forma":"PIX","valor":0,"data":"HOJE","confirmacao":"msg emoji"}
Múltiplos: {"action":"multiplos","itens":[{tipo,desc,cat,forma,valor,data}],"confirmacao":"msg"}
Outro: {"action":"conversa","resposta":"msg"}`;

async function callAI(msg,lancs) {
  const mes=curMes(),dm=lancs.filter(l=>l.data?.startsWith(mes));
  const tR=dm.filter(l=>l.tipo==="Receita").reduce((s,l)=>s+l.valor,0);
  const tD=dm.filter(l=>l.tipo==="Despesa").reduce((s,l)=>s+l.valor,0);
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,
      system:AI_SYS+`\nHoje:${today()} Rec:R$${tR.toFixed(0)},Dep:R$${tD.toFixed(0)}`,
      messages:[{role:"user",content:msg}]})});
  const d=await r.json();
  const raw=d.content?.map(b=>b.text||"").join("").trim()||"{}";
  try{return JSON.parse(raw.replace(/```json|```/g,"").trim());}
  catch{return{action:"conversa",resposta:"Não entendi 😊"};}
}

async function transcribeAudio(blob) {
  const form=new FormData();
  form.append("file",blob,"audio.webm");
  form.append("model","whisper-1");
  form.append("language","pt");
  const r=await fetch("/api/transcribe",{method:"POST",body:form});
  if(!r.ok) throw new Error("Transcription failed");
  const d=await r.json();
  return d.text||"";
}

// ─── DESIGN ────────────────────────────────────────────────────────────────────
const G={bg:"#0A0A0F",card:"#111118",card2:"#16161F",border:"#1E1E2A",border2:"#2A2A3A",text:"#F0EEF8",muted:"#6B6880",accent:"#7C6AF7",accentL:"#7C6AF720",green:"#2ECC8E",greenL:"#2ECC8E18",red:"#FF5C6A",redL:"#FF5C6A18",yellow:"#F5C842",blue:"#4A9EFF",orange:"#FB923C"};
const NH=62,HH=52;

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=Figtree:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0A0A0F;color:#F0EEF8;font-family:'Figtree',sans-serif;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased}
  input,select,button,textarea{font-family:inherit;-webkit-appearance:none;appearance:none}
  input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.55)}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
  *{scrollbar-width:none}*::-webkit-scrollbar{display:none}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  @keyframes popIn{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
  @keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .press:active{opacity:.7;transform:scale(.97)}
  .inp{width:100%;padding:12px 14px;background:#16161F;border:1px solid #2A2A3A;border-radius:12px;color:#F0EEF8;font-size:15px;outline:none}
  .inp:focus{border-color:#7C6AF7}
`;

const Tag=({children,color=G.muted})=>(
  <span style={{display:"inline-flex",alignItems:"center",padding:"1px 8px",borderRadius:20,fontSize:10,fontWeight:600,whiteSpace:"nowrap",background:color+"22",color,border:`1px solid ${color}33`}}>{children}</span>
);
const Spinner=({size=20,color=G.accent})=>(
  <div style={{width:size,height:size,border:`2px solid ${color}33`,borderTop:`2px solid ${color}`,borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}}/>
);
const Lbl=({children,opt})=>(
  <div style={{fontSize:11,fontWeight:600,letterSpacing:.8,textTransform:"uppercase",color:G.muted,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
    {children}{opt&&<span style={{fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:11,color:G.muted}}>(opcional)</span>}
  </div>
);

function Sheet({open,onClose,title,children}){
  if(!open)return null;
  return(
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.78)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end"}}>
      <div style={{width:"100%",maxHeight:"94vh",background:G.card,borderRadius:"22px 22px 0 0",border:`1px solid ${G.border2}`,display:"flex",flexDirection:"column",animation:"slideUp .28s cubic-bezier(.32,.72,0,1)"}}>
        <div style={{display:"flex",justifyContent:"center",paddingTop:10,paddingBottom:2}}><div style={{width:36,height:4,borderRadius:2,background:G.border2}}/></div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 20px 14px"}}>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700}}>{title}</div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"none",background:G.card2,color:G.muted,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{overflowY:"auto",padding:"0 20px 32px",flex:1}}>{children}</div>
      </div>
    </div>
  );
}

function Nav({view,setView}){
  const items=[{id:"dashboard",icon:"⬡",l:"Início"},{id:"receitas",icon:"↑",l:"Receitas"},{id:"despesas",icon:"↓",l:"Despesas"},{id:"carreira",icon:"◈",l:"Perfil"},{id:"financas",icon:"◎",l:"Finanças"},{id:"chat",icon:"✦",l:"IA"}];
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:G.card,borderTop:`1px solid ${G.border}`,display:"flex",height:NH}}>
      {items.map(it=>(
        <button key={it.id} onClick={()=>setView(it.id)} className="press" style={{flex:1,padding:"8px 0",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:view===it.id?G.accent:G.muted,position:"relative"}}>
          {view===it.id&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:24,height:2,borderRadius:"0 0 2px 2px",background:G.accent}}/>}
          <span style={{fontSize:20,lineHeight:1}}>{it.icon}</span>
          <span style={{fontSize:9,fontWeight:600}}>{it.l}</span>
        </button>
      ))}
    </div>
  );
}

function Head({view,onRec,onDep,user,onLogout}){
  const T={dashboard:"Início",receitas:"Receitas",despesas:"Despesas",carreira:"Meu Perfil",financas:"Finanças",chat:"IA"};
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,height:HH,background:G.card,borderBottom:`1px solid ${G.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px"}}>
      <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,letterSpacing:-.5}}>fin<span style={{color:G.accent}}>ance</span><span style={{fontFamily:"'Figtree',sans-serif",fontSize:12,fontWeight:400,color:G.muted,marginLeft:8}}>{T[view]}</span></div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {(view==="receitas"||view==="despesas")&&<>
          <button onClick={onRec} className="press" style={{padding:"6px 13px",borderRadius:20,border:`1px solid ${G.green}55`,background:G.greenL,color:G.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Rec</button>
          <button onClick={onDep} className="press" style={{padding:"6px 13px",borderRadius:20,border:`1px solid ${G.red}55`,background:G.redL,color:G.red,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Dep</button>
        </>}
        {view==="dashboard"&&<>
          <button onClick={onRec} className="press" style={{padding:"6px 13px",borderRadius:20,border:`1px solid ${G.green}55`,background:G.greenL,color:G.green,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Rec</button>
          <button onClick={onDep} className="press" style={{padding:"6px 13px",borderRadius:20,border:`1px solid ${G.red}55`,background:G.redL,color:G.red,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Dep</button>
        </>}
        <button onClick={onLogout} className="press" title="Sair"
          style={{width:32,height:32,borderRadius:"50%",border:`1px solid ${G.border2}`,background:"none",cursor:"pointer",overflow:"hidden",padding:0,flexShrink:0}}>
          {user?.photoURL?<img src={user.photoURL} style={{width:"100%",height:"100%",objectFit:"cover"}} referrerPolicy="no-referrer"/>
            :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:G.accent,background:G.accentL}}>{(user?.displayName||user?.email||"U")[0].toUpperCase()}</div>}
        </button>
      </div>
    </div>
  );
}

// ─── TX ROW ───────────────────────────────────────────────────────────────────
function TxRow({l,onDelete,full}){
  const isR=l.tipo==="Receita",c=isR?G.green:G.red;
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${G.border}`}}>
      <div style={{width:38,height:38,borderRadius:11,flexShrink:0,background:isR?G.greenL:G.redL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:c,position:"relative"}}>
        {isR?"↑":"↓"}
        {l.auto&&<div style={{position:"absolute",bottom:-2,right:-2,width:13,height:13,borderRadius:"50%",background:G.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff"}}>↻</div>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.desc||l.cat}</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:G.muted}}>{fmtD(l.data)}</span>
          <Tag color={CAT_COLORS[l.cat]||G.muted}>{l.cat}</Tag>
          {full&&<span style={{fontSize:11,color:G.muted}}>{l.forma}</span>}
          {l.auto&&<Tag color={G.accent}>↻ auto</Tag>}
        </div>
      </div>
      <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:c,flexShrink:0}}>{isR?"+":"-"}{fmtK(l.valor)}</div>
      <button onClick={()=>onDelete(l.id)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:20,padding:"2px 4px",lineHeight:1}}
        onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
    </div>
  );
}

// ─── LANC FORM ────────────────────────────────────────────────────────────────
function LancForm({tipo,setTipo,form,setForm,onSave}){
  const sw=t=>{setTipo(t);setForm(f=>({...f,cat:t==="Receita"?CATS_REC[0]:CATS_DEP[0],forma:t==="Receita"?FORMAS_REC[0]:FORMAS_DEP[0]}));};
  const ac=tipo==="Receita"?G.green:G.red;
  const isRec=form.recorrente;
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {["Receita","Despesa"].map(t=><button key={t} onClick={()=>sw(t)} className="press" style={{flex:1,padding:"12px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:14,fontFamily:"inherit",background:tipo===t?(t==="Receita"?G.greenL:G.redL):G.card2,color:tipo===t?(t==="Receita"?G.green:G.red):G.muted,border:`1px solid ${tipo===t?(t==="Receita"?G.green+"66":G.red+"66"):G.border}`}}>{t==="Receita"?"↑ Receita":"↓ Despesa"}</button>)}
      </div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <Lbl>Valor (R$)</Lbl>
        <input type="number" inputMode="decimal" placeholder="0,00" min="0" step="0.01" value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{width:"100%",textAlign:"center",fontFamily:"'Fraunces',serif",fontSize:36,fontWeight:700,color:ac,background:"transparent",border:"none",borderBottom:`2px solid ${ac}`,borderRadius:0,padding:"4px 0 10px",outline:"none",color:ac}}/>
      </div>
      <div style={{marginBottom:14}}><Lbl opt>Descrição</Lbl><input type="text" placeholder="Ex: Salário, Mercado, Uber..." value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} className="inp"/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div><Lbl>Data</Lbl><input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))} className="inp"/></div>
        <div><Lbl>Categoria</Lbl><select value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))} className="inp">{(tipo==="Receita"?CATS_REC:CATS_DEP).map(c=><option key={c}>{c}</option>)}</select></div>
      </div>
      <div style={{marginBottom:16}}><Lbl>Forma de Pagamento</Lbl>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
          {(tipo==="Receita"?FORMAS_REC:FORMAS_DEP).map(f=><div key={f} onClick={()=>setForm(fm=>({...fm,forma:f}))} className="press" style={{padding:"8px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:form.forma===f?ac+"22":G.card2,border:`1px solid ${form.forma===f?ac+"88":G.border}`,color:form.forma===f?ac:G.muted}}>{f}</div>)}
        </div>
      </div>
      <div onClick={()=>setForm(f=>({...f,recorrente:!f.recorrente}))} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderRadius:14,border:`1px solid ${isRec?ac+"66":G.border}`,background:isRec?ac+"11":G.card2,cursor:"pointer",marginBottom:isRec?14:24,transition:"all .2s"}}>
        <div><div style={{fontSize:14,fontWeight:600,color:isRec?ac:G.text}}>↻ Lançamento recorrente</div><div style={{fontSize:12,color:G.muted,marginTop:2}}>Repete automaticamente todo mês</div></div>
        <div style={{width:44,height:24,borderRadius:12,background:isRec?ac:G.border2,position:"relative",transition:"background .2s",flexShrink:0}}><div style={{position:"absolute",top:3,left:isRec?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></div>
      </div>
      {isRec&&<div style={{background:G.card2,borderRadius:14,padding:14,marginBottom:24,animation:"fadeUp .15s ease"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><Lbl>Frequência</Lbl><select value={form.freq||"mensal"} onChange={e=>setForm(f=>({...f,freq:e.target.value}))} className="inp">{FREQ_OPTS.map(f=><option key={f.id} value={f.id}>{f.icon} {f.label}</option>)}</select></div>
          <div><Lbl>Dia do mês</Lbl><input type="number" min="1" max="31" value={form.dia||1} onChange={e=>setForm(f=>({...f,dia:+e.target.value}))} className="inp"/></div>
        </div>
        <div style={{fontSize:12,color:G.muted,textAlign:"center"}}>💡 Gerado automaticamente todo mês no dia {form.dia||1}</div>
      </div>}
      <button onClick={onSave} className="press" style={{width:"100%",padding:"16px",borderRadius:14,border:"none",cursor:"pointer",fontWeight:700,fontSize:16,fontFamily:"inherit",background:ac,color:"#fff"}}>Salvar {tipo}</button>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({lancs,onDelete}){
  const [mes,setMes]=useState(curMes());
  const md=[...new Set(lancs.map(l=>getMes(l.data)))].sort().reverse().slice(0,8);
  if(!md.includes(curMes()))md.unshift(curMes());
  const dm=lancs.filter(l=>getMes(l.data)===mes);
  const tR=dm.filter(l=>l.tipo==="Receita").reduce((s,l)=>s+l.valor,0);
  const tD=dm.filter(l=>l.tipo==="Despesa").reduce((s,l)=>s+l.valor,0);
  const sal=tR-tD,po=tR>0?sal/tR:0;
  const cats=CATS_DEP.map(c=>({name:c,v:dm.filter(l=>l.tipo==="Despesa"&&l.cat===c).reduce((s,l)=>s+l.valor,0),color:CAT_COLORS[c]||"#94A3B8"})).filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  // Gastos semanais
  const [y,mNum]=mes.split("-").map(Number);
  const diasNoMes=new Date(y,mNum,0).getDate();
  const semanas=Array.from({length:5},(_,i)=>{
    const dIni=i*7+1,dFim=Math.min((i+1)*7,diasNoMes);
    if(dIni>diasNoMes)return null;
    const dep=dm.filter(l=>l.tipo==="Despesa"&&l.data).filter(l=>{const d=parseInt(l.data.slice(8,10));return d>=dIni&&d<=dFim;}).reduce((s,l)=>s+l.valor,0);
    return{name:`Sem ${i+1}`,dep,dIni,dFim};
  }).filter(Boolean);
  const maxDep=Math.max(...semanas.map(s=>s.dep),1);
  const totalSem=semanas.reduce((s,w)=>s+w.dep,0);
  const melhor=totalSem>0?semanas.reduce((b,w)=>w.dep<b.dep?w:b,semanas[0]):null;
  const pior=totalSem>0?semanas.reduce((b,w)=>w.dep>b.dep?w:b,semanas[0]):null;
  return(<div style={{paddingBottom:8}}>
    <div style={{background:"linear-gradient(145deg,#14142A,#0d0d1a)",border:`1px solid ${G.border}`,borderRadius:20,padding:"24px 20px 20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-50,right:-50,width:180,height:180,borderRadius:"50%",background:`radial-gradient(circle,${G.accent}18,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:4}}>Saldo do Mês</div>
      <div style={{fontFamily:"'Fraunces',serif",fontSize:38,fontWeight:700,letterSpacing:-2,color:sal>=0?G.green:G.red,marginBottom:16,lineHeight:1}}>{(sal<0?"-":"")+fmt(Math.abs(sal))}</div>
      <div style={{display:"flex"}}>
        {[{l:"Receitas",v:"+"+fmtK(tR),c:G.green},{l:"Despesas",v:"-"+fmtK(tD),c:G.red},{l:"Renda Livre",v:(po*100).toFixed(0)+"%",c:G.yellow}].map((k,i)=>(
          <div key={i} style={{flex:1,borderRight:i<2?`1px solid ${G.border}`:"none",paddingRight:i<2?16:0,paddingLeft:i>0?16:0}}>
            <div style={{fontSize:10,color:G.muted,marginBottom:3}}>{k.l}</div>
            <div style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:16,paddingBottom:2}}>
      {md.map(m=><div key={m} onClick={()=>setMes(m)} className="press" style={{padding:"7px 16px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:m===mes?G.accentL:G.card2,border:`1px solid ${m===mes?G.accent:G.border}`,color:m===mes?G.accent:G.muted}}>{mesLblFull(m)}</div>)}
    </div>
    <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16,marginBottom:16}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Últimos Lançamentos</div>
      {lancs.length===0?<div style={{textAlign:"center",color:G.muted,padding:"24px 0",fontSize:13}}>Sem lançamentos ainda</div>
        :[...lancs].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,7).map(l=><TxRow key={l.id} l={l} onDelete={onDelete}/>)}
    </div>
    {cats.length>0&&<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16,marginBottom:16}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Por Categoria</div>
      {cats.slice(0,6).map(c=>{const p=tD>0?c.v/tD*100:0;return(<div key={c.name} style={{marginBottom:11}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:7,height:7,borderRadius:"50%",background:c.color}}/><span style={{fontSize:13}}>{c.name}</span></div>
          <span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:c.color}}>{fmt(c.v)}</span>
        </div>
        <div style={{height:3,background:G.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:c.color,borderRadius:3}}/></div>
      </div>);})}
    </div>}
    <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Gastos Semanais</div>
        <div style={{fontSize:11,color:G.muted}}>{mesLblFull(mes)}</div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={semanas} barCategoryGap="30%" margin={{left:-18,right:8}}>
          <XAxis dataKey="name" tick={{fill:G.muted,fontSize:11}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
          <Tooltip contentStyle={{background:G.card2,border:`1px solid ${G.border2}`,borderRadius:10,fontSize:11}} cursor={{fill:"#ffffff06"}} formatter={v=>"R$ "+v.toLocaleString("pt-BR",{minimumFractionDigits:2})}/>
          <Bar dataKey="dep" name="Gastos" radius={[6,6,0,0]} fill={G.red} fillOpacity={.75}/>
        </BarChart>
      </ResponsiveContainer>
      {totalSem>0&&<div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:`1px solid ${G.border}`}}>
        {[{l:"Total",v:fmtK(totalSem),c:G.red},{l:"Menor gasto",v:melhor?.name||"—",c:G.green},{l:"Maior gasto",v:pior?.name||"—",c:G.orange}].map((k,i)=>(
          <div key={i} style={{textAlign:"center",flex:1,borderRight:i<2?`1px solid ${G.border}`:"none"}}>
            <div style={{fontSize:10,color:G.muted,marginBottom:2}}>{k.l}</div>
            <div style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>}
      {totalSem===0&&<div style={{fontSize:13,color:G.muted,textAlign:"center",marginTop:8}}>Sem despesas este mês</div>}
    </div>
  </div>);
}

// ─── LANCS VIEW ───────────────────────────────────────────────────────────────
function LancsView({tipo,lancs,recorrentes,onDelete,onToggleRec,onDeleteRec}){
  const [mf,setMf]=useState(curMes());
  const [cf,setCf]=useState("");
  const [sc,setSc]=useState(false);
  const isR=tipo==="Receita",ac=isR?G.green:G.red,cats=isR?CATS_REC:CATS_DEP;
  const todos=lancs.filter(l=>l.tipo===tipo);
  const meses=[...new Set(todos.map(l=>getMes(l.data)))].sort().reverse();
  let data=todos;
  if(mf)data=data.filter(l=>getMes(l.data)===mf);
  if(cf)data=data.filter(l=>l.cat===cf);
  data=[...data].sort((a,b)=>b.data.localeCompare(a.data));
  const mt=todos.filter(l=>getMes(l.data)===curMes()).reduce((s,l)=>s+l.valor,0);
  const at=todos.filter(l=>l.data.startsWith(new Date().getFullYear())).reduce((s,l)=>s+l.valor,0);
  const listaRec=recorrentes.filter(r=>r.tipo===tipo);
  return(<div style={{paddingBottom:8}}>
    <div style={{display:"flex",gap:10,overflowX:"auto",marginBottom:16,paddingBottom:2}}>
      {[{l:"Mês atual",v:fmtK(mt),c:ac},{l:`Ano ${new Date().getFullYear()}`,v:fmtK(at),c:G.blue},{l:"Registros",v:String(todos.length),c:G.yellow},{l:"Recorrentes",v:String(listaRec.filter(r=>r.ativo).length),c:G.accent}].map((k,i)=>(
        <div key={i} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:14,padding:"14px 18px",flexShrink:0,minWidth:115,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:k.c}}/>
          <div style={{fontSize:10,color:G.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.l}</div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:k.c}}>{k.v}</div>
        </div>
      ))}
    </div>
    {listaRec.length>0&&<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,marginBottom:16,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${G.border}`,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.accent}}>↻ {isR?"Ganhos":"Custos"} recorrentes</span>
        <span style={{fontSize:11,color:G.muted,marginLeft:"auto"}}>{fmtK(listaRec.filter(r=>r.ativo).reduce((s,r)=>s+r.valor,0))}/mês</span>
      </div>
      <div style={{padding:"0 16px"}}>
        {listaRec.map(r=>(
          <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${G.border}`}}>
            <div style={{width:36,height:36,borderRadius:10,flexShrink:0,background:r.ativo?(isR?G.greenL:G.redL):G.border2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{FREQ_OPTS.find(f=>f.id===r.freq)?.icon||"📅"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,opacity:r.ativo?1:.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc||r.cat}</div>
              <div style={{display:"flex",gap:6,marginTop:2}}><Tag color={CAT_COLORS[r.cat]||G.muted}>{r.cat}</Tag><span style={{fontSize:11,color:G.muted}}>{FREQ_OPTS.find(f=>f.id===r.freq)?.label} · dia {r.dia}</span></div>
            </div>
            <div style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:r.ativo?ac:G.muted,flexShrink:0}}>{fmtK(r.valor)}</div>
            <button onClick={()=>onToggleRec(r.id)} className="press" style={{width:38,height:22,borderRadius:11,border:"none",cursor:"pointer",background:r.ativo?ac:G.border2,position:"relative",flexShrink:0,transition:"background .2s"}}><div style={{position:"absolute",top:2,left:r.ativo?18:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></button>
            <button onClick={()=>onDeleteRec(r.id)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:18,padding:"2px",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
          </div>
        ))}
      </div>
    </div>}
    <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:10,paddingBottom:2}}>
      <div onClick={()=>setMf("")} className="press" style={{padding:"7px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:!mf?G.accentL:G.card2,border:`1px solid ${!mf?G.accent:G.border}`,color:!mf?G.accent:G.muted}}>Todos</div>
      {meses.map(m=><div key={m} onClick={()=>setMf(mf===m?"":m)} className="press" style={{padding:"7px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:mf===m?G.accentL:G.card2,border:`1px solid ${mf===m?G.accent:G.border}`,color:mf===m?G.accent:G.muted}}>{mesLblFull(m)}</div>)}
    </div>
    <div style={{marginBottom:14}}>
      <div onClick={()=>setSc(v=>!v)} className="press" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:600,background:cf?ac+"22":G.card2,border:`1px solid ${cf?ac+"88":G.border}`,color:cf?ac:G.muted,marginBottom:sc?10:0}}>{cf||"Categoria"} {sc?"▴":"▾"}</div>
      {sc&&<div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
        <div onClick={()=>{setCf("");setSc(false);}} className="press" style={{padding:"6px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:!cf?G.accentL:G.card2,border:`1px solid ${!cf?G.accent:G.border}`,color:!cf?G.accent:G.muted}}>Todas</div>
        {cats.map(c=><div key={c} onClick={()=>{setCf(cf===c?"":c);setSc(false);}} className="press" style={{padding:"6px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:cf===c?(CAT_COLORS[c]||ac)+"22":G.card2,border:`1px solid ${cf===c?(CAT_COLORS[c]||ac)+"88":G.border}`,color:cf===c?(CAT_COLORS[c]||ac):G.muted}}>{c}</div>)}
      </div>}
    </div>
    <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${G.border}`}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.muted}}>{data.length} registro{data.length!==1?"s":""}</span>
        <span style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:ac}}>{isR?"+":"-"}{fmtK(data.reduce((s,l)=>s+l.valor,0))}</span>
      </div>
      {data.length===0?<div style={{textAlign:"center",padding:"48px 20px",color:G.muted}}><div style={{fontSize:40,marginBottom:10}}>{isR?"💰":"💸"}</div><div style={{fontSize:14}}>Nenhum lançamento</div></div>
        :<div style={{padding:"0 16px"}}>{data.map(l=><TxRow key={l.id} l={l} onDelete={onDelete} full/>)}</div>}
    </div>
  </div>);
}

// ─── PERFIL VIEW ─────────────────────────────────────────────────────────────
function CarreiraView({uid,user}){
  const [perfil,setPerfil]=useState(null);
  const [historico,setHistorico]=useState([]);
  const [metas,setMetas]=useState([]);
  const [gastos,setGastos]=useState([]);
  const [secao,setSecao]=useState("sobre");
  const [sheet,setSheet]=useState(null);
  const [showCard,setShowCard]=useState(false);
  const [saving,setSaving]=useState(false);

  // forms
  const [fp,setFp]=useState({
    nome:"",cargo:"",empresa:"",area:AREAS[0],nivel:NIVEIS[0],
    salarioAtual:"",desde:"",bio:"",fotoUrl:"",
    linkedin:"",instagram:"",site:"",
    skills:[],idiomas:[],
    formacao:[]
  });
  const [fh,setFh]=useState({cargo:"",empresa:"",salario:"",data:today().slice(0,7),obs:""});
  const [fm,setFm]=useState({titulo:"",valorAlvo:"",prazo:"",tipo:"Renda Mensal"});
  const [fg,setFg]=useState({desc:"",cat:CATS_CARREIRA[0],valor:"",data:today(),retorno:""});
  const [fform,setFform]=useState({curso:"",inst:"",ano:"",tipo:"Graduação"});
  const [newSkill,setNewSkill]=useState("");
  const [newIdioma,setNewIdioma]=useState("");

  useEffect(()=>{
    if(!uid) return;
    async function load(){
      try{
        const pSnap=await getDoc(doc(db,"users",uid,"carreira","perfil"));
        if(pSnap.exists()){
          const d=pSnap.data();
          setPerfil(d);
          setFp(f=>({...f,...d,skills:d.skills||[],idiomas:d.idiomas||[],formacao:d.formacao||[]}));
        }
      }catch(e){console.warn("perfil:",e);}
      try{
        const hSnap=await getDocs(collection(db,"users",uid,"carreira","historico"));
        setHistorico(hSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.data||"").localeCompare(a.data||"")));
      }catch(e){console.warn("historico:",e);}
      try{
        const mSnap=await getDocs(collection(db,"users",uid,"carreira","metas"));
        setMetas(mSnap.docs.map(d=>({id:d.id,...d.data()})));
      }catch(e){console.warn("metas:",e);}
      try{
        const gSnap=await getDocs(collection(db,"users",uid,"carreira","gastos"));
        setGastos(gSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.data||"").localeCompare(a.data||"")));
      }catch(e){console.warn("gastos:",e);}
    }
    load();
  },[uid]);

  async function salvarPerfil(){
    setSaving(true);
    const v={...fp,salarioAtual:parseFloat(fp.salarioAtual)||0,updatedAt:today()};
    try{
      await setDoc(doc(db,"users",uid,"carreira","perfil"),v);
      setPerfil(v);setSheet(null);
    }catch(e){console.error(e);alert("Erro ao salvar. Verifique as regras do Firestore.");}
    setSaving(false);
  }
  async function salvarHistorico(){
    setSaving(true);
    try{
      const v={...fh,salario:parseFloat(fh.salario)||0};
      const ref=await addDoc(collection(db,"users",uid,"carreira","historico"),v);
      setHistorico(p=>[{id:ref.id,...v},...p].sort((a,b)=>(b.data||"").localeCompare(a.data||"")));
      setFh({cargo:"",empresa:"",salario:"",data:today().slice(0,7),obs:""});setSheet(null);
    }catch(e){console.error(e);alert("Erro ao salvar.");}
    setSaving(false);
  }
  async function salvarMeta(){
    setSaving(true);
    try{
      const v={...fm,valorAlvo:parseFloat(fm.valorAlvo)||0,valorAtual:0,createdAt:today()};
      const ref=await addDoc(collection(db,"users",uid,"carreira","metas"),v);
      setMetas(p=>[...p,{id:ref.id,...v}]);
      setFm({titulo:"",valorAlvo:"",prazo:"",tipo:"Renda Mensal"});setSheet(null);
    }catch(e){console.error(e);alert("Erro ao salvar.");}
    setSaving(false);
  }
  async function salvarGasto(){
    setSaving(true);
    try{
      const v={...fg,valor:parseFloat(fg.valor)||0};
      const ref=await addDoc(collection(db,"users",uid,"carreira","gastos"),v);
      setGastos(p=>[{id:ref.id,...v},...p]);
      setFg({desc:"",cat:CATS_CARREIRA[0],valor:"",data:today(),retorno:""});setSheet(null);
    }catch(e){console.error(e);alert("Erro ao salvar.");}
    setSaving(false);
  }
  async function deletarItem(col,id,setter){
    try{
      await deleteDoc(doc(db,"users",uid,"carreira",col,id));
      setter(p=>p.filter(x=>x.id!==id));
    }catch(e){console.error(e);}
  }
  async function atualizarMeta(id,valorAtual){
    try{
      await updateDoc(doc(db,"users",uid,"carreira","metas",id),{valorAtual});
      setMetas(p=>p.map(m=>m.id===id?{...m,valorAtual}:m));
    }catch(e){console.error(e);}
  }

  const addSkill=()=>{ if(newSkill.trim()){setFp(f=>({...f,skills:[...f.skills,newSkill.trim()]}));setNewSkill("");}};
  const rmSkill=i=>setFp(f=>({...f,skills:f.skills.filter((_,j)=>j!==i)}));
  const addIdioma=()=>{ if(newIdioma.trim()){setFp(f=>({...f,idiomas:[...f.idiomas,newIdioma.trim()]}));setNewIdioma("");}};
  const rmIdioma=i=>setFp(f=>({...f,idiomas:f.idiomas.filter((_,j)=>j!==i)}));
  const addForm=()=>{ if(fform.curso.trim()){setFp(f=>({...f,formacao:[...f.formacao,{...fform}]}));setFform({curso:"",inst:"",ano:"",tipo:"Graduação"});}};
  const rmForm=i=>setFp(f=>({...f,formacao:f.formacao.filter((_,j)=>j!==i)}));

  const totalGastos=gastos.reduce((s,g)=>s+g.valor,0);
  const salAtual=perfil?.salarioAtual||0;
  const ultimoAumento=historico.length>1?(historico[0].salario-historico[1].salario):0;
  const nomeExibido=perfil?.nome||(user?.displayName)||"";

  const SECOES=[
    {id:"sobre",icon:"👤",label:"Sobre"},
    {id:"historico",icon:"📈",label:"Histórico"},
    {id:"metas",icon:"🎯",label:"Metas"},
    {id:"gastos",icon:"🎓",label:"Gastos"},
  ];

  // ── CARD VISUAL ──────────────────────────────────────────────────────────────
  const CardVisita=()=>(
    <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:360}}>
        {/* The Card */}
        <div id="profile-card" style={{background:"linear-gradient(145deg,#1a1040,#111128)",border:`1px solid ${G.border2}`,borderRadius:24,padding:"28px 24px",position:"relative",overflow:"hidden"}}>
          {/* BG decoration */}
          <div style={{position:"absolute",top:-60,right:-60,width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle,${G.orange}20,transparent 65%)`,pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:-40,left:-40,width:160,height:160,borderRadius:"50%",background:`radial-gradient(circle,${G.accent}15,transparent 65%)`,pointerEvents:"none"}}/>

          {/* Top row */}
          <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20,position:"relative"}}>
            <div style={{width:64,height:64,borderRadius:18,flexShrink:0,overflow:"hidden",border:`2px solid ${G.orange}55`,background:`linear-gradient(135deg,${G.orange}44,${G.accent}44)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {perfil?.fotoUrl
                ?<img src={perfil.fotoUrl} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                :<span style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:700,color:G.orange}}>{nomeExibido?nomeExibido[0].toUpperCase():"?"}</span>}
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,lineHeight:1.2,marginBottom:4}}>{nomeExibido||"Seu Nome"}</div>
              <div style={{fontSize:13,fontWeight:600,color:G.orange}}>{perfil?.cargo||"Cargo"}</div>
              <div style={{fontSize:12,color:G.muted,marginTop:2}}>{perfil?.empresa||""}{perfil?.empresa&&perfil?.area?" · ":""}{perfil?.area||""}</div>
            </div>
          </div>

          {/* Nível + área tags */}
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",position:"relative"}}>
            {perfil?.nivel&&<Tag color={G.orange}>{perfil.nivel}</Tag>}
            {perfil?.desde&&<Tag color={G.muted}>desde {perfil.desde}</Tag>}
          </div>

          {/* Bio */}
          {perfil?.bio&&<div style={{fontSize:12,color:"#B0AAC8",lineHeight:1.6,marginBottom:16,padding:"12px 14px",background:"rgba(255,255,255,.04)",borderRadius:12,position:"relative"}}>{perfil.bio}</div>}

          {/* Skills */}
          {perfil?.skills?.length>0&&<div style={{marginBottom:16,position:"relative"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.muted,marginBottom:8}}>Skills</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {perfil.skills.map((s,i)=><span key={i} style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:`${G.accent}22`,color:G.accent,border:`1px solid ${G.accent}33`}}>{s}</span>)}
            </div>
          </div>}

          {/* Formação */}
          {perfil?.formacao?.length>0&&<div style={{marginBottom:16,position:"relative"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.muted,marginBottom:8}}>Formação</div>
            {perfil.formacao.slice(0,2).map((f,i)=><div key={i} style={{fontSize:12,color:G.text,marginBottom:4}}>🎓 {f.curso}{f.inst?" — "+f.inst:""}{f.ano?" ("+f.ano+")":""}</div>)}
          </div>}

          {/* Idiomas */}
          {perfil?.idiomas?.length>0&&<div style={{marginBottom:16,position:"relative"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.muted,marginBottom:8}}>Idiomas</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {perfil.idiomas.map((s,i)=><span key={i} style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:`${G.blue}22`,color:G.blue,border:`1px solid ${G.blue}33`}}>{s}</span>)}
            </div>
          </div>}

          {/* Redes */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",position:"relative"}}>
            {perfil?.linkedin&&<div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#60A5FA"}}>💼 {perfil.linkedin}</div>}
            {perfil?.instagram&&<div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#E879F9"}}>📷 {perfil.instagram}</div>}
            {perfil?.site&&<div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:G.green}}>🔗 {perfil.site}</div>}
          </div>

          {/* Bottom watermark */}
          <div style={{marginTop:20,paddingTop:14,borderTop:`1px solid ${G.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative"}}>
            <span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:G.muted}}>fin<span style={{color:G.accent}}>ance</span></span>
            <span style={{fontSize:10,color:G.border2}}>fincance-app.vercel.app</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={()=>{
            if(navigator.share){navigator.share({title:`${nomeExibido} — Perfil Profissional`,text:`${perfil?.cargo||""} ${perfil?.empresa?`@ ${perfil.empresa}`:""}`,url:window.location.href});}
            else{navigator.clipboard?.writeText(window.location.href);alert("Link copiado!");}
          }} className="press" style={{flex:1,padding:"14px",borderRadius:14,border:"none",background:G.orange,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            Compartilhar 🔗
          </button>
          <button onClick={()=>setShowCard(false)} className="press" style={{padding:"14px 20px",borderRadius:14,border:`1px solid ${G.border2}`,background:"none",color:G.muted,fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );

  return(<div style={{paddingBottom:8}}>
    {showCard&&<CardVisita/>}

    {/* ── HERO PERFIL ─────────────────────────────────────────────── */}
    <div style={{background:"linear-gradient(145deg,#1a1040,#0d0d1a)",border:`1px solid ${G.border}`,borderRadius:20,padding:"20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-50,right:-50,width:180,height:180,borderRadius:"50%",background:`radial-gradient(circle,${G.orange}18,transparent 70%)`,pointerEvents:"none"}}/>
      {perfil?(
        <div>
          <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:14}}>
            {/* Avatar */}
            <div style={{width:58,height:58,borderRadius:16,flexShrink:0,overflow:"hidden",border:`2px solid ${G.orange}55`,background:`linear-gradient(135deg,${G.orange}44,${G.accent}44)`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} onClick={()=>setSheet("perfil")}>
              {perfil.fotoUrl
                ?<img src={perfil.fotoUrl} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                :<span style={{fontFamily:"'Fraunces',serif",fontSize:24,fontWeight:700,color:G.orange}}>{nomeExibido?nomeExibido[0].toUpperCase():"?"}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,lineHeight:1.2}}>{nomeExibido||"Seu nome"}</div>
              <div style={{fontSize:13,color:G.orange,fontWeight:600,marginTop:1}}>{perfil.cargo||"—"}</div>
              <div style={{fontSize:12,color:G.muted}}>{perfil.empresa||""}{perfil.empresa&&perfil.area?" · ":""}{perfil.area}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setShowCard(true)} className="press" title="Ver cartão" style={{width:34,height:34,borderRadius:10,border:`1px solid ${G.orange}55`,background:G.orange+"18",color:G.orange,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>◻</button>
              <button onClick={()=>setSheet("perfil")} style={{width:34,height:34,borderRadius:10,border:`1px solid ${G.border}`,background:"none",color:G.muted,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✎</button>
            </div>
          </div>
          {/* KPIs */}
          <div style={{display:"flex",borderTop:`1px solid ${G.border}`,paddingTop:12}}>
            {[{l:"Salário",v:fmtK(salAtual),c:G.green},{l:"Investido",v:fmtK(totalGastos),c:G.orange},{l:"Aumento",v:(ultimoAumento>=0?"+":"")+fmtK(ultimoAumento),c:ultimoAumento>=0?G.green:G.red}].map((k,i)=>(
              <div key={i} style={{flex:1,borderRight:i<2?`1px solid ${G.border}`:"none",paddingRight:i<2?12:0,paddingLeft:i>0?12:0}}>
                <div style={{fontSize:10,color:G.muted,marginBottom:2}}>{k.l}</div>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>
          {/* Skills preview */}
          {perfil.skills?.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
            {perfil.skills.slice(0,4).map((s,i)=><Tag key={i} color={G.accent}>{s}</Tag>)}
            {perfil.skills.length>4&&<Tag color={G.muted}>+{perfil.skills.length-4}</Tag>}
          </div>}
        </div>
      ):(
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{fontSize:36,marginBottom:8}}>◈</div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:700,marginBottom:6}}>Crie seu perfil</div>
          <div style={{fontSize:13,color:G.muted,marginBottom:16}}>Cargo, salário, skills e muito mais</div>
          <button onClick={()=>setSheet("perfil")} className="press" style={{padding:"12px 28px",borderRadius:20,border:"none",background:G.orange,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>+ Criar perfil</button>
        </div>
      )}
    </div>

    {/* ── TABS ──────────────────────────────────────────────────────── */}
    <div style={{display:"flex",gap:0,marginBottom:16,background:G.card2,borderRadius:12,padding:4}}>
      {SECOES.map(s=><button key={s.id} onClick={()=>setSecao(s.id)} style={{flex:1,padding:"9px 4px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:11,background:secao===s.id?G.card:G.card2,color:secao===s.id?G.text:G.muted,transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span>{s.icon}</span>{s.label}</button>)}
    </div>

    {/* ── SOBRE ─────────────────────────────────────────────────────── */}
    {secao==="sobre"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
      {!perfil?<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:24,textAlign:"center",color:G.muted}}>
        <div style={{fontSize:13,marginBottom:12}}>Configure seu perfil para começar</div>
        <button onClick={()=>setSheet("perfil")} className="press" style={{padding:"10px 24px",borderRadius:20,border:"none",background:G.orange,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Configurar</button>
      </div>:<>
        {/* Info geral */}
        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Informações Profissionais</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[{l:"Cargo",v:perfil.cargo},{l:"Empresa",v:perfil.empresa||"—"},{l:"Área",v:perfil.area},{l:"Nível",v:perfil.nivel},{l:"Desde",v:perfil.desde||"—"},{l:"Salário",v:fmt(salAtual)}].map((f,i)=>(
              <div key={i}><div style={{fontSize:10,color:G.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:2}}>{f.l}</div><div style={{fontSize:13,fontWeight:500}}>{f.v}</div></div>
            ))}
          </div>
          {perfil.bio&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${G.border}`}}>
            <div style={{fontSize:10,color:G.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>Bio</div>
            <div style={{fontSize:13,color:G.muted,lineHeight:1.6}}>{perfil.bio}</div>
          </div>}
        </div>

        {/* Skills */}
        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Skills</div>
            <button onClick={()=>setSheet("perfil")} style={{fontSize:12,color:G.accent,background:"none",border:"none",cursor:"pointer"}}>+ editar</button>
          </div>
          {perfil.skills?.length>0
            ?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{perfil.skills.map((s,i)=><Tag key={i} color={G.accent}>{s}</Tag>)}</div>
            :<div style={{fontSize:13,color:G.muted}}>Nenhuma skill adicionada</div>}
        </div>

        {/* Formação */}
        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Formação Acadêmica</div>
            <button onClick={()=>setSheet("perfil")} style={{fontSize:12,color:G.accent,background:"none",border:"none",cursor:"pointer"}}>+ editar</button>
          </div>
          {perfil.formacao?.length>0
            ?perfil.formacao.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<perfil.formacao.length-1?`1px solid ${G.border}`:"none"}}>
                <div style={{width:34,height:34,borderRadius:10,background:G.yellow+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>🎓</div>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{f.curso}</div><div style={{fontSize:11,color:G.muted}}>{f.tipo}{f.inst?" · "+f.inst:""}{f.ano?" · "+f.ano:""}</div></div>
              </div>)
            :<div style={{fontSize:13,color:G.muted}}>Nenhuma formação adicionada</div>}
        </div>

        {/* Idiomas */}
        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Idiomas</div>
            <button onClick={()=>setSheet("perfil")} style={{fontSize:12,color:G.accent,background:"none",border:"none",cursor:"pointer"}}>+ editar</button>
          </div>
          {perfil.idiomas?.length>0
            ?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{perfil.idiomas.map((s,i)=><Tag key={i} color={G.blue}>{s}</Tag>)}</div>
            :<div style={{fontSize:13,color:G.muted}}>Nenhum idioma adicionado</div>}
        </div>

        {/* Redes sociais */}
        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Redes & Contato</div>
            <button onClick={()=>setSheet("perfil")} style={{fontSize:12,color:G.accent,background:"none",border:"none",cursor:"pointer"}}>+ editar</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {perfil.linkedin?<div style={{display:"flex",alignItems:"center",gap:10,fontSize:13}}><span style={{width:28,textAlign:"center"}}>💼</span><span style={{color:"#60A5FA"}}>{perfil.linkedin}</span></div>:<div style={{fontSize:13,color:G.border2}}>💼 LinkedIn não adicionado</div>}
            {perfil.instagram?<div style={{display:"flex",alignItems:"center",gap:10,fontSize:13}}><span style={{width:28,textAlign:"center"}}>📷</span><span style={{color:"#E879F9"}}>{perfil.instagram}</span></div>:<div style={{fontSize:13,color:G.border2}}>📷 Instagram não adicionado</div>}
            {perfil.site?<div style={{display:"flex",alignItems:"center",gap:10,fontSize:13}}><span style={{width:28,textAlign:"center"}}>🔗</span><span style={{color:G.green}}>{perfil.site}</span></div>:<div style={{fontSize:13,color:G.border2}}>🔗 Site não adicionado</div>}
          </div>
        </div>

        {/* Botão card */}
        <button onClick={()=>setShowCard(true)} className="press" style={{width:"100%",padding:"15px",borderRadius:14,border:`1px solid ${G.orange}55`,background:G.orange+"18",color:G.orange,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          ◻ Ver meu cartão de visita
        </button>
      </>}
    </div>}

    {/* ── HISTÓRICO ─────────────────────────────────────────────────── */}
    {secao==="historico"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:600,color:G.muted}}>{historico.length} registro{historico.length!==1?"s":""}</span>
        <button onClick={()=>setSheet("historico")} className="press" style={{padding:"8px 16px",borderRadius:20,border:`1px solid ${G.orange}55`,background:G.orange+"18",color:G.orange,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Adicionar</button>
      </div>
      {historico.length>1&&<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:"16px 8px 8px",marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12,paddingLeft:10}}>Evolução Salarial</div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={[...historico].reverse().map(h=>({name:h.data?.slice(0,7)||"",valor:h.salario}))} margin={{left:-14,right:8}}>
            <XAxis dataKey="name" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
            <Tooltip contentStyle={{background:G.card2,border:`1px solid ${G.border2}`,borderRadius:10,fontSize:11}} cursor={{stroke:G.border2}}/>
            <Line type="monotone" dataKey="valor" name="Salário" stroke={G.orange} strokeWidth={2} dot={{fill:G.orange,r:4}} activeDot={{r:6}}/>
          </LineChart>
        </ResponsiveContainer>
      </div>}
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,overflow:"hidden"}}>
        {historico.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:G.muted}}><div style={{fontSize:36,marginBottom:8}}>📈</div><div>Nenhum histórico ainda</div></div>
          :<div style={{padding:"0 16px"}}>
          {historico.map((h,i)=>{
            const aum=i<historico.length-1?h.salario-historico[i+1].salario:0;
            return(<div key={h.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:i<historico.length-1?`1px solid ${G.border}`:"none"}}>
              <div style={{width:38,height:38,borderRadius:11,flexShrink:0,background:G.orange+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>💼</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.cargo}</div>
                <div style={{fontSize:11,color:G.muted,marginTop:2}}>{h.empresa||"—"} · {h.data}</div>
                {h.obs&&<div style={{fontSize:11,color:G.muted}}>{h.obs}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:G.orange}}>{fmtK(h.salario)}</div>
                {aum!==0&&<div style={{fontSize:11,color:aum>0?G.green:G.red}}>{aum>0?"+":""}{fmtK(aum)}</div>}
              </div>
              <button onClick={()=>deletarItem("historico",h.id,setHistorico)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:18,padding:"2px"}} onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
            </div>);
          })}
        </div>}
      </div>
    </div>}

    {/* ── METAS ─────────────────────────────────────────────────────── */}
    {secao==="metas"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:600,color:G.muted}}>{metas.length} meta{metas.length!==1?"s":""}</span>
        <button onClick={()=>setSheet("meta")} className="press" style={{padding:"8px 16px",borderRadius:20,border:`1px solid ${G.accent}55`,background:G.accentL,color:G.accent,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Nova Meta</button>
      </div>
      {metas.length===0?<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,textAlign:"center",padding:"40px 20px",color:G.muted}}><div style={{fontSize:36,marginBottom:8}}>🎯</div><div>Nenhuma meta cadastrada</div></div>
        :<div style={{display:"flex",flexDirection:"column",gap:12}}>
        {metas.map(m=>{
          const p=m.valorAlvo>0?Math.min(100,((m.valorAtual||0)/m.valorAlvo)*100):0;
          const faltam=Math.max(0,(m.valorAlvo||0)-(m.valorAtual||0));
          return(<div key={m.id} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{m.titulo}</div>
                <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}><Tag color={G.accent}>{m.tipo}</Tag>{m.prazo&&<span style={{fontSize:11,color:G.muted}}>📅 {m.prazo}</span>}</div>
              </div>
              <button onClick={()=>deletarItem("metas",m.id,setMetas)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:18,padding:"2px"}} onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div><div style={{fontSize:10,color:G.muted,marginBottom:2}}>Atual</div><div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:G.green}}>{fmtK(m.valorAtual||0)}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:G.muted,marginBottom:2}}>Meta</div><div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:G.accent}}>{fmtK(m.valorAlvo)}</div></div>
            </div>
            <div style={{height:6,background:G.border,borderRadius:6,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",width:`${p}%`,background:`linear-gradient(90deg,${G.accent},${G.green})`,borderRadius:6,transition:"width .4s"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:G.muted}}>{p.toFixed(0)}% · faltam {fmtK(faltam)}</span>
              <input type="number" placeholder="Atualizar R$" onBlur={e=>{const v=parseFloat(e.target.value);if(v)atualizarMeta(m.id,v);e.target.value="";}} style={{width:120,padding:"6px 10px",background:G.card2,border:`1px solid ${G.border2}`,borderRadius:8,color:G.text,fontSize:12,outline:"none",textAlign:"right"}}/>
            </div>
          </div>);
        })}
      </div>}
    </div>}

    {/* ── GASTOS ────────────────────────────────────────────────────── */}
    {secao==="gastos"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:600,color:G.muted}}>Total: {fmt(totalGastos)}</span>
        <button onClick={()=>setSheet("gasto")} className="press" style={{padding:"8px 16px",borderRadius:20,border:`1px solid ${G.yellow}55`,background:G.yellow+"18",color:G.yellow,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Adicionar</button>
      </div>
      {gastos.length>0&&(()=>{
        const porCat=CATS_CARREIRA.map(c=>({c,v:gastos.filter(g=>g.cat===c).reduce((s,g)=>s+g.valor,0)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
        return(<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16,marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Por Categoria</div>
          {porCat.map(x=>{const p=totalGastos>0?x.v/totalGastos*100:0;return(<div key={x.c} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13}}>{x.c}</span><span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:G.yellow}}>{fmtK(x.v)}</span></div>
            <div style={{height:3,background:G.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:G.yellow,borderRadius:3}}/></div>
          </div>);})}
        </div>);
      })()}
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,overflow:"hidden"}}>
        {gastos.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:G.muted}}><div style={{fontSize:36,marginBottom:8}}>🎓</div><div>Nenhum gasto registrado</div></div>
          :<div style={{padding:"0 16px"}}>
          {gastos.map((g,i)=>(
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<gastos.length-1?`1px solid ${G.border}`:"none"}}>
              <div style={{width:38,height:38,borderRadius:11,flexShrink:0,background:G.yellow+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎓</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.desc||g.cat}</div>
                <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:G.muted}}>{fmtD(g.data)}</span>
                  <Tag color={G.yellow}>{g.cat}</Tag>
                  {g.retorno&&<span style={{fontSize:11,color:G.green}}>↑ {g.retorno}</span>}
                </div>
              </div>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:15,fontWeight:700,color:G.yellow,flexShrink:0}}>{fmtK(g.valor)}</div>
              <button onClick={()=>deletarItem("gastos",g.id,setGastos)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:18,padding:"2px"}} onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
            </div>
          ))}
        </div>}
      </div>
    </div>}

    {/* ── SHEET PERFIL COMPLETO ─────────────────────────────────────── */}
    <Sheet open={sheet==="perfil"} onClose={()=>setSheet(null)} title="Editar Perfil">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {/* Foto URL */}
        <div>
          <Lbl opt>URL da Foto de Perfil</Lbl>
          <input value={fp.fotoUrl} onChange={e=>setFp(f=>({...f,fotoUrl:e.target.value}))} placeholder="https://..." className="inp"/>
          {fp.fotoUrl&&<div style={{marginTop:8,display:"flex",alignItems:"center",gap:10}}>
            <img src={fp.fotoUrl} style={{width:48,height:48,borderRadius:12,objectFit:"cover",border:`1px solid ${G.border2}`}} onError={e=>e.target.style.display="none"}/>
            <span style={{fontSize:12,color:G.muted}}>Prévia da foto</span>
          </div>}
        </div>
        <div><Lbl>Nome completo</Lbl><input value={fp.nome} onChange={e=>setFp(f=>({...f,nome:e.target.value}))} placeholder="Seu nome" className="inp"/></div>
        <div><Lbl>Cargo atual</Lbl><input value={fp.cargo} onChange={e=>setFp(f=>({...f,cargo:e.target.value}))} placeholder="Ex: Desenvolvedor Sênior" className="inp"/></div>
        <div><Lbl opt>Empresa</Lbl><input value={fp.empresa} onChange={e=>setFp(f=>({...f,empresa:e.target.value}))} placeholder="Ex: Google" className="inp"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Área</Lbl><select value={fp.area} onChange={e=>setFp(f=>({...f,area:e.target.value}))} className="inp">{AREAS.map(a=><option key={a}>{a}</option>)}</select></div>
          <div><Lbl>Nível</Lbl><select value={fp.nivel} onChange={e=>setFp(f=>({...f,nivel:e.target.value}))} className="inp">{NIVEIS.map(n=><option key={n}>{n}</option>)}</select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Salário (R$)</Lbl><input type="number" value={fp.salarioAtual} onChange={e=>setFp(f=>({...f,salarioAtual:e.target.value}))} placeholder="0,00" className="inp"/></div>
          <div><Lbl opt>Desde</Lbl><input type="month" value={fp.desde} onChange={e=>setFp(f=>({...f,desde:e.target.value}))} className="inp"/></div>
        </div>
        <div><Lbl opt>Bio</Lbl><textarea value={fp.bio} onChange={e=>setFp(f=>({...f,bio:e.target.value}))} placeholder="Sua trajetória, objetivos..." rows={3} className="inp" style={{resize:"none",lineHeight:1.5}}/></div>

        {/* Redes */}
        <div style={{borderTop:`1px solid ${G.border}`,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:G.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>Redes & Contato</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18,width:28,textAlign:"center"}}>💼</span><input value={fp.linkedin} onChange={e=>setFp(f=>({...f,linkedin:e.target.value}))} placeholder="linkedin.com/in/..." className="inp" style={{flex:1}}/></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18,width:28,textAlign:"center"}}>📷</span><input value={fp.instagram} onChange={e=>setFp(f=>({...f,instagram:e.target.value}))} placeholder="@usuario" className="inp" style={{flex:1}}/></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18,width:28,textAlign:"center"}}>🔗</span><input value={fp.site} onChange={e=>setFp(f=>({...f,site:e.target.value}))} placeholder="seusite.com" className="inp" style={{flex:1}}/></div>
          </div>
        </div>

        {/* Skills */}
        <div style={{borderTop:`1px solid ${G.border}`,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:G.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>Skills</div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={newSkill} onChange={e=>setNewSkill(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSkill()} placeholder="Ex: React, Python, Excel..." className="inp" style={{flex:1}}/>
            <button onClick={addSkill} className="press" style={{padding:"0 16px",borderRadius:12,border:"none",background:G.accent,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>+</button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {fp.skills.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:G.accentL,border:`1px solid ${G.accent}33`}}>
              <span style={{fontSize:11,fontWeight:600,color:G.accent}}>{s}</span>
              <button onClick={()=>rmSkill(i)} style={{background:"none",border:"none",color:G.accent,cursor:"pointer",fontSize:13,lineHeight:1,padding:0}}>×</button>
            </div>)}
          </div>
        </div>

        {/* Idiomas */}
        <div style={{borderTop:`1px solid ${G.border}`,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:G.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>Idiomas</div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={newIdioma} onChange={e=>setNewIdioma(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addIdioma()} placeholder="Ex: Inglês C1, Espanhol B2..." className="inp" style={{flex:1}}/>
            <button onClick={addIdioma} className="press" style={{padding:"0 16px",borderRadius:12,border:"none",background:G.blue,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>+</button>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {fp.idiomas.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:G.blue+"22",border:`1px solid ${G.blue}33`}}>
              <span style={{fontSize:11,fontWeight:600,color:G.blue}}>{s}</span>
              <button onClick={()=>rmIdioma(i)} style={{background:"none",border:"none",color:G.blue,cursor:"pointer",fontSize:13,lineHeight:1,padding:0}}>×</button>
            </div>)}
          </div>
        </div>

        {/* Formação */}
        <div style={{borderTop:`1px solid ${G.border}`,paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:G.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>Formação Acadêmica</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
            <select value={fform.tipo} onChange={e=>setFform(f=>({...f,tipo:e.target.value}))} className="inp">
              {["Graduação","Pós-graduação","MBA","Mestrado","Doutorado","Técnico","Curso","Bootcamp","Certificação"].map(t=><option key={t}>{t}</option>)}
            </select>
            <input value={fform.curso} onChange={e=>setFform(f=>({...f,curso:e.target.value}))} placeholder="Nome do curso" className="inp"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <input value={fform.inst} onChange={e=>setFform(f=>({...f,inst:e.target.value}))} placeholder="Instituição" className="inp"/>
              <input value={fform.ano} onChange={e=>setFform(f=>({...f,ano:e.target.value}))} placeholder="Ano" className="inp"/>
            </div>
            <button onClick={addForm} className="press" style={{padding:"10px",borderRadius:12,border:"none",background:G.yellow+"22",color:G.yellow,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${G.yellow}44`}}>+ Adicionar formação</button>
          </div>
          {fp.formacao.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:G.card2,borderRadius:10,marginBottom:6}}>
            <div style={{flex:1,fontSize:12}}><div style={{fontWeight:600}}>{f.curso}</div><div style={{color:G.muted}}>{f.tipo}{f.inst?" · "+f.inst:""}{f.ano?" · "+f.ano:""}</div></div>
            <button onClick={()=>rmForm(i)} style={{background:"none",border:"none",color:G.muted,cursor:"pointer",fontSize:16}}>×</button>
          </div>)}
        </div>

        <button onClick={salvarPerfil} disabled={saving} className="press" style={{padding:"15px",borderRadius:14,border:"none",background:G.orange,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {saving?<Spinner size={16} color="#fff"/>:null} Salvar Perfil
        </button>
      </div>
    </Sheet>

    <Sheet open={sheet==="historico"} onClose={()=>setSheet(null)} title="Histórico Salarial">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl>Cargo</Lbl><input value={fh.cargo} onChange={e=>setFh(f=>({...f,cargo:e.target.value}))} placeholder="Ex: Analista Pleno" className="inp"/></div>
        <div><Lbl opt>Empresa</Lbl><input value={fh.empresa} onChange={e=>setFh(f=>({...f,empresa:e.target.value}))} placeholder="Nome da empresa" className="inp"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Salário (R$)</Lbl><input type="number" value={fh.salario} onChange={e=>setFh(f=>({...f,salario:e.target.value}))} placeholder="0,00" className="inp"/></div>
          <div><Lbl>Mês/Ano</Lbl><input type="month" value={fh.data} onChange={e=>setFh(f=>({...f,data:e.target.value}))} className="inp"/></div>
        </div>
        <div><Lbl opt>Observação</Lbl><input value={fh.obs} onChange={e=>setFh(f=>({...f,obs:e.target.value}))} placeholder="Ex: Promoção, mudança..." className="inp"/></div>
        <button onClick={salvarHistorico} disabled={saving} className="press" style={{padding:"15px",borderRadius:14,border:"none",background:G.orange,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {saving?<Spinner size={16} color="#fff"/>:null} Salvar
        </button>
      </div>
    </Sheet>

    <Sheet open={sheet==="meta"} onClose={()=>setSheet(null)} title="Nova Meta de Renda">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl>Título</Lbl><input value={fm.titulo} onChange={e=>setFm(f=>({...f,titulo:e.target.value}))} placeholder="Ex: Ganhar R$10k/mês" className="inp"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Valor alvo (R$)</Lbl><input type="number" value={fm.valorAlvo} onChange={e=>setFm(f=>({...f,valorAlvo:e.target.value}))} placeholder="0,00" className="inp"/></div>
          <div><Lbl opt>Prazo</Lbl><input type="month" value={fm.prazo} onChange={e=>setFm(f=>({...f,prazo:e.target.value}))} className="inp"/></div>
        </div>
        <div><Lbl>Tipo</Lbl><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Renda Mensal","Renda Anual","Patrimônio","Salário CLT","Renda Passiva"].map(t=><div key={t} onClick={()=>setFm(f=>({...f,tipo:t}))} className="press" style={{padding:"8px 14px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:600,background:fm.tipo===t?G.accentL:G.card2,border:`1px solid ${fm.tipo===t?G.accent:G.border}`,color:fm.tipo===t?G.accent:G.muted}}>{t}</div>)}
        </div></div>
        <button onClick={salvarMeta} disabled={saving} className="press" style={{padding:"15px",borderRadius:14,border:"none",background:G.accent,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {saving?<Spinner size={16} color="#fff"/>:null} Criar Meta
        </button>
      </div>
    </Sheet>

    <Sheet open={sheet==="gasto"} onClose={()=>setSheet(null)} title="Gasto com Carreira">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl>Descrição</Lbl><input value={fg.desc} onChange={e=>setFg(f=>({...f,desc:e.target.value}))} placeholder="Ex: Curso React, Livro..." className="inp"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Valor (R$)</Lbl><input type="number" value={fg.valor} onChange={e=>setFg(f=>({...f,valor:e.target.value}))} placeholder="0,00" className="inp"/></div>
          <div><Lbl>Data</Lbl><input type="date" value={fg.data} onChange={e=>setFg(f=>({...f,data:e.target.value}))} className="inp"/></div>
        </div>
        <div><Lbl>Categoria</Lbl><select value={fg.cat} onChange={e=>setFg(f=>({...f,cat:e.target.value}))} className="inp">{CATS_CARREIRA.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><Lbl opt>Retorno esperado</Lbl><input value={fg.retorno} onChange={e=>setFg(f=>({...f,retorno:e.target.value}))} placeholder="Ex: Aumento de 20%..." className="inp"/></div>
        <button onClick={salvarGasto} disabled={saving} className="press" style={{padding:"15px",borderRadius:14,border:"none",background:G.yellow,color:"#000",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {saving?<Spinner size={16} color="#000"/>:null} Salvar Gasto
        </button>
      </div>
    </Sheet>
  </div>);
}

// ─── FINANÇAS VIEW ────────────────────────────────────────────────────────────
const CAT_ICONS={"Moradia":"🏠","Alimentação":"🍔","Transporte":"🚗","Saúde":"❤️","Educação":"📚","Lazer":"🎮","Vestuário":"👕","Assinaturas":"📱","Pets":"🐾","Beleza e Cuidados":"💅","Eletrônicos":"💻","Presentes":"🎁","Impostos":"🧾","Dívidas":"💳","Seguros":"🛡️","Academia":"💪","Farmácia":"💊","Outros":"📦"};
const ORC_CORES=["#FB923C","#A78BFA","#F472B6","#34D399","#FBBF24","#60A5FA","#818CF8","#2DD4BF","#F97316","#E879F9"];

function FinancasView({uid,lancs}){
  const [secao,setSecao]=useState("visao");
  const [mes,setMes]=useState(curMes());
  const [orcamentos,setOrcamentos]=useState([]);
  const [alertas,setAlertas]=useState([]);
  const [sheet,setSheet]=useState(null);
  const [fo,setFo]=useState({cat:CATS_DEP[0],limite:"",cor:ORC_CORES[0]});
  const [fa,setFa]=useState({msg:"",tipo:"lembrete"});

  useEffect(()=>{
    if(!uid)return;
    async function load(){
      try{const s=await getDocs(collection(db,"users",uid,"orcamentos"));setOrcamentos(s.docs.map(d=>({id:d.id,...d.data()})));}catch(e){console.warn(e);}
      try{const s=await getDocs(collection(db,"users",uid,"alertas"));setAlertas(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.data?.localeCompare(a.data||"")));}catch(e){console.warn(e);}
    }
    load();
  },[uid]);

  const dm=lancs.filter(l=>getMes(l.data)===mes);
  const tR=dm.filter(l=>l.tipo==="Receita").reduce((s,l)=>s+l.valor,0);
  const tD=dm.filter(l=>l.tipo==="Despesa").reduce((s,l)=>s+l.valor,0);
  const sal=tR-tD;
  const tx=tR>0?sal/tR*100:0;
  const nlidos=alertas.filter(a=>!a.lido).length;

  function gastosCat(cat){return dm.filter(l=>l.tipo==="Despesa"&&l.cat===cat).reduce((s,l)=>s+l.valor,0);}

  const now=new Date();
  const trend=Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
    const ma=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const r=lancs.filter(l=>l.tipo==="Receita"&&getMes(l.data)===ma).reduce((s,l)=>s+l.valor,0);
    const dd=lancs.filter(l=>l.tipo==="Despesa"&&getMes(l.data)===ma).reduce((s,l)=>s+l.valor,0);
    return{name:MESES[d.getMonth()],poupanca:Math.max(0,r-dd),gasto:dd,rec:r};
  });

  const mesesDisp=[...new Set([curMes(),...lancs.map(l=>getMes(l.data))])].filter(Boolean).sort().reverse().slice(0,6);
  const totalLimite=orcamentos.reduce((s,o)=>s+o.limite,0);
  const totalGasto=orcamentos.reduce((s,o)=>s+gastosCat(o.cat),0);
  const pTotal=totalLimite>0?Math.min(100,totalGasto/totalLimite*100):0;
  const barTotal=pTotal<70?G.green:pTotal<90?G.yellow:G.red;

  const hoje=new Date();
  const diasNoMes=new Date(hoje.getFullYear(),hoje.getMonth()+1,0).getDate();
  const frac=hoje.getDate()/diasNoMes;
  const projDep=frac>0?tD/frac:0;
  const projSaldo=tR-projDep;

  async function salvarOrc(){
    const v={...fo,limite:parseFloat(fo.limite)||0};
    if(!v.limite){return;}
    if(orcamentos.find(o=>o.cat===v.cat)){alert("Categoria já tem orçamento.");return;}
    try{const ref=await addDoc(collection(db,"users",uid,"orcamentos"),v);setOrcamentos(p=>[...p,{id:ref.id,...v}]);setSheet(null);}catch(e){console.error(e);}
  }
  async function delOrc(id){
    try{await deleteDoc(doc(db,"users",uid,"orcamentos",id));setOrcamentos(p=>p.filter(x=>x.id!==id));}catch(e){console.error(e);}
  }
  async function salvarAlerta(){
    if(!fa.msg.trim())return;
    const v={...fa,lido:false,data:today()};
    try{const ref=await addDoc(collection(db,"users",uid,"alertas"),v);setAlertas(p=>[{id:ref.id,...v},...p]);setSheet(null);}catch(e){console.error(e);}
  }
  async function marcarLido(id){
    try{await updateDoc(doc(db,"users",uid,"alertas",id),{lido:true});setAlertas(p=>p.map(a=>a.id===id?{...a,lido:true}:a));}catch(e){console.error(e);}
  }
  async function marcarTodosLidos(){
    try{await Promise.all(alertas.filter(a=>!a.lido).map(a=>updateDoc(doc(db,"users",uid,"alertas",a.id),{lido:true})));setAlertas(p=>p.map(a=>({...a,lido:true})));}catch(e){console.error(e);}
  }
  async function delAlerta(id){
    try{await deleteDoc(doc(db,"users",uid,"alertas",id));setAlertas(p=>p.filter(x=>x.id!==id));}catch(e){console.error(e);}
  }

  // Auto alertas
  const autoAlertas=orcamentos.map(o=>{
    const g=gastosCat(o.cat);
    const p=o.limite>0?g/o.limite*100:0;
    if(p>=100)return{cor:G.red,msg:`🚨 ${o.cat} estourou! Gasto: ${fmt(g)} / Limite: ${fmt(o.limite)}`};
    if(p>=80)return{cor:G.yellow,msg:`⚠️ ${o.cat} atingiu ${p.toFixed(0)}% do limite (${fmt(g)} de ${fmt(o.limite)})`};
    return null;
  }).filter(Boolean);

  const SECOES=[{id:"visao",icon:"📊",l:"Visão"},{id:"orcamentos",icon:"🎯",l:"Orçamentos"},{id:"relatorio",icon:"📈",l:"Relatório"},{id:"alertas",icon:"🔔",l:"Alertas"}];

  return(<div style={{paddingBottom:8}}>
    {/* Hero */}
    <div style={{background:"linear-gradient(145deg,#0d1a14,#0a0f1a)",border:`1px solid ${G.border}`,borderRadius:20,padding:"20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:`radial-gradient(circle,${G.green}18,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Planejamento · {mesLbl(mes)}</div>
        {nlidos>0&&<div onClick={()=>setSecao("alertas")} style={{padding:"3px 10px",borderRadius:20,background:G.redL,border:`1px solid ${G.red}44`,color:G.red,fontSize:11,fontWeight:700,cursor:"pointer"}}>🔔 {nlidos} alerta{nlidos>1?"s":""}</div>}
      </div>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:"'Fraunces',serif",fontSize:36,fontWeight:700,letterSpacing:-2,color:sal>=0?G.green:G.red,lineHeight:1}}>{sal>=0?"+":""}{fmt(sal)}</div>
        <div style={{fontSize:12,color:G.muted,marginTop:4}}>Saldo livre · {tx>=0?tx.toFixed(0):0}% da renda poupado</div>
      </div>
      <div style={{display:"flex"}}>
        {[{l:"Receitas",v:fmt(tR),c:G.green},{l:"Despesas",v:fmt(tD),c:G.red},{l:"Orçamentos",v:`${orcamentos.length} ativos`,c:G.accent}].map((k,i)=>(
          <div key={i} style={{flex:1,borderRight:i<2?`1px solid ${G.border}`:"none",paddingRight:i<2?14:0,paddingLeft:i>0?14:0}}>
            <div style={{fontSize:10,color:G.muted,marginBottom:3}}>{k.l}</div>
            <div style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Mes pills */}
    <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:14,paddingBottom:2}}>
      {mesesDisp.map(m=><div key={m} onClick={()=>setMes(m)} className="press" style={{padding:"7px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,fontWeight:600,background:m===mes?G.accentL:G.card2,border:`1px solid ${m===mes?G.accent:G.border}`,color:m===mes?G.accent:G.muted}}>{mesLbl(m)}</div>)}
    </div>

    {/* Tabs */}
    <div style={{display:"flex",background:G.card2,borderRadius:12,padding:4,marginBottom:16}}>
      {SECOES.map(s=><button key={s.id} onClick={()=>setSecao(s.id)} style={{flex:1,padding:"9px 4px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:11,background:secao===s.id?G.card:G.card2,color:secao===s.id?G.text:G.muted,transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span>{s.icon}</span>{s.l}</button>)}
    </div>

    {/* ── VISÃO ── */}
    {secao==="visao"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:"16px 8px 8px"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12,paddingLeft:10}}>Poupança vs Gastos</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={trend} barGap={3} barCategoryGap="28%" margin={{left:-18,right:8}}>
            <XAxis dataKey="name" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
            <Tooltip contentStyle={{background:G.card2,border:`1px solid ${G.border2}`,borderRadius:10,fontSize:11}} cursor={{fill:"#ffffff06"}}/>
            <Bar dataKey="poupanca" name="Poupança" fill={G.green} radius={[4,4,0,0]} fillOpacity={.85}/>
            <Bar dataKey="gasto" name="Gastos" fill={G.red} radius={[4,4,0,0]} fillOpacity={.7}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted}}>Orçamentos do Mês</div>
          <button onClick={()=>setSecao("orcamentos")} style={{fontSize:12,color:G.accent,background:"none",border:"none",cursor:"pointer"}}>ver todos →</button>
        </div>
        {orcamentos.length===0?<div style={{fontSize:13,color:G.muted}}>Nenhum orçamento cadastrado</div>
          :orcamentos.slice(0,4).map(o=>{const g=gastosCat(o.cat);const p=o.limite>0?Math.min(100,g/o.limite*100):0;const bar=p<70?G.green:p<90?G.yellow:G.red;return(
          <div key={o.id} style={{marginBottom:13}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:8,height:8,borderRadius:"50%",background:o.cor}}/><span style={{fontSize:13,fontWeight:500}}>{o.cat}</span>{g>o.limite&&<span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20,background:G.redL,color:G.red,border:`1px solid ${G.red}44`}}>Estourou</span>}</div>
              <span style={{fontSize:12,color:G.muted}}><span style={{fontFamily:"'Fraunces',serif",fontWeight:700,color:g>o.limite?G.red:G.text}}>{fmtK(g)}</span> / {fmtK(o.limite)}</span>
            </div>
            <div style={{height:4,background:G.border,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:bar,borderRadius:4}}/></div>
          </div>);})}
      </div>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Onde o dinheiro foi</div>
        {CATS_DEP.map(c=>({name:c,v:gastosCat(c),color:CAT_COLORS[c]||"#94A3B8"})).filter(c=>c.v>0).sort((a,b)=>b.v-a.v).slice(0,6).map(c=>{const p=tD>0?c.v/tD*100:0;return(
          <div key={c.name} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:7,height:7,borderRadius:"50%",background:c.color}}/><span style={{fontSize:13}}>{c.name}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:G.muted}}>{p.toFixed(0)}%</span><span style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:c.color}}>{fmtK(c.v)}</span></div>
            </div>
            <div style={{height:3,background:G.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:c.color,borderRadius:3}}/></div>
          </div>);})}
        {tD===0&&<div style={{fontSize:13,color:G.muted}}>Sem despesas neste mês</div>}
      </div>
      <div style={{background:"linear-gradient(145deg,#111128,#0d0d1a)",border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Projeção fim do mês</div>
        <div style={{display:"flex"}}>
          {[{l:"Gastos projetados",v:fmt(projDep),c:G.red},{l:"Saldo projetado",v:fmt(Math.abs(projSaldo)),c:projSaldo>=0?G.green:G.red}].map((k,i)=>(
            <div key={i} style={{flex:1,borderRight:i===0?`1px solid ${G.border}`:"none",paddingRight:i===0?14:0,paddingLeft:i>0?14:0}}>
              <div style={{fontSize:10,color:G.muted,marginBottom:3}}>{k.l}</div>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:16,fontWeight:700,color:k.c}}>{k.v}</div>
            </div>))}
        </div>
        <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${G.border}`,fontSize:12,color:G.muted}}>
          Baseado em {hoje.getDate()} dias de {diasNoMes} · {(frac*100).toFixed(0)}% do mês transcorrido
        </div>
      </div>
    </div>}

    {/* ── ORÇAMENTOS ── */}
    {secao==="orcamentos"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><div style={{fontSize:15,fontWeight:700}}>{orcamentos.length} orçamentos</div><div style={{fontSize:12,color:G.muted,marginTop:2}}>Limite mensal por categoria</div></div>
        <button onClick={()=>{setFo({cat:CATS_DEP[0],limite:"",cor:ORC_CORES[0]});setSheet("orc");}} className="press" style={{padding:"9px 18px",borderRadius:20,border:`1px solid ${G.accent}55`,background:G.accentL,color:G.accent,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Novo</button>
      </div>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <div><div style={{fontSize:11,color:G.muted,marginBottom:2}}>Total gasto</div><div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:G.red}}>{fmt(totalGasto)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:11,color:G.muted,marginBottom:2}}>Total limite</div><div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:G.accent}}>{fmt(totalLimite)}</div></div>
        </div>
        <div style={{height:8,background:G.border,borderRadius:8,overflow:"hidden"}}><div style={{height:"100%",width:`${pTotal}%`,background:barTotal,borderRadius:8}}/></div>
        <div style={{fontSize:11,color:G.muted,marginTop:6}}>{pTotal.toFixed(0)}% do orçamento total utilizado</div>
      </div>
      {orcamentos.length===0?<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,textAlign:"center",padding:"40px 20px",color:G.muted}}><div style={{fontSize:36,marginBottom:8}}>🎯</div><div>Nenhum orçamento. Crie um!</div></div>
        :<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {orcamentos.map(o=>{const g=gastosCat(o.cat);const p=o.limite>0?Math.min(100,g/o.limite*100):0;const over=g>o.limite;const bar=p<70?G.green:p<90?G.yellow:G.red;return(
          <div key={o.id} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:42,height:42,borderRadius:12,flexShrink:0,background:o.cor+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{CAT_ICONS[o.cat]||"💰"}</div>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700}}>{o.cat}</div><div style={{fontSize:11,color:G.muted}}>Limite: {fmt(o.limite)}/mês</div></div>
              {over&&<span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:G.redL,color:G.red,border:`1px solid ${G.red}44`,flexShrink:0}}>+{fmtK(g-o.limite)}</span>}
              <button onClick={()=>delOrc(o.id)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:18,padding:2}} onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:12,color:G.muted}}>Gasto: <span style={{fontFamily:"'Fraunces',serif",fontWeight:700,color:over?G.red:G.text}}>{fmt(g)}</span></span>
              <span style={{fontSize:12,color:G.muted}}>{over?<span style={{color:G.red}}>Estourou {fmtK(g-o.limite)}</span>:<span>Faltam <span style={{fontFamily:"'Fraunces',serif",fontWeight:700,color:G.green}}>{fmt(Math.max(0,o.limite-g))}</span></span>}</span>
            </div>
            <div style={{height:6,background:G.border,borderRadius:6,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:bar,borderRadius:6}}/></div>
            <div style={{fontSize:11,color:G.muted,marginTop:5}}>{p.toFixed(0)}% utilizado</div>
          </div>);})}
      </div>}
    </div>}

    {/* ── RELATÓRIO ── */}
    {secao==="relatorio"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:"16px 8px 8px"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12,paddingLeft:10}}>Receitas vs Gastos</div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={trend} margin={{left:-18,right:8}}>
            <XAxis dataKey="name" tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:G.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
            <Tooltip contentStyle={{background:G.card2,border:`1px solid ${G.border2}`,borderRadius:10,fontSize:11}} cursor={{stroke:G.border2}}/>
            <Line type="monotone" dataKey="rec" name="Receitas" stroke={G.green} strokeWidth={2} dot={{fill:G.green,r:3}} activeDot={{r:5}}/>
            <Line type="monotone" dataKey="gasto" name="Gastos" stroke={G.red} strokeWidth={2} dot={{fill:G.red,r:3}} activeDot={{r:5}}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Métricas do Mês</div>
        {(()=>{
          const taxa=tR>0?((tR-tD)/tR*100):0;
          const media=tD>0?tD/hoje.getDate():0;
          const catTop=CATS_DEP.map(c=>({c,v:gastosCat(c)})).sort((a,b)=>b.v-a.v)[0];
          const mC=trend.filter(t=>t.rec>0);
          const mediaPoup=mC.length>0?mC.reduce((s,t)=>s+t.poupanca,0)/mC.length:0;
          return[{l:"Taxa de poupança",v:taxa.toFixed(1)+"%",sub:"da renda",c:taxa>=20?G.green:taxa>=10?G.yellow:G.red},{l:"Gasto médio/dia",v:fmtK(media),sub:"neste mês",c:G.accent},{l:"Maior categoria",v:catTop?.c||"—",sub:catTop?fmt(catTop.v):"sem gastos",c:G.orange},{l:"Poupança média",v:fmtK(mediaPoup),sub:"6 meses",c:G.blue}].map(m=>(
            <div key={m.l} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${G.border}`}}>
              <div style={{width:3,height:36,borderRadius:2,background:m.c,flexShrink:0}}/>
              <div style={{flex:1}}><div style={{fontSize:12,color:G.muted}}>{m.l}</div><div style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:700,color:m.c}}>{m.v}</div></div>
              <div style={{fontSize:11,color:G.muted,textAlign:"right"}}>{m.sub}</div>
            </div>));
        })()}
      </div>
      <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:16}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:G.muted,marginBottom:12}}>Histórico 6 Meses</div>
        {trend.map(t=>{const s=t.rec-t.gasto;return(
          <div key={t.name} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${G.border}`}}>
            <div style={{fontSize:12,fontWeight:600,color:G.muted,width:28,flexShrink:0}}>{t.name}</div>
            <div style={{flex:1}}>
              <div style={{height:4,borderRadius:2,background:G.green,width:`${t.rec>0?Math.min(100,t.rec/8000*100):0}%`,marginBottom:3}}/>
              <div style={{height:4,borderRadius:2,background:G.red,width:`${t.gasto>0?Math.min(100,t.gasto/8000*100):0}%`}}/>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:13,fontWeight:700,color:s>=0?G.green:G.red}}>{s>=0?"+":""}{fmtK(s)}</div>
              <div style={{fontSize:10,color:G.muted}}>{fmtK(t.gasto)} gastos</div>
            </div>
          </div>);})}
      </div>
    </div>}

    {/* ── ALERTAS ── */}
    {secao==="alertas"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><div style={{fontSize:15,fontWeight:700}}>Alertas & Notificações</div><div style={{fontSize:12,color:G.muted,marginTop:2}}>{nlidos} não lido{nlidos!==1?"s":""}</div></div>
        {alertas.some(a=>!a.lido)&&<button onClick={marcarTodosLidos} style={{fontSize:12,color:G.muted,background:"none",border:"none",cursor:"pointer"}}>Marcar todos lidos</button>}
      </div>
      {autoAlertas.length>0&&<div style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.muted,marginBottom:8}}>Automáticos</div>
        {autoAlertas.map((a,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",borderRadius:12,background:a.cor+"12",border:`1px solid ${a.cor}44`,marginBottom:8}}><div style={{fontSize:13,lineHeight:1.5,flex:1}}>{a.msg}</div></div>)}
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:G.muted}}>Notificações</div>
        <button onClick={()=>{setFa({msg:"",tipo:"lembrete"});setSheet("alerta");}} style={{fontSize:12,color:G.accent,background:"none",border:"none",cursor:"pointer"}}>+ Nova</button>
      </div>
      {alertas.length===0?<div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,textAlign:"center",padding:"40px 20px",color:G.muted}}><div style={{fontSize:36,marginBottom:8}}>🔔</div><div>Nenhum alerta configurado</div></div>
        :alertas.map(a=>(
        <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:14,borderRadius:14,background:a.lido?G.card2:G.card,border:`1px solid ${a.lido?G.border:G.border2}`,marginBottom:8,opacity:a.lido?.6:1}}>
          <div style={{fontSize:20,flexShrink:0}}>{a.tipo==="meta"?"🎉":a.tipo==="limite"?"⚠️":"🔔"}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:a.lido?400:600,lineHeight:1.4}}>{a.msg}</div><div style={{fontSize:11,color:G.muted,marginTop:4}}>{fmtD(a.data)}</div></div>
          {!a.lido&&<button onClick={()=>marcarLido(a.id)} style={{background:"none",border:"none",color:G.accent,cursor:"pointer",fontSize:11,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>✓ Lido</button>}
          <button onClick={()=>delAlerta(a.id)} style={{background:"none",border:"none",color:G.border2,cursor:"pointer",fontSize:18,padding:0}} onMouseEnter={e=>e.currentTarget.style.color=G.red} onMouseLeave={e=>e.currentTarget.style.color=G.border2}>×</button>
        </div>))}
    </div>}

    {/* ── SHEETS ── */}
    <Sheet open={sheet==="orc"} onClose={()=>setSheet(null)} title="Novo Orçamento">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl>Categoria</Lbl><select value={fo.cat} onChange={e=>setFo(f=>({...f,cat:e.target.value}))} className="inp">{CATS_DEP.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><Lbl>Limite Mensal (R$)</Lbl><input type="number" value={fo.limite} onChange={e=>setFo(f=>({...f,limite:e.target.value}))} placeholder="Ex: 500" className="inp"/></div>
        <div><Lbl>Cor</Lbl><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{ORC_CORES.map(c=><div key={c} onClick={()=>setFo(f=>({...f,cor:c}))} style={{width:30,height:30,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${fo.cor===c?"#fff":"transparent"}`,transition:"border .15s"}}/> )}</div></div>
        <button onClick={salvarOrc} className="press" style={{padding:"15px",borderRadius:14,border:"none",background:G.accent,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Criar Orçamento</button>
      </div>
    </Sheet>

    <Sheet open={sheet==="alerta"} onClose={()=>setSheet(null)} title="Novo Alerta">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl>Mensagem</Lbl><textarea value={fa.msg} onChange={e=>setFa(f=>({...f,msg:e.target.value}))} placeholder="Ex: Pagar fatura do cartão..." rows={3} className="inp" style={{resize:"none",lineHeight:1.5}}/></div>
        <div><Lbl>Tipo</Lbl><div style={{display:"flex",gap:8}}>
          {[{id:"lembrete",l:"🔔 Lembrete"},{id:"meta",l:"🎯 Meta"},{id:"limite",l:"⚠️ Limite"}].map(t=><div key={t.id} onClick={()=>setFa(f=>({...f,tipo:t.id}))} className="press" style={{flex:1,padding:"10px 6px",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:600,textAlign:"center",background:fa.tipo===t.id?G.accentL:G.card2,border:`1px solid ${fa.tipo===t.id?G.accent:G.border}`,color:fa.tipo===t.id?G.accent:G.muted}}>{t.l}</div>)}
        </div></div>
        <button onClick={salvarAlerta} className="press" style={{padding:"15px",borderRadius:14,border:"none",background:G.accent,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Criar Alerta</button>
      </div>
    </Sheet>
  </div>);
}

// ─── CHAT VIEW ────────────────────────────────────────────────────────────────
function ChatView({lancs,onAddLanc}){
  const SUGS=["Gastei 45 no Uber","Paguei 380 no mercado","Recebi salário de 5000","Quanto gastei esse mês?"];
  const [msgs,setMsgs]=useState([{id:0,from:"ai",ts:new Date(),text:"Oi! 👋 Me fale qualquer gasto ou receita!\n\n• \"Gastei 45 no Uber agora\"\n• \"Recebi salário de 5 mil\"\n• \"Paguei 380 no mercado com débito\""}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [pending,setPending]=useState(null);
  const [recSt,setRecSt]=useState("idle");
  const [recSec,setRecSec]=useState(0);
  const [recErr,setRecErr]=useState("");
  const botRef=useRef(),inpRef=useRef(),mrRef=useRef(null),chkRef=useRef([]),tmrRef=useRef(null);
  useEffect(()=>{botRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const push=(from,text,ex={})=>setMsgs(p=>[...p,{id:Date.now()+Math.random(),from,text,ts:new Date(),...ex}]);

  async function startRec(){
    setRecErr("");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      chkRef.current=[];
      const mime=["audio/webm;codecs=opus","audio/webm","audio/ogg","audio/mp4"].find(m=>MediaRecorder.isTypeSupported(m))||"";
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:{});
      mr.ondataavailable=e=>{if(e.data?.size>0)chkRef.current.push(e.data);};
      mr.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        if(!chkRef.current.length){setRecSt("idle");return;}
        setRecSt("proc");
        const blob=new Blob(chkRef.current,{type:mr.mimeType||"audio/webm"});
        try{
          try{
            const txt=await transcribeAudio(blob);
            if(txt.trim()){setInput(txt.trim());push("ai",`🎤 Transcrevi: *"${txt.trim()}"*\nRevise e toque enviar! ✉️`);setTimeout(()=>inpRef.current?.focus(),100);}
            else push("ai","🎤 Não entendi o áudio. Pode falar de novo? 😊");
          }catch{push("ai","🎤 Erro na transcrição. Pode tentar de novo? 😊");}
        }catch{push("ai","Erro ao transcrever. Pode digitar? 😊");}
        setRecSt("idle");setRecSec(0);
      };
      mr.start(200);mrRef.current=mr;setRecSt("rec");setRecSec(0);
      tmrRef.current=setInterval(()=>setRecSec(s=>s+1),1000);
    }catch(e){setRecSt("idle");setRecErr(e.name==="NotAllowedError"?"Microfone bloqueado — libere nas configurações.":"Erro ao acessar microfone.");}
  }
  function stopRec(){clearInterval(tmrRef.current);if(mrRef.current?.state==="recording")mrRef.current.stop();}
  function cancelRec(){clearInterval(tmrRef.current);if(mrRef.current?.state==="recording"){mrRef.current.onstop=null;mrRef.current.stop();}chkRef.current=[];setRecSt("idle");setRecSec(0);}

  async function send(txt){
    const msg=(txt||input).trim();if(!msg||busy)return;
    setInput("");if(inpRef.current)inpRef.current.style.height="auto";
    push("user",msg);setBusy(true);setPending(null);
    try{
      const r=await callAI(msg,lancs);
      if(r.action==="lancamento"){push("ai",r.confirmacao||"Entendido!",{lanc:r});setPending(r);}
      else if(r.action==="multiplos"){push("ai",`${r.confirmacao}\n\n${r.itens.map(i=>`• ${i.tipo==="Receita"?"↑":"↓"} ${i.desc||i.cat} — R$${Number(i.valor).toFixed(2)}`).join("\n")}`,{multi:r.itens});setPending({action:"multiplos",itens:r.itens});}
      else push("ai",r.resposta||"Não entendi 😊");
    }catch{push("ai","Problema de conexão 🔌");}
    setBusy(false);
  }
  function confirmar(){
    if(!pending)return;
    if(pending.action==="multiplos"){pending.itens.forEach(i=>onAddLanc({tipo:i.tipo,desc:i.desc,cat:i.cat,forma:i.forma||"PIX",valor:i.valor,data:i.data||today()}));push("ai",`✅ ${pending.itens.length} lançamentos salvos!`);}
    else{onAddLanc({tipo:pending.tipo,desc:pending.desc,cat:pending.cat,forma:pending.forma||"PIX",valor:pending.valor,data:pending.data||today()});push("ai","✅ Salvo! 🚀");}
    setPending(null);
  }
  const fmtS=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const isRec=recSt==="rec",isProc=recSt==="proc";
  return(<div style={{display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
      {msgs.map(m=>(<div key={m.id} style={{display:"flex",flexDirection:"column",alignItems:m.from==="user"?"flex-end":"flex-start",animation:"fadeUp .18s ease"}}>
        <div style={{maxWidth:"84%",padding:"10px 14px",borderRadius:m.from==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",background:m.from==="user"?G.accent:G.card2,border:m.from==="ai"?`1px solid ${G.border2}`:"none",fontSize:14,lineHeight:1.55,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{m.text}</div>
        {m.lanc&&<div style={{marginTop:6,maxWidth:"84%",background:G.card,border:`1px solid ${m.lanc.tipo==="Receita"?G.green:G.red}44`,borderRadius:14,padding:"12px 14px",animation:"popIn .2s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:20,background:m.lanc.tipo==="Receita"?G.greenL:G.redL,color:m.lanc.tipo==="Receita"?G.green:G.red}}>{m.lanc.tipo==="Receita"?"↑ Receita":"↓ Despesa"}</span>
            <span style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:m.lanc.tipo==="Receita"?G.green:G.red}}>R${Number(m.lanc.valor).toFixed(2)}</span>
          </div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{m.lanc.desc||m.lanc.cat}</div>
          <div style={{fontSize:11,color:G.muted}}>{m.lanc.cat} · {m.lanc.forma} · {fmtD(m.lanc.data||today())}</div>
        </div>}
        {m.multi&&<div style={{marginTop:6,maxWidth:"84%",display:"flex",flexDirection:"column",gap:6}}>
          {m.multi.map((i,idx)=><div key={idx} style={{background:G.card,border:`1px solid ${i.tipo==="Receita"?G.green:G.red}44`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18,color:i.tipo==="Receita"?G.green:G.red}}>{i.tipo==="Receita"?"↑":"↓"}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{i.desc||i.cat}</div><div style={{fontSize:11,color:G.muted}}>{i.cat}</div></div>
            <div style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:700,color:i.tipo==="Receita"?G.green:G.red}}>R${Number(i.valor).toFixed(2)}</div>
          </div>)}
        </div>}
        <div style={{fontSize:10,color:G.muted,marginTop:3}}>{m.ts.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>
      </div>))}
      {(busy||isProc)&&<div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{padding:"12px 16px",borderRadius:"18px 18px 18px 4px",background:G.card2,border:`1px solid ${G.border2}`,display:"flex",gap:5,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:G.muted,animation:`bounce .9s ${i*.15}s infinite`}}/>)}</div>
        {isProc&&<span style={{fontSize:12,color:G.muted}}>transcrevendo...</span>}
      </div>}
      {pending&&!busy&&<div style={{display:"flex",gap:8,animation:"fadeUp .2s ease"}}>
        <button onClick={confirmar} className="press" style={{flex:1,padding:"13px",borderRadius:12,border:"none",cursor:"pointer",background:G.green,color:"#fff",fontWeight:700,fontSize:14,fontFamily:"inherit"}}>✓ Confirmar e salvar</button>
        <button onClick={()=>{push("ai","Cancelei! 😊");setPending(null);}} className="press" style={{padding:"13px 18px",borderRadius:12,border:`1px solid ${G.border2}`,cursor:"pointer",background:"transparent",color:G.muted,fontWeight:600,fontSize:14,fontFamily:"inherit"}}>✕</button>
      </div>}
      <div ref={botRef}/>
    </div>
    {recErr&&<div style={{margin:"0 14px 8px",padding:"10px 14px",borderRadius:12,background:G.redL,border:`1px solid ${G.red}44`,fontSize:12,color:G.red,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>⚠️ <span style={{flex:1}}>{recErr}</span><button onClick={()=>setRecErr("")} style={{background:"none",border:"none",color:G.red,cursor:"pointer",fontSize:16}}>×</button></div>}
    {msgs.length<=2&&!isRec&&<div style={{display:"flex",gap:8,overflowX:"auto",padding:"4px 14px 8px",flexShrink:0}}>{SUGS.map(s=><div key={s} onClick={()=>send(s)} className="press" style={{padding:"7px 14px",borderRadius:20,cursor:"pointer",flexShrink:0,fontSize:12,background:G.card2,border:`1px solid ${G.border2}`,color:G.muted}}>{s}</div>)}</div>}
    <div style={{padding:"10px 12px",background:G.card,borderTop:`1px solid ${G.border}`,flexShrink:0}}>
      {isRec?(<div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:"50%",flexShrink:0,background:G.redL,border:`2px solid ${G.red}`,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:14,height:14,borderRadius:"50%",background:G.red,animation:"pulse 1s infinite"}}/></div>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:G.red}}>Gravando...</div><div style={{fontSize:12,color:G.muted}}>{fmtS(recSec)}</div></div>
        <button onClick={stopRec} className="press" style={{padding:"10px 16px",borderRadius:22,border:"none",cursor:"pointer",background:G.red,color:"#fff",fontWeight:700,fontSize:13,fontFamily:"inherit"}}>Enviar ✓</button>
        <button onClick={cancelRec} className="press" style={{width:36,height:36,borderRadius:"50%",border:`1px solid ${G.border2}`,cursor:"pointer",background:"transparent",color:G.muted,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>):(<div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <button onClick={startRec} disabled={busy||isProc} className="press" style={{width:44,height:44,borderRadius:"50%",border:`1px solid ${G.border2}`,flexShrink:0,cursor:"pointer",background:isProc?G.accentL:G.card2,color:G.muted,fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>{isProc?<Spinner size={18}/>:"🎤"}</button>
        <textarea ref={inpRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,110)+"px";}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Digite como no WhatsApp..." rows={1} style={{flex:1,padding:"11px 14px",background:G.card2,border:`1px solid ${G.border2}`,borderRadius:22,color:G.text,fontSize:15,outline:"none",resize:"none",lineHeight:1.4,maxHeight:110}}/>
        <button onClick={()=>send()} disabled={!input.trim()||busy} className="press" style={{width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",background:input.trim()&&!busy?G.accent:G.border2,color:"#fff",fontSize:19,display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s"}}>➤</button>
      </div>)}
    </div>
  </div>);
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({onGoogle,onApple,onEmail,loading,error}){
  const [modo,setModo]=useState(""); // ""|"login"|"cadastro"
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [nome,setNome]=useState("");
  const [emailErr,setEmailErr]=useState("");

  async function handleEmail(){
    if(!email||!senha){setEmailErr("Preencha email e senha.");return;}
    setEmailErr("");
    await onEmail(email,senha,modo==="cadastro"?nome:null);
  }

  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:G.bg,padding:28,overflowY:"auto"}}>
    <style>{CSS}</style>
    <div style={{position:"fixed",top:"10%",left:"50%",transform:"translateX(-50%)",width:320,height:320,borderRadius:"50%",background:`radial-gradient(circle,${G.accent}10,transparent 70%)`,pointerEvents:"none"}}/>
    <div style={{textAlign:"center",marginBottom:40,position:"relative"}}>
      <div style={{fontFamily:"'Fraunces',serif",fontSize:52,fontWeight:700,letterSpacing:-2,marginBottom:10}}>fin<span style={{color:G.accent}}>ance</span></div>
      <div style={{fontSize:14,color:G.muted,lineHeight:1.6}}>Controle financeiro + gestão de carreira<br/>com assistente IA</div>
    </div>
    <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:10}}>
      {/* Google */}
      <button onClick={onGoogle} disabled={loading} className="press" style={{width:"100%",padding:"15px 20px",borderRadius:14,border:`1px solid ${G.border2}`,background:G.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:15,fontWeight:600,color:G.text,fontFamily:"inherit"}}>
        {loading==="google"?<Spinner size={18}/>:<><svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Entrar com Google</>}
      </button>
      {/* Apple */}
      <button onClick={onApple} disabled={loading} className="press" style={{width:"100%",padding:"15px 20px",borderRadius:14,border:`1px solid ${G.border2}`,background:G.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:15,fontWeight:600,color:G.text,fontFamily:"inherit"}}>
        {loading==="apple"?<Spinner size={18}/>:<><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.76 3.16.78 1.2-.24 2.35-1 3.64-.85 1.54.19 2.7.87 3.44 2.15-3.13 1.88-2.38 5.98.42 7.14-.48 1.28-1.12 2.55-2.66 3.66zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>Entrar com Apple</>}
      </button>

      {/* Divisor */}
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0"}}>
        <div style={{flex:1,height:1,background:G.border}}/><span style={{fontSize:12,color:G.muted}}>ou</span><div style={{flex:1,height:1,background:G.border}}/>
      </div>

      {/* Email */}
      {!modo?(
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setModo("login")} className="press" style={{flex:1,padding:"14px",borderRadius:14,border:`1px solid ${G.border2}`,background:G.card2,cursor:"pointer",fontWeight:600,fontSize:14,color:G.text,fontFamily:"inherit"}}>Entrar com email</button>
          <button onClick={()=>setModo("cadastro")} className="press" style={{flex:1,padding:"14px",borderRadius:14,border:`1px solid ${G.accent}55`,background:G.accentL,cursor:"pointer",fontWeight:600,fontSize:14,color:G.accent,fontFamily:"inherit"}}>Criar conta</button>
        </div>
      ):(
        <div style={{background:G.card2,borderRadius:16,padding:16,border:`1px solid ${G.border2}`,animation:"fadeUp .15s ease"}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14,color:G.accent}}>{modo==="login"?"Entrar com email":"Criar nova conta"}</div>
          {modo==="cadastro"&&<div style={{marginBottom:10}}><input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Seu nome" className="inp"/></div>}
          <div style={{marginBottom:10}}><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="inp"/></div>
          <div style={{marginBottom:14}}><input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Senha" onKeyDown={e=>e.key==="Enter"&&handleEmail()} className="inp"/></div>
          {(emailErr||error)&&<div style={{fontSize:13,color:G.red,marginBottom:10,textAlign:"center"}}>{emailErr||error}</div>}
          <button onClick={handleEmail} disabled={!!loading} className="press" style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:G.accent,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {loading==="email"?<Spinner size={16} color="#fff"/>:modo==="login"?"Entrar":"Criar conta"}
          </button>
          <button onClick={()=>{setModo("");setEmailErr("");}} style={{width:"100%",padding:"10px",marginTop:8,background:"none",border:"none",color:G.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Voltar</button>
        </div>
      )}

      {error&&!modo&&<div style={{padding:"12px 16px",borderRadius:12,background:G.redL,border:`1px solid ${G.red}44`,fontSize:13,color:G.red,textAlign:"center"}}>{error}</div>}
    </div>
    <div style={{position:"fixed",bottom:24,fontSize:12,color:G.muted,textAlign:"center",lineHeight:1.6}}>Seus dados ficam na sua conta.<br/>Privado e seguro. 🔒</div>
  </div>);
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [loginLoading,setLoginLoading]=useState("");
  const [loginError,setLoginError]=useState("");
  const [lancs,setLancs]=useState([]);
  const [recorrentes,setRecorrentes]=useState([]);
  const [dataLoading,setDataLoading]=useState(false);
  const [view,setView]=useState("dashboard");
  const [modal,setModal]=useState(false);
  const [tipo,setTipo]=useState("Despesa");
  const [form,setForm]=useState({data:today(),desc:"",cat:CATS_DEP[0],forma:FORMAS_DEP[0],valor:"",recorrente:false,freq:"mensal",dia:1});
  const [toast,setToast]=useState(null);
  const tRef=useRef();


  useEffect(()=>{ return onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);}); },[]);

  useEffect(()=>{
    if(!user){setLancs([]);setRecorrentes([]);return;}
    setDataLoading(true);
    const uid=user.uid;
    const unsubL=onSnapshot(collection(db,"users",uid,"lancamentos"),snap=>{setLancs(snap.docs.map(d=>({id:d.id,...d.data()})));setDataLoading(false);});
    const unsubR=onSnapshot(collection(db,"users",uid,"recorrentes"),snap=>{setRecorrentes(snap.docs.map(d=>({id:d.id,...d.data()})));});
    return()=>{unsubL();unsubR();};
  },[user]);

  useEffect(()=>{
    if(!user||recorrentes.length===0)return;
    const novos=gerarRecorrentesDoMes(recorrentes,lancs);
    novos.forEach(n=>addDoc(collection(db,"users",user.uid,"lancamentos"),n).catch(()=>{}));
  },[recorrentes,user]);

  const showT=useCallback((msg,type="success")=>{setToast({msg,type});clearTimeout(tRef.current);tRef.current=setTimeout(()=>setToast(null),2400);},[]);

  function openModal(t){setTipo(t);setForm({data:today(),desc:"",cat:t==="Receita"?CATS_REC[0]:CATS_DEP[0],forma:t==="Receita"?FORMAS_REC[0]:FORMAS_DEP[0],valor:"",recorrente:false,freq:"mensal",dia:1});setModal(true);}

  async function salvar(){
    const v=parseFloat(form.valor);
    if(!form.data||!v||v<=0){showT("Informe o valor e a data.","error");return;}
    await addDoc(collection(db,"users",user.uid,"lancamentos"),{tipo,desc:form.desc,cat:form.cat,forma:form.forma,valor:v,data:form.data});
    if(form.recorrente)await addDoc(collection(db,"users",user.uid,"recorrentes"),{tipo,desc:form.desc,cat:form.cat,forma:form.forma,valor:v,freq:form.freq,dia:form.dia,ativo:true});
    showT(`${tipo} adicionada!${form.recorrente?" ↻":""}`);setModal(false);
  }
  async function deletar(id){await deleteDoc(doc(db,"users",user.uid,"lancamentos",id));showT("Removido.","error");}
  async function toggleRec(id){const r=recorrentes.find(r=>r.id===id);if(r)await updateDoc(doc(db,"users",user.uid,"recorrentes",id),{ativo:!r.ativo});}
  async function deleteRec(id){
    await deleteDoc(doc(db,"users",user.uid,"recorrentes",id));
    const snap=await getDocs(collection(db,"users",user.uid,"lancamentos"));
    snap.docs.filter(d=>d.data().recId===id).forEach(d=>deleteDoc(d.ref));
    showT("Recorrente removido.","error");
  }

  async function handleGoogle(){setLoginLoading("google");setLoginError("");try{await signInWithPopup(auth,googleProvider);}catch{setLoginError("Erro ao entrar com Google.");}setLoginLoading("");}
  async function handleApple(){setLoginLoading("apple");setLoginError("");try{await signInWithPopup(auth,appleProvider);}catch(e){setLoginError("Erro ao entrar com Apple. Verifique se está configurado no Firebase.");}setLoginLoading("");}
  async function handleEmail(email,senha,nome){
    setLoginLoading("email");setLoginError("");
    try{
      if(nome!==null){
        const cred=await createUserWithEmailAndPassword(auth,email,senha);
        if(nome)await updateProfile(cred.user,{displayName:nome});
      }else{await signInWithEmailAndPassword(auth,email,senha);}
    }catch(e){
      const msgs={
        "auth/email-already-in-use":"Email já cadastrado.",
        "auth/weak-password":"Senha muito fraca (mín. 6 caracteres).",
        "auth/invalid-email":"Email inválido.",
        "auth/invalid-credential":"Email ou senha incorretos.",
        "auth/user-not-found":"Usuário não encontrado.",
      };
      setLoginError(msgs[e.code]||"Erro ao entrar. Tente novamente.");
    }
    setLoginLoading("");
  }
  async function handleLogout(){if(window.confirm("Sair da conta?"))await signOut(auth);}

  if(authLoading)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:G.bg,gap:14}}><style>{CSS}</style><div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:700}}>fin<span style={{color:G.accent}}>ance</span></div><Spinner size={24}/></div>);
  if(!user)return <LoginScreen onGoogle={handleGoogle} onApple={handleApple} onEmail={handleEmail} loading={loginLoading} error={loginError}/>;

  return(<>
    <style>{CSS}</style>
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:G.bg}}>
      <Head view={view} onRec={()=>openModal("Receita")} onDep={()=>openModal("Despesa")} user={user} onLogout={handleLogout}/>
      {dataLoading?(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",marginTop:HH,marginBottom:NH}}><Spinner size={28}/></div>
      ):view==="chat"?(
        <div style={{position:"fixed",top:HH,left:0,right:0,bottom:NH,display:"flex",flexDirection:"column"}}>
          <ChatView lancs={lancs} onAddLanc={l=>{addDoc(collection(db,"users",user.uid,"lancamentos"),l);showT("Salvo! ✓");}}/>
        </div>
      ):(
        <main key={view} style={{flex:1,overflowY:"auto",padding:"16px 14px",marginTop:HH,marginBottom:NH,animation:"fadeUp .2s ease both"}}>
          {view==="dashboard"&&<Dashboard lancs={lancs} onDelete={deletar}/>}
          {view==="receitas"&&<LancsView tipo="Receita" lancs={lancs} recorrentes={recorrentes} onDelete={deletar} onToggleRec={toggleRec} onDeleteRec={deleteRec}/>}
          {view==="despesas"&&<LancsView tipo="Despesa" lancs={lancs} recorrentes={recorrentes} onDelete={deletar} onToggleRec={toggleRec} onDeleteRec={deleteRec}/>}
          {view==="carreira"&&<CarreiraView uid={user.uid} user={user}/>}
          {view==="financas"&&<FinancasView uid={user.uid} lancs={lancs}/>}
        </main>
      )}
      <Nav view={view} setView={setView}/>
    </div>
    <Sheet open={modal} onClose={()=>setModal(false)} title="Novo Lançamento">
      <LancForm tipo={tipo} setTipo={setTipo} form={form} setForm={setForm} onSave={salvar}/>
    </Sheet>
    {toast&&<div style={{position:"fixed",bottom:NH+12,left:"50%",transform:"translateX(-50%)",background:G.card2,border:`1px solid ${toast.type==="success"?G.green:G.red}55`,borderRadius:20,padding:"10px 18px",fontSize:13,fontWeight:600,zIndex:9999,display:"flex",alignItems:"center",gap:8,animation:"fadeUp .28s ease",boxShadow:"0 6px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap",color:toast.type==="success"?G.green:G.red}}>{toast.type==="success"?"✓":"✕"} {toast.msg}</div>}
  </>);
}
