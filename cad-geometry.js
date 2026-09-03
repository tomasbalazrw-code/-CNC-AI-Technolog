(function(global){
  'use strict';

  function extension(name){return String(name||'').split('.').pop().toLowerCase();}
  function finite(n){return Number.isFinite(n);}

  function parseObj(text){
    const vertices=[];
    String(text).split(/\r?\n/).forEach(line=>{
      const m=line.trim().match(/^v\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/);
      if(m){const p=[Number(m[1]),Number(m[2]),Number(m[3])];if(p.every(finite))vertices.push(...p);}
    });
    return vertices;
  }

  function parseStl(buffer){
    const view=new DataView(buffer);
    if(buffer.byteLength>=84){
      const triangles=view.getUint32(80,true);
      if(84+triangles*50<=buffer.byteLength){
        const vertices=[];let o=84;
        for(let i=0;i<triangles;i++,o+=50){
          for(let v=0;v<3;v++){
            const p=o+12+v*12;
            vertices.push(view.getFloat32(p,true),view.getFloat32(p+4,true),view.getFloat32(p+8,true));
          }
        }
        return vertices;
      }
    }
    return parseObj(new TextDecoder().decode(buffer).replace(/\bvertex\s+/g,'v '));
  }

  async function parseOcct(buffer,ext){
    if(typeof global.occtimportjs!=='function')throw new Error('CAD jadro OpenCascade sa nepodarilo načítať. Obnov stránku a skús znova.');
    const occt=await global.occtimportjs();
    const bytes=new Uint8Array(buffer);
    const params={linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:0.05,angularDeflection:0.35};
    const result=(ext==='step'||ext==='stp')?occt.ReadStepFile(bytes,params):occt.ReadIgesFile(bytes,params);
    if(!result||result.success!==true)throw new Error('CAD jadro nedokázalo model prečítať. Skontroluj, či súbor nie je poškodený.');
    const vertices=[];
    (result.meshes||[]).forEach(mesh=>{
      const a=mesh&&mesh.attributes&&mesh.attributes.position&&mesh.attributes.position.array;
      if(Array.isArray(a)||ArrayBuffer.isView(a))for(let i=0;i<a.length;i++)if(finite(Number(a[i])))vertices.push(Number(a[i]));
    });
    return vertices;
  }

  function bounds(vertices){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<vertices.length;i+=3)for(let a=0;a<3;a++){const n=vertices[i+a];if(n<min[a])min[a]=n;if(n>max[a])max[a]=n;}
    return {min,max,size:max.map((n,i)=>n-min[i])};
  }

  function profileFromVertices(vertices,axisName){
    if(vertices.length<9)throw new Error('Model neobsahuje dostatok geometrických bodov.');
    const axis={X:0,Y:1,Z:2}[String(axisName||'Z').toUpperCase()]??2;
    const side=[0,1,2].filter(x=>x!==axis);
    const b=bounds(vertices),start=b.min[axis],length=b.size[axis];
    if(!(length>0))throw new Error('Model nemá platnú dĺžku v zvolenej osi sústruženia.');
    const center=[0,1,2].map(i=>(b.min[i]+b.max[i])/2);
    const binCount=Math.max(40,Math.min(240,Math.round(length/0.5)));
    const radius=new Array(binCount+1).fill(null);
    for(let i=0;i<vertices.length;i+=3){
      const z=vertices[i+axis],u=vertices[i+side[0]]-center[side[0]],v=vertices[i+side[1]]-center[side[1]];
      const k=Math.max(0,Math.min(binCount,Math.round((z-start)/length*binCount)));
      const r=Math.sqrt(u*u+v*v);if(radius[k]===null||r>radius[k])radius[k]=r;
    }
    for(let i=0;i<radius.length;i++)if(radius[i]===null){
      let l=i-1,r=i+1;while(l>=0&&radius[l]===null)l--;while(r<radius.length&&radius[r]===null)r++;
      if(l>=0&&r<radius.length)radius[i]=radius[l]+(radius[r]-radius[l])*(i-l)/(r-l);else radius[i]=l>=0?radius[l]:(r<radius.length?radius[r]:0);
    }
    const raw=radius.map((r,i)=>({z:Number((i/binCount*length).toFixed(3)),diameter:Number((2*r).toFixed(3))}));
    const tolerance=Math.max(0.02,Math.max(...radius)*0.001),profile=[raw[0]];
    for(let i=1;i<raw.length-1;i++){
      const prev=profile[profile.length-1],next=raw[i+1];
      if(Math.abs(raw[i].diameter-prev.diameter)>tolerance||Math.abs(next.diameter-raw[i].diameter)>tolerance)profile.push(raw[i]);
    }
    profile.push(raw[raw.length-1]);
    const maxDiameter=Math.max(...raw.map(p=>p.diameter));
    return {
      processed:true,mode:'turning-envelope',axis:String(axisName||'Z').toUpperCase(),unit:'mm',
      vertexCount:Math.floor(vertices.length/3),bounds:{min:b.min.map(n=>Number(n.toFixed(3))),max:b.max.map(n=>Number(n.toFixed(3))),size:b.size.map(n=>Number(n.toFixed(3)))},
      length:Number(length.toFixed(3)),maxDiameter:Number(maxDiameter.toFixed(3)),centerline:center.map(n=>Number(n.toFixed(3))),profile,
      tolerance:Number(tolerance.toFixed(3)),warning:'Profil je vypočítaná rotačná obálka triangulovaného modelu. Pred výrobou ho musí technológ porovnať s výkresom a CAM simuláciou.'
    };
  }

  function millingMeshFromVertices(vertices){
    if(vertices.length<9)throw new Error('Model neobsahuje dostatok geometrických bodov.');
    const b=bounds(vertices),count=Math.floor(vertices.length/3);
    const sampleLimit=360,step=Math.max(1,Math.floor(count/sampleLimit)),surfaceSamples=[];
    for(let i=0;i<count&&surfaceSamples.length<sampleLimit;i+=step){
      const p=i*3;
      surfaceSamples.push([Number(vertices[p].toFixed(3)),Number(vertices[p+1].toFixed(3)),Number(vertices[p+2].toFixed(3))]);
    }
    return {
      processed:true,mode:'milling-mesh',unit:'mm',vertexCount:count,
      bounds:{min:b.min.map(n=>Number(n.toFixed(3))),max:b.max.map(n=>Number(n.toFixed(3))),size:b.size.map(n=>Number(n.toFixed(3)))},
      surfaceSamples,
      warning:'Ide o geometrický prehľad triangulovaného modelu pre plánovanie frézovania. Dráhy musí technológ overiť v CAM simulácii a na konkrétnom stroji.'
    };
  }

  async function process(file,axisName,processType){
    const ext=extension(file&&file.name),buffer=await file.arrayBuffer();let vertices;
    if(ext==='obj')vertices=parseObj(new TextDecoder().decode(buffer));
    else if(ext==='stl')vertices=parseStl(buffer);
    else if(['step','stp','iges','igs'].includes(ext))vertices=await parseOcct(buffer,ext);
    else throw new Error('Geometrické spracovanie V24 podporuje STEP/STP, IGES/IGS, STL a OBJ.');
    return String(processType||'turning').toLowerCase()==='milling'?millingMeshFromVertices(vertices):profileFromVertices(vertices,axisName);
  }

  global.CNCCadGeometry={process,profileFromVertices,millingMeshFromVertices};
})(window);
