export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Použi POST požiadavku.",
      });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const operation = formData.get("operation") || "Sústruženie";
    const stock = formData.get("stock") || "";

    if (!file) {
      return res.status(400).json({
        error: "Nebolo odoslané PDF s výkresom.",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY nie je nastavený vo Verceli.",
      });
    }

    // 1. Nahrajeme PDF do OpenAI
    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name || "vykres.pdf");
    uploadForm.append("purpose", "user_data");

    const uploadResponse = await fetch(
      "https://api.openai.com/v1/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: uploadForm,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      return res.status(500).json({
        error: "Nepodarilo sa nahrať PDF do AI.",
        details: errorText,
      });
    }

    const uploadedFile = await uploadResponse.json();

    // 2. AI analyzuje výkres
    const prompt = `
Si odborník na CNC obrábanie a technologickú prípravu výroby.

Analyzuj priložený technický výkres.

Operácia:
${operation}

Polotovar:
${stock}

Priprav technologický postup V TOMTO PORADÍ:

1. ANALÝZA VÝKRESU
- identifikuj hlavné rozmery
- priemery
- dĺžky
- rádiusy
- uhly
- závity
- drážky
- tolerancie
- drsnosti
- materiál, ak je uvedený

2. UPÍNANIE
Navrhni konkrétne upnutie obrobku.
Uveď:
- typ skľučovadla/upnutia
- čeľuste
- opretie
- orientáciu obrobku
- čo treba skontrolovať pred obrábaním

3. TECHNOLOGICKÝ POSTUP
Rozdeľ výrobu na jednotlivé operácie.
Pri každej operácii uveď:
- číslo operácie
- čo sa obrába
- z ktorej strany
- spôsob kontroly

4. NÁSTROJE
Navrhni vhodné CNC nástroje.
Pri každom uveď:
- typ nástroja
- geometriu
- vhodný typ VBD, ak je možné
- odporúčaný držiak
- účel nástroja

5. REZNÉ PARAMETRE
Pre každý nástroj navrhni:
- vc
- otáčky
- posuv na otáčku alebo zub
- hĺbku záberu
- chladiacu kvapalinu
- či ide o hrubovanie alebo dokončovanie

Ak nie je známy presný materiál, stroj alebo nástroj, jasne označ hodnoty ako ŠTARTOVACIE PARAMETRE.

6. CNC PROGRAM
Priprav CNC program podľa technologického postupu.

Program musí byť vytvorený až PO technologickom postupe.

Ak chýba:
- riadiaci systém
- nulový bod
- presný materiál
- nástrojová tabuľka
- typ stroja

NEVYMÝŠĽAJ tieto údaje. Uveď, čo treba doplniť pred použitím programu.

Program označ ako:
"VZOROVÝ CNC PROGRAM – PRED POUŽITÍM NUTNÁ KONTROLA"

Nikdy netvrď, že program je bezpečný na okamžité spustenie bez kontroly technológom.

Odpoveď vráť ako JSON s týmito položkami:

{
  "analysis": {},
  "setup": {},
  "technology": [],
  "tools": [],
  "parameters": [],
  "program": "",
  "missing_information": [],
  "warnings": []
}
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5.6",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_file",
                  file_id: uploadedFile.id,
                },
                {
                  type: "input_text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(500).json({
        error: "AI analýza zlyhala.",
        details: errorText,
      });
    }

    const result = await response.json();

    return res.status(200).json({
      success: true,
      file: file.name,
      operation,
      stock,
      result: result.output_text || "",
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Chyba servera.",
      details: error.message,
    });
  }
}
