/* CNC AI Technológ – detailná analýza výkresu + overovanie nástrojov */
const OPENAI_URL="https://api.openai.com/v1";
const MODEL="gpt-5.6-luna";

function key(){return String(process.env.OPENAI_API_KEY||process.env.OPENAI_KEY||"").trim().replace(/^["']|["']$/g,"");}
function fail(res,status,error,details=""){return res.status(status).json({success:false,error,details});}

const SCHEMA={
 type:"object",additionalProperties:false,
 properties:{
  drawing_read:{type:"string"},
  drawing_features:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   feature:{type:"string"},feature_scope:{type:"string"},value:{type:"string"},tolerance:{type:"string"},surface_finish:{type:"string"},location:{type:"string"},source:{type:"string"}
  },required:["feature","feature_scope","value","tolerance","surface_finish","location","source"]}},
  setup:{type:"object",additionalProperties:false,properties:{
   clamping:{type:"string"},datum:{type:"string"},supports:{type:"string"},risks:{type:"string"}
  },required:["clamping","datum","supports","risks"]},
  operations:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   order:{type:"integer"},name:{type:"string"},machining_scope:{type:"string"},description:{type:"string"},setup:{type:"string"},features:{type:"string"},tool_id:{type:"string"},parameters:{type:"string"}
  },required:["order","name","machining_scope","description","setup","features","tool_id","parameters"]}},
  tools:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   tool_id:{type:"string"},tool_type:{type:"string"},quantity:{type:"integer"},operation:{type:"string"},manufacturer:{type:"string"},holder_or_body:{type:"string"},holder_or_body_code:{type:"string"},
   insert_or_tool:{type:"string"},insert_or_tool_code:{type:"string"},grade:{type:"string"},geometry:{type:"string"},
   compatibility:{type:"string"},reason:{type:"string"},supplier_search_path:{type:"string"},verification_status:{type:"string"}
  },required:["tool_id","tool_type","quantity","operation","manufacturer","holder_or_body","holder_or_body_code","insert_or_tool","insert_or_tool_code","grade","geometry","compatibility","reason","supplier_search_path","verification_status"]}},
  parameters:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   operation:{type:"string"},vc:{type:"string"},rpm:{type:"string"},feed:{type:"string"},fz:{type:"string"},ap:{type:"string"},ae:{type:"string"},coolant:{type:"string"},note:{type:"string"}
  },required:["operation","vc","rpm","feed","fz","ap","ae","coolant","note"]}},
  material:{type:"string"},stock:{type:"string"},
  critical_dimensions:{type:"array",items:{type:"string"}},
  missing_information:{type:"array",items:{type:"string"}},
  tool_sources:{type:"array",items:{type:"string"}},
  warnings:{type:"array",items:{type:"string"}},
  notes:{type:"array",items:{type:"string"}}
 },
 required:["drawing_read","drawing_features","setup","operations","tools","parameters","material","stock","critical_dimensions","missing_information","tool_sources","warnings","notes"]
};

