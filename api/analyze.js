export const config = {
  api: {
    bodyParser: false,
  },
};

const OPENAI_URL = "https://api.openai.com/v1";
const MODEL = "gpt-5.6-luna";

const CNC_SCHEMA = {
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
        overall_dimensions: { type: "string" },
        key_dimensions: { type: "array", items: { type: "string" } },
        tolerances: { type: "array", items: { type: "string" } },
        surface_finish: { type: "array", items: { type: "string" } },
        threads: { type: "array", items: { type: "string" } },
        grooves: { type: "array", items: { type: "string" } },
        radii_angles: { type: "array", items: { type: "string" } },
        detected_features: { type: "array", items: { type: "string" } },
      },
      required: [
        "part_name", "operation", "material", "stock", "overall_dimensions",
        "key_dimensions", "tolerances", "surface_finish", "threads",
        "grooves", "radii_angles", "detected_features",
      ],
    },
    setup: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommendation: { type: "string" },
        workholding: { type: "array", items: { type: "string" } },
        datum: { type: "string" },
        checks_before_machining: { type: "array", items: { type: "string" } },
      },
      required: ["recommendation", "workholding", "datum", "checks_before_machining"],
    },
    technology: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          operation_no: { type: "integer" },
          name: { type: "string" },
          side: { type: "string" },
          description: { type: "string" },
          tool_ref: { type: "string" },
          control: { type: "string" },
        },
        required: ["operation_no", "name", "side", "description", "tool_ref", "control"],
      },
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool_no: { type: "string" },
          operation: { type: "string" },
          category: { type: "string" },
          tool: { type: "string" },
          insert: { type: "string" },
          holder: { type: "string" },
          geometry: { type: "string" },
          grade: { type: "string" },
          manufacturer: { type: "string" },
          confidence: { type: "string" },
          note: { type: "string" },
          selection_basis: { type: "string" },
          compatibility_check: { type: "string" },
        },
        required: [
          "tool_no", "operation", "category", "tool", "insert", "holder",
          "geometry", "grade", "manufacturer", "confidence", "note",
          "selection_basis", "compatibility_check",
        ],
      },
    },
    parameters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool_no: { type: "string" },
          operation: { type: "string" },
          cutting_mode: { type: "string" },
          vc_m_min: { type: "number" },
          rpm: { type: "number" },
          feed_mm_rev: { type: "number" },
          feed_mm_min: { type: "number" },
          ap_mm: { type: "number" },
          ae_mm: { type: "number" },
          coolant: { type: "string" },
          parameter_status: { type: "string" },
          note: { type: "string" },
        },
        required: [
          "tool_no", "operation", "cutting_mode", "vc_m_min", "rpm",
          "feed_mm_rev", "feed_mm_min", "ap_mm", "ae_mm", "coolant",
          "parameter_status", "note",
        ],
      },
    },
    program: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string" },
        controller_assumption: { type: "string" },
        code: { type: "string" },
        required_before_run: { type: "array", items: { type: "string" } },
      },
      required: ["status", "controller_assumption", "code", "required_before_run"],
    },
    missing_information: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "drawing_summary", "setup", "technology", "tools",
    "parameters", "program", "missing_information", "warnings",
  ],
};

function sendError(res, status, error, details = "") {
  return res.status(status).json({ success: false, error, details });
}

async function getFormData(req) {
  if (typeof req.formData === "function") {
    return await req.formData();
  }
  return await new Response(req).formData();
}

