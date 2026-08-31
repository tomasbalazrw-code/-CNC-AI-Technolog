/*
 * api/program.js
 * CNC program generator for the CNC AI Technológ test application.
 *
 * IMPORTANT:
 * This endpoint creates a REVIEW/TEST CNC program only.
 * It does not claim the program is ready for direct machine execution.
 * Machine, control, work offset, tool table, clamping and safety values
 * must be verified by the technologist/operator.
 */

const MODEL = "gpt-5.6-luna";
const OPENAI_URL = "https://api.openai.com/v1";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_name: { type: "string" },
    controller: { type: "string" },
    operation: { type: "string" },
    safety_notes: {
      type: "array",
      items: { type: "string" }
    },
    assumptions: {
      type: "array",
      items: { type: "string" }
    },
    cnc_code: { type: "string" },
    tool_list: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool_no: { type: "integer" },
          description: { type: "string" },
          insert: { type: "string" },
          holder: { type: "string" }
        },
        required: ["tool_no", "description", "insert", "holder"]
      }
    },
    verification: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "program_name",
    "controller",
    "operation",
    "safety_notes",
    "assumptions",
    "cnc_code",
    "tool_list",
    "verification"
  ]
};

function fail(res, status, error, details = "") {
  return res.status(status).json({
    success: false,
    error,
    details
  });
}

function buildPrompt(payload) {
  const operation = payload.operation || "Sústruženie";
  const stock = payload.stock || "neuvedený";
  const analysis = payload.analysis || {};
  const technology = payload.technology || {};

  return `
Si senior CNC programátor a technológ.

Vytvor TESTOVACÍ CNC PROGRAM podľa dodanej AI analýzy a technologického postupu.

OPERÁCIA:
${operation}

POLOTOVAR:
${stock}

AI ANALÝZA:
${JSON.stringify(analysis, null, 2)}

TECHNOLOGICKÝ POSTUP:
${JSON.stringify(technology, null, 2)}

PRAVIDLÁ:
- Generuj iba program vhodný na kontrolu technológom.
- Predpokladaj FANUC/ISO iba ako výslovný TESTOVACÍ predpoklad.
- Ak nie je známy konkrétny stroj, riadenie, nulový bod, nástrojová tabuľka,
  orientácia upnutia alebo bezpečná nájazdová rovina, NESMIEŠ ich vymyslieť.
- Chýbajúce údaje uveď v assumptions a verification.
- Nepoužívaj neoverené katalógové čísla nástrojov ako keby boli isté.
- Zachovaj rozmery a tolerancie iba podľa dodanej analýzy.
- Pre sústruženie vytvor ISO/FANUC štýl s bezpečným komentárom a nástrojmi,
  ale nepoužívaj neznáme hodnoty ako hotové bezpečnostné hodnoty.
- Pre frézovanie vytvor ISO/FANUC štýl s G0/G1/G2/G3 iba tam,
  kde to vyplýva z geometrie v analýze.
- Ak geometria nestačí na bezpečný výpočet dráhy, nevymýšľaj súradnice;
  vlož komentár typu (DOPLNIT X/Y/Z ...).
- Nepredstieraj, že program je pripravený na okamžité spustenie.
- Nepoužívaj M30 ako dôkaz pripravenosti; môže byť použitý iba ako koniec
  testovacieho programu.
- Rezné parametre používaj ako štartovacie a rešpektuj údaje z technológie.
- Výstup musí byť praktický a čitateľný.

Vráť výsledok presne podľa JSON schémy.
`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Použi POST požiadavku.");
  }

  if (!process.env.OPENAI_API_KEY) {
    return fail(
      res,
      500,
      "OPENAI_API_KEY nie je nastavený vo Verceli."
    );
  }

  try {
    const payload =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    if (!payload.analysis && !payload.technology) {
      return fail(
        res,
        400,
        "Chýba AI analýza alebo technologický postup."
      );
    }

    const response = await fetch(`${OPENAI_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: buildPrompt(payload)
          }]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "cnc_test_program",
            strict: true,
            schema: SCHEMA
          }
        }
      })
    });

    if (!response.ok) {
      return fail(
        res,
        502,
        "Generovanie CNC programu zlyhalo.",
        await response.text()
      );
    }

    const data = await response.json();
    const text = data.output_text || "";

    let program;
    try {
      program = JSON.parse(text);
    } catch {
      return fail(
        res,
        502,
        "AI nevrátila platný CNC program vo formáte JSON.",
        text
      );
    }

    return res.status(200).json({
      success: true,
      program
    });

  } catch (err) {
    console.error(err);
    return fail(
      res,
      500,
      "Chyba servera pri tvorbe CNC programu.",
      err?.message || String(err)
    );
  }
}
