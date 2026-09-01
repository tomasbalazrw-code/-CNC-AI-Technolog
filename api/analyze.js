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
   feature:{type:"string"},value:{type:"string"},tolerance:{type:"string"},surface_finish:{type:"string"},location:{type:"string"},source:{type:"string"}
  },required:["feature","value","tolerance","surface_finish","location","source"]}},
  setup:{type:"object",additionalProperties:false,properties:{
   clamping:{type:"string"},datum:{type:"string"},supports:{type:"string"},risks:{type:"string"}
  },required:["clamping","datum","supports","risks"]},
  operations:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   order:{type:"integer"},name:{type:"string"},description:{type:"string"},setup:{type:"string"},features:{type:"string"},tool_id:{type:"string"},parameters:{type:"string"}
  },required:["order","name","description","setup","features","tool_id","parameters"]}},
  tools:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   operation:{type:"string"},manufacturer:{type:"string"},holder_or_body:{type:"string"},holder_or_body_code:{type:"string"},
   insert_or_tool:{type:"string"},insert_or_tool_code:{type:"string"},grade:{type:"string"},geometry:{type:"string"},
   compatibility:{type:"string"},reason:{type:"string"},verification_status:{type:"string"},product_family:{type:"string"},source_url:{type:"string"}
  },required:["operation","manufacturer","holder_or_body","holder_or_body_code","insert_or_tool","insert_or_tool_code","grade","geometry","compatibility","reason","verification_status","product_family","source_url"]}},
  parameters:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   operation:{type:"string"},vc:{type:"string"},rpm:{type:"string"},feed:{type:"string"},fz:{type:"string"},ap:{type:"string"},ae:{type:"string"},coolant:{type:"string"},note:{type:"string"}
  },required:["operation","vc","rpm","feed","fz","ap","ae","coolant","note"]}},
  material:{type:"string"},stock:{type:"string"},
  critical_dimensions:{type:"array",items:{type:"string"}},
  drawing_checks:{type:"array",items:{type:"object",additionalProperties:false,properties:{item:{type:"string"},value:{type:"string"},confidence:{type:"string"},reason:{type:"string"}},required:["item","value","confidence","reason"]}},
  missing_information:{type:"array",items:{type:"string"}},
  tool_sources:{type:"array",items:{type:"string"}},
  warnings:{type:"array",items:{type:"string"}},
  notes:{type:"array",items:{type:"string"}}
 },
 required:["drawing_read","drawing_features","setup","operations","tools","parameters","material","stock","critical_dimensions","drawing_checks","missing_information","tool_sources","warnings","notes"]
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
- Držiak/teleso: ${b.holderType||"AI MÁ VYBRAŤ"}
- Ďalšie požiadavky: ${b.requirements||"žiadne"}

OVERENÁ DATABÁZA KONKRÉTNYCH NÁSTROJOV:
${toolDbText()}

ZÁSADNÉ PRAVIDLÁ:
A. VÝKRES JE ZDROJ PRAVDY. Najprv urob samostatné čítanie výkresu, až potom technológiu.
B. Systematicky skontroluj všetky pohľady a rezy: celkové rozmery, Ø, dĺžky, hrúbky, rádiusy, skosenia, zápichy, závity, otvory, kužele, tolerancie, drsnosť, datumy a poznámky.
C. Každý použitý rozmer musí byť buď PRIAMO ČITATEĽNÝ alebo jednoznačne ODVODENÝ Z GEOMETRIE. Nikdy si nevymýšľaj rozmery.
D. Ak je údaj nečitateľný, napíš NIE JE ČITATEĽNÉ / POTREBNÉ OVERIŤ a nevytváraj z neho operáciu.
E. drawing_checks musí obsahovať najdôležitejšie rozmery, prvky a mieru istoty.
F. Každá operácia musí uviesť konkrétny prvok výkresu, ktorý obrába, a konkrétny spôsob obrábania. Žiadne všeobecné frázy.
G. Pri veľkom úbere rozdeľ hrubovanie na viac záberov a uveď ponechaný prídavok.
H. Pri každej operácii vyber konkrétny nástroj: výrobca, držiak/teleso, presný kód, plátok/VHM, presný kód, grade a geometria. Ak kód nevieš spoľahlivo potvrdiť, napíš OVERIŤ V KATALÓGU, nikdy nehádaj.
I. Kompatibilitu kontroluj držiak↔plátok, upnutie↔revolver/stroj a pri frézovaní nástroj↔vreteno.
J. Textové zadanie, polotovar a stroj sú iba doplnkový kontext; nesmú nahradiť rozmery z výkresu.

