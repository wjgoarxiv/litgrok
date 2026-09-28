import React from 'react';
import {AbsoluteFill, Composition, Img, interpolate, Easing, registerRoot, staticFile, useCurrentFrame} from 'remotion';

const pixels=['000011110000','001111111100','011100001110','111001100111','110011110011','110111111011','110011110011','111001100111','011100001110','001111111100','000011110000'];
export function Cover({dark=false,mobile=false,variant='restrained',blur=16,midBlur=5,grain=0.035,glow=0.18,rimLight=0.42}) {
  const frame=useCurrentFrame(), phase=frame/299*Math.PI*2;
  const enter=interpolate(frame,[0,32,260,299],[12,0,0,12],{easing:Easing.inOut(Easing.cubic),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const amplitude=variant==='expressive'?1.7:1;
  const ink=dark?'light':'dark', color=dark?'#f7f5ef':'#16252b', field=dark?'#112329':'#f5f2e8';
  return <AbsoluteFill style={{background:field,color,overflow:'hidden'}}>
    <Img data-depth="far" src={staticFile('background.png')} style={{position:'absolute',inset:-30,width:'calc(100% + 60px)',height:'calc(100% + 60px)',objectFit:'cover',filter:`blur(${blur}px)`,transform:`translateY(${Math.sin(phase)*6*amplitude}px) scale(1.03)`}}/>
    <Img data-depth="middle" src={staticFile('background.png')} style={{position:'absolute',left:'18%',top:'7%',width:'84%',height:'69%',objectFit:'cover',objectPosition:'center',opacity:0.35,filter:`blur(${midBlur}px)`,transform:`translateY(${Math.sin(phase)*3*amplitude}px) scale(1.02)`}}/>
    <AbsoluteFill style={{background:dark?'linear-gradient(105deg,rgba(17,35,41,.98) 8%,rgba(17,35,41,.93) 54%,rgba(17,35,41,.55))':'linear-gradient(105deg,rgba(245,242,232,.99) 8%,rgba(245,242,232,.94) 54%,rgba(245,242,232,.62))'}}/>
    <Img data-depth="foreground" src={staticFile('background.png')} style={{position:'absolute',left:-30,bottom:0,width:'calc(100% + 60px)',height:'32%',objectFit:'cover',objectPosition:'center bottom',opacity:0.34,filter:'none',transform:`translateY(${Math.sin(phase)*2*amplitude}px)`}}/>
    <AbsoluteFill style={{background:'radial-gradient(ellipse at 86% 20%,#ffa76d,transparent 60%)',opacity:glow*(1+Math.sin(phase)*0.2)}}/>
    <AbsoluteFill data-lighting="rim" style={{background:'linear-gradient(112deg,transparent 42%,rgba(255,206,155,.12) 48%,rgba(255,206,155,.34) 50%,rgba(255,206,155,.12) 52%,transparent 58%)',opacity:rimLight*(1+Math.sin(phase)*0.12),mixBlendMode:'screen'}}/>
    <svg width="100%" height="100%" style={{position:'absolute',opacity:grain}}><defs><pattern id="grain" width="97" height="101" patternUnits="userSpaceOnUse">{Array.from({length:32},(_,i)=><rect key={i} x={(i*31)%97} y={(i*47)%101} width="2" height="2" fill={color}/>)}</pattern></defs><rect width="100%" height="100%" fill="url(#grain)"/></svg>
    <div style={{position:'absolute',inset:mobile?48:72,borderTop:`1px solid ${color}66`,borderBottom:`1px solid ${color}66`}}/>
    <Img src={staticFile(`label-${ink}-ink.svg`)} style={{position:'absolute',left:mobile?52:78,top:mobile?90:120,width:mobile?360:430}}/>
    <div style={{position:'absolute',left:mobile?48:72,top:mobile?240:280,transform:`translateY(${enter}px)`,width:mobile?704:970}}>
      <Img src={staticFile(`title-${ink}-ink.svg`)} style={{width:'100%'}}/>
      <Img src={staticFile(`subtitle-${ink}-ink.svg`)} style={{width:mobile?610:680,marginTop:24}}/>
    </div>
    <svg aria-label="Original pixel observatory" viewBox="0 0 192 192" style={{position:'absolute',width:mobile?255:320,height:mobile?255:320,right:mobile?60:72,bottom:mobile?78:110,transform:`translateY(${Math.sin(phase)*10*amplitude}px)`,imageRendering:'pixelated'}}>
      {pixels.flatMap((row,y)=>[...row].map((v,x)=>v==='1'?<rect key={`${x}-${y}`} x={x*12+24} y={y*12+20} width="12" height="12" fill={(x+y)%3===0?'#e77746':dark?'#dce9d4':'#335951'}/>:null))}
      <path d="M24 170H168M96 154V180" fill="none" stroke={color} strokeWidth="3"/>
    </svg>
  </AbsoluteFill>;
}
function Root() {return <>{[false,true].flatMap(mobile=>[false,true].map(dark=><Composition key={`${mobile}-${dark}`} id={`${mobile?'Mobile':'Wide'}${dark?'Dark':'Light'}`} component={Cover} width={mobile?800:1600} height={mobile?1000:800} fps={60} durationInFrames={300} defaultProps={{mobile,dark}}/>))}</>;}
registerRoot(Root);
