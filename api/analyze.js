/* CNC AI Technológ – detailná analýza výkresu + overovanie nástrojov */
const OPENAI_URL="https://api.openai.com/v1";
const MODEL="gpt-5.6-luna";

function key(){return String(process.env.OPENAI_API_KEY||process.env.OPENAI_KEY||"").trim().replace(/^["']|["']$/g,"");}
function fail(res,status,error,details=""){return res.status(status).json({success:false,error,details});}

const INSPECTION_SCHEMA={
 type:"object",additionalProperties:false,
 properties:{
  drawing_read:{type:"string"},
  drawing_features:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   feature:{type:"string"},feature_scope:{type:"string"},value:{type:"string"},tolerance:{type:"string"},surface_finish:{type:"string"},location:{type:"string"},source:{type:"string"}
  },required:["feature","feature_scope","value","tolerance","surface_finish","location","source"]}},
  external_undercuts:{type:"array",items:{type:"string"}},
  internal_features:{type:"array",items:{type:"string"}},
  material_detected:{type:"string"},
  material_condition_detected:{type:"string"},
  material_source:{type:"string"},
  material_confidence:{type:"string"},
  uncertainties:{type:"array",items:{type:"string"}},
  consistency_check:{type:"string"}
 },
 required:["drawing_read","drawing_features","external_undercuts","internal_features","material_detected","material_condition_detected","material_source","material_confidence","uncertainties","consistency_check"]
};

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
async function structuredResponse(apiKey,inputFile,text,name,schema,withSearch=false){
 const body={model:MODEL,input:[{role:"user",content:[inputFile,{type:"input_text",text}]}],text:{format:{type:"json_schema",name,strict:true,schema}}};
 if(withSearch)body.tools=[{type:"web_search"}];
 const r=await fetch(`${OPENAI_URL}/responses`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify(body)});
 const raw=await r.text();
 if(!r.ok)throw new Error(`OpenAI ${name} ${r.status}: ${raw}`);
 const out=outputText(JSON.parse(raw));
 if(!out)throw new Error(`OpenAI nevrátilo výsledok fázy ${name}.`);
 try{return JSON.parse(out)}catch(_){throw new Error(`OpenAI vrátilo neplatný formát fázy ${name}: ${out.slice(0,1200)}`);}
}
function cadSummary(g){
 if(!g||g.processed!==true)return "CAD GEOMETRIA NEBOLA SPRACOVANÁ";
 const profile=Array.isArray(g.profile)?g.profile.slice(0,120):[];
 return JSON.stringify({mode:g.mode,axis:g.axis,unit:g.unit||"mm",bounds:g.bounds,length:g.length,maxDiameter:g.maxDiameter,profile});
}
function inspectionPrompt(b,name){
 return `Si technický kontrolór strojárskych výkresov. V tejto fáze NEVYTVÁRAJ technologický postup ani nástroje. Iba presne prečítaj výkres ${name}.
Proces: ${b.type||b.operation||"Sústruženie"}
Polotovar: ${b.stock||"NEUVEDENÝ"}
CAD vonkajšia obálka: ${cadSummary(b.cadGeometry)}

Povinné pravidlá:
1. Každý prvok klasifikuj ako VONKAJŠÍ, VNÚTORNÝ, ČELNÝ/OSOVÝ alebo NEJASNÝ podľa obrysu, rezu, osi, šípok a vynášacích čiar.
2. VONKAJŠÍ PODPICH alebo VONKAJŠÍ ZÁPICH zostáva VONKAJŠÍM prvkom aj vtedy, keď jeho dno tvorí menší priemer. Nie je to vnútorná diera ani vnútorné sústruženie.
3. VNÚTORNÝ prvok musí ležať v dutine alebo otvore a musí byť potvrdený rezom, vnútorným obrysom alebo kótovaním otvoru.
4. Nevytváraj spojenie medzi rozmerom a prvkom iba preto, že sú na obrázku blízko seba.
5. Vonkajšiu CAD obálku používaj iba na kontrolu vonkajšieho profilu; nepotvrdzuje vnútorné otvory.
6. Ak sa klasifikácia nedá spoľahlivo určiť, označ NEJASNÝ. Nikdy nehádaj.
7. Do external_undercuts samostatne vypíš všetky rozpoznané vonkajšie podpichy a zápichy, ich šírku, priemer dna, polohu a rádiusy, ak sú čitateľné.
8. Materiál hľadaj výhradne v titulnom poli, technických poznámkach, označení polotovaru alebo materiálovej norme na výkrese. Rozmer, číslo výkresu ani názov súčiastky nesmieš považovať za materiál.
9. material_detected musí obsahovať presné označenie, napríklad 42CrMo4, iba ak je na výkrese priamo čitateľné. material_source opíše, kde bolo označenie nájdené.
10. material_confidence použi presne VYSOKÁ, STREDNÁ, NÍZKA alebo ŽIADNA. VYSOKÁ je povolená iba pri priamo čitateľnom označení na výkrese.
11. Stav, tepelné spracovanie a tvrdosť zapíš do material_condition_detected iba vtedy, keď sú priamo uvedené. Inak nechaj prázdny reťazec.`;
}
function prompt(b,name,inspection){
 const turn=String(b.type||b.operation||"").toLowerCase().includes("sústru");
 return `Si SENIOR CNC technológ a zároveň odborník na obrábacie nástroje.
Pracuj s priloženým technickým výkresom ${name}.

VSTUP:
- Proces: ${b.type||b.operation||"Sústruženie"}
- Materiál: ${b.material||"NEUVEDENÝ"}
- Stav/tvrdosť materiálu: ${b.materialCondition||"NEUVEDENÁ – TRIEDU PLÁTKU OZNAČ AKO ŠTARTOVACÍ NÁVRH"}
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
- ZÁVÄZNÝ protokol samostatnej kontroly výkresu: ${JSON.stringify(inspection)}
- Ďalšie požiadavky: ${b.requirements||"žiadne"}

ZÁSADNÉ PRAVIDLÁ:
1. Geometriu a rozmery prevezmi zo ZÁVÄZNÉHO protokolu samostatnej kontroly. Nemeň VONKAJŠÍ prvok na VNÚTORNÝ. Ak protokol označil prvok NEJASNÝ, nevytváraj z neho operáciu bez upozornenia.
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
27. machining_scope každej operácie musí byť presne VONKAJŠIE, VNÚTORNÉ, ČELNÉ/OSOVÉ alebo NEJASNÉ a musí súhlasiť s feature_scope obrábaného prvku.
28. VONKAJŠÍ PODPICH/ZÁPICH obrábaj vonkajším zapichovacím alebo profilovým nástrojom. Menší priemer dna podpichu z neho nikdy nerobí vnútornú operáciu.
29. Pre 42CrMo4 najprv urč ISO skupinu materiálu, stav a tvrdosť. Potom vyber konkrétnu geometriu a triedu plátku vhodnú pre hrubovanie, dokončovanie alebo zapichovanie. Jedna univerzálna trieda pre všetky operácie nie je automaticky správna.
30. Katalógové označenie musí byť úplné a objednateľné: ISO rozmer plátku + geometria/lámač + konkrétna trieda výrobcu. Samotné označenie typu CNMG, DNMG alebo "P25" nestačí.
31. Pri každom plátku over, že presne pasuje do uvedeného držiaka a že jeho rezná geometria, polomer špičky, šírka zápichu a trieda zodpovedajú konkrétnej operácii. Ak presný údaj z výkresu alebo tvrdosť chýba, navrhni bezpečný štartovací variant a jasne uveď, čo musí technológ potvrdiť.`;
}
async function handler(req,res){
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
  const inspection=await structuredResponse(apiKey,inputFile,inspectionPrompt(b,name),"cnc_drawing_inspection",INSPECTION_SCHEMA,false);
  const manualMaterial=String(b.material||"").trim();
  const detectedMaterial=String(inspection.material_detected||"").trim();
  const confidence=String(inspection.material_confidence||"ŽIADNA").trim().toUpperCase();
  if(!manualMaterial&&(!detectedMaterial||confidence!=="VYSOKÁ")){
   return fail(res,409,"Materiál sa z výkresu nepodarilo spoľahlivo potvrdiť.",`AI našla: ${detectedMaterial||"nič"}; istota: ${confidence}. Vyber materiál zo zoznamu a spusti analýzu znova.`);
  }
  const effectiveMaterial=manualMaterial||detectedMaterial;
  const materialSource=manualMaterial?"Potvrdené technológom vo formulári":String(inspection.material_source||"Prečítané z výkresu");
  b.material=effectiveMaterial;
  if(!String(b.materialCondition||"").trim()&&String(inspection.material_condition_detected||"").trim())b.materialCondition=String(inspection.material_condition_detected).trim();
  const plan=await structuredResponse(apiKey,inputFile,prompt(b,name,inspection),"cnc_detailed_plan",SCHEMA,true);
  plan.drawing_read=inspection.drawing_read;
  plan.drawing_features=inspection.drawing_features;
  plan.material=effectiveMaterial;
  plan.missing_information=[...new Set([...(plan.missing_information||[]),...(inspection.uncertainties||[])])];
  return res.status(200).json({success:true,analyzed:true,file:name,operation:b.type||b.operation||"Sústruženie",machine:b.machine||"",control:b.control||"",material:effectiveMaterial,materialCondition:b.materialCondition||"",materialSource,materialConfidence:manualMaterial?"POTVRDENÉ TECHNOLÓGOM":confidence,stock:b.stock||plan.stock||"",toolPreferences:{preferred:b.preferredToolManufacturer||"",alternatives:Array.isArray(b.alternativeToolManufacturers)?b.alternativeToolManufacturers:[]},...plan});
 }catch(e){console.error(e);return fail(res,500,"Chyba servera pri AI analýze.",e?.message||String(e));}
}

module.exports = handler;
