/* CNC AI Technológ – complete UI and generated-result translation */
const OPENAI_URL='https://api.openai.com/v1';
const MODEL='gpt-5.6-luna';
const LANGUAGES={en:'English',sk:'Slovak',cs:'Czech',de:'German',pl:'Polish',hu:'Hungarian'};
const SCHEMA={type:'object',additionalProperties:false,properties:{translations:{type:'array',items:{type:'string'}}},required:['translations']};
function fail(res,status,error,details=''){return res.status(status).json({success:false,error,details});}
function outputText(d){if(typeof d.output_text==='string'&&d.output_text.trim())return d.output_text;return(d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('\n');}
module.exports=async function handler(req,res){
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'Method not allowed.');}
  const apiKey=String(process.env.OPENAI_API_KEY||process.env.OPENAI_KEY||'').trim().replace(/^["']|["']$/g,'');
  if(!apiKey)return fail(res,500,'Translation service is not configured.');
  const b=typeof req.body==='string'?JSON.parse(req.body):(req.body||{}),target=String(b.targetLanguage||'en');
  const strings=Array.isArray(b.strings)?b.strings.map(x=>String(x)).slice(0,80):[];
  if(!LANGUAGES[target])return fail(res,400,'Unsupported target language.');
  if(!strings.length)return res.status(200).json({success:true,translations:[]});
  const prompt=`Translate every item in the JSON array into ${LANGUAGES[target]}.
Return exactly one translated string for every input item, in the same order.
Translate the complete natural-language UI text, including CNC explanations and generated analysis.
Never translate manufacturer names, catalogue/order codes, material standards, CNC G/M codes, dimensions, units, variable symbols (vc, n, f, ap, ae), file extensions or control names.
Do not summarise, omit or add information. Preserve punctuation, numbers, line breaks and placeholders.
If an item is already in ${LANGUAGES[target]} or consists only of a technical code, return it unchanged.

INPUT JSON:
${JSON.stringify(strings)}`;
  const response=await fetch(`${OPENAI_URL}/responses`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model:MODEL,input:prompt,text:{format:{type:'json_schema',name:'ui_translations',strict:true,schema:SCHEMA}}})});
  const raw=await response.text();if(!response.ok)return fail(res,502,'Translation failed.',raw.slice(0,1500));
  const text=outputText(JSON.parse(raw));let data;try{data=JSON.parse(text)}catch(_){return fail(res,502,'Invalid translation response.');}
  if(!Array.isArray(data.translations)||data.translations.length!==strings.length)return fail(res,502,'Incomplete translation response.');
  return res.status(200).json({success:true,translations:data.translations});
 }catch(error){console.error(error);return fail(res,500,'Translation server error.',error?.message||String(error));}
};
