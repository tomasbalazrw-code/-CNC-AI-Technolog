(function(global){
  'use strict';
  var LANGS=['en','sk','cs','de','pl','hu'];
  var rows={
    'Prihlásenie':['Sign in','Prihlásenie','Přihlášení','Anmelden','Logowanie','Bejelentkezés'],
    'Registrácia':['Register','Registrácia','Registrace','Registrierung','Rejestracja','Regisztráció'],
    'Prihláste sa a pokračujte vo svojej práci.':['Sign in and continue your work.','Prihláste sa a pokračujte vo svojej práci.','Přihlaste se a pokračujte ve své práci.','Melden Sie sich an und setzen Sie Ihre Arbeit fort.','Zaloguj się i kontynuuj pracę.','Jelentkezzen be, és folytassa a munkát.'],
    'Vitajte späť':['Welcome back','Vitajte späť','Vítejte zpět','Willkommen zurück','Witamy ponownie','Üdvözöljük újra'],
    'Zadajte svoje prihlasovacie údaje.':['Enter your login details.','Zadajte svoje prihlasovacie údaje.','Zadejte své přihlašovací údaje.','Geben Sie Ihre Anmeldedaten ein.','Wprowadź dane logowania.','Adja meg bejelentkezési adatait.'],
    'E-mail':['Email','E-mail','E-mail','E-Mail','E-mail','E-mail'],
    'Heslo':['Password','Heslo','Heslo','Passwort','Hasło','Jelszó'],
    'Zapamätať si ma':['Remember me','Zapamätať si ma','Zapamatovat si mě','Angemeldet bleiben','Zapamiętaj mnie','Emlékezz rám'],
    'Zabudnuté heslo?':['Forgot password?','Zabudnuté heslo?','Zapomenuté heslo?','Passwort vergessen?','Nie pamiętasz hasła?','Elfelejtette a jelszót?'],
    'Prihlásiť sa':['Sign in','Prihlásiť sa','Přihlásit se','Anmelden','Zaloguj się','Bejelentkezés'],
    'Vytvoriť účet':['Create account','Vytvoriť účet','Vytvořit účet','Konto erstellen','Utwórz konto','Fiók létrehozása'],
    'Účet':['Account','Účet','Účet','Konto','Konto','Fiók'],
    'Odhlásiť':['Sign out','Odhlásiť','Odhlásit','Abmelden','Wyloguj','Kijelentkezés'],
    'Od výkresu k hotovej technológii':['From drawing to production-ready process','Od výkresu k hotovej technológii','Od výkresu k hotové technologii','Von der Zeichnung zum fertigen Fertigungsprozess','Od rysunku do gotowego procesu','A rajztól a kész technológiáig'],
    'SÚSTRUŽENIE':['TURNING','SÚSTRUŽENIE','SOUSTRUŽENÍ','DREHEN','TOCZENIE','ESZTERGÁLÁS'],
    'FRÉZOVANIE':['MILLING','FRÉZOVANIE','FRÉZOVÁNÍ','FRÄSEN','FREZOWANIE','MARÁS'],
    'Sústruženie':['Turning','Sústruženie','Soustružení','Drehen','Toczenie','Esztergálás'],
    'Frézovanie':['Milling','Frézovanie','Frézování','Fräsen','Frezowanie','Marás'],
    'CNC sústruhy':['CNC lathes','CNC sústruhy','CNC soustruhy','CNC-Drehmaschinen','Tokarki CNC','CNC esztergák'],
    'CNC frézky':['CNC milling machines','CNC frézky','CNC frézky','CNC-Fräsmaschinen','Frezarki CNC','CNC marógépek'],
    'AI VÝKRES':['AI DRAWING','AI VÝKRES','AI VÝKRES','KI-ZEICHNUNG','RYSUNEK AI','AI RAJZ'],
    'NÁHRADA NÁSTROJA / PLÁTKU':['TOOL / INSERT REPLACEMENT','NÁHRADA NÁSTROJA / PLÁTKU','NÁHRADA NÁSTROJE / DESTIČKY','WERKZEUG- / WENDEPLATTENERSATZ','ZAMIENNIK NARZĘDZIA / PŁYTKI','SZERSZÁM- / LAPKAHELYETTESÍTÉS'],
    'NÁSTROJE':['TOOLS','NÁSTROJE','NÁSTROJE','WERKZEUGE','NARZĘDZIA','SZERSZÁMOK'],
    'MOJE ZÁKAZKY':['MY JOBS','MOJE ZÁKAZKY','MOJE ZAKÁZKY','MEINE AUFTRÄGE','MOJE ZLECENIA','MUNKÁIM'],
    'NASTAVENIA':['SETTINGS','NASTAVENIA','NASTAVENÍ','EINSTELLUNGEN','USTAWIENIA','BEÁLLÍTÁSOK'],
    'DOMOV':['HOME','DOMOV','DOMŮ','START','START','KEZDŐLAP'],
    'ANALÝZA':['ANALYSIS','ANALÝZA','ANALÝZA','ANALYSE','ANALIZA','ELEMZÉS'],
    'NOVÁ ZÁKAZKA':['NEW JOB','NOVÁ ZÁKAZKA','NOVÁ ZAKÁZKA','NEUER AUFTRAG','NOWE ZLECENIE','ÚJ MUNKA'],
    'KALKULAČKA':['CALCULATOR','KALKULAČKA','KALKULAČKA','RECHNER','KALKULATOR','KALKULÁTOR'],
    'PROFIL':['PROFILE','PROFIL','PROFIL','PROFIL','PROFIL','PROFIL'],
    '← Späť':['← Back','← Späť','← Zpět','← Zurück','← Wstecz','← Vissza'],
    'Typ obrábania':['Machining type','Typ obrábania','Typ obrábění','Bearbeitungsart','Rodzaj obróbki','Megmunkálás típusa'],
    'Materiál':['Material','Materiál','Materiál','Werkstoff','Materiał','Anyag'],
    'Obrábaný materiál':['Workpiece material','Obrábaný materiál','Obráběný materiál','Werkstückwerkstoff','Materiał obrabiany','Munkadarab anyaga'],
    'Vyber materiál…':['Select material…','Vyber materiál…','Vyberte materiál…','Werkstoff wählen…','Wybierz materiał…','Válasszon anyagot…'],
    'Iný materiál – dopísať':['Other material – enter manually','Iný materiál – dopísať','Jiný materiál – doplnit','Anderer Werkstoff – eingeben','Inny materiał – wpisz','Más anyag – írja be'],
    'Vlastné označenie materiálu':['Custom material designation','Vlastné označenie materiálu','Vlastní označení materiálu','Eigene Werkstoffbezeichnung','Własne oznaczenie materiału','Egyedi anyagjelölés'],
    'Stav a tvrdosť materiálu':['Material condition and hardness','Stav a tvrdosť materiálu','Stav a tvrdost materiálu','Werkstoffzustand und Härte','Stan i twardość materiału','Anyagállapot és keménység'],
    'Stav materiálu / tvrdosť – voliteľné':['Material condition / hardness – optional','Stav materiálu / tvrdosť – voliteľné','Stav materiálu / tvrdost – volitelné','Werkstoffzustand / Härte – optional','Stan materiału / twardość – opcjonalnie','Anyagállapot / keménység – opcionális'],
    'Použitie – voliteľné':['Application – optional','Použitie – voliteľné','Použití – volitelné','Anwendung – optional','Zastosowanie – opcjonalnie','Alkalmazás – opcionális'],
    'Štýl obrábania – voliteľné':['Machining style – optional','Štýl obrábania – voliteľné','Styl obrábění – volitelný','Bearbeitungsstrategie – optional','Styl obróbki – opcjonalnie','Megmunkálási stílus – opcionális'],
    'Typ nástroja':['Tool type','Typ nástroja','Typ nástroje','Werkzeugtyp','Typ narzędzia','Szerszámtípus'],
    'Určiť automaticky':['Detect automatically','Určiť automaticky','Určit automaticky','Automatisch bestimmen','Określ automatycznie','Automatikus felismerés'],
    'Označenie pôvodného nástroja alebo plátku':['Original tool or insert designation','Označenie pôvodného nástroja alebo plátku','Označení původního nástroje nebo destičky','Bezeichnung des ursprünglichen Werkzeugs oder der Wendeschneidplatte','Oznaczenie pierwotnego narzędzia lub płytki','Az eredeti szerszám vagy lapka jelölése'],
    'Požadovaní dodávatelia – môžeš označiť viac':['Preferred suppliers – select multiple','Požadovaní dodávatelia – môžeš označiť viac','Požadovaní dodavatelé – lze vybrat více','Gewünschte Lieferanten – Mehrfachauswahl','Preferowani dostawcy – wybór wielokrotny','Előnyben részesített beszállítók – több is választható'],
    'Fotografia nástroja alebo označenia':['Photo of tool or designation','Fotografia nástroja alebo označenia','Fotografie nástroje nebo označení','Foto des Werkzeugs oder der Bezeichnung','Zdjęcie narzędzia lub oznaczenia','A szerszám vagy jelölés fényképe'],
    '📷 Odfotiť':['📷 Take photo','📷 Odfotiť','📷 Vyfotit','📷 Fotografieren','📷 Zrób zdjęcie','📷 Fénykép'],
    '🖼 Galéria':['🖼 Gallery','🖼 Galéria','🖼 Galerie','🖼 Galerie','🖼 Galeria','🖼 Galéria'],
    '📁 Súbor':['📁 File','📁 Súbor','📁 Soubor','📁 Datei','📁 Plik','📁 Fájl'],
    'Ďalšie požiadavky':['Additional requirements','Ďalšie požiadavky','Další požadavky','Weitere Anforderungen','Dodatkowe wymagania','További követelmények'],
    'Ďalšie požiadavky – voliteľné':['Additional requirements – optional','Ďalšie požiadavky – voliteľné','Další požadavky – volitelné','Weitere Anforderungen – optional','Dodatkowe wymagania – opcjonalnie','További követelmények – opcionális'],
    'NÁJSŤ NÁHRADU':['FIND REPLACEMENT','NÁJSŤ NÁHRADU','NAJÍT NÁHRADU','ERSATZ FINDEN','ZNAJDŹ ZAMIENNIK','HELYETTESÍTŐ KERESÉSE'],
    'Vyhľadanie kompatibilnej náhrady':['Find a compatible replacement','Vyhľadanie kompatibilnej náhrady','Vyhledání kompatibilní náhrady','Kompatiblen Ersatz finden','Wyszukiwanie kompatybilnego zamiennika','Kompatibilis helyettesítő keresése'],
    'Rezné parametre pôvodného nástroja – voliteľné':['Current cutting parameters – optional','Rezné parametre pôvodného nástroja – voliteľné','Řezné parametry původního nástroje – volitelné','Aktuelle Schnittdaten – optional','Aktualne parametry skrawania – opcjonalnie','Jelenlegi forgácsolási adatok – opcionális'],
    'Rezná rýchlosť vc (m/min)':['Cutting speed vc (m/min)','Rezná rýchlosť vc (m/min)','Řezná rychlost vc (m/min)','Schnittgeschwindigkeit vc (m/min)','Prędkość skrawania vc (m/min)','Forgácsolási sebesség vc (m/min)'],
    'Otáčky n (ot/min)':['Spindle speed n (rpm)','Otáčky n (ot/min)','Otáčky n (ot/min)','Drehzahl n (U/min)','Obroty n (obr/min)','Fordulatszám n (1/min)'],
    'Posuv f':['Feed f','Posuv f','Posuv f','Vorschub f','Posuw f','Előtolás f'],
    'Jednotka posuvu':['Feed unit','Jednotka posuvu','Jednotka posuvu','Vorschubeinheit','Jednostka posuwu','Előtolás mértékegysége'],
    'Hĺbka rezu ap (mm)':['Depth of cut ap (mm)','Hĺbka rezu ap (mm)','Hloubka řezu ap (mm)','Schnitttiefe ap (mm)','Głębokość skrawania ap (mm)','Fogásmélység ap (mm)'],
    'Šírka záberu ae (mm)':['Width of cut ae (mm)','Šírka záberu ae (mm)','Šířka záběru ae (mm)','Eingriffsbreite ae (mm)','Szerokość skrawania ae (mm)','Fogásszélesség ae (mm)'],
    'Chladenie / poznámka':['Coolant / note','Chladenie / poznámka','Chlazení / poznámka','Kühlung / Hinweis','Chłodzenie / uwaga','Hűtés / megjegyzés'],
    'Technický výkres':['Technical drawing','Technický výkres','Technický výkres','Technische Zeichnung','Rysunek techniczny','Műszaki rajz'],
    'Vybrať výkres':['Select drawing','Vybrať výkres','Vybrat výkres','Zeichnung auswählen','Wybierz rysunek','Rajz kiválasztása'],
    '3D model a CAD dáta':['3D model and CAD data','3D model a CAD dáta','3D model a CAD data','3D-Modell und CAD-Daten','Model 3D i dane CAD','3D modell és CAD-adatok'],
    'Vybrať CAD súbor':['Select CAD file','Vybrať CAD súbor','Vybrat CAD soubor','CAD-Datei auswählen','Wybierz plik CAD','CAD-fájl kiválasztása'],
    'SPUSTIŤ AI ANALÝZU':['START AI ANALYSIS','SPUSTIŤ AI ANALÝZU','SPUSTIT AI ANALÝZU','KI-ANALYSE STARTEN','URUCHOM ANALIZĘ AI','AI ELEMZÉS INDÍTÁSA'],
    'Výsledok analýzy':['Analysis result','Výsledok analýzy','Výsledek analýzy','Analyseergebnis','Wynik analizy','Elemzés eredménye'],
    'AI technologická analýza – sústruženie':['AI process analysis – turning','AI technologická analýza – sústruženie','AI technologická analýza – soustružení','KI-Technologieanalyse – Drehen','Analiza technologiczna AI – toczenie','AI technológiai elemzés – esztergálás'],
    'AI technologická analýza – frézovanie':['AI process analysis – milling','AI technologická analýza – frézovanie','AI technologická analýza – frézování','KI-Technologieanalyse – Fräsen','Analiza technologiczna AI – frezowanie','AI technológiai elemzés – marás'],
    'Polotovar':['Stock','Polotovar','Polotovar','Rohteil','Półfabrykat','Nyersdarab'],
    'Typ polotovaru':['Stock type','Typ polotovaru','Typ polotovaru','Rohteiltyp','Typ półfabrykatu','Nyersdarab típusa'],
    'Valec / tyč':['Cylinder / bar','Valec / tyč','Válec / tyč','Zylinder / Stange','Walec / pręt','Henger / rúd'],
    'Trubka':['Tube','Trubka','Trubka','Rohr','Rura','Cső'],
    'Vonkajší priemer Ø [mm]':['Outside diameter Ø [mm]','Vonkajší priemer Ø [mm]','Vnější průměr Ø [mm]','Außendurchmesser Ø [mm]','Średnica zewnętrzna Ø [mm]','Külső átmérő Ø [mm]'],
    'Vnútorný priemer Ø [mm]':['Inside diameter Ø [mm]','Vnútorný priemer Ø [mm]','Vnitřní průměr Ø [mm]','Innendurchmesser Ø [mm]','Średnica wewnętrzna Ø [mm]','Belső átmérő Ø [mm]'],
    'Dĺžka polotovaru [mm]':['Stock length [mm]','Dĺžka polotovaru [mm]','Délka polotovaru [mm]','Rohteillänge [mm]','Długość półfabrykatu [mm]','Nyersdarab hossza [mm]'],
    'Výrobca stroja':['Machine manufacturer','Výrobca stroja','Výrobce stroje','Maschinenhersteller','Producent maszyny','Gépgyártó'],
    'Model stroja':['Machine model','Model stroja','Model stroje','Maschinenmodell','Model maszyny','Gépmodell'],
    'CNC riadiaci systém':['CNC control','CNC riadiaci systém','CNC řídicí systém','CNC-Steuerung','Sterowanie CNC','CNC vezérlés'],
    'Vyber výrobcu…':['Select manufacturer…','Vyber výrobcu…','Vyberte výrobce…','Hersteller wählen…','Wybierz producenta…','Válasszon gyártót…'],
    'Vyber riadenie…':['Select control…','Vyber riadenie…','Vyberte řízení…','Steuerung wählen…','Wybierz sterowanie…','Válasszon vezérlést…'],
    'Hlavný výrobca':['Primary manufacturer','Hlavný výrobca','Hlavní výrobce','Haupthersteller','Główny producent','Elsődleges gyártó'],
    '1. náhradný výrobca':['1st alternative manufacturer','1. náhradný výrobca','1. náhradní výrobce','1. Alternativhersteller','1. producent alternatywny','1. alternatív gyártó'],
    '2. náhradný výrobca':['2nd alternative manufacturer','2. náhradný výrobca','2. náhradní výrobce','2. Alternativhersteller','2. producent alternatywny','2. alternatív gyártó'],
    'Rozhranie vretena':['Spindle interface','Rozhranie vretena','Rozhraní vřetena','Spindelschnittstelle','Interfejs wrzeciona','Orsócsatlakozás'],
    'Vyber rozhranie…':['Select interface…','Vyber rozhranie…','Vyberte rozhraní…','Schnittstelle wählen…','Wybierz interfejs…','Válasszon csatlakozást…'],
    'Nástroj':['Tool','Nástroj','Nástroj','Werkzeug','Narzędzie','Szerszám'],
    'OBROBOK':['WORKPIECE','OBROBOK','OBROBEK','WERKSTÜCK','PRZEDMIOT','MUNKADARAB'],
    'CNC stôl':['CNC table','CNC stôl','CNC stůl','CNC-Tisch','Stół CNC','CNC asztal'],
    'Databáza nástrojov':['Tool database','Databáza nástrojov','Databáze nástrojů','Werkzeugdatenbank','Baza narzędzi','Szerszámadatbázis'],
    'Hľadať nástroj':['Search tool','Hľadať nástroj','Hledat nástroj','Werkzeug suchen','Szukaj narzędzia','Szerszám keresése'],
    'Vyhľadať':['Search','Vyhľadať','Vyhledat','Suchen','Szukaj','Keresés'],
    'Nová zákazka':['New job','Nová zákazka','Nová zakázka','Neuer Auftrag','Nowe zlecenie','Új munka'],
    'Názov':['Name','Názov','Název','Name','Nazwa','Név'],
    'Uložiť zákazku':['Save job','Uložiť zákazku','Uložit zakázku','Auftrag speichern','Zapisz zlecenie','Munka mentése'],
    'Rezná kalkulačka':['Cutting calculator','Rezná kalkulačka','Řezná kalkulačka','Schnittdatenrechner','Kalkulator skrawania','Forgácsolási kalkulátor'],
    'Vypočítať':['Calculate','Vypočítať','Vypočítat','Berechnen','Oblicz','Számítás'],
    'Nastavenia':['Settings','Nastavenia','Nastavení','Einstellungen','Ustawienia','Beállítások'],
    'Predvolený materiál':['Default material','Predvolený materiál','Výchozí materiál','Standardwerkstoff','Domyślny materiał','Alapértelmezett anyag'],
    'Predvolený stroj':['Default machine','Predvolený stroj','Výchozí stroj','Standardmaschine','Domyślna maszyna','Alapértelmezett gép'],
    'Uložiť nastavenia':['Save settings','Uložiť nastavenia','Uložit nastavení','Einstellungen speichern','Zapisz ustawienia','Beállítások mentése'],
    'Aktívna':['Active','Aktívna','Aktivní','Aktiv','Aktywna','Aktív'],
    'BEZPEČNOSŤ':['SECURITY','BEZPEČNOSŤ','BEZPEČNOST','SICHERHEIT','BEZPIECZEŃSTWO','BIZTONSÁG'],
    'ZÁLOHA':['BACKUP','ZÁLOHA','ZÁLOHA','SICHERUNG','KOPIA','BIZTONSÁGI MENTÉS'],
    'HISTÓRIA':['HISTORY','HISTÓRIA','HISTORIE','VERLAUF','HISTORIA','ELŐZMÉNYEK'],
    '12 položiek':['12 items','12 položiek','12 položek','12 Einträge','12 pozycji','12 elem'],
    'Čakajte…':['Please wait…','Čakajte…','Čekejte…','Bitte warten…','Proszę czekać…','Kérjük, várjon…']
    ,'Pôvodný nástroj':['Original tool','Pôvodný nástroj','Původní nástroj','Originalwerkzeug','Narzędzie pierwotne','Eredeti szerszám']
    ,'Operácia':['Operation','Operácia','Operace','Operation','Operacja','Művelet']
    ,'Štartovacie parametre':['Starting parameters','Štartovacie parametre','Startovací parametry','Startwerte','Parametry startowe','Kiindulási adatok']
    ,'Dodávateľ / výrobca':['Supplier / manufacturer','Dodávateľ / výrobca','Dodavatel / výrobce','Lieferant / Hersteller','Dostawca / producent','Beszállító / gyártó']
    ,'Presné označenie':['Exact designation','Presné označenie','Přesné označení','Genaue Bezeichnung','Dokładne oznaczenie','Pontos jelölés']
    ,'Trieda':['Grade','Trieda','Třída','Sorte','Gatunek','Minőség']
    ,'Teleso alebo držiak':['Body or holder','Teleso alebo držiak','Těleso nebo držák','Körper oder Halter','Korpus lub oprawka','Test vagy tartó']
    ,'Opis / použitie':['Description / application','Opis / použitie','Popis / použití','Beschreibung / Anwendung','Opis / zastosowanie','Leírás / alkalmazás']
    ,'Chladenie / stratégia':['Coolant / strategy','Chladenie / stratégia','Chlazení / strategie','Kühlung / Strategie','Chłodzenie / strategia','Hűtés / stratégia']
    ,'Zhoda':['Match','Zhoda','Shoda','Übereinstimmung','Zgodność','Egyezés']
    ,'Porovnanie':['Comparison','Porovnanie','Porovnání','Vergleich','Porównanie','Összehasonlítás']
    ,'Overenie':['Verification','Overenie','Ověření','Prüfung','Weryfikacja','Ellenőrzés']
    ,'Položka':['Item','Položka','Položka','Position','Pozycja','Tétel']
    ,'CNC AI TECHNOLÓG – POROVNANIE NÁHRAD NÁSTROJA':['CNC AI TECHNOLOGIST – TOOL REPLACEMENT COMPARISON','CNC AI TECHNOLÓG – POROVNANIE NÁHRAD NÁSTROJA','CNC AI TECHNOLOG – POROVNÁNÍ NÁHRAD NÁSTROJE','CNC KI-TECHNOLOGE – WERKZEUGERSATZVERGLEICH','TECHNOLOG CNC AI – PORÓWNANIE ZAMIENNIKÓW','CNC AI TECHNOLÓGUS – SZERSZÁMHELYETTESÍTÉSEK']
  };
  var dict={};
  LANGS.forEach(function(l,i){dict[l]={};Object.keys(rows).forEach(function(k){dict[l][k]=rows[k][i]||rows[k][0];});});
  var originalText=new WeakMap(),originalAttrs=new WeakMap(),busy=false;
  function lang(){return localStorage.getItem('cncLanguage')||'en';}
  function translateString(source,l){var s=String(source||''),trim=s.trim(),translated=dict[l][trim];if(!translated&&l!=='sk')translated=dict.en[trim];if(!translated)return s;return s.replace(trim,translated);}
  function translateNode(node,l){
    if(node.nodeType===3){if(!originalText.has(node))originalText.set(node,node.nodeValue);node.nodeValue=translateString(originalText.get(node),l);return;}
    if(node.nodeType!==1||node.closest&&node.closest('script,style'))return;
    ['placeholder','title','aria-label'].forEach(function(a){if(!node.hasAttribute||!node.hasAttribute(a))return;var bag=originalAttrs.get(node)||{};if(!(a in bag))bag[a]=node.getAttribute(a);originalAttrs.set(node,bag);node.setAttribute(a,translateString(bag[a],l));});
    Array.from(node.childNodes||[]).forEach(function(n){translateNode(n,l);});
  }
  function apply(l){if(!LANGS.includes(l))l='en';busy=true;document.documentElement.lang=l;translateNode(document.body,l);var s=document.getElementById('cncLanguage');if(s)s.value=l;busy=false;document.dispatchEvent(new CustomEvent('cnc-language-change',{detail:{language:l}}));}
  global.cncSetLanguage=function(l){localStorage.setItem('cncLanguage',LANGS.includes(l)?l:'en');apply(lang());};
  global.cncGetLanguage=function(){return lang();};
  global.cncTranslate=function(s,l){return translateString(s,l||lang());};
  var nativeFetch=global.fetch;
  if(nativeFetch)global.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||'';
    if(/^\/api\/(analyze|substitute|program)/.test(url)){
      init=Object.assign({},init||{});init.headers=new Headers(init.headers||{});init.headers.set('X-CNC-Language',lang());
    }
    return nativeFetch.call(this,input,init);
  };
  function init(){apply(lang());new MutationObserver(function(ms){if(busy)return;busy=true;ms.forEach(function(m){m.addedNodes.forEach(function(n){translateNode(n,lang());});});busy=false;}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
