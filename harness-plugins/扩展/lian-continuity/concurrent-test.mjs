import {ContinuityStore} from './store.mjs';const s=new ContinuityStore(process.argv[2]);for(let n=0;n<100;n++)s.event('concurrent',{n,writer:process.argv[3]},{dedupe:'concurrent:'+n});s.close();