async function openaiUpload(file) {
  const bytes = await file.arrayBuffer();
  const blob = new Blob([bytes], {
    type: file.type || "application/octet-stream",
  });

  const uploadForm = new FormData();
  uploadForm.append("file", blob, file.name || "vykres.pdf");
  uploadForm.append("purpose", "user_data");

  const response = await fetch(`${OPENAI_URL}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: uploadForm,
  });

  if (!response.ok) {
    throw new Error(`OpenAI upload ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

function buildPrompt(operation, stock, filename, material, machine, requirements, selectedInsertFamily, selectedInsertSize, selectedInsertBody) {
  const turning =
    operation.toLowerCase().includes("sústru") ||
    operation.toLowerCase().includes("soustru");
  const process = turning ? "CNC SÚSTRUŽENIE" : "CNC FRÉZOVANIE";

  const standardTurning = `
SÚSTRUŽENIE – BEŽNÉ ŠTANDARDNÉ RODINY:
CNMG, DNMG, WNMG, TNMG, SNMG, VNMG, CCMT, DCMT, TCMT, VBMT, VCMT,
SCMT, RCMT, CCGT, DCGT, TCGT, MGMN, 16ER, 16IR.
`;

  const standardMilling = `
FRÉZOVANIE – BEŽNÉ ŠTANDARDNÉ RODINY:
APKT, APMT, SEKT, SEHT, SPMT, RPMT, RDMT, RPKT, SNMX, ONMU,
LNMU, XNMU, XDKT, WNMU, SDMT.
`;

  return `
Si senior CNC technológ pre ${process}. Analyzuj priložený technický výkres ako podklad pre praktický technologický návrh.

SÚBOR: ${filename}
OPERÁCIA: ${operation}
MATERIÁL ZADANÝ POUŽÍVATEĽOM: ${material || "neuvedený"}
POLOTOVAR: ${stock || "neuvedený"}
STROJ / RIADENIE: ${machine || "neuvedené"}
ĎALŠIE POŽIADAVKY: ${requirements || "neuvedené"}

POŽADOVANÉ SPRÁVANIE – AUTOMATICKÝ VÝBER NÁSTROJOV:
1. Technológ nemusí vyberať plátok ani držiak ručne. TY ich vyber automaticky podľa materiálu, geometrie súčiastky, konkrétnej operácie, tolerancií, drsnosti, hĺbky rezu, stability upnutia a stroja.
2. Najprv urč operáciu a požadovanú geometriu nástroja. Až potom vyber konkrétnu štandardnú rodinu VBD/plátku a kompatibilný držiak alebo telo frézy.
3. Nikdy nekombinuj nekompatibilný plátok s držiakom/telesom. Pole compatibility_check musí stručne potvrdiť kompatibilitu.
4. Pri sústružení vyber vhodný ISO typ držiaka (napr. PCLNR, PDJNR, PCBNR, SVJBR, SDJCR, MCLNR a podobne) podľa konkrétnej VBD a smeru/typu obrábania. Neuvádzaj konkrétny katalógový kód, ak ho nemožno spoľahlivo určiť.
5. Pri frézovaní vyber vhodné frézovacie teleso podľa typu plátku a operácie. Pri VHM nástrojoch plátok neuvádzaj, ak sa nepoužíva.
6. Triedu/povlak voľ podľa materiálu len ako odporúčanie. Ak chýba presná katalógová trieda výrobcu, napíš „overiť v katalógu“.
7. Preferuj štandardné ISO riešenia. Konkrétneho výrobcu (Sandvik, Walter, Seco, Kennametal, Ceratizit, ISCAR, Mitsubishi, Tungaloy, Dormer Pramet, BÖHLERIT atď.) uvádzaj iba vtedy, keď je výber odôvodnený; inak použi „štandard ISO / výrobca podľa dostupnosti“.
8. Ak používateľ už vybral konkrétny plátok alebo telo, ber to ako preferenciu, ale ak je to nevhodné alebo nekompatibilné, upozorni na to a navrhni správnu alternatívu.
9. Vráť každý potrebný nástroj samostatne podľa operácie. Pri každom uveď tool_no, operation, category, tool, insert, holder, geometry, grade, manufacturer, confidence, note, selection_basis a compatibility_check.
10. Nevymýšľaj rozmery. Ak výkres nie je čitateľný, označ údaj ako neuvedený a daj ho do missing_information.
11. Rezné parametre sú iba konzervatívne ŠTARTOVACIE hodnoty. Pri sústružení Vc, f a otáčky; pri frézovaní Vc, fz, posuv, ae/ap a otáčky.
12. CNC program je iba VZOROVÝ. Bez úplne potvrdeného stroja, riadenia, nulového bodu, nástrojovej tabuľky a upnutia nesmieš tvrdiť, že je pripravený na okamžité spustenie.
13. Ak je operácia sústruženie, nevymýšľaj frézovacie operácie a naopak.

${turning ? standardTurning : standardMilling}

VOLITEĽNÁ PREFERENCIA Z UI:
Plátok – rodina: ${selectedInsertFamily || "AI vyberie automaticky"}
Plátok – rozmer: ${selectedInsertSize || "AI vyberie automaticky"}
Telo/držiak: ${selectedInsertBody || "AI vyberie automaticky"}

DÔLEŽITÉ:
- Automatický výber je nadradený ručnému výberu iba vtedy, keď je ručný výber nevhodný alebo nekompatibilný.
- Pri nejasnosti vyber bezpečnejší štandardný nástroj a jasne uveď, čo musí technológ/operator pred výrobou overiť.
- Odpoveď musí byť výhradne podľa zadanej JSON schémy.
`;
}


export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "Použi POST požiadavku.");
    }

    if (!process.env.OPENAI_API_KEY) {
      return sendError(res, 500, "OPENAI_API_KEY nie je nastavený vo Verceli.");
    }

    const formData = await getFormData(req);
    const file = formData.get("file");
    const operation = String(formData.get("operation") || "Sústruženie");
    const stock = String(formData.get("stock") || "");
    const material = String(formData.get("material") || "");
    const machine = String(formData.get("machine") || formData.get("controller") || "");
    const requirements = String(formData.get("requirements") || formData.get("notes") || "");
    const selectedInsertFamily = String(formData.get("selectedInsertFamily") || "");
    const selectedInsertSize = String(formData.get("selectedInsertSize") || "");
    const selectedInsertBody = String(formData.get("selectedInsertBody") || "");
    const autoToolSelection = String(formData.get("autoToolSelection") || "true");
    const manualToolOverride = String(formData.get("manualToolOverride") || "");

    if (!file || typeof file.arrayBuffer !== "function") {
      return sendError(res, 400, "Nebolo odoslané platné PDF/JPG/PNG s výkresom.");
    }

    const filename = file.name || "vykres.pdf";
    const mime = String(file.type || "application/pdf").toLowerCase();
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];

    if (!allowed.includes(mime) && !/\.(pdf|png|jpe?g|webp)$/i.test(filename)) {
      return sendError(
        res,
        400,
        "Podporované formáty sú PDF, PNG, JPG/JPEG a WEBP."
      );
    }

    let content;

    if (mime === "application/pdf" || /\.pdf$/i.test(filename)) {
      const uploadedFile = await openaiUpload(file);
      content = {
        type: "input_file",
        file_id: uploadedFile.id,
      };
    } else {
      const bytes = Buffer.from(await file.arrayBuffer());
      const base64 = bytes.toString("base64");
      const imageMime = mime.startsWith("image/") ? mime : "image/jpeg";
      content = {
        type: "input_image",
        image_url: `data:${imageMime};base64,${base64}`,
        detail: "high",
      };
    }

    const response = await fetch(`${OPENAI_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: "user",
            content: [
              content,
              {
                type: "input_text",
                text: buildPrompt(
                  operation,
                  stock,
                  filename,
                  material,
                  machine,
                  requirements,
                  selectedInsertFamily,
                  selectedInsertSize,
                  selectedInsertBody
                ),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "cnc_analysis",
            description: "Štruktúrovaná CNC analýza technického výkresu.",
            strict: true,
            schema: CNC_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return sendError(res, 502, "AI analýza zlyhala.", errorText);
    }

    const result = await response.json();
    const outputText = result.output_text || "";
    let analysis;

    try {
      analysis = JSON.parse(outputText);
    } catch {
      return res.status(502).json({
        success: false,
        error: "AI vrátila neplatný štruktúrovaný výsledok.",
        raw: outputText,
      });
    }

    return res.status(200).json({
      success: true,
      file: filename,
      operation,
      material,
      stock,
      machine,
      auto_tool_selection: autoToolSelection !== "false",
      manual_tool_override: manualToolOverride,
      model: MODEL,
      analysis,
    });
  } catch (error) {
    console.error("CNC AI analyze error:", error);
    return sendError(
      res,
      500,
      "Chyba servera pri AI analýze.",
      error?.message || String(error)
    );
  }
}
