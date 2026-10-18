/** Three independent source families. No adapter impersonates a live authorized connection. */
export type SourceFamily='tipsters'|'odds'|'account';
export interface ConnectorStatus {id:string;family:SourceFamily;name:string;mode:'manual'|'disabled';reason:string;lastSynchronizedAt:null;requiredAccess:string[];}
export const CONNECTORS:readonly ConnectorStatus[]=[
  {id:'generic-picks',family:'tipsters',name:'Fichier de pronostics autorisé',mode:'manual',reason:'CSV fourni par l’utilisateur, avec provenance et droits de traitement.',lastSynchronizedAt:null,requiredAccess:[]},
  {id:'bet-analytix',family:'tipsters',name:'Bet Analytix',mode:'disabled',reason:'Conditions et accès automatisé autorisé non vérifiés.',lastSynchronizedAt:null,requiredAccess:['Conditions applicables vérifiées','API ou flux expressément autorisé']},
  {id:'odds-api',family:'odds',name:'The Odds API',mode:'disabled',reason:'Couverture Winamax France, marchés, quotas et offre à vérifier avant activation.',lastSynchronizedAt:null,requiredAccess:['Couverture vérifiée','Clé côté serveur','Accord préalable pour tout abonnement payant']},
  {id:'manual-odds',family:'odds',name:'Cotes saisies manuellement',mode:'manual',reason:'Relevé horodaté et correspondance explicite du marché.',lastSynchronizedAt:null,requiredAccess:[]},
  {id:'winamax-account',family:'account',name:'Compte Winamax',mode:'manual',reason:'Saisie ou CSV générique. Aucune API publique de compte ou export natif supposé.',lastSynchronizedAt:null,requiredAccess:[]}
];
export async function synchronizeConnector(id:string):Promise<never>{
  const adapter=CONNECTORS.find(item=>item.id===id);
  throw new Error(adapter?`${adapter.name} : ${adapter.reason}`:'Connecteur inconnu.');
}
