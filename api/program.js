/* CNC AI Technológ – CNC program generation endpoint */

const OPENAI_URL = "https://api.openai.com/v1";
const MODEL = "gpt-5.6-luna";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    program: { type: "string" },
    notes: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    checks: { type: "array", items: { type: "string" } }
  },
  required: ["program", "notes", "assumptions", "checks"]
};

function fail(res, status, message, details = "") {
  return res.status(status).json({ success: false, error: message, details });
}

function promptFor({ control, zero, plan }) {
  return `
Si senior CNC programátor a technológ.

Vytvor návrh CNC programu podľa už analyzovaného technického výkresu a technologického plánu nižšie.

RIADENIE: ${control || "Fanuc / ISO"}
NULOVÝ BOD: ${zero || "G54"}

TECHNOLOGICKÝ PLÁN:
${JSON.stringify(plan, null, 2)}

PRAVIDLÁ:
1. Program musí vychádzať z geometry, operations, setup a tools. Nevymýšľaj rozmery, ktoré v pláne nie sú.
2. Použi konkrétne rozmery z geometry.dimensions a prvky z geometry.features tam, kde sú jednoznačné.
3. Ak chýba kritický údaj potrebný na bezpečný pohyb (napr. presná poloha prvku, nástroj, korekcia, bezpečná rovina, smer osi alebo spôsob upnutia), nevymýšľaj ho. Uveď ho v assumptions/checks a program ponechaj ako bezpečný návrh s komentárom alebo placeholderom.
4. Zohľadni poradie operácií a navrhnuté nástroje. Pre sústruženie používaj X/Z a vhodné G-kódy pre Fanuc/ISO. Pre frézovanie používaj X/Y/Z a G17 podľa potreby.
5. Pri otáčkach a posuvoch použi hodnoty z tools, ak sú uvedené. Ak sú označené ako nutné doplniť, nepodsúvaj ich ako presné.
6. Zahrň bezpečný štart, vyvolanie nástroja/korekcie, otáčky, posuvy, pracovný nulový bod a ukončenie programu iba v rozsahu, ktorý je podložený plánom.
7. Nevytváraj falošné merania ani predstieraj, že program je overený simuláciou.
8. Výstup program má byť čistý G-kód s krátkymi komentármi, bez Markdown code fence.
9. Program je technologický návrh na kontrolu, nie automaticky bezpečný výrobný program.
10. Ak je výkres nedostatočne jednoznačný na vytvorenie konkrétnej dráhy, vráť čo najviac použiteľného programu a presne vypíš, čo musí technológ doplniť.
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(res, 405, "Použi POST požiadavku.");
    }
    if (!process.env.OPENAI_API_KEY) return fail(res, 500, "OPENAI_API_KEY nie je nastavený vo Verceli.");

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (!body.plan) return fail(res, 400, "Chýba technologický plán.");

    const response = await fetch(`${OPENAI_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [{ type: "input_text", text: promptFor(body) }] }],
        text: { format: { type: "json_schema", name: "cnc_program", strict: true, schema: SCHEMA } }
      })
    });

    if (!response.ok) return fail(res, 502, "Generovanie CNC programu zlyhalo.", await response.text());
    const data = await response.json();
    let out;
    try { out = JSON.parse(data.output_text || ""); }
    catch { return fail(res, 502, "AI nevrátila platný program.", data.output_text || ""); }

    return res.status(200).json({ success: true, ...out });
  } catch (err) {
    console.error(err);
    return fail(res, 500, "Chyba servera pri generovaní CNC programu.", err?.message || String(err));
  }
}
