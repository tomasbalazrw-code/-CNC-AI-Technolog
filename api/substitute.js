/* CNC AI Technológ – vyhľadanie kompatibilnej náhrady nástroja alebo plátku */
const OPENAI_URL="https://api.openai.com/v1";
const MODEL="gpt-5.6-luna";

const SCHEMA={
 type:"object",additionalProperties:false,
 properties:{
  original_designation:{type:"string"},original_manufacturer:{type:"string"},original_type:{type:"string"},identification_confidence:{type:"string"},
  target_manufacturer:{type:"string"},
  alternatives:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   order_code:{type:"string"},description:{type:"string"},geometry_and_size:{type:"string"},grade:{type:"string"},match_level:{type:"string"},compatibility:{type:"string"},differences:{type:"string"},recommended_use:{type:"string"},verification_status:{type:"string"}
  },required:["order_code","description","geometry_and_size","grade","match_level","compatibility","differences","recommended_use","verification_status"]}},
  sources:{type:"array",items:{type:"string"}},warnings:{type:"array",items:{type:"string"}}
 },
 required:["original_designation","original_manufacturer","original_type","identification_confidence","target_manufacturer","alternatives","sources","warnings"]
};

function fail(res,status,error,details=""){return res.status(status).json({success:false,error,details});}
function key(){return String(process.env.OPENAI_API_KEY||process.env.OPENAI_KEY||"").trim().replace(/^["']|["']$/g,"");}
function outputText(d){if(typeof d.output_text==="string"&&d.output_text.trim())return d.output_text;return (d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("\n");}

function prompt(b){return `Si senior aplikačný technik pre obrábacie nástroje. Identifikuj pôvodný nástroj alebo vymeniteľnú reznú doštičku a nájdi kompatibilnú náhradu výhradne od požadovaného výrobcu.

VSTUP:
- Zadané označenie: ${b.code||"NEUVEDENÉ – PREČÍTAJ Z FOTOGRAFIE"}
- Požadovaný výrobca náhrady: ${b.targetManufacturer}
- Obrábaný materiál: ${b.material||"NEUVEDENÝ"}
- Použitie/operácia: ${b.operation||"NEUVEDENÁ"}

POVINNÝ POSTUP:
1. Z označenia a fotografie identifikuj výrobcu, typ nástroja, ISO tvar, uhol chrbta, toleranciu, veľkosť, hrúbku, rádius/šírku, lámač triesky a triedu. Nečitateľné údaje nehádaj.
2. Najprv over pôvodné označenie v dôveryhodnom alebo oficiálnom katalógu pôvodného výrobcu.
3. Potom prehľadaj oficiálnu stránku a katalógy výrobcu ${b.targetManufacturer}. Pri MASAM prever jeho oficiálnu stránku a dostupné katalógy.
4. Náhrada musí zhodovať rozmery a upnutie. Pri VBD over ISO tvar, veľkosť, hrúbku, otvor, geometriu a polomer/šírku. Pri monolitnom nástroji over priemer, stopku, reznú dĺžku, celkovú dĺžku, počet zubov a povlak. Pri telese/držiaku over rozhranie a kompatibilné plátky.
5. Triedu a lámač vyber podľa zadaného materiálu a operácie. Ak materiál alebo použitie chýbajú, môžeš určiť rozmerovú náhradu, ale triedu označ ako NEPOTVRDENÚ a vysvetli, čo treba doplniť.
6. order_code musí byť úplné objednávacie označenie. Samotné DNMG, CCMT, vrták D10 alebo P25 nie je objednávací kód.
7. match_level použi presne: PRIAMA NÁHRADA, ROZMEROVO ZHODNÁ – INÁ APLIKÁCIA, PRIBLIŽNÁ NÁHRADA alebo NENAŠLA SA.
8. PRIAMA NÁHRADA je povolená iba pri zhodnej funkcii, rozmeroch a kompatibilite s držiakom. Rozdielnu geometriu, rádius, šírku, povlak alebo triedu vždy uveď.
9. verification_status musí povedať OVERENÉ V KATALÓGU alebo NEOVERENÉ. Nevymýšľaj kódy ani zdroje.
10. Vráť najviac tri reálne možnosti zoradené od najlepšej. Ak presnú položku nenájdeš, alternatives nechaj prázdne a do warnings napíš, ktoré údaje chýbajú.
11. Do sources zapíš názov výrobcu, katalógu alebo oficiálnej stránky a čo bolo overené; nevymýšľaj URL.
12. Fotografia môže zobrazovať obal, laserové označenie alebo samotnú geometriu. Text na fotografii čítaj opatrne a identification_confidence uveď VYSOKÁ, STREDNÁ, NÍZKA alebo ŽIADNA.`;}

async function handler(req,res){
 try{
  if(req.method!=="POST"){res.setHeader("Allow","POST");return fail(res,405,"Použi POST požiadavku.");}
  const apiKey=key();if(!apiKey)return fail(res,500,"OPENAI_API_KEY nie je nastavený vo Verceli.");
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
  if(!String(b.code||"").trim()&&!String(b.photoData||"").trim())return fail(res,400,"Zadaj označenie alebo fotografiu nástroja.");
  if(!String(b.targetManufacturer||"").trim())return fail(res,400,"Vyber požadovaného dodávateľa náhrady.");
  const content=[];
  if(b.photoData){
   if(!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(b.photoData)))return fail(res,400,"Fotografia musí byť JPG, PNG alebo WEBP.");
   content.push({type:"input_image",image_url:String(b.photoData),detail:"high"});
  }
  content.push({type:"input_text",text:prompt(b)});
  const response=await fetch(`${OPENAI_URL}/responses`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model:MODEL,input:[{role:"user",content}],tools:[{type:"web_search"}],text:{format:{type:"json_schema",name:"tool_substitution",strict:true,schema:SCHEMA}}})});
  const raw=await response.text();if(!response.ok)return fail(res,502,"AI vyhľadanie náhrady zlyhalo.",raw.slice(0,3000));
  const out=outputText(JSON.parse(raw));if(!out)return fail(res,502,"AI nevrátila výsledok náhrady.");
  let data;try{data=JSON.parse(out)}catch(_){return fail(res,502,"AI vrátila neplatný formát výsledku.",out.slice(0,1500));}
  return res.status(200).json({success:true,...data});
 }catch(error){console.error(error);return fail(res,500,"Chyba servera pri hľadaní náhrady.",error?.message||String(error));}
}

module.exports=handler;