1. Najprv výkres dôkladne prečítaj. Vypíš všetky relevantné rozmery a výrobné prvky, nie iba celkový rozmer.
2. Pri každom rozmere uveď, či je priamo čitateľný z výkresu. Nikdy nevymýšľaj hodnotu.
3. Technologický postup musí byť konkrétny a naviazaný na prvky výkresu. Žiadne všeobecné frázy typu "vykonať obrábanie".
4. Každá operácia musí mať konkrétny účel, prvky výkresu, spôsob upnutia, nástroj a parametre.
5. Pri veľkom úbere z polotovaru rozdeľ hrubovanie na viac záberov a zohľadni tuhosť, výkon a geometriu.
6. ${turn?"Pre sústruženie rozlišuj čelné sústruženie, OD/ID hrubovanie, dokončovanie, zápichy, závity, vŕtanie a ďalšie operácie iba podľa výkresu. Pri rúre rešpektuj skutočný vnútorný priemer polotovaru.":"Pre frézovanie rozlišuj čelné frézovanie, kapsy, obrysy, drážky, otvory, závity, 3D plochy a ďalšie operácie iba podľa výkresu."}
7. Nástroje musia byť konkrétne. Použi reálne katalógové označenie iba vtedy, keď ho vieš spoľahlivo overiť. Ak nie, napíš presne "OVERIŤ V KATALÓGU" a nehádej.
8. Pre každý nástroj uveď výrobcu, držiak/teleso, katalógový kód držiaka/telesa, plátok/VHM, katalógový kód plátku/nástroja, triedu a geometriu.
9. Over kompatibilitu: držiak ↔ plátok, rozhranie ↔ stroj/revolver, pri frézovaní upnutie ↔ vreteno.
10. Pri každej konkrétnej položke z databázy skontroluj, že výrobca, kód, rozmer a použitie sedia. Ak treba, použi web_search na oficiálnom katalógu výrobcu. Do source_url vráť skutočný zdroj. Ak položku nemožno overiť, nepouži ju ako presný nástroj.
10a. Prednostne vyber z OVERENEJ DATABÁZY. Ak sa nehodí, vykonaj web_search a nájdi konkrétny produkt u výrobcu. Výstup musí obsahovať presný katalógový kód, nie iba rodinu typu CNMG/DNMG/VHM.
10b. Nikdy nevytváraj katalógový kód kombináciou náhodných častí. Ak výrobca uvádza len produktovú rodinu bez konkrétnej veľkosti, označ to ako OVERIŤ V KATALÓGU.
10c. Pri nástroji musí byť jasné, či ide o držiak/teleso alebo o reznú časť; pri vymeniteľnej doštičke uveď aj konkrétny grade/chipbreaker, ak je dostupný.
11. Rezné podmienky musia byť naviazané na materiál a operáciu. Ak niečo chýba, označ to ako štartovacie/orientačné.
12. CNC program teraz NEVYTVÁRAJ. Najprv vytvor presný technologický plán.
13. Výstup musí byť použiteľný ako vstup pre samostatný generátor CNC programu.
14. Ak je údaj z výkresu nečitateľný, uveď "NIE JE ČITATEĽNÉ" namiesto dohadu.`;
}

const VERIFIED_TOOL_DB = [
 {manufacturer:"Sandvik Coromant",product_family:"T-Max P",holder_or_body:"PCLNR/L 2525M 12",holder_or_body_code:"PCLNR 2525M 12",insert_or_tool:"CNMG 12 04 08-PM",insert_or_tool_code:"CNMG 12 04 08-PM",grade:"GC4405",geometry:"CNMG 80° negative, PM chipbreaker",application:"ISO P steel; roughing/semi-finishing",source_url:"https://epublications.sandvik.coromant.com/frontend/catalogs/1098482/1/pdf/complete.pdf"},
 {manufacturer:"Kennametal",product_family:"Kenlever / Kenloc",holder_or_body:"PCLN 95° external holder",holder_or_body_code:"PCLNR2525M12 (Material 1108097)",insert_or_tool:"CNMG 120408P",insert_or_tool_code:"CNMG120408P (KC730)",grade:"KC730",geometry:"CNMG 80° negative, P chipbreaker",application:"Turning, facing, profiling; steel",source_url:"https://www.kennametal.com/us/en/products/p.pcln-95.1108097.html"},
 {manufacturer:"Sandvik Coromant",product_family:"CoroMill 390",holder_or_body:"CoroMill 390 cylindrical shank cutter",holder_or_body_code:"R390-012A12-07M",insert_or_tool:"CoroMill 390 insert",insert_or_tool_code:"R390-11 T3 08M-PM",grade:"GC1230",geometry:"90° shoulder milling, PM medium geometry",application:"ISO P steel; shoulder/slot/face milling",source_url:"https://epublications.sandvik.coromant.com/frontend/catalogs/1249041/1/pdf/complete.pdf"},
 {manufacturer:"Kennametal",product_family:"HARVI I TE",holder_or_body:"Solid carbide end mill, 4 flutes, Weldon",holder_or_body_code:"H1TE4CH1200R026HBM (Material 6675754)",insert_or_tool:"HARVI I TE solid carbide end mill Ø12",insert_or_tool_code:"H1TE4CH1200R026HBM",grade:"KCPM15",geometry:"4 flute, 38° helix, chamfered, Weldon",application:"Steel and stainless; roughing/finishing",source_url:"https://www.kennametal.com/us/en/products/p.harvi-i-te-chamfered-4-flutes-weldon-shank-metric.6675754.html"},
 {manufacturer:"Kennametal",product_family:"HARVI I TE",holder_or_body:"Solid carbide end mill, 4 flutes, plain shank",holder_or_body_code:"H1TE4SE1200N026HAM (Material 6769565)",insert_or_tool:"HARVI I TE solid carbide end mill Ø12",insert_or_tool_code:"H1TE4SE1200N026HAM",grade:"KCPM15",geometry:"4 flute, 38° helix, square end, necked",application:"Steel/stainless; slotting, shoulder, ramping",source_url:"https://www.kennametal.com/us/en/products/p.harvi-i-te-square-end-4-flutes-necked-plain-shank-metric.6769565.html"},
 {manufacturer:"Kennametal",product_family:"HARVI I TE",holder_or_body:"Solid carbide ball nose, 4 flutes",holder_or_body_code:"H1TE4BN1200N012HAM (Material 6768033)",insert_or_tool:"HARVI I TE ball nose Ø12",insert_or_tool_code:"H1TE4BN1200N012HAM",grade:"KCPM15",geometry:"4 flute ball nose, necked, plain shank",application:"3D profiling and complex surfaces",source_url:"https://www.kennametal.com/us/en/products/p.harvi-i-te-ball-nose-4-flutes-necked-plain-shank-metric.6768033.html"}
];

function toolDbText(){
 return VERIFIED_TOOL_DB.map((x,i)=>`${i+1}. ${x.manufacturer} | ${x.product_family} | holder ${x.holder_or_body_code} | tool/insert ${x.insert_or_tool_code} | grade ${x.grade} | geometry ${x.geometry} | application ${x.application} | source ${x.source_url}`).join("\n");
}
function decodePageImages(arr){return Array.isArray(arr)?arr.filter(x=>typeof x==='string'&&/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(x)).slice(0,8):[];}
export default async function handler(req,res){
 try{
  if(req.method!=="POST"){res.setHeader("Allow","POST");return fail(res,405,"Použi POST požiadavku.");}
  const apiKey=key(); if(!apiKey)return fail(res,500,"OPENAI_API_KEY nie je nastavený vo Verceli.");
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});
  const name=b.fileName||"drawing.pdf"; const fd=b.fileData||b.data; if(!fd)return fail(res,400,"Výkres nebol odoslaný.");
  const {mime,base64}=parseDataUrl(fd,name);
  let content=[];
  const pageImages=decodePageImages(b.pageImages);
  if(pageImages.length){
    pageImages.forEach((img,i)=>content.push({type:"input_image",image_url:img,detail:"high"}));
    content.push({type:"input_text",text:`PDF výkres bol v prehliadači vyrastrovaný na ${pageImages.length} strán. Skontroluj každú stránku samostatne a nespoliehaj sa iba na OCR.`});
  } else if(mime==="application/pdf"||/\.pdf$/i.test(name)){const up=await upload(base64,name,"application/pdf",apiKey);content.push({type:"input_file",file_id:up.id});}
  else if(/^image\/(png|jpeg|jpg|webp)$/.test(mime)){const mm=mime==="image/jpg"?"image/jpeg":mime;content.push({type:"input_image",image_url:`data:${mm};base64,${base64}`,detail:"high"});}
  else return fail(res,400,"Podporované sú PDF, PNG, JPG/JPEG a WEBP.");
  content.push({type:"input_text",text:prompt(b,name)});
  const r=await fetch(`${OPENAI_URL}/responses`,{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
   body:JSON.stringify({
    model:MODEL,
    tools:[{type:"web_search"}],
    input:[{role:"user",content}],
    text:{format:{type:"json_schema",name:"cnc_detailed_plan",strict:true,schema:SCHEMA}}
   })
  });
  const txt=await r.text(); if(!r.ok)return fail(res,502,"OpenAI analýza zlyhala.",txt);
  const d=JSON.parse(txt); const out=outputText(d); if(!out)return fail(res,502,"OpenAI nevrátilo výsledok analýzy.",txt.slice(0,4000));
  let plan; try{plan=JSON.parse(out)}catch(e){return fail(res,502,"OpenAI vrátilo neplatný formát analýzy.",out.slice(0,4000));}
  return res.status(200).json({success:true,analyzed:true,file:name,operation:b.type||b.operation||"Sústruženie",machine:b.machine||"",control:b.control||"",material:b.material||plan.material||"",stock:b.stock||plan.stock||"",...plan});
 }catch(e){console.error(e);return fail(res,500,"Chyba servera pri AI analýze.",e?.message||String(e));}
}
