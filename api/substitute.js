/* CNC AI Technológ – vyhľadanie kompatibilnej náhrady nástroja alebo plátku */
const OPENAI_URL="https://api.openai.com/v1";
const MODEL="gpt-5.6-luna";

const SCHEMA={
 type:"object",additionalProperties:false,
 properties:{
  original_designation:{type:"string"},original_manufacturer:{type:"string"},original_type:{type:"string"},identification_confidence:{type:"string"},
  target_manufacturer:{type:"string"},
  alternatives:{type:"array",items:{type:"object",additionalProperties:false,properties:{
   supplier:{type:"string"},manufacturer:{type:"string"},order_code:{type:"string"},application_role:{type:"string"},description:{type:"string"},geometry_and_size:{type:"string"},grade:{type:"string"},match_level:{type:"string"},compatibility:{type:"string"},differences:{type:"string"},recommended_use:{type:"string"},recommended_parameters:{type:"string"},parameter_comparison:{type:"string"},verification_status:{type:"string"},
   starting_parameters:{type:"object",additionalProperties:false,properties:{vc:{type:"string"},rpm:{type:"string"},feed_value:{type:"string"},feed_unit:{type:"string"},ap:{type:"string"},ae:{type:"string"},coolant:{type:"string"},strategy:{type:"string"},calculation_basis:{type:"string"}},required:["vc","rpm","feed_value","feed_unit","ap","ae","coolant","strategy","calculation_basis"]},
   companion_tool:{type:"object",additionalProperties:false,properties:{required:{type:"boolean"},type:{type:"string"},order_code:{type:"string"},diameter_or_size:{type:"string"},machine_interface:{type:"string"},insert_interface:{type:"string"},number_of_seats:{type:"string"},compatibility_verification:{type:"string"}},required:["required","type","order_code","diameter_or_size","machine_interface","insert_interface","number_of_seats","compatibility_verification"]}
  },required:["supplier","manufacturer","order_code","application_role","description","geometry_and_size","grade","match_level","compatibility","differences","recommended_use","recommended_parameters","parameter_comparison","verification_status","starting_parameters","companion_tool"]}},
  sources:{type:"array",items:{type:"string"}},warnings:{type:"array",items:{type:"string"}}
 },
 required:["original_designation","original_manufacturer","original_type","identification_confidence","target_manufacturer","alternatives","sources","warnings"]
};

