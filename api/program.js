/* CNC AI Technológ – testovací CNC program endpoint */

const OPENAI_URL = "https://api.openai.com/v1";
const MODEL = "gpt-5.6-luna";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    program: { type: "string" },
    notes: { type: "string" }
  },
  required: ["program", "notes"]
};

function fail(res, status, message, details = "") {
  return res.status(status).json({
    success: false,
    error: message,
    details
  });
}

function buildPrompt(payload) {
  const control = payload.control || "FANUC / ISO – TEST";
  const zero = payload.zero || "nutné doplniť";
  const plan = payload.plan || {};

  return `
Si senior CNC programátor a technológ.

Vytvor TESTOVACÍ CNC PROGRAM podľa technologického plánu nižšie.

RIADENIE:
${control}

NULOVÝ BOD:
${zero}

TECHNOLOGICKÝ PLÁN:
${JSON.stringify(plan, null, 2)}

PRAVIDLÁ:
- Program je iba na kontrolu technológom/operatorom.
- Nikdy netvrď, že je pripravený na okamžité spustenie.
- Ak chýbajú súradnice, priemery, nástrojová tabuľka alebo bezpečná rovina,
  nevymýšľaj ich.
- Chýbajúce hodnoty označ priamo v programe komentárom:
  (DOPLNIT ...)
- Použi FANUC/ISO štýl iba ako testovací formát.
- Zachovaj operácie a nástroje z technologického plánu.
- Rezné parametre ber ako štartovacie.
- Na začiatok programu vlož jasný bezpečnostný komentár.
- Na koniec môže byť M30.
- V poli notes uveď všetky dôležité údaje, ktoré musí technológ/operator
  pred použitím overiť.

Vráť presne JSON podľa zadanej schémy.
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

    if (!payload.plan) {
      return fail(
        res,
        400,
        "Chýba technologický plán."
      );
    }

    const response = await fetch(
      `${OPENAI_URL}/responses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`
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
      }
    );

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

    let result;

    try {
      result = JSON.parse(text);
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
      program: result.program,
      notes: result.notes
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
