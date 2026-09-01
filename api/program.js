/* CNC AI Technológ – generátor programu z detailného technologického plánu */
const OPENAI_URL="https://api.openai.com/v1";
const MODEL="gpt-5.6-luna";
const SCHEMA={type:"object",additionalProperties:false,properties:{
 program:{type:"string"},notes:{type:"string"},assumptions:{type:"array",items:{type:"string"}},checks:{type:"array",items:{type:"string"}}
},required:["program","notes","assumptions","checks"]};
function fail(res,status,error,details=""){return res.status(status).json({success:false,error,details});}
function prompt(p){
 const plan=p.plan||{};
 return `Si senior CNC programátor a technológ. Vytvor TESTOVACÍ CNC PROGRAM z presného technologického plánu nižšie.
RIADENIE: ${p.control||plan.control||"FANUC/ISO"}
NULOVÝ BOD: ${p.zero||"G54"}
STROJ: ${p.machine||plan.machine||"NEUVEDENÝ"}
PROCES: ${plan.operation||"NEUVEDENÝ"}
PLÁN:
${JSON.stringify(plan,null,2)}

PRAVIDLÁ:
- Program musí vychádzať z konkrétnych rozmerov a operácií v pláne, nie z univerzálnej šablóny.
- Zachovaj poradie operácií a konkrétne nástroje.
- Použi iba súradnice, ktoré sú v pláne jednoznačne odvodené z výkresu.
- Ak chýba bezpečný údaj, vlož komentár (DOPLNIT: ...) a nepoužívaj vymyslenú hodnotu.
- Pri sústružení rešpektuj polotovar, viacnásobné hrubovacie zábery, G54, nástrojové korekcie a bezpečné odjazdy.
- Pri frézovaní rešpektuj nulový bod, roviny G17/G18/G19 podľa procesu, nástrojové korekcie a bezpečné výšky.
- Program označ ako TESTOVACÍ. Pred spustením musí byť simulovaný a skontrolovaný na konkrétnom stroji.
- Ak presný kód nástroja nebol overený, zachovaj jeho označenie z plánu a nevymýšľaj nové.
Vráť iba JSON podľa schémy.`;
}
export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return fail(res,405,"Použi POST požiadavku.");}
 if(!process.env.OPENAI_API_KEY)return fail(res,500,"OPENAI_API_KEY nie je nastavený vo Verceli.");
 try{
  const p=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
  if(!p.plan)return fail(res,400,"Chýba technologický plán.");
  const r=await fetch(`${OPENAI_URL}/responses`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
   body:JSON.stringify({model:MODEL,input:prompt(p),text:{format:{type:"json_schema",name:"cnc_program",strict:true,schema:SCHEMA}}})});
  const t=await r.text();if(!r.ok)return fail(res,502,"OpenAI generovanie programu zlyhalo.",t);
  const d=JSON.parse(t);const out=d.output_text||((d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("\n"));
  if(!out)return fail(res,502,"OpenAI nevrátilo CNC program.",t.slice(0,4000));
  let result;try{result=JSON.parse(out)}catch(e){return fail(res,502,"Neplatný formát CNC programu.",out.slice(0,4000));}
  return res.status(200).json({success:true,...result});
 }catch(e){return fail(res,500,"Chyba servera pri generovaní CNC programu.",e?.message||String(e));}
}
