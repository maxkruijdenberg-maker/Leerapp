const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const clone = value => structuredClone(value);
const wait = () => new Promise(resolve => setTimeout(resolve, 20));
(async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8'), {runScripts:'outside-only',url:'http://localhost'});
  const w=dom.window,d=w.document;
  w.structuredClone=structuredClone;w.confirm=()=>true;
  w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const demo=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/demo/lespakket.json'),'utf8'));
  demo.topics[0].videos=[{id:'extra',title:'Extra video',file:'assets/second.webm'}];
  const legacy=demo.topics[0];
  const choice={id:'part-choice',type:'choice',prompt:'Welke mogelijkheid klopt?',options:['Eerste','Tweede'],answer:1,explanation:'De tweede past bij de gegeven uitleg.',source:'Eigen bron'};
  const open={id:'part-open',type:'open',prompt:'Leg de keuze uit.',answer:'Een eigen onderbouwing.',explanation:'Vergelijk met de uitleg.'};
  const structured={id:'structured',title:'Leren in kleine stappen',subtopics:[
    {id:'eerste',title:'De eerste stap',summary:'# Eerste uitleg\n\nEen **belangrijk** begrip.\n\n- Eén kenmerk\n- Nog een kenmerk',questions:[choice,open],videos:[{id:'part-film',title:'Uitleg bij dit deel',file:'assets/deel.webm'}],examples:[{id:'beeld',title:'Een voorbeeld',file:'assets/vormen.png',caption:'Kijk naar dit detail.',source:'Eigen illustratie <script>geen code</script>'}]},
    {id:'tweede',title:'De tweede stap',summary:'Een kort volgend stukje.',assignmentText:'Maak een eigen schets en vergelijk.',questions:[]}
  ],examQuestions:[{id:'exam-eigen',type:'choice',prompt:'Wat weet je van het hele onderwerp?',options:['Antwoord A','Antwoord B'],answer:0,explanation:'A volgt uit beide delen.',clip:{videoId:'part-film',start:1,end:3}}]};
  demo.topics.push(structured);
  let state={packages:[demo],progress:{topics:{[demo.id+'/'+legacy.id]:{position:45,duration:200}},questions:{}}}, serial=0,fullscreen=true;
  const calls=[];let cancelDeletePart=false;
  const reply=()=>clone({...state,modules:[...new Map(state.packages.map(p=>[p.moduleId,{id:p.moduleId,title:p.moduleTitle}])).values()]});
  const topic=r=>state.packages.find(p=>p.id===r.packageId).topics.find(t=>t.id===r.topicId);
  const migrate=t=>{
    if(!Array.isArray(t.subtopics)){
      const old={id:'legacy',title:'Bestaande uitleg en opdrachten'};
      for(const k of ['summary','pdf','questions','assignmentText','assignments','video','videos','examples'])if(k in t){old[k]=t[k];delete t[k];}
      t.subtopics=[old];
    }
    return t.subtopics;
  };
  const part=r=>migrate(topic(r)).find(s=>s.id===r.subtopicId);
  w.academy={
    state:async()=>reply(),save:async p=>{state.progress=clone(p);},
    windowControl:async command=>{calls.push(['window',command]);if(command==='toggleFullscreen')fullscreen=!fullscreen;return{fullscreen};},
    newModule:async r=>{const id='module-'+ ++serial;state.packages.push({format:'makelaar-lespakket',schemaVersion:1,id,moduleId:id,moduleTitle:r.title,title:r.title,topics:[]});return reply();},
    renameModule:async r=>{state.packages.filter(p=>p.moduleId===r.moduleId).forEach(p=>p.moduleTitle=r.title);return reply();},
    deleteModule:async id=>{state.packages=state.packages.filter(p=>p.moduleId!==id);return reply();},
    newTopic:async r=>{state.packages.find(p=>p.moduleId===r.moduleId).topics.push({id:'topic-'+ ++serial,title:r.title,subtopics:[],examQuestions:[]});return reply();},
    deleteTopic:async r=>{calls.push(["deleteTopic",clone(r)]);const p=state.packages.find(p=>p.id===r.packageId);p.topics=p.topics.filter(t=>t.id!==r.topicId);return reply();},
    updateTopic:async r=>{calls.push(['updateTopic',clone(r)]);for(const k of ['title','summary','assignmentText','questions','examQuestions'])if(k in r)topic(r)[k]=clone(r[k]);if('summary'in r)delete topic(r).pdf;return reply();},
    newSubtopic:async r=>{calls.push(['newSubtopic',clone(r)]);migrate(topic(r)).push({id:'part-'+ ++serial,title:r.title,summary:'',questions:[],examples:[]});return reply();},
    updateSubtopic:async r=>{calls.push(['updateSubtopic',clone(r)]);for(const k of ['title','summary','assignmentText','questions','examples'])if(k in r)part(r)[k]=clone(r[k]);if('summary'in r)delete part(r).pdf;return reply();},
    deleteSubtopic:async r=>{if(cancelDeletePart)return null;topic(r).subtopics=migrate(topic(r)).filter(s=>s.id!==r.subtopicId);return reply();},
    moveSubtopic:async r=>{const a=migrate(topic(r)),i=a.findIndex(s=>s.id===r.subtopicId),j=i+(r.direction==='up'?-1:1);[a[i],a[j]]=[a[j],a[i]];return reply();},
    attach:async r=>{calls.push(['attach',clone(r)]);const t=r.subtopicId?part(r):topic(r);if(r.kind==='example'){t.examples||=[];t.examples.push({id:'uploaded-'+ ++serial,title:r.title,caption:r.caption,source:r.source,file:'assets/eigen.png'});}else if(r.kind==='summary'){t.summary='Geïmporteerde tekst';delete t.pdf;}return reply();},
    removeAttachment:async r=>{calls.push(['removeAttachment',clone(r)]);const t=r.subtopicId?part(r):topic(r);if(r.kind==='example')t.examples=t.examples.filter(e=>e.id!==r.id);return reply();},
    prompt:async()=>'',backup:async()=>true,restore:async()=>reply(),exportPackage:async()=>true,
  };
  w.eval(fs.readFileSync(path.join(__dirname,'../app/renderer.js'),'utf8'));await wait();
  const click=async selector=>{const e=d.querySelector(selector);assert(e,'Ontbreekt: '+selector);assert(!e.disabled,'Uitgeschakeld: '+selector);e.click();await wait();};
  const input=(selector,value,type='input')=>{const e=d.querySelector(selector);assert(e);e.value=value;e.dispatchEvent(new w.Event(type,{bubbles:true}));};
  const submit=async selector=>{d.querySelector(selector).dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await wait();};
  const text=()=>d.querySelector('main').textContent;
  const overview=async()=>{await click('[data-action="module"]');await click('[data-action="topic"][data-t="structured"]');};
  assert.match(text(),/Jouw eigen studeerkamer/);assert.equal(d.querySelectorAll('.window-controls button').length,3);
  await click('[data-action="window"][data-command="toggleFullscreen"]');assert.equal(fullscreen,false);
  assert.equal(d.querySelector('#modules [data-id="bt2"]'),null);
  // Legacy import is readable as one part, and its video seek and text editor remain usable.
  await click('[data-action="topic"]');assert.match(text(),/1 deelonderwerpen/);
  assert(d.querySelector('[data-action="exam"]').disabled);
  await click('[data-action="openPart"][data-s="legacy"]');
  assert(d.querySelector('article.prose'));assert.equal(d.querySelectorAll('[data-action="selectVideo"]').length,2);
  const video=d.querySelector('#lesson-video');Object.defineProperty(video,'duration',{value:200,configurable:true});video.dispatchEvent(new w.Event('loadedmetadata'));assert.equal(video.currentTime,45);
  await click('[data-action="editSummary"]');input('#content-text','# Bijgewerkt\n\nBestaande tekst blijft bewerkbaar.');await submit('#content-form');assert.match(text(),/Bestaande tekst blijft bewerkbaar/);
  assert(calls.some(([kind])=>kind==='updateTopic'));
  // Topic overview and explanatory figures are rendered safely as native content.
  await overview();assert.match(text(),/2 deelonderwerpen/);assert(d.querySelector('[data-action="exam"]').disabled);
  await click('[data-action="openPart"][data-s="eerste"]');
  assert.equal(d.querySelectorAll('#lesson-body iframe').length,0);assert.match(text(),/belangrijk/);assert.equal(d.querySelectorAll('.example-card img').length,1);assert.equal(d.querySelectorAll('.example-card script').length,0);
  await click('[data-action="viewExample"]');assert(d.querySelector('#modal').open);assert.match(d.querySelector('.example-expanded img').src,/vormen\.png$/);assert.match(d.querySelector('.example-expanded').textContent,/Kijk naar dit detail/);assert.equal(d.querySelectorAll('.example-expanded script').length,0);await click('[data-action="close"]');
  await click('[data-action="editExample"]');input('#example-caption','Let op de verhouding.');input('#example-source','Eigen bron 2026');await submit('#example-form');assert.match(text(),/Let op de verhouding/);
  await click('[data-action="addExample"]');input('#example-title','Tweede afbeelding');input('#example-caption','Nog een concreet detail.');input('#example-source','Eigen foto');await submit('#example-form');assert.equal(d.querySelectorAll('.example-card img').length,2);
  const upload=calls.find(([kind,r])=>kind==='attach'&&r.kind==='example')[1];assert.equal(upload.subtopicId,'eerste');assert.equal(upload.source,'Eigen foto');
  await click('[data-action="removeAttachment"][data-kind="example"][data-id^="uploaded-"]');assert.equal(d.querySelectorAll('.example-card img').length,1);
  // CRUD and order changes leave all other parts intact.
  await click('[data-action="topic"]');await click('[data-action="newSubtopic"]');input('#subtopic-title','Tijdelijk deel');await submit('#subtopic-form');assert.match(text(),/Tijdelijk deel/);
  const added=state.packages[0].topics.find(t=>t.id==='structured').subtopics.at(-1).id;
  await click('[data-action="topic"]');await click(`[data-action="moveSubtopic"][data-s="${added}"][data-direction="up"]`);
  assert.equal(state.packages[0].topics.find(t=>t.id==='structured').subtopics[1].id,added);
  cancelDeletePart=true;await click(`[data-action="deleteSubtopic"][data-s="${added}"]`);
  assert.equal(state.packages[0].topics.find(t=>t.id==='structured').subtopics.length,3);assert.match(text(),/Tijdelijk deel/);
  cancelDeletePart=false;await click(`[data-action="deleteSubtopic"][data-s="${added}"]`);assert.equal(state.packages[0].topics.find(t=>t.id==='structured').subtopics.length,2);
  // Add/edit a question in a part; answers live at stable topic/question progress keys.
  await click('[data-action="openPart"][data-s="eerste"]');await click('[data-action="partStep"][data-step="work"]');
  assert(d.querySelector('[data-action="completePart"]').disabled);
  await click('[data-action="editQuestion"][data-id="part-choice"]');input('#question-explanation','Een heldere toelichting.');await submit('#question-form');
  const first=state.packages[0].topics.find(t=>t.id==='structured').subtopics[0];assert.notEqual(first.questions[0].id,'part-choice');
  assert(calls.some(([kind,r])=>kind==='updateSubtopic'&&r.subtopicId==='eerste'&&r.questions));
  await click('[data-action="partStep"][data-step="read"]');await click('[data-action="readPart"]');
  assert(d.querySelector('[data-action="completePart"]').disabled);
  await click('[data-action="practice"]');await click('[data-action="answer"][data-index="0"]');await click('[data-action="check"]');assert.match(text(),/Nog even aanscherpen/);await click('[data-action="next"]');
  input('#answer-text','Mijn eigen uitleg.');await click('[data-action="check"]');assert(d.querySelector('[data-action="next"]').disabled);await click('[data-action="self"][data-value="yes"]');await click('[data-action="next"]');
  assert.match(text(),/OEFENSESSIE AFGEROND/);await click('[data-action="quizReturn"]');assert(!d.querySelector('[data-action="completePart"]').disabled);
  await click('[data-action="completePart"]');assert.match(d.querySelector('h1').textContent,/De tweede stap/);
  // Manual work without interactive questions has an explicit completion route.
  await click('[data-action="readPart"]');assert.match(text(),/Maak een eigen schets/);await click('[data-action="completePart"]');
  assert.match(text(),/2 van 2/);assert(!d.querySelector('[data-action="exam"]').disabled);
  const progress=state.progress.topics[demo.id+'/structured'];assert(progress.subtopics.eerste.read&&progress.subtopics.eerste.done&&progress.subtopics.tweede.done);
  assert(state.progress.questions[demo.id+'/structured/'+first.questions[0].id]);
  // Final exam is a separate pool and does not reveal answers before submission.
  await click('[data-action="exam"]');assert.match(text(),/Wat weet je van het hele onderwerp/);assert(!text().includes('A volgt uit beide delen.'));await click('[data-action="answer"][data-index="0"]');await click('[data-action="next"]');
  assert.match(text(),/100%/);assert.match(text(),/A volgt uit beide delen/);assert.equal(state.progress.attempts.length,1);assert(state.progress.topics[demo.id+'/structured'].done);
  await click('[data-action="resultClip"]');assert.match(d.querySelector('#hint-video').src,/deel\.webm$/);await click('[data-action="close"]');
  await click('[data-action="quizReturn"]');assert.match(text(),/2 van 2/);
  // Changing an assignment invalidates completion rather than unlocking the final exam on stale work.
  await click('[data-action="openPart"][data-s="eerste"]');await click('[data-action="partStep"][data-step="work"]');
  await click('[data-action="editQuestion"][data-list="questions"][data-id]');input('#question-prompt','Een inhoudelijk gewijzigde vraag?');await submit('#question-form');
  await click('[data-action="topic"]');assert(d.querySelector('[data-action="exam"]').disabled);
  // New modules/topics remain freely creatable; empty topics do not unlock an exam.
  await click('[data-action="newModule"]');input('#name-title','Mijn nieuwe module');await submit('#name-form');await click('[data-action="new"]');input('#name-title','Een leeg onderwerp');await submit('#name-form');
  assert.match(text(),/Verdeel dit onderwerp/);assert(d.querySelector('[data-action="exam"]').disabled);
  await click('[data-action="newSubtopic"]');input('#subtopic-title','Start hier');await submit('#subtopic-form');
  await click('[data-action="editSummary"]');input('#content-text','Mijn eigen uitleg.');await submit('#content-form');assert.match(text(),/Mijn eigen uitleg/);
  assert.equal(d.querySelectorAll('#lesson-body iframe').length,0);
  await click('[data-action="topic"]');await click('[data-action="deleteTopic"]');
  assert.match(d.querySelector('h1').textContent,/Mijn nieuwe module/);assert.match(text(),/Hier begint jouw module/);
  assert.equal(state.packages[0].topics.length,2);assert(calls.some(([kind])=>kind==='deleteTopic'));
  console.log('DOM-controle geslaagd: oude lessen, deelonderwerpen CRUD, lokale voorbeelden, uitleg → opdrachten → volgend deel, voortgang en eindtoets.');
  dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
