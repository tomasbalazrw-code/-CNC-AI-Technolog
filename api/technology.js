export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Použi POST požiadavku."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "OPENAI_API_KEY nie je nastavený vo Verceli."
    });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : (req.body || {});

    const analysis = body.analysis || body;
    const operation = body.operation || analysis?.drawing_summary?.operation || "Sústruženie";
    const stock = body.stock || analysis?.drawing_summary?.stock || "neuvedený";

    const prompt = `
Si senior CNC technológ. Z dodanej AI analýzy technického výkresu vytvor
praktický technologický postup pre skúšobnú výrobu.

OPERÁCIA: ${operation}
POLOTOVAR: ${stock}

ANALÝZA VÝKRESU:
${JSON.stringify(analysis, null, 2)}

Pravidlá:
- Zachovaj iba údaje, ktoré vyplývajú z analýzy.
- Ak údaj chýba, označ ho ako "nutné doplniť", nevymýšľaj ho.
- Rozdeľ postup na číslované operácie.
- Pre sústruženie navrhni hrubovanie, dokončenie, vŕtanie, závitovanie,
  zapichovanie a ďalšie operácie iba podľa prvkov výkresu.
- Pre frézovanie navrhni upnutie, zarovnanie, hrubovanie, dokončenie,
  vŕtanie, závity, drážky a kontúry podľa výkresu.
- Ku každej operácii priraď konkrétny typ nástroja.
- Preferuj BÖHLERIT, Sandvik, Walter, Seco alebo Ceratizit.
- Presné katalógové číslo uvádzaj iba ak je jednoznačné; inak napíš
  "overiť v katalógu".
- Rezné parametre označ ako ŠTARTOVACIE.
- Pri sústružení používaj f v mm/ot.
- Pri frézovaní používaj fz v mm/zub a posuv v mm/min.
- Na konci uveď kontrolný plán.
- Nevytváraj CNC kód. Ten bude riešený samostatne.
`;

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        operation: { type: "string" },
        stock: { type: "string" },
        setup: {
          type: "array",
          items: { type: "string" }
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              no: { type: "integer" },
              operation: { type: "string" },
              description: { type: "string" },
              tool: { type: "string" },
              insert: { type: "string" },
              holder: { type: "string" },
              parameters: { type: "string" },
              inspection: { type: "string" }
            },
            required: [
              "no",
              "operation",
              "description",
              "tool",
              "insert",
              "holder",
              "parameters",
              "inspection"
            ]
          }
        },
        tools: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              no: { type: "integer" },
              manufacturer: { type: "string" },
              type: { type: "string" },
              designation: { type: "string" },
              insert: { type: "string" },
              holder: { type: "string" },
              note: { type: "string" }
            },
            required: [
              "no",
              "manufacturer",
              "type",
              "designation",
              "insert",
              "holder",
              "note"
            ]
          }
        },
        inspection_plan: {
          type: "array",
          items: { type: "string" }
        },
        warnings: {
          type: "array",
          items: { type: "string" }
        },
        missing_information: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: [
        "title",
        "operation",
        "stock",
        "setup",
        "steps",
        "tools",
        "inspection_plan",
        "warnings",
        "missing_information"
      ]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: prompt
          }]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "cnc_technology",
            strict: true,
            schema
          }
        }
      })
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "AI technologický postup zlyhal.",
        details: await response.text()
      });
    }

    const data = await response.json();
    const text = data.output_text || "";

    let technology;
    try {
      technology = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        error: "AI nevrátila platný technologický postup.",
        raw: text
      });
    }

    return res.status(200).json({
      success: true,
      technology
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Chyba servera pri tvorbe technologického postupu.",
      details: err?.message || String(err)
    });
  }
}
