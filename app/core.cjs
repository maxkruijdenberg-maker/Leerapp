const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const MEDIA=/\.(mp4|webm|mp3|wav|png|jpe?g|webp|gif|pdf)$/i;
function assert(ok,msg){if(!ok)throw Error(msg)}
function safeRel(p){assert(typeof p==='string' && p.length<240 && !p.includes('\\') && !p.includes(':') && !p.startsWith('/') && p.split('/').every(x=>x && x!=='.'&&x!=='..'),'Ongeldig bestandspad'); return p;}
function text(s,n=200000){assert(typeof s==='string'&&s.length<=n,'Tekst ontbreekt of is te lang');return s;}
function validate(p){
 assert(p&&p.format==='makelaar-lespakket'&&p.schemaVersion===1,'Dit is geen lespakket versie 1.');
 assert(ID.test(p.id)&&ID.test(p.moduleId),'Ongeldig pakket- of module-ID');text(p.title,200);text(p.moduleTitle,200);
 assert(Array.isArray(p.topics)&&p.topics.length>0&&p.topics.length<=200,'Een pakket bevat 1 tot 200 onderwerpen.');
 const ids=new Set(); const refs=[];
 const asset=(s)=>{if(s){safeRel(s);assert(MEDIA.test(s),'Bestandstype niet toegestaan: '+s);refs.push(s)}};
 function qs(arr){assert(Array.isArray(arr)&&arr.length<=2000,'Ongeldige vragenlijst'); const qids=new Set();for(const q of arr){assert(ID.test(q.id)&&!qids.has(q.id),'Dubbel of ongeldig vraag-ID');qids.add(q.id);text(q.prompt,5000);text(q.explanation||'',10000);assert(['choice','number','open'].includes(q.type),'Onbekend vraagtype');if(q.type==='choice'){assert(Array.isArray(q.options)&&q.options.length>=2&&q.options.length<=8,'Een vraag heeft 2 tot 8 opties');q.options.forEach(s=>text(s,2000));assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length,'Antwoordindex ongeldig');} if(q.type==='number')assert(Number.isFinite(q.answer)&&Number.isFinite(q.tolerance||0)&&(q.tolerance||0)>=0,'Getalantwoord ongeldig');if(q.type==='open')text(q.answer,10000);asset(q.image);if(q.clip){assert(Number.isFinite(q.clip.start)&&q.clip.start>=0&&Number.isFinite(q.clip.end)&&q.clip.end>q.clip.start,'Ongeldige videotijden');}}}
 for(const t of p.topics){assert(ID.test(t.id)&&!ids.has(t.id),'Dubbel of ongeldig onderwerp-ID');ids.add(t.id);text(t.title,200);text(t.summary||'');asset(t.video);asset(t.pdf);asset(t.image);qs(t.questions||[]);qs(t.examQuestions||[]);const qids=[...(t.questions||[]),...(t.examQuestions||[])].map(q=>q.id);assert(new Set(qids).size===qids.length,'Gebruik verschillende IDs voor oefen- en toetsvragen');}
 asset(p.overviewVideo);qs(p.finalQuestions||[]);
 for(const q of p.finalQuestions||[])if(q.topicId)assert(ids.has(q.topicId),'Eindtoets verwijst naar onbekend onderwerp');
 if(p.examMinutes!==undefined)assert(Number.isFinite(p.examMinutes)&&p.examMinutes>=0&&p.examMinutes<=360,'Ongeldige toetsduur');
 return [...new Set(refs)];
}
function readPackage(source){
 const zip=/\.(zip|lespakket)$/i.test(source)?new AdmZip(source):null;
 let p, entries=[];
 if(zip){entries=zip.getEntries();assert(entries.length<=4000,'Te veel bestanden');let total=0;for(const e of entries){safeRel(e.entryName.replace(/\/$/,''));total+=e.header.size;assert(total<=2*1024**3,'Pakket is groter dan 2 GB');assert((e.header.attr>>>16&0xf000)!==0xa000,'Symbolische links zijn niet toegestaan');} const manifest=entries.find(e=>e.entryName==='lespakket.json');assert(manifest&&manifest.header.size<5*1024**2,'lespakket.json ontbreekt of is te groot');p=JSON.parse(manifest.getData().toString('utf8'));}
 else{assert(fs.statSync(source).size<5*1024**2,'JSON is te groot');p=JSON.parse(fs.readFileSync(source,'utf8'));}
 const refs=validate(p);const assets=new Map();
 for(const ref of refs){if(zip){const e=entries.find(e=>e.entryName===ref&&!e.isDirectory);assert(e,'Bestand ontbreekt: '+ref);assets.set(ref,()=>e.getData());}else{const f=path.resolve(path.dirname(source),ref);assert(fs.existsSync(f)&&fs.statSync(f).isFile(),'Bestand ontbreekt: '+ref);assert(fs.realpathSync(f).startsWith(fs.realpathSync(path.dirname(source))+path.sep),'Bestand buiten pakket');assets.set(ref,()=>fs.readFileSync(f));}}
 return {p,assets};
}
function atomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,typeof data==='string'?data:JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
function installPackage(source,root){const {p,assets}=readPackage(source);const dest=path.join(root,p.id),stage=dest+'.incoming';fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});try{for(const [ref,read]of assets){const f=path.join(stage,ref);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,read());}atomic(path.join(stage,'lespakket.json'),p);const old=dest+'.previous';fs.rmSync(old,{recursive:true,force:true});if(fs.existsSync(dest))fs.renameSync(dest,old);try{fs.renameSync(stage,dest)}catch(e){if(fs.existsSync(old))fs.renameSync(old,dest);throw e;}fs.rmSync(old,{recursive:true,force:true});}finally{fs.rmSync(stage,{recursive:true,force:true});}return p;}
function grade(q,a){if(q.type==='open')return null;if(q.type==='choice')return Number.isInteger(a)&&a===q.answer;if(a===null||a===undefined||String(a).trim()==='')return false;let n=Number(String(a).replace(',','.'));return Number.isFinite(n)&&Math.abs(n-q.answer)<=(q.tolerance||0);}
module.exports={validate,safeRel,readPackage,installPackage,atomic,grade,ID,MEDIA};
