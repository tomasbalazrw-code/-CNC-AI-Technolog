/* CNC AI Technológ – real technical drawing analysis */

const OPENAI_URL = "https://api.openai.com/v1";
const MODEL = "gpt-5.6-luna";

function getOpenAIKey() {
  const raw = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_TOKEN || "";
  return String(raw).trim().replace(/^["']|["']$/g, "").trim();
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    drawing_read: { type: "string" },
    geometry: { type: "object", additionalProperties: false, properties: {
      coordinate_system: { type: "string" },
      dimensions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        name: { type: "string" }, value: { type: "string" }, tolerance: { type: "string" }, reference: { type: "string" }
      }, required: ["name", "value", "tolerance", "reference"] } },
      features: { type: "array", items: { type: "string" } },
      profile_sequence: { type: "array", items: { type: "string" } }
    }, required: ["coordinate_system", "dimensions", "features", "profile_sequence"] },
    setup: { type: "object", additionalProperties: false, properties: {
      clamping: { type: "string" }, datum: { type: "string" }, supports: { type: "string" }, risks: { type: "string" }
    }, required: ["clamping", "datum", "supports", "risks"] },
    recommended_tool: { type: "object", additionalProperties: false, properties: {
      family: { type: "string" }, size: { type: "string" }, holder: { type: "string" },
      body: { type: "string" }, reason: { type: "string" }
    }, required: ["family", "size", "holder", "body", "reason"] },
    operations: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      order: { type: "integer" }, name: { type: "string" }, description: { type: "string" }
    }, required: ["order", "name", "description"] } },
    tools: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      operation: { type: "string" }, tool: { type: "string" }, holder: { type: "string" }, insert: { type: "string" }, vc: { type: "string" }, feed: { type: "string" }, rpm: { type: "string" }
    }, required: ["operation", "tool", "holder", "insert", "vc", "feed", "rpm"] } },
    material: { type: "string" }, stock: { type: "string" },
    critical_dimensions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } }
  },
  required: ["drawing_read", "geometry", "setup", "recommended_tool", "operations", "tools", "material", "stock", "critical_dimensions", "warnings", "notes"]
};

function fail(res, status, message, details = "") {
  return res.status(status).json({ success: false, error: message, details });
}

function parseFileData(value, fileName) {
  const text = String(value || "");
  const match = text.match(/^data:([^;,]+)(?:;[^,]*)?,([\s\S]*)$/);
  if (match) return { mime: match[1].toLowerCase(), base64: decodeURIComponent(match[2]) };
  const lower = String(fileName || "drawing.pdf").toLowerCase();
  const mime = lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return { mime, base64: text };
}

async function uploadFile(base64, fileName, mime, apiKey) {
  const bytes = Buffer.from(String(base64).replace(/\s/g, ""), "base64");
  if (!bytes.length) throw new Error("Výkres je prázdny alebo poškodený.");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), fileName || "drawing.pdf");
  form.append("purpose", "user_data");
  const r = await fetch(`${OPENAI_URL}/files`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  const t = await r.text();
  if (!r.ok) throw new Error(`OpenAI upload ${r.status}: ${t}`);
  return JSON.parse(t);
}

