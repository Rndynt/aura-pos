import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   CSS  –  keyframes + resets
═══════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.scr{overflow-y:auto;-webkit-overflow-scrolling:touch}
.scr::-webkit-scrollbar{display:none}
.hscr{overflow-x:auto;display:flex;gap:8px}
.hscr::-webkit-scrollbar{display:none}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes floatUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes checkGrow{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}
.s-up{animation:slideUp .38s cubic-bezier(.32,.72,0,1)}
.f-in{animation:fadeIn .22s ease}
.pop{animation:pop .28s cubic-bezier(.175,.885,.32,1.275)}
.float-up{animation:floatUp .25s ease}
.spin{animation:spin .7s linear infinite}
`;

/* ═══════════════════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════════════════ */
const C = {
  pri:'#2563EB', priDk:'#1D4ED8', priLt:'#EFF6FF', priSh:'rgba(37,99,235,.3)',
  bg:'#F8FAFC', card:'#FFFFFF', card2:'#F1F5F9',
  bd:'#E2E8F0', bd2:'#F1F5F9',
  t1:'#0F172A', t2:'#475569', t3:'#94A3B8', t4:'#CBD5E1',
  grn:'#16A34A', grnLt:'#F0FDF4',
  red:'#DC2626', redLt:'#FEF2F2',
  amb:'#F59E0B', ambLt:'#FFFBEB',
  org:'#F97316', orgLt:'#FFF7ED',
};

const R = { sm:8, md:12, lg:16, xl:20, pill:999 };

const sh = {
  xs:'0 1px 3px rgba(0,0,0,.07)',
  sm:'0 2px 8px rgba(0,0,0,.08)',
  md:'0 4px 16px rgba(0,0,0,.1)',
  pri:`0 6px 20px rgba(37,99,235,.35)`,
};

/* ═══════════════════════════════════════════════════════
   MOCK DATA
═══════════════════════════════════════════════════════ */
const PRODUCTS = [
  {id:'1',name:'Kopi Susu',cat:'Minuman',price:25000,emoji:'☕',c1:'#3B82F6',c2:'#1D4ED8'},
  {id:'2',name:'Es Teh Manis',cat:'Minuman',price:8000,emoji:'🧋',c1:'#14B8A6',c2:'#0D9488'},
  {id:'3',name:'Juice Alpukat',cat:'Minuman',price:22000,emoji:'🥑',c1:'#16A34A',c2:'#15803D'},
  {id:'4',name:'Nasi Goreng Spesial',cat:'Makanan',price:35000,emoji:'🍳',c1:'#F97316',c2:'#EA580C'},
  {id:'5',name:'Ayam Geprek',cat:'Makanan',price:30000,emoji:'🍗',c1:'#EF4444',c2:'#DC2626'},
  {id:'6',name:'Mie Goreng',cat:'Makanan',price:25000,emoji:'🍜',c1:'#F59E0B',c2:'#D97706'},
  {id:'7',name:'Soto Ayam',cat:'Makanan',price:28000,emoji:'🥣',c1:'#8B5CF6',c2:'#7C3AED'},
  {id:'8',name:'Pisang Goreng',cat:'Snack',price:12000,emoji:'🍌',c1:'#EC4899',c2:'#DB2777'},
  {id:'9',name:'Roti Bakar',cat:'Snack',price:15000,emoji:'🍞',c1:'#6366F1',c2:'#4F46E5'},
  {id:'10',name:'Cireng Bumbu',cat:'Snack',price:10000,emoji:'🧆',c1:'#84CC16',c2:'#65A30D'},
];

const ORDERS_DATA = [
  {id:'1',num:'#A-001',type:'Dine In',customer:'Budi Santoso',table:'3',count:3,total:97000,status:'paid',time:'10:32'},
  {id:'2',num:'#A-002',type:'Take Away',customer:'Ani Wijaya',table:null,count:2,total:43000,status:'paid',time:'10:15'},
  {id:'3',num:'#A-003',type:'Dine In',customer:'Cici Amelia',table:'1',count:5,total:138000,status:'unpaid',time:'09:55'},
  {id:'4',num:'#A-004',type:'Delivery',customer:'Deni Kusuma',table:null,count:1,total:35000,status:'cancelled',time:'09:30'},
];

const CATS = ['Semua','Minuman','Makanan','Snack'];
const NUMPAD = ['7','8','9','4','5','6','1','2','3','000','0','⌫'];

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const fmt = n => 'Rp ' + n.toLocaleString('id-ID');
const initials = name => name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

/* ═══════════════════════════════════════════════════════
   ICONS  (inline SVG)
═══════════════════════════════════════════════════════ */
const PATHS = {
  search:<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  cart:<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
  receipt:<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8M14 12H8M10 16H8"/></>,
  hub:<><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="10" y="2" width="4" height="4" rx="1"/><rect x="18" y="2" width="4" height="4" rx="1"/><rect x="2" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="18" y="10" width="4" height="4" rx="1"/><rect x="2" y="18" width="4" height="4" rx="1"/><rect x="10" y="18" width="4" height="4" rx="1"/><rect x="18" y="18" width="4" height="4" rx="1"/></>,
  trash:<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  minus:<line x1="5" y1="12" x2="19" y2="12"/>,
  plus:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  chevD:<polyline points="6 9 12 15 18 9"/>,
  chevU:<polyline points="18 15 12 9 6 15"/>,
  check:<polyline points="20 6 9 17 4 12"/>,
  x:<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  logout:<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  store:<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  banknote:<><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></>,
  user:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  box:<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  chart:<><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>,
  users:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  pack:<><path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></>,
  bag:<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  qr:<><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3m2-8h.01M12 21v-2m0-6v-2m6 8h.01"/></>,
  card:<><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  okCircle:<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  clock:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  shBag:<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
};

function Ic({n,s=18,c='currentColor',sw=2,style:st}) {
  return (
    <svg width={s} height={s} fill="none" stroke={c} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
      style={{flexShrink:0,...st}}>
      {PATHS[n]}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   ATOMS
═══════════════════════════════════════════════════════ */
function Avi({name,c1='#3B82F6',c2='#1D4ED8',size=44}) {
  return (
    <div style={{
      width:size,height:size,borderRadius:size,flexShrink:0,
      background:`linear-gradient(135deg,${c1},${c2})`,
      display:'flex',alignItems:'center',justifyContent:'center',
    }}>
      <span style={{color:'#fff',fontWeight:900,fontSize:size*.36,lineHeight:1}}>{initials(name)}</span>
    </div>
  );
}

function Chip({label,active,onClick}) {
  return (
    <button onClick={onClick} style={{
      flexShrink:0,padding:'7px 16px',borderRadius:R.pill,border:'none',cursor:'pointer',
      background:active?C.pri:'#fff',
      boxShadow:active?sh.pri:`0 0 0 1px ${C.bd}`,
      color:active?'#fff':C.t2, fontWeight:700,fontSize:12,
      transform:active?'scale(1.03)':'scale(1)',
      transition:'all .15s ease', whiteSpace:'nowrap', fontFamily:'inherit',
    }}>{label}</button>
  );
}

function StatusPill({status}) {
  const map={
    paid:{l:'Lunas',bg:C.grnLt,c:C.grn},
    unpaid:{l:'Belum Bayar',bg:C.ambLt,c:C.amb},
    cancelled:{l:'Batal',bg:C.redLt,c:C.red},
  };
  const s=map[status]||map.unpaid;
  return <span style={{padding:'3px 8px',borderRadius:6,background:s.bg,color:s.c,fontWeight:700,fontSize:10}}>{s.l}</span>;
}

function PressBtn({onClick,children,style:st,disabled}) {
  const [p,setP]=useState(false);
  return (
    <button
      onClick={disabled?null:onClick}
      onMouseDown={()=>!disabled&&setP(true)}
      onMouseUp={()=>setP(false)}
      onMouseLeave={()=>setP(false)}
      onTouchStart={()=>!disabled&&setP(true)}
      onTouchEnd={()=>setP(false)}
      style={{
        border:'none',cursor:disabled?'not-allowed':'pointer',fontFamily:'inherit',
        transform:p?'scale(.93)':'scale(1)',
        transition:'transform .1s ease',
        ...st,
      }}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   PRODUCT CARD
═══════════════════════════════════════════════════════ */
function ProdCard({product,onAdd}) {
  const [p,setP]=useState(false);
  const tap=()=>{setP(true);setTimeout(()=>setP(false),120);onAdd(product);};
  return (
    <div
      onClick={tap}
      style={{
        background:C.card,borderRadius:R.md,border:`1px solid ${C.bd2}`,
        boxShadow:p?sh.xs:sh.sm,
        transform:p?'scale(.95)':'scale(1)',
        transition:'all .12s ease',cursor:'pointer',overflow:'hidden',
        display:'flex',flexDirection:'column',
      }}>
      {/* emoji image */}
      <div style={{
        aspectRatio:'4/3',background:`linear-gradient(135deg,${product.c1},${product.c2})`,
        display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,userSelect:'none',
      }}>
        {product.emoji}
      </div>
      <div style={{padding:'8px 10px 10px',flex:1,display:'flex',flexDirection:'column',gap:3}}>
        <div style={{
          fontWeight:700,fontSize:12,color:C.t1,lineHeight:1.35,
          display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',
        }}>{product.name}</div>
        <div style={{fontWeight:900,fontSize:14,color:C.pri,marginTop:'auto'}}>{fmt(product.price)}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   STATUS BAR
═══════════════════════════════════════════════════════ */
function StatusBar() {
  const [t,setT]=useState('');
  useEffect(()=>{
    const tick=()=>{const d=new Date();setT(`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`);};
    tick();const iv=setInterval(tick,1000);return()=>clearInterval(iv);
  },[]);
  return (
    <div style={{height:44,background:C.card,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',flexShrink:0,position:'relative'}}>
      <span style={{fontWeight:800,fontSize:13,color:C.t1}}>{t}</span>
      {/* Dynamic island */}
      <div style={{position:'absolute',left:'50%',transform:'translateX(-50%)',width:116,height:30,background:'#000',borderRadius:22,display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
        <div style={{width:8,height:8,borderRadius:4,background:'#1c1c1c',border:'1.5px solid #2c2c2c'}}/>
        <div style={{width:12,height:12,borderRadius:6,background:'#111',border:'1.5px solid #222'}}/>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <span style={{fontSize:11,fontWeight:700,color:C.t1}}>5G</span>
        <div style={{width:22,height:10,borderRadius:3,border:`1.5px solid ${C.t2}`,display:'flex',alignItems:'center',padding:1.5}}>
          <div style={{width:'80%',height:'100%',borderRadius:2,background:C.grn}}/>
          <div style={{width:2,height:6,background:C.t2,marginLeft:1.5,borderRadius:1}}/>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   BOTTOM NAV
═══════════════════════════════════════════════════════ */
function BottomNav({screen,setScreen,cartCount,onCart}) {
  const tabs=[
    {id:'pos',label:'Kasir',icon:'grid'},
    {id:'__cart__',label:'',icon:'cart'},
    {id:'orders',label:'Pesanan',icon:'receipt'},
    {id:'hub',label:'Hub',icon:'hub'},
  ];
  return (
    <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'0 14px 18px',pointerEvents:'none',zIndex:40}}>
      <div style={{
        background:'rgba(255,255,255,.93)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',
        border:`1px solid rgba(226,232,240,.9)`,borderRadius:22,
        boxShadow:'0 8px 32px rgba(0,0,0,.14)',
        display:'flex',alignItems:'center',padding:'6px 6px',gap:4,
        pointerEvents:'all',
      }}>
        {tabs.map(tab=>{
          if(tab.id==='__cart__') return (
            <div key="cart" style={{flex:1,display:'flex',justifyContent:'center',alignItems:'center',position:'relative'}}>
              <PressBtn onClick={onCart} style={{
                width:54,height:54,borderRadius:R.lg,
                background:'linear-gradient(145deg,#3B82F6 0%,#1D4ED8 100%)',
                display:'flex',alignItems:'center',justifyContent:'center',
                boxShadow:'0 6px 20px rgba(37,99,235,.5)',position:'relative',
              }}>
                <Ic n="cart" s={22} c="#fff" sw={1.8}/>
                {cartCount>0&&(
                  <div key={cartCount} className="pop" style={{
                    position:'absolute',top:-5,right:-5,
                    minWidth:18,height:18,borderRadius:9,
                    background:'#EF4444',border:'2.5px solid #fff',
                    display:'flex',alignItems:'center',justifyContent:'center',
                  }}>
                    <span style={{fontSize:9,fontWeight:900,color:'#fff',lineHeight:1}}>{cartCount>99?'99+':cartCount}</span>
                  </div>
                )}
              </PressBtn>
            </div>
          );
          const active=screen===tab.id;
          return (
            <PressBtn key={tab.id} onClick={()=>setScreen(tab.id)} style={{
              flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
              gap:3,padding:'7px 0',borderRadius:14,position:'relative',
              background:active?'#EFF6FF':'transparent',
            }}>
              <Ic n={tab.icon} s={20} c={active?C.pri:C.t3} sw={active?2.5:1.8}/>
              <span style={{fontSize:9,fontWeight:700,color:active?C.pri:C.t3,lineHeight:1}}>{tab.label}</span>
            </PressBtn>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LOGIN SCREEN
═══════════════════════════════════════════════════════ */
function LoginScreen({onLogin}) {
  const [tab,setTab]=useState('owner');
  const [email,setEmail]=useState('owner@demo.id');
  const [pass,setPass]=useState('••••••••');
  const [loading,setLoading]=useState(false);
  const go=()=>{setLoading(true);setTimeout(()=>{setLoading(false);onLogin();},1100);};
  return (
    <div style={{flex:1,background:'linear-gradient(150deg,#EFF6FF 0%,#fff 55%,#EEF2FF 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'28px 20px'}} className="f-in">
      {/* logo */}
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{width:62,height:62,borderRadius:20,background:C.pri,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',boxShadow:'0 10px 28px rgba(37,99,235,.4)'}}>
          <Ic n="store" s={30} c="#fff" sw={1.5}/>
        </div>
        <div style={{fontWeight:900,fontSize:24,color:C.t1,letterSpacing:-.5}}>AuraPOS</div>
        <div style={{fontSize:12,color:C.t3,marginTop:2}}>Sistem kasir modern</div>
      </div>

      {/* card */}
      <div style={{width:'100%',background:C.card,borderRadius:24,border:`1px solid ${C.bd}`,boxShadow:sh.md,overflow:'hidden'}}>
        <div style={{height:4,background:'linear-gradient(90deg,#3B82F6,#2563EB,#4F46E5)'}}/>
        <div style={{padding:'20px 18px 22px'}}>
          {/* tab */}
          <div style={{background:C.card2,borderRadius:14,padding:4,display:'grid',gridTemplateColumns:'1fr 1fr',gap:3,marginBottom:18}}>
            {[{v:'owner',l:'Owner / Admin'},{v:'kasir',l:'Kasir'}].map(t=>(
              <button key={t.v} onClick={()=>setTab(t.v)} style={{
                padding:'10px',borderRadius:10,border:'none',cursor:'pointer',fontFamily:'inherit',
                background:tab===t.v?C.card:'transparent',
                boxShadow:tab===t.v?sh.xs:'none',
                color:tab===t.v?C.t1:C.t3,fontWeight:700,fontSize:12,
                transition:'all .15s',
              }}>{t.l}</button>
            ))}
          </div>

          {/* inputs */}
          {[{ph:'Email atau username',val:email,set:setEmail,icon:'user',type:'text'},
            {ph:'Password',val:pass,set:setPass,icon:'bag',type:'password'}].map((f,i)=>(
            <div key={i} style={{position:'relative',marginBottom:10}}>
              <div style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)'}}><Ic n={f.icon} s={15} c={C.t3}/></div>
              <input value={f.val} onChange={e=>f.set(e.target.value)} type={f.type}
                placeholder={f.ph}
                style={{width:'100%',height:44,borderRadius:R.md,border:`1px solid ${C.bd}`,paddingLeft:34,paddingRight:12,fontSize:13,color:C.t1,outline:'none',background:C.card,fontFamily:'inherit'}}/>
            </div>
          ))}

          {/* btn */}
          <PressBtn onClick={go} disabled={loading} style={{
            width:'100%',height:48,borderRadius:R.md,marginTop:8,
            background:loading?'#93C5FD':C.pri,color:'#fff',
            fontWeight:800,fontSize:14,
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            boxShadow:loading?'none':sh.pri,transition:'background .2s,box-shadow .2s',
          }}>
            {loading
              ? <div className="spin" style={{width:18,height:18,border:'2.5px solid rgba(255,255,255,.35)',borderTopColor:'#fff',borderRadius:'50%'}}/>
              : <><span>Masuk</span><Ic n="chevU" s={15} c="#fff" sw={2.5} style={{transform:'rotate(90deg)'}}/></>
            }
          </PressBtn>
        </div>
      </div>
      <div style={{marginTop:14,fontSize:11,color:C.t4}}>Demo — tap Masuk untuk lanjut</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   POS SCREEN
═══════════════════════════════════════════════════════ */
function POSScreen({onAdd}) {
  const [cat,setCat]=useState('Semua');
  const [q,setQ]=useState('');

  const list = PRODUCTS.filter(p=>{
    if(q) return p.name.toLowerCase().includes(q.toLowerCase());
    return cat==='Semua'||p.cat===cat;
  });
  const isGroup=!q&&cat==='Semua';
  const groups=['Minuman','Makanan','Snack'];

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.bg,overflow:'hidden'}}>
      {/* top bar */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.bd2}`,padding:'10px 14px 8px',flexShrink:0}}>
        <div style={{display:'flex',gap:8}}>
          <div style={{flex:1,position:'relative'}}>
            <div style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><Ic n="search" s={15} c={C.t3}/></div>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari menu..."
              style={{width:'100%',height:40,borderRadius:R.md,border:`1px solid ${C.bd}`,paddingLeft:32,paddingRight:10,fontSize:13,color:C.t1,outline:'none',background:C.card,fontFamily:'inherit'}}/>
          </div>
          <button style={{height:40,padding:'0 12px',borderRadius:R.md,border:`1px solid ${C.bd}`,background:C.card,color:C.t2,fontWeight:600,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:5,flexShrink:0,fontFamily:'inherit'}}>
            <Ic n="clock" s={12} c={C.t3}/> Draft
          </button>
        </div>
      </div>

      {/* category chips */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.bd2}`,padding:'8px 14px',flexShrink:0}}>
        <div className="hscr">
          {CATS.map(c=><Chip key={c} label={c} active={cat===c} onClick={()=>{setQ('');setCat(c);}}/>)}
        </div>
      </div>

      {/* grid */}
      <div className="scr" style={{flex:1,padding:'12px 14px 110px'}}>
        {isGroup
          ? groups.map(g=>{
              const items=PRODUCTS.filter(p=>p.cat===g);
              return (
                <div key={g} style={{marginBottom:20}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <span style={{fontWeight:800,fontSize:12,color:C.t1}}>{g}</span>
                    <span style={{fontSize:10,fontWeight:700,color:C.t3,background:C.card2,padding:'1px 7px',borderRadius:20}}>{items.length}</span>
                    <div style={{flex:1,height:1,background:C.bd2}}/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {items.map(p=><ProdCard key={p.id} product={p} onAdd={onAdd}/>)}
                  </div>
                </div>
              );
            })
          : list.length===0
            ? <div style={{textAlign:'center',padding:'56px 0'}}>
                <div style={{width:56,height:56,borderRadius:28,background:C.card2,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}><Ic n="search" s={26} c={C.t4}/></div>
                <div style={{fontWeight:700,fontSize:14,color:C.t2}}>Produk tidak ditemukan</div>
                <div style={{fontSize:12,color:C.t3,marginTop:4}}>Coba kata kunci lain</div>
              </div>
            : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {list.map(p=><ProdCard key={p.id} product={p} onAdd={onAdd}/>)}
              </div>
        }
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CART SHEET
═══════════════════════════════════════════════════════ */
function CartSheet({open,onClose,cart,onQty,onClear,onPay,orderNum}) {
  const [type,setType]=useState('Dine In');
  const [cust,setCust]=useState('');
  const [detail,setDetail]=useState(false);

  if(!open)return null;
  const sub=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const tax=Math.round(sub*.1);
  const total=sub+tax;

  return (
    <div style={{position:'absolute',inset:0,zIndex:50,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
      <div onClick={onClose} className="f-in" style={{position:'absolute',inset:0,background:'rgba(15,23,42,.5)',backdropFilter:'blur(2px)'}}/>
      <div className="s-up" style={{position:'relative',background:C.card,borderRadius:'24px 24px 0 0',display:'flex',flexDirection:'column',maxHeight:'88%'}}>
        {/* handle */}
        <div style={{display:'flex',justifyContent:'center',padding:'10px 0 6px'}}><div style={{width:40,height:4,borderRadius:4,background:C.bd}}/></div>
        {/* header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px 12px',borderBottom:`1px solid ${C.bd2}`}}>
          <span style={{fontWeight:900,fontSize:15,color:C.t1}}>Order</span>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{padding:'3px 10px',borderRadius:7,background:C.priLt,color:C.pri,fontWeight:800,fontSize:11}}>{orderNum}</span>
            <PressBtn onClick={()=>{onClear();}} style={{width:30,height:30,borderRadius:8,background:'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Ic n="trash" s={14} c={C.t4}/>
            </PressBtn>
          </div>
        </div>

        {/* order type */}
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.bd2}`}}>
          <div style={{background:C.card2,borderRadius:R.sm,padding:3,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:3,marginBottom:10}}>
            {['Dine In','Take Away','Delivery'].map(t=>(
              <button key={t} onClick={()=>setType(t)} style={{
                padding:'8px 4px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'inherit',
                background:type===t?C.card:'transparent',boxShadow:type===t?sh.xs:'none',
                color:type===t?C.t1:C.t3,fontWeight:700,fontSize:10,transition:'all .15s',
              }}>{t}</button>
            ))}
          </div>
          <div style={{position:'relative'}}>
            <div style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><Ic n="user" s={13} c={C.t3}/></div>
            <input value={cust} onChange={e=>setCust(e.target.value)} placeholder="Nama pelanggan"
              style={{width:'100%',height:34,borderRadius:R.sm,border:`1px solid ${C.bd}`,paddingLeft:29,paddingRight:10,fontSize:12,color:C.t1,outline:'none',background:C.card,fontFamily:'inherit'}}/>
          </div>
        </div>

        {/* items */}
        <div className="scr" style={{flex:1,minHeight:0}}>
          {cart.length===0
            ? <div style={{textAlign:'center',padding:'36px 0',color:C.t3}}>
                <Ic n="bag" s={32} c={C.t4}/>
                <div style={{marginTop:8,fontSize:12,fontWeight:600}}>Keranjang kosong</div>
              </div>
            : cart.map(item=>(
              <div key={item.id} style={{display:'flex',gap:10,padding:'10px 16px',borderBottom:`1px solid ${C.bd2}`,alignItems:'center'}}>
                <div style={{width:36,height:36,borderRadius:9,overflow:'hidden',flexShrink:0,background:`linear-gradient(135deg,${item.c1},${item.c2})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{item.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.t1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                  <div style={{fontWeight:800,fontSize:12,color:C.t1,marginTop:2}}>{fmt(item.price*item.qty)}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4,background:C.card2,borderRadius:9,padding:2,border:`1px solid ${C.bd2}`}}>
                  <PressBtn onClick={()=>onQty(item.id,item.qty-1)} style={{width:24,height:24,borderRadius:7,background:C.card,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:sh.xs}}>
                    <Ic n="minus" s={10} c={C.t2} sw={2.5}/>
                  </PressBtn>
                  <span style={{width:20,textAlign:'center',fontWeight:900,fontSize:12,color:C.t1}}>{item.qty}</span>
                  <PressBtn onClick={()=>onQty(item.id,item.qty+1)} style={{width:24,height:24,borderRadius:7,background:C.card,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:sh.xs}}>
                    <Ic n="plus" s={10} c={C.t2} sw={2.5}/>
                  </PressBtn>
                </div>
              </div>
            ))
          }
        </div>

        {/* footer */}
        {cart.length>0&&(
          <div style={{borderTop:`1px solid ${C.bd}`,background:C.card,flexShrink:0}}>
            {detail&&(
              <div style={{padding:'10px 16px 0',background:'#FAFAFA',borderBottom:`1px solid ${C.bd2}`}}>
                {[['Subtotal',fmt(sub)],['Pajak (10%)',fmt(tax)]].map(([l,v])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:12,color:C.t2}}>{l}</span>
                    <span style={{fontSize:12,fontWeight:700,color:C.t1}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px 4px'}}>
              <button onClick={()=>setDetail(!detail)} style={{display:'flex',alignItems:'center',gap:5,border:'none',background:'none',cursor:'pointer',padding:0,fontFamily:'inherit'}}>
                <span style={{fontSize:12,fontWeight:700,color:C.t2}}>Total</span>
                <Ic n={detail?'chevU':'chevD'} s={12} c={C.t3}/>
              </button>
              <span style={{fontWeight:900,fontSize:19,color:C.t1}}>{fmt(total)}</span>
            </div>
            <div style={{padding:'6px 16px 20px',display:'flex',gap:8}}>
              <PressBtn onClick={onClose} style={{width:44,height:44,borderRadius:R.md,border:`2px solid ${C.bd}`,background:C.card,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Ic n="bag" s={16} c={C.t2}/>
              </PressBtn>
              <PressBtn onClick={()=>{onClose();onPay(total);}} style={{flex:1,height:44,borderRadius:R.md,background:C.pri,color:'#fff',fontWeight:800,fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',gap:7,boxShadow:sh.pri}}>
                <Ic n="banknote" s={16} c="#fff"/><span>Bayar {fmt(total)}</span>
              </PressBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PAYMENT SHEET
═══════════════════════════════════════════════════════ */
function PaySheet({open,onClose,total,onSuccess}) {
  const [method,setMethod]=useState('Tunai');
  const [raw,setRaw]=useState('');
  const [done,setDone]=useState(false);

  useEffect(()=>{if(open){setRaw('');setDone(false);setMethod('Tunai');};},[open]);
  if(!open)return null;

  const cash=parseInt(raw)||0;
  const change=cash-total;
  const ok=method!=='Tunai'||cash>=total;

  const key=k=>{
    if(k==='⌫'){setRaw(p=>p.slice(0,-1));return;}
    const n=k==='000'?(raw===''?'':raw+'000'):raw+k;
    if(parseInt(n||'0')<=99999999)setRaw(n);
  };

  const process=()=>{
    if(!ok||done)return;
    setDone(true);
    setTimeout(()=>{onSuccess();onClose();},1600);
  };

  const methods=[{l:'Tunai',n:'banknote'},{l:'Transfer',n:'card'},{l:'QRIS',n:'qr'}];

  return (
    <div style={{position:'absolute',inset:0,zIndex:60,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
      <div onClick={onClose} className="f-in" style={{position:'absolute',inset:0,background:'rgba(15,23,42,.55)',backdropFilter:'blur(2px)'}}/>
      <div className="s-up" style={{position:'relative',background:C.card,borderRadius:'24px 24px 0 0',display:'flex',flexDirection:'column',maxHeight:'92%'}}>
        {/* handle */}
        <div style={{display:'flex',justifyContent:'center',padding:'10px 0 4px'}}><div style={{width:40,height:4,borderRadius:4,background:C.bd}}/></div>
        {/* header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 18px 14px'}}>
          <span style={{fontWeight:900,fontSize:16,color:C.t1}}>Pembayaran</span>
          <span style={{fontWeight:900,fontSize:16,color:C.t1}}>{fmt(total)}</span>
        </div>

        {/* amount display */}
        <div style={{padding:'0 16px 14px'}}>
          <div style={{fontSize:10,fontWeight:800,color:C.t3,letterSpacing:.8,textTransform:'uppercase',marginBottom:6}}>
            {method==='Tunai'?'Jumlah Tunai':'Total Tagihan'}
          </div>
          <div style={{
            height:66,borderRadius:R.lg,
            border:`2.5px solid ${raw&&method==='Tunai'&&cash<total?C.red:C.pri}`,
            display:'flex',alignItems:'center',padding:'0 16px',
            background:raw&&method==='Tunai'&&cash<total?C.redLt:C.priLt,
            transition:'all .2s ease',
          }}>
            <span style={{fontWeight:900,fontSize:29,color:C.t1,letterSpacing:-.5,fontVariantNumeric:'tabular-nums'}}>
              {method!=='Tunai'?fmt(total):(raw?fmt(cash):'Rp 0')}
            </span>
          </div>
          {method==='Tunai'&&cash>0&&change>=0&&(
            <div className="float-up" style={{marginTop:8,display:'flex',justifyContent:'space-between',padding:'8px 14px',background:C.grnLt,borderRadius:R.md}}>
              <span style={{fontSize:12,color:C.grn,fontWeight:700}}>Kembalian</span>
              <span style={{fontSize:14,color:C.grn,fontWeight:900}}>{fmt(change)}</span>
            </div>
          )}
        </div>

        {/* payment methods */}
        <div style={{padding:'0 16px 12px',display:'flex',gap:8}}>
          {methods.map(m=>(
            <PressBtn key={m.l} onClick={()=>setMethod(m.l)} style={{
              flex:1,height:44,borderRadius:R.md,
              background:method===m.l?C.pri:C.card,
              border:method===m.l?'none':`1px solid ${C.bd}`,
              color:method===m.l?'#fff':C.t2,
              fontWeight:700,fontSize:12,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              boxShadow:method===m.l?sh.pri:'none',transition:'all .15s',
            }}>
              <Ic n={m.n} s={14} c={method===m.l?'#fff':C.t3}/>{m.l}
            </PressBtn>
          ))}
        </div>

        {/* numpad */}
        {method==='Tunai'&&!done&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,padding:'0 16px 12px'}}>
            {NUMPAD.map(k=>(
              <PressBtn key={k} onClick={()=>key(k)} style={{
                height:52,borderRadius:R.md,
                border:k==='⌫'?`1px solid #FEE2E2`:`1px solid ${C.bd2}`,
                background:k==='⌫'?C.redLt:C.card,
                color:k==='⌫'?C.red:C.t1,
                fontWeight:800,fontSize:k==='000'?13:18,
              }}>{k}</PressBtn>
            ))}
          </div>
        )}

        {/* success */}
        {done&&(
          <div className="float-up" style={{padding:'20px 16px 10px',display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
            <div style={{width:64,height:64,borderRadius:32,background:C.grnLt,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Ic n="okCircle" s={34} c={C.grn}/>
            </div>
            <div style={{fontWeight:900,fontSize:16,color:C.grn}}>Pembayaran Berhasil!</div>
            <div style={{fontSize:12,color:C.t3}}>Terima kasih 🎉</div>
          </div>
        )}

        {!done&&(
          <div style={{padding:'0 16px 24px'}}>
            <PressBtn onClick={process} disabled={!ok} style={{
              width:'100%',height:52,borderRadius:R.md,
              background:ok?C.pri:'#CBD5E1',color:'#fff',
              fontWeight:800,fontSize:15,
              boxShadow:ok?sh.pri:'none',transition:'all .15s',
            }}>
              {method==='Tunai'&&!ok?`Kurang ${fmt(total-cash)}`:'Proses Pembayaran'}
            </PressBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ORDERS SCREEN
═══════════════════════════════════════════════════════ */
function OrdersScreen() {
  const [period,setPeriod]=useState('Hari Ini');
  const total=ORDERS_DATA.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+o.total,0);
  const paid=ORDERS_DATA.filter(o=>o.status==='paid').length;
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.bg,overflow:'hidden'}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.bd2}`,padding:'14px 16px 10px',flexShrink:0}}>
        <div style={{fontWeight:900,fontSize:18,color:C.t1,marginBottom:10}}>Pesanan</div>
        <div className="hscr">
          {['Hari Ini','Kemarin','Minggu Ini','Bulan Ini'].map(p=>(
            <Chip key={p} label={p} active={period===p} onClick={()=>setPeriod(p)}/>
          ))}
        </div>
      </div>

      {/* stat cards */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'12px 16px 6px'}}>
        {[{l:'Total Penjualan',v:fmt(total),c:C.pri},{l:'Transaksi Lunas',v:`${paid} order`,c:C.grn}].map(s=>(
          <div key={s.l} style={{background:C.card,borderRadius:R.md,padding:'12px 14px',border:`1px solid ${C.bd2}`,boxShadow:sh.xs}}>
            <div style={{fontSize:10,fontWeight:700,color:C.t3,textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>{s.l}</div>
            <div style={{fontWeight:900,fontSize:16,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="scr" style={{flex:1,padding:'4px 16px 110px'}}>
        {ORDERS_DATA.map(o=>(
          <div key={o.id} style={{background:C.card,borderRadius:R.md,padding:'12px 14px',border:`1px solid ${C.bd2}`,boxShadow:sh.xs,marginBottom:8,cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:800,fontSize:13,color:C.t1}}>{o.num}</span>
                <span style={{padding:'2px 8px',borderRadius:6,background:C.card2,color:C.t2,fontSize:10,fontWeight:700}}>{o.type}</span>
              </div>
              <StatusPill status={o.status}/>
            </div>
            <div style={{fontSize:12,color:C.t2,marginBottom:5}}>{o.customer}{o.table?` · Meja ${o.table}`:''}</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:11,color:C.t3}}>{o.count} item · {o.time}</span>
              <span style={{fontWeight:900,fontSize:14,color:C.t1}}>{fmt(o.total)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HUB SCREEN
═══════════════════════════════════════════════════════ */
function HubScreen({onLogout}) {
  const items=[
    {t:'Marketplace',s:'Aktifkan fitur',n:'shBag',bg:'#EDE9FE',ic:'#7C3AED',hl:true},
    {t:'Fitur Saya',s:'Fitur aktif',n:'okCircle',bg:'#DCFCE7',ic:'#16A34A'},
    {t:'Produk',s:'Kelola menu',n:'box',bg:'#FFF7ED',ic:'#EA580C'},
    {t:'Stok',s:'Pantau stok',n:'pack',bg:'#F3E8FF',ic:'#7C3AED'},
    {t:'Laporan',s:'Analisis',n:'chart',bg:'#EFF6FF',ic:C.pri},
    {t:'Karyawan',s:'Kelola tim',n:'users',bg:'#DCFCE7',ic:C.grn},
    {t:'Profil Toko',s:'Pengaturan',n:'store',bg:'#F1F5F9',ic:'#475569'},
    {t:'Keluar',s:'Logout',n:'logout',bg:C.redLt,ic:C.red,action:onLogout},
  ];
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',background:C.bg,overflow:'hidden'}}>
      {/* user header */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.bd2}`,padding:'14px 16px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Avi name="Ahmad Owner" size={48}/>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:C.t1}}>Ahmad Owner</div>
            <div style={{fontSize:12,color:C.t3}}>Owner</div>
          </div>
        </div>
        <div style={{marginTop:10,padding:'8px 12px',borderRadius:R.sm,background:C.card2,border:`1px solid ${C.bd}`,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
          <Ic n="store" s={14} c={C.t3}/>
          <span style={{flex:1,fontSize:12,fontWeight:600,color:C.t2}}>Cabang Utama</span>
          <Ic n="chevD" s={12} c={C.t3}/>
        </div>
      </div>

      <div className="scr" style={{flex:1,padding:'12px 16px 110px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:9}}>
          {items.map(item=>(
            <PressBtn key={item.t} onClick={item.action} style={{
              background:C.card,borderRadius:R.md,padding:'12px 8px 14px',
              border:`1px solid ${item.hl?'#DDD6FE':C.bd2}`,
              display:'flex',flexDirection:'column',alignItems:'flex-start',gap:8,
              boxShadow:sh.xs,
            }}>
              <div style={{width:38,height:38,borderRadius:10,background:item.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Ic n={item.n} s={18} c={item.ic} sw={1.8}/>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontWeight:800,fontSize:11,color:C.t1}}>{item.t}</div>
                <div style={{fontSize:9,color:C.t3,marginTop:1}}>{item.s}</div>
              </div>
            </PressBtn>
          ))}
        </div>
        <div style={{textAlign:'center',marginTop:20,fontSize:10,color:C.t4}}>AuraPOS Mobile v1.0.0</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════ */
function Toast({msg,visible}) {
  if(!visible)return null;
  return (
    <div className="float-up" style={{
      position:'absolute',top:54,left:12,right:12,zIndex:90,
      background:C.grn,borderRadius:R.md,padding:'12px 14px',
      display:'flex',alignItems:'center',gap:10,
      boxShadow:'0 4px 20px rgba(22,163,74,.4)',
    }}>
      <Ic n="okCircle" s={20} c="#fff"/>
      <div>
        <div style={{fontWeight:800,fontSize:13,color:'#fff'}}>{msg}</div>
        <div style={{fontSize:11,color:'rgba(255,255,255,.8)'}}>Order baru siap dibuat</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════ */
export default function App() {
  const [screen,setScreen]=useState('login');
  const [cart,setCart]=useState([]);
  const [cartOpen,setCartOpen]=useState(false);
  const [payOpen,setPayOpen]=useState(false);
  const [payTotal,setPayTotal]=useState(0);
  const [toast,setToast]=useState(false);
  const orderNumRef=useRef(5);

  const cartCount=cart.reduce((s,i)=>s+i.qty,0);
  const orderNum=`#A-00${orderNumRef.current}`;

  const addToCart=p=>{
    setCart(prev=>{
      const ex=prev.find(i=>i.id===p.id);
      return ex?prev.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...prev,{...p,qty:1}];
    });
  };

  const updateQty=(id,qty)=>{
    if(qty<=0)setCart(p=>p.filter(i=>i.id!==id));
    else setCart(p=>p.map(i=>i.id===id?{...i,qty}:i));
  };

  const paySuccess=()=>{
    orderNumRef.current+=1;
    setCart([]);
    setToast(true);
    setTimeout(()=>setToast(false),2800);
  };

  const loggedIn=screen!=='login';

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:'100vh',
        background:'linear-gradient(160deg,#0f172a 0%,#1e293b 50%,#0c1220 100%)',
        display:'flex',alignItems:'center',justifyContent:'center',
        padding:20,fontFamily:"'Inter',system-ui,sans-serif",
      }}>
        {/* ── Phone frame ── */}
        <div style={{
          width:393,flexShrink:0,
          background:'#111',
          borderRadius:54,
          boxShadow:'0 40px 90px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)',
          overflow:'hidden',position:'relative',
          display:'flex',flexDirection:'column',
        }}>
          {/* Side buttons */}
          <div style={{position:'absolute',left:-3,top:120,width:3,height:36,background:'#2a2a2a',borderRadius:'2px 0 0 2px'}}/>
          <div style={{position:'absolute',left:-3,top:168,width:3,height:60,background:'#2a2a2a',borderRadius:'2px 0 0 2px'}}/>
          <div style={{position:'absolute',left:-3,top:240,width:3,height:60,background:'#2a2a2a',borderRadius:'2px 0 0 2px'}}/>
          <div style={{position:'absolute',right:-3,top:160,width:3,height:80,background:'#2a2a2a',borderRadius:'0 2px 2px 0'}}/>

          {/* Inner screen */}
          <div style={{
            margin:6,borderRadius:48,overflow:'hidden',
            background:C.card,display:'flex',flexDirection:'column',
            height:852,
          }}>
            <StatusBar/>

            {/* content */}
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
              {screen==='login'&&<LoginScreen onLogin={()=>setScreen('pos')}/>}
              {loggedIn&&screen==='pos'&&<POSScreen onAdd={addToCart}/>}
              {loggedIn&&screen==='orders'&&<OrdersScreen/>}
              {loggedIn&&screen==='hub'&&<HubScreen onLogout={()=>{setCart([]);setScreen('login');}}/>}

              {loggedIn&&(
                <BottomNav
                  screen={screen} setScreen={setScreen}
                  cartCount={cartCount}
                  onCart={()=>setCartOpen(true)}
                />
              )}

              <CartSheet
                open={cartOpen} onClose={()=>setCartOpen(false)}
                cart={cart} onQty={updateQty} onClear={()=>setCart([])}
                onPay={t=>{setPayTotal(t);setPayOpen(true);}}
                orderNum={orderNum}
              />

              <PaySheet
                open={payOpen} onClose={()=>setPayOpen(false)}
                total={payTotal} onSuccess={paySuccess}
              />

              <Toast msg="Pembayaran Berhasil!" visible={toast}/>
            </div>

            {/* home indicator */}
            <div style={{height:30,background:C.card,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <div style={{width:130,height:5,borderRadius:3,background:C.bd}}/>
            </div>
          </div>
        </div>

        {/* caption */}
        <div style={{
          position:'fixed',bottom:16,left:'50%',transform:'translateX(-50%)',
          background:'rgba(0,0,0,.6)',backdropFilter:'blur(12px)',
          color:'rgba(255,255,255,.85)',fontSize:11,fontWeight:600,
          padding:'7px 16px',borderRadius:20,whiteSpace:'nowrap',letterSpacing:.2,
        }}>
          Tap produk → tambah ke keranjang · Tap 🛒 untuk checkout
        </div>
      </div>
    </>
  );
}
