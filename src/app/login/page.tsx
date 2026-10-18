'use client';
import {useState} from 'react';
import {Gem,ArrowRight,LockKeyhole} from 'lucide-react';
export default function Login(){
  const [error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setLoading(true);setError('');
    try{const password=new FormData(e.currentTarget).get('password');const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const body=await response.json();if(!response.ok)throw new Error(body.error);window.location.assign('/');}catch(e){setError((e as Error).message);setLoading(false);}
  }
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f3f5f3',padding:24,color:'#172b2a'}}>
    <section style={{width:'100%',maxWidth:440,padding:40,background:'white',borderRadius:24,border:'1px solid #dae4df',boxShadow:'0 24px 80px #173e3210'}}>
      <Gem size={38} color="#177d66"/><p style={{fontSize:12,letterSpacing:4,fontWeight:700,marginTop:22}}>PRISME</p>
      <h1 style={{fontSize:32,fontWeight:650,margin:'10px 0'}}>Vos décisions, en perspective.</h1>
      <p style={{color:'#657873',lineHeight:1.6,marginBottom:30}}>Connectez-vous à votre espace privé d’analyse et de suivi.</p>
      <form onSubmit={submit}>
        <label htmlFor="password" style={{display:'block',fontSize:14,fontWeight:600,marginBottom:8}}>Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} style={{width:'100%',padding:13,border:'1px solid #bdcec7',borderRadius:10,color:'#172b2a',background:'#fff'}}/>
        {error&&<p role="alert" style={{color:'#b44336',marginTop:12,fontSize:14}}>{error}</p>}
        <button disabled={loading} style={{marginTop:18,width:'100%',padding:14,background:'#177d66',color:'white',border:0,borderRadius:10,display:'flex',gap:12,justifyContent:'center',alignItems:'center',cursor:'pointer'}}>{loading?'Connexion…':'Ouvrir mon espace'}<ArrowRight size={18}/></button>
      </form>
      <p style={{fontSize:12,lineHeight:1.7,color:'#657873',marginTop:24}}><LockKeyhole size={13} style={{display:'inline',verticalAlign:'middle'}}/> Première connexion : le mot de passe initial se trouve dans <code>.local/initial-password.txt</code>, créé par <code>npm run setup</code>. Vous pouvez le changer dans Paramètres.</p>
    </section>
  </main>;
}