function prompt(body, fileName) {
  return `Si SENIOR CNC technológ. SKUTOČNE PREČÍTAJ A VYHODNOŤ PRILOŽENÝ TECHNICKÝ VÝKRES ${fileName}.

Vstup:
- Typ obrábania: ${body.type || body.operation || "Sústruženie"}
- Materiál: ${body.material || "neuvedený"}
- Polotovar: ${body.stock || "neuvedený"}
- Stroj/riadenie: ${body.machine || "neuvedený"}

POVINNÉ:
1. Prečítaj konkrétne rozmery, priemery, dĺžky, tolerancie, závity, rádiusy, uhly, drsnosti, geometrické tolerancie a poznámky z výkresu.
2. Vytvor explicitnú geometriu: každý dôležitý rozmer zapíš do geometry.dimensions s hodnotou a toleranciou; do geometry.features zapíš všetky rozpoznané prvky (priemer, čelo, zápich, závit, rádius, kužeľ, otvor, drážka atď.); pri rotačnom diele zapíš profile_sequence v poradí od referenčného bodu.
3. Žiadna všeobecná ukážka a žiadne prázdne polia. Výsledok musí vychádzať z výkresu.
3. Ak údaj nie je čitateľný alebo nie je uvedený, napíš „NIE JE UVEDENÉ/ČITATEĽNÉ“. Nevymýšľaj si ho.
4. Navrhni reálny technologický postup v správnom poradí.
5. Navrhni konkrétne nástroje; preferuj MASAM/BÖHLERIT, potom Sandvik, Walter, Seco alebo Ceratizit. Katalógové číslo len ak je spoľahlivo určiteľné, inak „overiť v katalógu“.
6. Uveď štartovacie rezné podmienky. Sústruženie: Vc, f, otáčky. Frézovanie: Vc, fz, posuv, otáčky. Ak chýba materiál, označ parametre ako orientačné.
7. Uveď kritické rozmery na kontrolu po obrábaní.
8. Uveď konkrétne riziká upnutia, vibrácií, výbehu, kolízie alebo tolerancií, ak sa týkajú dielu.
9. Nevytváraj CNC kód.
10. Odpoveď musí byť založená iba na skutočne dostupných údajoch z výkresu a vstupe používateľa.`;
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of data.output || []) for (const content of item.content || []) {
    if (typeof content.text === "string") parts.push(content.text);
  }
  return parts.join("\n");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(res, 405, "Použi POST požiadavku."); }
    const apiKey = getOpenAIKey();
    if (!apiKey) return fail(res, 500, "OPENAI_API_KEY nie je nastavený vo Verceli.", "Vercel → Project → Settings → Environment Variables → OPENAI_API_KEY. Po pridaní kľúča vytvor nový Production deployment.");

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const fileName = body.fileName || "drawing.pdf";
    const fileData = body.fileData || body.data;
    if (!fileData) return fail(res, 400, "Výkres nebol odoslaný.");

    const { mime, base64 } = parseFileData(fileData, fileName);
    let inputFile;
    if (mime === "application/pdf" || /\.pdf$/i.test(fileName)) {
      const uploaded = await uploadFile(base64, fileName, "application/pdf", apiKey);
      inputFile = { type: "input_file", file_id: uploaded.id };
    } else if (/^image\/(png|jpeg|jpg|webp)$/.test(mime)) {
      const imageMime = mime === "image/jpg" ? "image/jpeg" : mime;
      inputFile = { type: "input_image", image_url: `data:${imageMime};base64,${base64}`, detail: "high" };
    } else return fail(res, 400, "Podporované sú PDF, PNG, JPG/JPEG a WEBP.");

    const r = await fetch(`${OPENAI_URL}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [inputFile, { type: "input_text", text: prompt(body, fileName) }] }],
        text: { format: { type: "json_schema", name: "cnc_plan", strict: true, schema: SCHEMA } }
      })
    });

    const responseText = await r.text();
    if (!r.ok) return fail(res, 502, "OpenAI analýza zlyhala.", responseText);
    const data = JSON.parse(responseText);
    const outputText = extractOutputText(data);
    if (!outputText) return fail(res, 502, "OpenAI nevrátilo výsledok analýzy.", responseText.slice(0, 4000));

    let plan;
    try { plan = JSON.parse(outputText); }
    catch { return fail(res, 502, "OpenAI vrátilo neplatný formát analýzy.", outputText.slice(0, 4000)); }

    return res.status(200).json({
      success: true, analyzed: true, file: fileName,
      operation: body.type || body.operation || "Sústruženie",
      material: body.material || plan.material || "",
      stock: body.stock || plan.stock || "",
      machine: body.machine || "",
      control: body.control || "",
      ...plan
    });
  } catch (err) {
    console.error(err);
    return fail(res, 500, "Chyba servera pri AI analýze.", err?.message || String(err));
  }
}
