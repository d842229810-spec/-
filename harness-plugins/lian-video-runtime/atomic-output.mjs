import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

function verifyAndFlush(file){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.size===0)throw new Error('渲染器没有产生非空普通文件');
  const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
export async function publishRenderedFile(output,produce){
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const temporary=path.join(path.dirname(output),'.'+path.basename(output,path.extname(output))+'-'+randomUUID()+'.partial'+path.extname(output));
  try{
    await produce(temporary);verifyAndFlush(temporary);
    // Same-volume rename replaces the file only after rendering succeeds. Do
    // not unlink the old movie first: a locked destination must leave it intact.
    fs.renameSync(temporary,output);return output;
  }finally{try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT'&&fs.existsSync(temporary))console.error('未能清理本次渲染临时文件：'+temporary);}}
}
export async function publishFrameBatch(out,frames,produce){
  fs.mkdirSync(out,{recursive:true});const id=randomUUID(),temporary=path.join(out,'.frames-'+id+'.partial'),published=path.join(out,'frames-'+id);
  fs.mkdirSync(temporary);let committed=false;
  try{
    const images=[];
    for(const row of frames){
      const name='frame-'+row.frame+'.png',file=path.join(temporary,name);
      await produce(file,row.frame);verifyAndFlush(file);
      images.push({time:row.time,path:path.join(published,name)});
    }
    fs.renameSync(temporary,published);
    await publishRenderedFile(path.join(out,'frames.json'),file=>fs.writeFileSync(file,JSON.stringify(images,null,2)));
    committed=true;return images;
  }finally{
    fs.rmSync(temporary,{recursive:true,force:true});
    if(!committed)fs.rmSync(published,{recursive:true,force:true});
  }
}
