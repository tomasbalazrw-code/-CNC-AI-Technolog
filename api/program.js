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
2. geometry.dimensions, geometry.features a geometry.profile_sequence sú povinný zdroj dráhy. Použi konkrétne rozmery z nich v programe a zachovaj ich poradie.
3. Ak chýba kritický údaj potrebný na bezpečný pohyb (napr. presná poloha prvku, nástroj, korekcia, bezpečná rovina, smer osi alebo spôsob upnutia), nevymýšľaj ho. Uveď ho v assumptions/checks a program ponechaj ako bezpečný návrh s komentárom alebo placeholderom.
4. Zohľadni poradie operácií a navrhnuté nástroje. Pre sústruženie používaj X/Z a vhodné G-kódy pre Fanuc/ISO. Pre frézovanie používaj X/Y/Z a G17 podľa potreby.
5. Pri otáčkach a posuvoch použi hodnoty z tools, ak sú uvedené. Ak sú označené ako nutné doplniť, nepodsúvaj ich ako presné.
6. Zahrň bezpečný štart, vyvolanie nástroja/korekcie, otáčky, posuvy, pracovný nulový bod a ukončenie programu iba v rozsahu, ktorý je podložený plánom.
7. Pri sústružení vytvor skutočnú dráhu podľa profile_sequence a dimensions (X/Z); pri frézovaní vytvor dráhu podľa features/dimensions (X/Y/Z). Nevytváraj generickú šablónu typu "X0 Z0" len preto, aby program vyzeral hotový.
8. Pri sústružení je polotovar záväzný vstup pre hrubovanie. Ak je polotovar výrazne väčší než hotový rozmer, NIKDY nepredpokladaj jeden záber. Rozdeľ hrubovanie do viacerých bezpečných záberov/passov podľa dostupného ap, nástroja a výkonu stroja; každý záber musí postupne odoberať materiál z reálneho priemeru/dĺžky polotovaru smerom k profilu výkresu. Pri trubke rešpektuj vonkajší aj vnútorný priemer polotovaru a neobrábaj materiál, ktorý v polotovare nie je.
9. Ak polotovar obsahuje "Valec/tyč: ØD × L", začni z ØD a dĺžky L. Ak obsahuje "Trubka: ØD / Ød × L", zohľadni oba priemery. Nepredpokladaj plný materiál pri trubke.
10. Nevytváraj falošné merania ani predstieraj, že program je overený simuláciou.
9. Výstup program má byť čistý G-kód s krátkymi komentármi, bez Markdown code fence.
10. Program je technologický návrh na kontrolu, nie automaticky bezpečný výrobný program.
11. Ak je výkres nedostatočne jednoznačný na vytvorenie konkrétnej dráhy, nevymýšľaj chýbajúce súradnice; vráť najbezpečnejší možný návrh a presne vypíš, čo musí technológ doplniť.
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

    // Responses API môže mať text priamo v output_text alebo v output[].content[].text.
    function extractOutputText(resp) {
      if (typeof resp.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();
      const parts = [];
      for (const item of (resp.output || [])) {
        for (const content of (item.content || [])) {
          if (typeof content.text === "string" && content.text.trim()) parts.push(content.text);
        }
      }
      return parts.join("\n").trim();
    }

    const raw = extractOutputText(data);
    if (!raw) {
      return fail(res, 502, "AI nevrátila text CNC programu.", JSON.stringify({
        response_id: data.id || null,
        status: data.status || null,
        incomplete_details: data.incomplete_details || null,
        output_items: Array.isArray(data.output) ? data.output.length : 0
      }));
    }

    let out;
    try {
      out = JSON.parse(raw);
    } catch (_) {
      // Fallback: model môže vrátiť JSON v markdown code fence alebo s krátkym textom okolo.
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidate = fenced ? fenced[1].trim() : raw;
      try {
        out = JSON.parse(candidate);
      } catch (_) {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try { out = JSON.parse(candidate.slice(start, end + 1)); } catch (_) {}
        }
      }
    }

    if (!out || typeof out !== "object" || typeof out.program !== "string" || !out.program.trim()) {
      return fail(res, 502, "AI nevrátila platný CNC program.", raw.slice(0, 8000));
    }

    return res.status(200).json({ success: true, ...out });
  } catch (err) {
    console.error(err);
    return fail(res, 500, "Chyba servera pri generovaní CNC programu.", err?.message || String(err));
  }
}
