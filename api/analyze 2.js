/* CNC AI Technológ – AI analysis endpoint */

export const config = { api: { bodyParser: false } };

const OPENAI_URL = "https://api.openai.com/v1";
const MODEL = "gpt-5.6-luna";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    setup: {
      type: "object",
      additionalProperties: false,
      properties: {
        clamping: { type: "string" },
        datum: { type: "string" },
        supports: { type: "string" },
        risks: { type: "string" }
      },
      required: ["clamping", "datum", "supports", "risks"]
    },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          order: { type: "integer" },
          name: { type: "string" },
          description: { type: "string" }
        },
        required: ["order", "name", "description"]
      }
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          operation: { type: "string" },
          tool: { type: "string" },
          holder: { type: "string" },
          insert: { type: "string" },
          vc: { type: "string" },
          feed: { type: "string" },
          rpm: { type: "string" }
        },
        required: ["operation", "tool", "holder", "insert", "vc", "feed", "rpm"]
      }
    },
    material: { type: "string" },
    stock: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } }
  },
  required: ["setup", "operations", "tools", "material", "stock", "warnings", "notes"]
};

function fail(res, status, message, details = "") {
  return res.status(status).json({ success: false, error: message, details });
}

function dataUrlParts(dataUrl, fileName = "drawing.pdf") {
  const value = String(dataUrl || "");
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/s);

  if (match) {
    return {
      mime: match[1].toLowerCase(),
      base64: match[2],
      fileName
    };
  }

  const lower = fileName.toLowerCase();
  const mime = lower.endsWith(".pdf")
    ? "application/pdf"
    : lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";

  return { mime, base64: value, fileName };
}

async function createOpenAIFile(fileData, fileName, mime) {
  const bytes = Buffer.from(fileData, "base64");
  const form = new FormData();

  form.append(
    "file",
    new Blob([bytes], { type: mime }),
    fileName || "drawing.pdf"
  );

  form.append("purpose", "user_data");

  const response = await fetch(`${OPENAI_URL}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI upload ${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}

function buildPrompt({ operation, material, stock, machine, fileName }) {
  return `
Si senior CNC technológ pre obrábanie kovov.

Analyzuj technický výkres ${fileName || "výkres"} a priprav podklady pre aplikáciu CNC AI Technológ.

Typ obrábania: ${operation || "Sústruženie"}
Materiál zadaný používateľom: ${material || "neuvedený"}
Polotovar: ${stock || "neuvedený"}
Stroj: ${machine || "neuvedený"}

PRAVIDLÁ:
1. Čítaj iba údaje, ktoré sú skutočne viditeľné alebo jednoznačne vyplývajú z výkresu.
2. Nevymýšľaj chýbajúce rozmery, tolerancie, závity ani materiál.
3. Navrhni praktický technologický postup pre zadanú operáciu.
4. Pri sústružení uvažuj hrubovanie, dokončenie, vŕtanie, závitovanie, drážky a podobne iba vtedy, ak ich vyžaduje výkres.
5. Pri frézovaní uvažuj zarovnanie, hrubovanie, dokončenie, vŕtanie, závity, drážky a kontúry iba podľa výkresu.
6. Pri nástrojoch preferuj MASAM/BÖHLERIT a následne Sandvik, Walter, Seco alebo Ceratizit.
7. Presné katalógové číslo uveď iba vtedy, keď je spoľahlivo určiteľné. Inak napíš „overiť v katalógu“.
8. Rezné parametre sú iba ŠTARTOVACIE hodnoty. Pri sústružení uvádzaj Vc, f a otáčky; pri frézovaní Vc, fz, posuv a otáčky.
9. Ak nie je možné bezpečne určiť parameter, uveď „nutné doplniť“.
10. Neuvádzaj CNC kód. Ten sa vytvorí v ďalšom kroku.
11. Do risks/warnings uveď kritické veci, ktoré musí overiť technológ/operator.

Výstup vráť presne podľa JSON schémy.
`;
}

export default async function handler(req, res) {
  try {
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

    const rawBody =
      typeof req.body === "string" ? req.body : null;

    const body = rawBody
      ? JSON.parse(rawBody)
      : req.body || {};

    const fileName = body.fileName || "drawing.pdf";
    const fileData = body.fileData || body.data;
    const operation =
      body.type || body.operation || "Sústruženie";
    const material = body.material || "";
    const stock = body.stock || "";
    const machine = body.machine || "";

    if (!fileData) {
      return fail(res, 400, "Výkres nebol odoslaný.");
    }

    const { mime, base64 } =
      dataUrlParts(fileData, fileName);

    let inputFile;

    if (
      mime === "application/pdf" ||
      /\.pdf$/i.test(fileName)
    ) {
      const uploaded = await createOpenAIFile(
        base64,
        fileName,
        "application/pdf"
      );

      inputFile = {
        type: "input_file",
        file_id: uploaded.id
      };
    } else if (
      /^image\/(png|jpeg|jpg|webp)$/.test(mime)
    ) {
      inputFile = {
        type: "input_image",
        image_url:
          `data:${mime === "image/jpg" ? "image/jpeg" : mime};base64,${base64}`,
        detail: "high"
      };
    } else {
      return fail(
        res,
        400,
        "Podporované sú PDF, PNG, JPG/JPEG a WEBP."
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
            content: [
              inputFile,
              {
                type: "input_text",
                text: buildPrompt({
                  operation,
                  material,
                  stock,
                  machine,
                  fileName
                })
              }
            ]
          }],
          text: {
            format: {
              type: "json_schema",
              name: "cnc_plan",
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
        "OpenAI analýza zlyhala.",
        await response.text()
      );
    }

    const data = await response.json();
    const text = data.output_text || "";

    let plan;

    try {
      plan = JSON.parse(text);
    } catch {
      return fail(
        res,
        502,
        "AI nevrátila platný JSON.",
        text
      );
    }

    return res.status(200).json({
      success: true,
      file: fileName,
      operation,
      material,
      stock,
      machine,
      ...plan
    });

  } catch (err) {
    console.error(err);

    return fail(
      res,
      500,
      "Chyba servera pri AI analýze.",
      err?.message || String(err)
    );
  }
}
