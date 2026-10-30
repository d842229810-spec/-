import React from 'react';
import {AbsoluteFill,Audio,Composition,Img,interpolate,registerRoot,spring,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {TransitionSeries,linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
const font='Microsoft YaHei UI, Microsoft YaHei, sans-serif';
const palette={ink:'#143d52',blue:'#1b82bb',cream:'#f7f4eb',muted:'#557382'};
const Scene=({index,headline,caption,image})=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig(),enter=spring({frame:f,fps,config:{damping:22,stiffness:100}}),drift=interpolate(f,[0,90],[0,-24]);
 return <AbsoluteFill style={{background:index===1?'#deeff4':palette.cream,color:palette.ink,fontFamily:font,overflow:'hidden'}}>
  <div style={{position:'absolute',width:1200,height:1200,border:'2px solid #99cbd9',borderRadius:'50%',left:-430+index*180,top:480+drift}}/>
  <div style={{position:'absolute',width:800,height:800,background:'radial-gradient(circle,#84c9e355,transparent 68%)',right:-170,top:500+drift}}/>
  <div style={{position:'absolute',top:110,left:90,fontSize:30,letterSpacing:5,color:palette.muted}}>LIAN / 涟的创作桌</div>
  <div style={{position:'absolute',top:index===2?250:230,left:90,right:90,fontSize:index===2?92:88,fontWeight:800,lineHeight:1.25,whiteSpace:'pre-line',opacity:enter,transform:`translateY(${(1-enter)*45}px)`}}>{headline}</div>
  <div style={{position:'absolute',left:94,top:index===2?570:480,width:95,height:8,background:palette.blue,transform:`scaleX(${enter})`,transformOrigin:'left'}}/>
  <Img src={staticFile(image)} style={{position:'absolute',height:index===1?1150:1060,width:860,objectFit:'contain',bottom:180,left:index===1?-120:210,opacity:enter,transform:`translate(${(1-enter)*110}px,${drift}px) rotate(${index===1?-4:2}deg)`}}/>
  {index===1?<div style={{position:'absolute',right:80,top:800,width:300,fontSize:36,lineHeight:1.9,color:palette.muted}}>角色参考<br/>场景与动作<br/>同一份声音</div>:null}
  {index===2?<div style={{position:'absolute',left:95,top:730,fontSize:34,color:palette.muted}}>起因 → 尝试 → 变化</div>:null}
  <div style={{position:'absolute',bottom:105,left:90,right:90,borderTop:'2px solid #c5d6d9',paddingTop:28,fontSize:30,color:palette.muted}}>{caption}</div>
 </AbsoluteFill>;
};
const Film=({scenes,audio,captions=[]})=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig(),caption=captions.find(c=>f>=c.startMs/1000*fps&&f<c.endMs/1000*fps);
 return <AbsoluteFill><TransitionSeries>{scenes.flatMap((s,i)=>[
  ...(i?[<TransitionSeries.Transition key={'t'+i} presentation={fade()} timing={linearTiming({durationInFrames:15})}/>]:[]),
  <TransitionSeries.Sequence key={i} durationInFrames={Math.round((s.durationSeconds??3)*fps)}><Scene {...s} index={i}/></TransitionSeries.Sequence>
 ])}</TransitionSeries>
 {audio?<Audio src={staticFile(audio)} volume={1}/>:null}
 {caption?<div style={{position:'absolute',bottom:170,left:90,right:90,textAlign:'center',fontFamily:font,fontSize:42,fontWeight:700,color:'white',background:'#143d52e8',padding:'16px 20px',borderRadius:12}}>{caption.text}</div>:null}
 </AbsoluteFill>;
};
const defaults={scenes:[{headline:'涟的创作桌',caption:'本地制作环境验收',image:'assets/character.png'},{headline:'同一个角色，\n不同的镜头。',caption:'固定角色 · 独立参考图',image:'assets/character.png'},{headline:'把素材，\n接成故事。',caption:'Remotion / 本地渲染',image:'assets/character.png'}],audio:null,captions:[]};
const Root=()=> <Composition id="LianFilm" component={Film} width={1080} height={1920} fps={30} durationInFrames={240} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:props.scenes.reduce((n,s)=>n+Math.round((s.durationSeconds??3)*30),0)-Math.max(0,props.scenes.length-1)*15})}/>;
registerRoot(Root);
