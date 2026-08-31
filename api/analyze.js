export const config = {
  api: { bodyParser: false },
};

const OPENAI_URL = "https://api.openai.com/v1";
const MODEL = "gpt-5.6-luna";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    drawing_summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        part_name: { type: "string" },
        operation: { type: "string" },
        material: { type: "string" },
        stock: { type: "string" },
        dimensions: { type: "array", items: { type: "string" } },
        tolerances: { type: "array", items: { type: "string" } },
        threads: { type: "array", items: { type: "string" } },
        grooves: { type: "array", items: { type: "string" } },
        surface_finish: { type: "array", items: { type: "string" } },
        features: { type: "array", items: { type: "string" } }
      },
      required: [
        "part_name","operation","material","stock","dimensions",
        "tolerances","threads","grooves","surface_finish","features"
      ]
    },
    setup: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommendation: { type: "string" },
        workholding: { type: "array", items: { type: "string" } },
        datum: { type: "string" },
        checks: { type: "array", items: { type: "string" } }
      },
      required: ["recommendation","workholding","datum","checks"]
    },
    technology: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          no: { type: "integer" },
          operation: { type: "string" },
          description: { type: "string" },
          tool_ref: { type: "string" },
          inspection: { type: "string" }
        },
        required: ["no","operation","description","tool_ref","inspection"]
      }
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool_ref: { type: "string" },
          operation: { type: "string" },
          category: { type: "string" },
          manufacturer: { type: "string" },
          tool: { type: "string" },
          insert: { type: "string" },
          holder: { type: "string" },
          grade: { type: "string" },
          geometry: { type: "string" },
          confidence: { type: "string" },
          verification: { type: "string" }
        },
        required: [
          "tool_ref","operation","category","manufacturer","tool",
          "insert","holder","grade","geometry","confidence","verification"
        ]
      }
    },
    parameters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool_ref: { type: "string" },
          operation: { type: "string" },
          vc_m_min: { type: "number" },
          rpm: { type: "number" },
          feed_mm_rev: { type: "number" },
          feed_mm_min: { type: "number" },
          fz_mm: { type: "number" },
          ap_mm: { type: "number" },
          ae_mm: { type: "number" },
          coolant: { type: "string" },
          status: { type: "string" },
          note: { type: "string" }
        },
        required: [
          "tool_ref","operation","vc_m_min","rpm","feed_mm_rev",
          "feed_mm_min","fz_mm","ap_mm","ae_mm","coolant","status","note"
        ]
      }
    },
    warnings: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } }
  },
  required: [
    "drawing_summary","setup","technology","tools",
    "parameters","warnings","missing_information"
  ]
};

function error(res, status, message, details = "") {
  return res.status(status).json({
    success: false,
    error: message,
    details
  });
}

async function getForm(req) {
  if (typeof req.formData === "function") return req.formData();
  return new Response(req).formData();
}

async function uploadPDF(file) {
  const bytes = await file.arrayBuffer();
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: file.type || "application/pdf" }),
    file.name || "drawing.pdf"
  );
  form.append("purpose", "user_data");

  const r = await fetch(`${OPENAI_URL}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!r.ok) {
    throw new Error(`PDF upload ${r.status}: ${await r.text()}`);
  }

  return r.json();
}

function prompt(operation, stock, filename) {
  return `
Si senior CNC technológ. Analyzuj technický výkres ${filename}.

Typ obrábania: ${operation}
Polotovar: ${stock || "neuvedený"}

ÚLOHA:
1. Prečítaj výkres a urč iba údaje, ktoré sú skutočne viditeľné.
2. Urči materiál, rozmery, tolerancie, závity, drážky, povrchy a technologické prvky.
3. Navrhni kompletný technologický postup.
4. Navrhni nástroje pre sústruženie alebo frézovanie.
5. Preferuj výrobcov v tomto poradí:
   MASAM / nástroje dostupné cez Masam,
   BÖHLERIT,
   potom Sandvik, Walter, Seco, Ceratizit.
6. Presné katalógové číslo uvádzaj iba vtedy, keď ho vieš spoľahlivo určiť.
7. Ak štandardný nástroj nestačí, navrhni aj riešenie špeciálneho nástroja a uveď, čo musí výrobca nástroja potvrdiť.
8. Rezné parametre uvádzaj ako konzervatívne ŠTARTOVACIE hodnoty.
9. Pri sústružení používaj f v mm/ot.
10. Pri frézovaní používaj fz v mm/zub a posuv v mm/min.
11. Ak chýba priemer, počet zubov, materiál, stroj alebo iný údaj potrebný na bezpečný výpočet, uveď to v missing_information.
12. Nikdy nevymýšľaj nečitateľný rozmer.
13. Nezamieňaj sústruženie s frézovaním.

NÁSTROJE:
Pri každom nástroji uveď výrobcu, typ nástroja, VBD, držiak, geometriu a triedu.
Ak katalógové číslo nie je isté, napíš "overiť v katalógu" namiesto vymysleného čísla.

PARAMETRE:
Uveď Vc, otáčky, posuv, ap a pri frézovaní aj ae/fz.
Označ ich ako štartovacie.

Bez konkrétneho stroja, riadenia, nulového bodu a nástrojovej tabuľky nevytváraj tvrdenie, že ide o program pripravený na okamžité spustenie.

Výsledok vráť výhradne podľa zadanej JSON schémy.
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return error(res, 405, "Použi POST.");
    }

    if (!process.env.OPENAI_API_KEY) {
      return error(
        res,
        500,
        "OPENAI_API_KEY nie je nastavený vo Verceli."
      );
    }

    const form = await getForm(req);
    const file = form.get("file");
    const operation = String(
      form.get("operation") || "Sústruženie"
    );
    const stock = String(form.get("stock") || "");

    if (!file || typeof file.arrayBuffer !== "function") {
      return error(res, 400, "Výkres nebol odoslaný.");
    }

    const filename = file.name || "drawing.pdf";
    const mime = String(
      file.type || "application/pdf"
    ).toLowerCase();

    let inputFile;

    if (
      mime === "application/pdf" ||
      /\.pdf$/i.test(filename)
    ) {
      const uploaded = await uploadPDF(file);
      inputFile = {
        type: "input_file",
        file_id: uploaded.id
      };
    } else if (
      /^image\/(png|jpeg|jpg|webp)$/.test(mime)
    ) {
      const bytes = Buffer.from(await file.arrayBuffer());
      inputFile = {
        type: "input_image",
        image_url:
          `data:${mime};base64,${bytes.toString("base64")}`,
        detail: "high"
      };
    } else {
      return error(
        res,
        400,
        "Podporované sú PDF, PNG, JPG/JPEG a WEBP."
      );
    }

    const r = await fetch(`${OPENAI_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{
          role: "user",
          content: [
            inputFile,
            {
              type: "input_text",
              text: prompt(operation, stock, filename)
            }
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "cnc_drawing_analysis",
            strict: true,
            schema: SCHEMA
          }
        }
      })
    });

    if (!r.ok) {
      return error(
        res,
        502,
        "OpenAI analýza zlyhala.",
        await r.text()
      );
    }

    const result = await r.json();
    const text = result.output_text || "";

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      return res.status(502).json({
        success: false,
        error: "AI nevrátila platný JSON.",
        raw: text
      });
    }

    return res.status(200).json({
      success: true,
      file: filename,
      operation,
      stock,
      analysis
    });

  } catch (e) {
    console.error(e);
    return error(
      res,
      500,
      "Chyba servera pri AI analýze.",
      e?.message || String(e)
    );
  }
}