function fail(res,status,error,details=""){return res.status(status).json({success:false,error,details});}
function key(){return String(process.env.OPENAI_API_KEY||process.env.OPENAI_KEY||"").trim().replace(/^["']|["']$/g,"");}
function outputText(d){if(typeof d.output_text==="string"&&d.output_text.trim())return d.output_text;return (d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("\n");}

function prompt(b){
 const languageNames={en:'English',sk:'Slovak',cs:'Czech',de:'German',pl:'Polish',hu:'Hungarian'};
 const outputLanguage=languageNames[String(b.language||'en')]||'English';
 const suppliers=Array.isArray(b.targetManufacturers)?b.targetManufacturers.map(x=>String(x).trim()).filter(Boolean):[String(b.targetManufacturer||"").trim()].filter(Boolean);
 const targetLabel=suppliers.join(", ");
 const isMasam=/\bMASAM\b/i.test(targetLabel);
 const isDistributor=/Hoffmann|TGS|GRUMANT/i.test(targetLabel);
 const isVhm=/^solid_carbide_/.test(String(b.toolType||""));
 const p=b.cuttingParameters&&typeof b.cuttingParameters==="object"?b.cuttingParameters:{};
 const masamRules=isMasam?`

POVINNÉ PRAVIDLÁ PRE MASAM:
- Hľadaj najprv výhradne na oficiálnej doméne masam.sk.
- Povinne otvor a prever aktuálnu stránku Produktové katalógy 2026: https://masam.sk/sluzby/produktove-katalogy-2026/
- Prever rozcestník produktov: https://masam.sk/produkty/
- Pre vymeniteľné plátky a ich telesá prever: https://masam.sk/produkty/rezne-nastroje-s-vymenitelnymi-platkami/
- Podľa aplikácie otvor príslušnú podsekciu MASAM: sústruženie, frézovanie alebo výroba otvorov. Použi https://masam.sk/produkty/rezne-nastroje-s-vymenitelnymi-platkami/sustruzenie/ , https://masam.sk/produkty/rezne-nastroje-s-vymenitelnymi-platkami/frezovanie/ a https://masam.sk/produkty/rezne-nastroje-s-vymenitelnymi-platkami/vyroba-otvorov/ podľa typu nástroja.
- Urob aj doménové vyhľadávanie presného označenia a jeho normalizovaných častí vo forme site:masam.sk.
- Za NENAŠLA SA môžeš označiť výsledok až po preverení stránky katalógov 2026, produktovej kategórie a doménového vyhľadávania.
- MASAM vyrába aj špeciálne nástroje. Ak katalóg neobsahuje štandardnú priamu náhradu, jasne rozlíš „nenájdená štandardná katalógová položka“ od možnosti zákazkovej výroby. Nevymýšľaj objednávací kód.
- Do sources uveď presnú oficiálnu stránku alebo katalóg MASAM, ktorý si skutočne preveril.
`:"";
 const distributorRules=isDistributor?`

POVINNÉ PRAVIDLÁ PRE DODÁVATEĽA:
- Niektorý zo zvolených dodávateľov (${targetLabel}) môže byť distribútor alebo obchodná skupina, nie výrobca nástroja. Prehľadaj jeho oficiálny web, online katalóg a zoznam zastupovaných značiek.
- Výsledok musí byť reálne dostupná katalógová položka zo sortimentu tohto dodávateľa. V order_code uveď kód výrobcu a v opise pomenuj skutočného výrobcu.
- Pri Hoffmann Group uprednostni vlastnú značku GARANT, ak má vhodnú overenú položku. Pri TGS a GRUMANT vyber vhodnú položku z nimi dodávaných značiek; dodávateľa nezamieňaj za výrobcu.
- Do sources uveď preverovaný oficiálny katalóg dodávateľa aj oficiálny katalóg skutočného výrobcu. Ak dostupnosť u dodávateľa nevieš overiť, výsledok označ NEOVERENÉ.
`:"";
 const vhmRules=isVhm?`

POVINNÉ PRAVIDLÁ PRE VHM MONOLITNÝ NÁSTROJ:
- Ide o monolitný tvrdokovový nástroj, nie o vymeniteľnú doštičku. Nenavrhuj teleso ani držiak; companion_tool.required=false a ostatné polia companion_tool vyplň NEVYŽADUJE SA.
- Funkčné rozmery over samostatne: priemer D, rezná dĺžka Lc, celková dĺžka L, priemer stopky Ds, počet britov a zadané detaily. Pri vrtáku over aj dĺžkový pomer, uhol hrotu a vnútorné chladenie; pri fréze rádius/fazetu a typ čela; pri výstružníku toleranciu; pri závitovom nástroji závit, stúpanie a vyhotovenie.
- Materiál, tvrdosť, operáciu, stabilitu a chladenie použi na výber geometrie, počtu britov, substrátu a povlaku. Nehľadaj iba kópiu obchodného názvu pôvodného nástroja.
- Vráť najviac tri overené alternatívy od najvhodnejšej. Ak chýbajú rozmery nevyhnutné na zameniteľnosť, môžeš ponúknuť vhodnú rodinu nástrojov, ale nesmieš ju označiť PRIAMA NÁHRADA a v warnings presne vypíš chýbajúce údaje.
`:"";
 return `Si senior aplikačný technik pre obrábacie nástroje. Identifikuj pôvodný nástroj alebo vymeniteľnú reznú doštičku a porovnaj kompatibilné náhrady od všetkých zvolených dodávateľov.

JAZYK VÝSTUPU: Všetky vysvetľujúce texty v JSON napíš v jazyku ${outputLanguage}. Katalógové kódy, názvy výrobcov, normy, jednotky a CNC označenia neprekladaj.

VSTUP:
- Zadané označenie: ${b.code||"NEUVEDENÉ – PREČÍTAJ Z FOTOGRAFIE"}
- Typ zvolený používateľom: ${b.toolType||"auto"}
- Požadovaný priemer frézovacieho/vŕtacieho telesa: ${b.bodyDiameter?`${b.bodyDiameter} mm`:"NEUVEDENÝ"}
- Požadovaný počet zubov/lôžok frézy: ${b.toothCount||"NEUVEDENÝ"}
- Požadovaný rozmer alebo upínanie držiaka: ${b.holderInterface||"NEUVEDENÉ"}
- Rezná dĺžka VHM Lc: ${b.cuttingLength?`${b.cuttingLength} mm`:"NEUVEDENÁ"}
- Celková dĺžka VHM L: ${b.overallLength?`${b.overallLength} mm`:"NEUVEDENÁ"}
- Priemer stopky VHM Ds: ${b.shankDiameter?`${b.shankDiameter} mm`:"NEUVEDENÝ"}
- Počet britov VHM: ${b.fluteCount||"NEUVEDENÝ"}
- Ďalšie požiadavky VHM: ${b.vhmDetails||"NEUVEDENÉ"}
- Zvolení dodávatelia náhrady: ${targetLabel}
- Obrábaný materiál: ${b.material||"NEUVEDENÝ"}
- Použitie/operácia: ${b.operation||"NEUVEDENÁ"}
- Štýl obrábania: ${b.machiningStyle||"NEUVEDENÝ"}
- Používaná rezná rýchlosť vc: ${p.vc?`${p.vc} m/min`:"NEUVEDENÁ"}
- Používané otáčky n: ${p.rpm?`${p.rpm} ot/min`:"NEUVEDENÉ"}
- Používaný posuv f: ${p.feed?`${p.feed} ${p.feedUnit||"mm/ot"}`:"NEUVEDENÝ"}
- Používaná hĺbka rezu ap: ${p.ap?`${p.ap} mm`:"NEUVEDENÁ"}
- Používaná šírka záberu ae: ${p.ae?`${p.ae} mm`:"NEUVEDENÁ"}
- Chladenie/poznámka: ${p.cooling||"NEUVEDENÉ"}

POVINNÝ POSTUP:
1. Z označenia a fotografie identifikuj výrobcu, typ nástroja, ISO tvar, uhol chrbta, toleranciu, veľkosť, hrúbku, rádius/šírku, lámač triesky a triedu. Nečitateľné údaje nehádaj.
2. Najprv over pôvodné označenie v dôveryhodnom alebo oficiálnom katalógu pôvodného výrobcu.
3. Potom prehľadaj oficiálne stránky a katalógy každého zvoleného výrobcu alebo dodávateľa: ${targetLabel}.${masamRules}${distributorRules}${vhmRules}
4. Pri ISO sústružníckej VBD over ISO tvar, veľkosť, hrúbku, otvor, geometriu a polomer/šírku. Pri monolitnom nástroji over priemer, stopku, reznú dĺžku, celkovú dĺžku, počet zubov a povlak. Pri telese/držiaku over rozhranie a kompatibilné plátky. Toto pravidlo rozmerovej zhody plátku NEAPLIKUJ na frézovací plátok, keďže pri frézovaní sa vyberá nový kompletný systém teleso + plátok.
5. Triedu a lámač vyber podľa zadaného materiálu a operácie. Ak materiál alebo použitie chýbajú, môžeš určiť rozmerovú náhradu, ale triedu označ ako NEPOTVRDENÚ a vysvetli, čo treba doplniť.
6. order_code musí byť úplné objednávacie označenie. Samotné DNMG, CCMT, vrták D10 alebo P25 nie je objednávací kód.
7. match_level použi presne: PRIAMA NÁHRADA, ROZMEROVO ZHODNÁ – INÁ APLIKÁCIA, PRIBLIŽNÁ NÁHRADA alebo NENAŠLA SA.
8. PRIAMA NÁHRADA je povolená iba pri zhodnej funkcii, rozmeroch a kompatibilite s držiakom. Rozdielnu geometriu, rádius, šírku, povlak alebo triedu vždy uveď.
9. verification_status musí povedať OVERENÉ V KATALÓGU alebo NEOVERENÉ. Nevymýšľaj kódy ani zdroje.
10. Pri sústružníckych plátkoch vráť 3 až 5 reálnych, katalógovo overených možností, ak ich výrobca pre daný materiál a operáciu ponúka. Pri ostatných nástrojoch vráť najviac tri možnosti. Vždy ich zoraď od najvhodnejšej. Ak presnú položku nenájdeš, alternatives nechaj prázdne a do warnings napíš, ktoré údaje chýbajú.
11. Do sources zapíš názov výrobcu, katalógu alebo oficiálnej stránky a čo bolo overené; nevymýšľaj URL.
12. Zadané rezné parametre ber ako reálne odskúšané podmienky pôvodného nástroja. Použi ich pri výbere geometrie, lámača triesky, triedy a povlaku náhrady; neuprednostni katalógovú položku, ktorá ich zjavne nezvládne.
13. Do recommended_parameters uveď bezpečné štartovacie vc, posuv, ap a podľa potreby ae pre náhradu. Do parameter_comparison stručne napíš, ktoré používateľove hodnoty možno ponechať a ktoré treba zmeniť. Ak chýba materiál alebo operácia, uveď NEPOTVRDENÉ a nevymýšľaj presné hodnoty.
14. Najprv správne urči druh nástroja. Ak používateľ zvolil konkrétny typ, rešpektuj ho; hodnota auto znamená, že ho musíš určiť z označenia, fotografie a operácie.
15. Pri milling_insert nehľadaj rozmerovo rovnaký frézovací plátok ako pôvodný. Ide o náhradu CELÉHO FRÉZOVACIEHO SYSTÉMU. Najprv vyber od požadovaného výrobcu frézovacie teleso podľa požadovaného priemeru, zadaného počtu zubov/lôžok, operácie, ap, ae a upínania. Až potom vyber presne kompatibilný plátok do tohto telesa; jeho geometriu, lámač a triedu zvoľ podľa obrábaného materiálu, operácie a rezných parametrov. Pôvodné označenie použi iba na pochopenie aplikácie, nie ako povinný rozmer nového plátku. V order_code uveď plátok a v companion_tool.order_code teleso; companion_tool.required=true.
16. Ak technológ zadal počet zubov, musí mať navrhnuté teleso presne tento katalógový počet lôžok. Ak taká kombinácia priemeru a počtu zubov u výrobcu neexistuje, ponúkni najbližšiu reálnu možnosť, označ ju ako PRIBLIŽNÁ NÁHRADA a presne vysvetli rozdiel. Počet lôžok vždy uveď v companion_tool.number_of_seats.
17. Pri drilling_insert vždy navrhni kompletnú dvojicu: presné objednávacie označenie plátku a presné objednávacie označenie kompatibilného vŕtacieho telesa požadovaného priemeru. V companion_tool nastav required=true.
18. Pri grooving_insert, ak nejde o univerzálny ISO plátok, vždy navrhni plátok spolu s presným kompatibilným držiakom, kazetou alebo planžetou. Rešpektuj zadaný prierez a upínanie držiaka. V companion_tool nastav required=true.
19. Pri turning_iso môže byť companion_tool.required=false; ostatné polia companion_tool vyplň textom NEVYŽADUJE SA. Ak však náhrada nepasuje do pôvodného držiaka, navrhni aj nový držiak a nastav required=true.
20. Kompatibilitu dvojice over v tom istom oficiálnom katalógu výrobcu: rozhranie/lôžko plátku, veľkosť, pravé alebo ľavé vyhotovenie, počet lôžok, priemer telesa a strojové upínanie. Nestačí, že majú plátok a teleso podobný názov.
21. Ak požadovaný priemer telesa chýba pri frézovaní alebo vŕtaní, neoznač konkrétne teleso ako priamu náhradu. Vypíš najbližšiu overenú zostavu iba ako NEPOTVRDENÚ a upozorni, že treba doplniť priemer.
22. order_code plátku aj companion_tool.order_code musia byť úplné katalógové označenia. Ak sa kompatibilná zostava nedá overiť, kód nevymýšľaj a použi NENAŠLO SA.
23. Pri turning_iso nehľadaj iba jednu rozmerovú kópiu pôvodného plátku. Zachovaj ISO tvar, veľkosť, hrúbku, otvor, uhol chrbta a polomer špičky potrebné pre existujúci držiak a program, ale v rámci tohto rozmeru vyhľadaj viac vhodných kombinácií geometrie/lámača triesky, substrátu, povlaku a triedy od požadovaného výrobcu podľa materiálu, operácie, ap, posuvu, vc, stability a chladenia.
24. Ak je operácia zadaná, všetky alternatívy musia byť pre ňu reálne použiteľné; zoraď ich na hlavnú voľbu a ďalšie vhodné varianty, napríklad pre stabilné podmienky, prerušovaný rez alebo inú bezpečnú oblasť použitia. Ak operácia zadaná nie je, pokús sa ponúknuť varianty HRUBOVANIE, STREDNÉ OBRÁBANIE a DOKONČOVANIE. Do application_role napíš presnú úlohu každej alternatívy.
25. Alternatívy sa nesmú líšiť iba obchodným názvom. Pri každej vysvetli, prečo je jej lámač a trieda vhodná pre zadaný materiál a čím sa odlišuje od ostatných. Ak výrobca nemá 3 overené možnosti, vráť iba tie, ktoré si našiel; nič nedopĺňaj odhadom.
26. Ak obrábaný materiál chýba, môžeš nájsť rozmerovo kompatibilné plátky, ale nesmieš tvrdiť, že je vybraná adekvátna trieda. Označ triedu a parametre ako NEPOTVRDENÉ a vyžiadaj materiál v warnings.
27. Fotografia môže zobrazovať obal, laserové označenie alebo samotnú geometriu. Text na fotografii čítaj opatrne a identification_confidence uveď VYSOKÁ, STREDNÁ, NÍZKA alebo ŽIADNA.
28. Vyhodnoť všetkých zvolených dodávateľov, nie iba prvého. Ak je zvolených viac dodávateľov, nájdi najviac dve overené možnosti od každého a najviac osem možností celkovo. Ak dodávateľ vhodnú položku nemá, uveď ho vo warnings aj s dôvodom. Výsledky zoraď naprieč značkami od technicky najvhodnejšej možnosti.
29. V každej alternatíve vyplň supplier presným názvom zvoleného dodávateľa a manufacturer skutočným výrobcom nástroja. Pri priamom výrobcovi môžu byť oba údaje rovnaké. target_manufacturer vyplň zoznamom všetkých preverovaných dodávateľov: ${targetLabel}.
30. Neuprednostni automaticky prvého dodávateľa zo zoznamu. Porovnaj vhodnosť pre materiál a operáciu, rozmerovú kompatibilitu, overiteľnosť katalógového kódu a odporúčané rezné podmienky.
31. Pre KAŽDÚ alternatívu povinne vyplň starting_parameters: vc v m/min, rpm v ot/min, feed_value, feed_unit, ap v mm, ae v mm, coolant, strategy a calculation_basis. Použi bezpečné štartovacie hodnoty alebo rozumné úzke rozsahy pre konkrétny nástroj, materiál, tvrdosť, operáciu a štýl obrábania.
32. Posuv vyjadri správnou jednotkou: pri sústružení a vŕtaní spravidla mm/ot, pri frézovaní mm/zub; ak je technicky vhodnejšia iná jednotka, vysvetli ju. ap a ae nikdy nezamieňaj. Pri operácii, kde ae nedáva zmysel, uveď NEUPLATŇUJE SA a dôvod.
33. Otáčky vypočítaj z odporúčaného vc a známeho pracovného priemeru nástroja alebo obrobku. Ak potrebný priemer nie je zadaný ani spoľahlivo identifikovaný, do rpm uveď VYPOČÍTAŤ PO DOPLNENÍ PRIEMERU; nevymýšľaj číslo. Do calculation_basis uveď použitý priemer a vzťah n = 1000 × vc / (π × D), prípadne jasne označ chýbajúci vstup.
34. Aktuálne parametre používateľa ber ako odskúšaný referenčný bod, nie ako automaticky správne hodnoty pre nový nástroj. V parameter_comparison jasne uveď, čo ponechať a čo zmeniť. Pri neúplnom materiáli, tvrdosti alebo operácii označ parametre ako orientačné a vypíš chýbajúci údaj vo warnings.`;}

async function handler(req,res){
 try{
  if(req.method!=="POST"){res.setHeader("Allow","POST");return fail(res,405,"Použi POST požiadavku.");}
  const apiKey=key();if(!apiKey)return fail(res,500,"OPENAI_API_KEY nie je nastavený vo Verceli.");
  const b=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});b.language=String(req.headers['x-cnc-language']||b.language||'en');
  if(!String(b.code||"").trim()&&!String(b.photoData||"").trim())return fail(res,400,"Zadaj označenie alebo fotografiu nástroja.");
  const targets=Array.isArray(b.targetManufacturers)?b.targetManufacturers.map(x=>String(x).trim()).filter(Boolean):[String(b.targetManufacturer||"").trim()].filter(Boolean);
  if(!targets.length)return fail(res,400,"Vyber aspoň jedného dodávateľa náhrady.");
  if(targets.length>16)return fail(res,400,"Vybral si príliš veľa dodávateľov.");
  b.targetManufacturers=targets;
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
