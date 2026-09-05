/* CNC AI Technológ – generátor programu z detailného technologického plánu */
const OPENAI_URL="https://api.openai.com/v1";
const MODEL="gpt-5.6-luna";
const SCHEMA={type:"object",additionalProperties:false,properties:{
 program:{type:"string"},notes:{type:"string"},assumptions:{type:"array",items:{type:"string"}},checks:{type:"array",items:{type:"string"}}
},required:["program","notes","assumptions","checks"]};
function fail(res,status,error,details=""){return res.status(status).json({success:false,error,details});}
function prompt(p){
 const plan=p.plan||{};
 const languageNames={en:'English',sk:'Slovak',cs:'Czech',de:'German',pl:'Polish',hu:'Hungarian'};
 const outputLanguage=languageNames[String(p.language||'en')]||'English';
 return `Si senior CNC programátor a technológ. Vytvor TESTOVACÍ CNC PROGRAM z presného technologického plánu nižšie.
JAZYK SPRIEVODNÉHO TEXTU A KOMENTÁROV: ${outputLanguage}. CNC príkazy, adresy, jednotky a katalógové označenia neprekladaj.
RIADENIE: ${p.control||plan.control||"FANUC/ISO"}
NULOVÝ BOD: ${p.zero||"G54"}
STROJ: ${p.machine||plan.machine||"NEUVEDENÝ"}
PROCES: ${plan.operation||"NEUVEDENÝ"}
SPRACOVANÁ CAD GEOMETRIA: ${JSON.stringify(plan.cadGeometry||null,null,2)}
PLÁN:
${JSON.stringify(plan,null,2)}

PRAVIDLÁ:
- Program musí vychádzať z konkrétnych rozmerov a operácií v pláne, nie z univerzálnej šablóny.
- Zachovaj poradie operácií a konkrétne nástroje.
- Použi iba súradnice, ktoré sú v pláne jednoznačne odvodené z výkresu.
- Pri sústružení musí geometria dráhy vychádzať z bodov profile[z, diameter] v SPRACOVANEJ CAD GEOMETRII. Súradnicu X odvoď ako priemer podľa zvoleného programovania stroja a Z podľa axiálnej polohy profilu. Nevytváraj kontúru mimo dodaného profilu.
- Ak chýba bezpečný údaj, vlož komentár (DOPLNIT: ...) a nepoužívaj vymyslenú hodnotu.
- Pri sústružení rešpektuj polotovar, viacnásobné hrubovacie zábery, G54, nástrojové korekcie a bezpečné odjazdy.
- Pri frézovaní rešpektuj nulový bod, jednotlivé upnutia, roviny G17/G18/G19 podľa procesu, nástrojové korekcie, bezpečné výšky a pracovný priestor z bounds modelu. surfaceSamples používaj iba ako kontrolu geometrie, nie ako náhradu CAM výpočtu.
- Program označ ako TESTOVACÍ. Pred spustením musí byť simulovaný a skontrolovaný na konkrétnom stroji.
- Ak presný kód nástroja nebol overený, zachovaj jeho označenie z plánu a nevymýšľaj nové.
Vráť iba JSON podľa schémy.`;
}
async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return fail(res,405,"Použi POST požiadavku.");}
 if(!process.env.OPENAI_API_KEY)return fail(res,500,"OPENAI_API_KEY nie je nastavený vo Verceli.");
 try{
  const p=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});p.language=String(req.headers['x-cnc-language']||p.language||'en');
  if(!p.plan)return fail(res,400,"Chýba technologický plán.");
  if(!p.plan.cadModel||p.plan.cadModel.is3D!==true)return fail(res,400,"Na vytvorenie CNC programu je povinný 3D model STEP, IGES, STL, Parasolid, OBJ alebo 3MF.");
  const expectedMode=String(p.plan.operation||"").toLowerCase().includes("fréz")?"milling-mesh":"turning-envelope";
  if(!p.plan.cadGeometry||p.plan.cadGeometry.processed!==true||p.plan.cadGeometry.mode!==expectedMode)return fail(res,400,expectedMode==="milling-mesh"?"3D model nebol geometricky spracovaný pre frézovanie.":"3D model nebol geometricky spracovaný na sústružnícky profil.");
  const r=await fetch(`${OPENAI_URL}/responses`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
   body:JSON.stringify({model:MODEL,input:prompt(p),text:{format:{type:"json_schema",name:"cnc_program",strict:true,schema:SCHEMA}}})});
  const t=await r.text();if(!r.ok)return fail(res,502,"OpenAI generovanie programu zlyhalo.",t);
  const d=JSON.parse(t);const out=d.output_text||((d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("\n"));
  if(!out)return fail(res,502,"OpenAI nevrátilo CNC program.",t.slice(0,4000));
  let result;try{result=JSON.parse(out)}catch(e){return fail(res,502,"Neplatný formát CNC programu.",out.slice(0,4000));}
  return res.status(200).json({success:true,...result});
 }catch(e){return fail(res,500,"Chyba servera pri generovaní CNC programu.",e?.message||String(e));}
}

module.exports = handler;