function parseDataUrl(v,name){
 const x=String(v||""); const m=x.match(/^data:([^;,]+)(?:;[^,]*)?,([\s\S]*)$/);
 if(m)return {mime:m[1].toLowerCase(),base64:decodeURIComponent(m[2])};
 const n=String(name||"drawing.pdf").toLowerCase();
 return {mime:n.endsWith(".pdf")?"application/pdf":n.endsWith(".png")?"image/png":n.endsWith(".webp")?"image/webp":"image/jpeg",base64:x};
}
async function upload(base64,name,mime,apiKey){
 const bytes=Buffer.from(String(base64).replace(/\s/g,""),"base64");
 if(!bytes.length)throw new Error("Výkres je prázdny alebo poškodený.");
 const fd=new FormData(); fd.append("file",new Blob([bytes],{type:mime}),name||"drawing.pdf"); fd.append("purpose","user_data");
 const r=await fetch(`${OPENAI_URL}/files`,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`},body:fd});
 const t=await r.text(); if(!r.ok)throw new Error(`OpenAI upload ${r.status}: ${t}`); return JSON.parse(t);
}
function outputText(d){
 if(typeof d.output_text==="string"&&d.output_text.trim())return d.output_text;
 let a=[]; for(const i of d.output||[])for(const c of i.content||[])if(typeof c.text==="string")a.push(c.text);
 return a.join("\n");
}
function cadSummary(g){
 if(!g||g.processed!==true)return "CAD GEOMETRIA NEBOLA SPRACOVANÁ";
 const profile=Array.isArray(g.profile)?g.profile.slice(0,120):[];
 return JSON.stringify({mode:g.mode,axis:g.axis,unit:g.unit||"mm",bounds:g.bounds,length:g.length,maxDiameter:g.maxDiameter,profile});
}
function prompt(b,name){
 const turn=String(b.type||b.operation||"").toLowerCase().includes("sústru");
 return `Si SENIOR CNC technológ a zároveň odborník na obrábacie nástroje.
Pracuj s priloženým technickým výkresom ${name}.

VSTUP:
- Proces: ${b.type||b.operation||"Sústruženie"}
- Materiál: ${b.material||"NEUVEDENÝ"}
- Polotovar: ${b.stock||"NEUVEDENÝ"}
- Stroj: ${b.machine||"NEUVEDENÝ"}
- Výrobca stroja: ${b.machineManufacturer||"NEUVEDENÝ"}
- Model: ${b.machineModel||"NEUVEDENÝ"}
- CNC: ${b.control||"NEUVEDENÉ"}
- Upnutie/revolver: ${b.turretInterface||b.millingToolInterface||"NEUVEDENÉ"}
- Spôsob upnutia/orientácia nástroja: ${b.toolClampingMethod||b.holderOrientation||"NEUVEDENÉ"}
- Držiak/teleso: ${b.holderType||"AI MÁ VYBRAŤ"}
- Preferovaný výrobca nástrojov: ${b.preferredToolManufacturer||"BEZ PREFERENCIE"}
- Náhradní výrobcovia: ${Array.isArray(b.alternativeToolManufacturers)&&b.alternativeToolManufacturers.length?b.alternativeToolManufacturers.join(", "):"NEUVEDENÍ"}
- Spracovaná geometria CAD modelu: ${cadSummary(b.cadGeometry)}
- Ďalšie požiadavky: ${b.requirements||"žiadne"}

ZÁSADNÉ PRAVIDLÁ:
1. Najprv výkres dôkladne prečítaj. Vytvor si samostatnú mapu všetkých relevantných rozmerov a výrobných prvkov, nie iba celkového rozmeru.
2. Každý prvok povinne klasifikuj vo feature_scope presne ako VONKAJŠÍ, VNÚTORNÝ, ČELNÝ/OSOVÝ alebo NEJASNÝ. Vonkajší priemer nesmieš zameniť za vnútorný otvor. Rozmer priraď k prvku iba podľa kótovacích čiar, šípok, rezu a osi; nie iba podľa jeho polohy na obrázku.
3. Technologický postup musí byť konkrétny a naviazaný na prvky výkresu. Žiadne všeobecné frázy typu "vykonať obrábanie".
4. Každá operácia musí mať konkrétny účel, prvky výkresu, spôsob upnutia, nástroj a parametre.
5. Pri veľkom úbere z polotovaru rozdeľ hrubovanie na viac záberov a zohľadni tuhosť, výkon a geometriu.
6. ${turn?"Pre sústruženie rozlišuj čelné sústruženie, OD/ID hrubovanie, dokončovanie, zápichy, závity, vŕtanie a ďalšie operácie iba podľa výkresu. Pri rúre rešpektuj skutočný vnútorný priemer polotovaru.":"Pre frézovanie rozlišuj čelné frézovanie, kapsy, obrysy, drážky, otvory, závity, 3D plochy a ďalšie operácie iba podľa výkresu."}
7. Nástroje musia byť konkrétne. Použi reálne katalógové označenie iba vtedy, keď ho vieš spoľahlivo overiť. Text "OVERIŤ V KATALÓGU" smieš použiť až po vykonaní celého postupu preverovania výrobcov podľa pravidiel 22 až 25.
8. Pre každý nástroj uveď výrobcu, držiak/teleso, katalógový kód držiaka/telesa, plátok/VHM, katalógový kód plátku/nástroja, triedu a geometriu.
9. Over kompatibilitu: držiak ↔ plátok, rozhranie ↔ stroj/revolver, pri frézovaní upnutie ↔ vreteno.
10. Ak máš web_search, použi ho na kontrolu katalógového označenia v oficiálnych alebo dôveryhodných katalógoch výrobcu. Do tool_sources uveď, čo bolo overené. Nikdy nevymýšľaj URL ani kód.
11. Rezné podmienky musia byť naviazané na materiál a operáciu. Ak niečo chýba, označ to ako štartovacie/orientačné.
12. CNC program teraz NEVYTVÁRAJ. Najprv vytvor presný technologický plán.
13. Výstup musí byť použiteľný ako vstup pre samostatný generátor CNC programu.
14. Ak je údaj z výkresu nečitateľný, uveď "NIE JE ČITATEĽNÉ" namiesto dohadu.
15. Ak je zadaný preferovaný výrobca nástrojov, najprv hľadaj vhodné a overiteľné riešenie od neho. Ak ho nemá alebo katalógový kód nevieš overiť, použi náhradných výrobcov v zadanom poradí. Preferencia nesmie zhoršiť bezpečnosť, kompatibilitu ani technologickú vhodnosť. Každú odchýlku od preferencie stručne vysvetli.
16. Každý navrhnutý držiak musí byť kompatibilný so zadaným rozhraním a rozmerom upínania. Pri frézovaní rešpektuj rozhranie vretena aj zvolený spôsob upnutia nástroja. Pri sústružení rešpektuj kvadrát, priemer tyče, Capto, VDI alebo BMT. Potrebný adaptér alebo redukciu uveď ako samostatnú položku.
17. Vytvor ÚPLNÝ zoznam nástrojov pre všetky skutočne potrebné operácie výkresu: podľa potreby čelný a pozdĺžny nôž, hrubovací a dokončovací nôž, vnútorný nôž, zapichovací nôž a plátok, závitový nôž a plátok, strediaci vrták, vrták, výstružník, závitník, čelná fréza, stopková fréza, zrážač hrán a ďalšie. Nevynechaj nástroj len preto, že operácia pôsobí samozrejmo.
18. Každý nástroj musí mať jedinečné tool_id (napríklad T01, T02). Pole tool_id v každej operácii musí presne odkazovať na tool_id nástroja v zozname tools. Ak jedna operácia potrebuje dva nástroje, rozdeľ ju na dve konkrétne operácie.
19. tool_type pomenuj jednoznačne, napríklad "Sústružnícky nôž – vonkajšie hrubovanie", "VBD vrták", "VHM špirálový vrták" alebo "Stopková fréza". quantity je počet rovnakých kusov potrebných v zostave.
20. Pri monolitnom vrtáku alebo fréze uveď do insert_or_tool celý nástroj a do holder_or_body vhodné upínacie puzdro alebo držiak. Ak nástroj nepoužíva VBD, v geometrii jasne napíš "MONOLITNÝ – BEZ VBD". Pri nástroji s VBD musí byť samostatne uvedené teleso/držiak aj kompatibilný plátok.
21. Preferovaného výrobcu použi pre každú kategóriu, ktorú reálne ponúka. Ak musíš použiť náhradného výrobcu, uveď dôvod pri konkrétnom nástroji. Názov výrobcu bez konkrétneho typu nástroja, držiaka a plátku nie je dostatočný výstup.
22. PRE KAŽDÝ jednotlivý nástroj postupuj v pevnom poradí: (1) preferovaný výrobca, (2) prvý náhradný výrobca, (3) druhý náhradný výrobca. Ďalšieho výrobcu začni preverovať iba vtedy, keď predchádzajúci nemá vhodný nástroj alebo jeho kompatibilný katalógový kód nemožno nájsť.
23. Pri výrobcovi MASAM povinne prever jeho oficiálnu webovú stránku a dostupné katalógy na tejto stránke. Rovnakým spôsobom uprednostni oficiálne webové katalógy každého ďalšieho vybraného výrobcu.
24. Do supplier_search_path pri každom nástroji zapíš skutočný priebeh, napríklad "MASAM: nenájdené → Walter: overené". Do tool_sources zapíš názov výrobcu, katalóg alebo oficiálnu stránku a čo sa v nich podarilo overiť. Nevymýšľaj, že si zdroj preveril, ak sa tak nestalo.
25. "OVERIŤ V KATALÓGU" použi až vtedy, keď vhodný a overiteľný výsledok nebol nájdený u ŽIADNEHO z vybraných výrobcov. Ak vybraní výrobcovia danú kategóriu nemajú, môžeš navrhnúť známeho ďalšieho výrobcu, ale jasne ho označ ako riešenie mimo preferovaného zoznamu.
26. Pred vytvorením operácií vykonaj kontrolu konzistencie rozmerov: porovnaj vonkajšie priemery s vonkajšou obálkou CAD, vnútorné rozmery s dierami/rezmi a polotovarom. CAD obálka potvrdzuje vonkajší profil, nie automaticky vnútorné diery. Pri konflikte nevytváraj operáciu z dohadu; zapíš rozpor do missing_information a warnings.
27. machining_scope každej operácie musí byť presne VONKAJŠIE, VNÚTORNÉ, ČELNÉ/OSOVÉ alebo NEJASNÉ a musí súhlasiť s feature_scope obrábaného prvku.`;
}
export default async function handler(req,res){
 try{
  if(req.method!=="POST"){res.setHeader("Allow","POST");return fail(res,405,"Použi POST požiadavku.");}
  const apiKey=key(); if(!apiKey)return fail(res,500,"OPENAI_API_KEY nie je nastavený vo Verceli.");
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
  const name=b.fileName||"drawing.pdf"; const fd=b.fileData||b.data; if(!fd)return fail(res,400,"Výkres nebol odoslaný.");
  const {mime,base64}=parseDataUrl(fd,name);
  let inputFile;
  if(mime==="application/pdf"||/\.pdf$/i.test(name)){const up=await upload(base64,name,"application/pdf",apiKey);inputFile={type:"input_file",file_id:up.id};}
  else if(/^image\/(png|jpeg|jpg|webp)$/.test(mime)){const mm=mime==="image/jpg"?"image/jpeg":mime;inputFile={type:"input_image",image_url:`data:${mm};base64,${base64}`,detail:"high"};}
  else return fail(res,400,"Podporované sú PDF, PNG, JPG/JPEG a WEBP.");
  const r=await fetch(`${OPENAI_URL}/responses`,{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
   body:JSON.stringify({
    model:MODEL,
    tools:[{type:"web_search"}],
    input:[{role:"user",content:[inputFile,{type:"input_text",text:prompt(b,name)}]}],
    text:{format:{type:"json_schema",name:"cnc_detailed_plan",strict:true,schema:SCHEMA}}
   })
  });
  const txt=await r.text(); if(!r.ok)return fail(res,502,"OpenAI analýza zlyhala.",txt);
  const d=JSON.parse(txt); const out=outputText(d); if(!out)return fail(res,502,"OpenAI nevrátilo výsledok analýzy.",txt.slice(0,4000));
  let plan; try{plan=JSON.parse(out)}catch(e){return fail(res,502,"OpenAI vrátilo neplatný formát analýzy.",out.slice(0,4000));}
  return res.status(200).json({success:true,analyzed:true,file:name,operation:b.type||b.operation||"Sústruženie",machine:b.machine||"",control:b.control||"",material:b.material||plan.material||"",stock:b.stock||plan.stock||"",toolPreferences:{preferred:b.preferredToolManufacturer||"",alternatives:Array.isArray(b.alternativeToolManufacturers)?b.alternativeToolManufacturers:[]},...plan});
 }catch(e){console.error(e);return fail(res,500,"Chyba servera pri AI analýze.",e?.message||String(e));}
}
