// S00 1: AxisDir [pX_, pZ_, pY], conversion rate 0.001 m/mm.
export function motionAxes(path){return path.startsWith('/CNC/Z-axis/')?['z']:path.startsWith('/CNC/X-axis/Y-axis/')?['x','y']:path.startsWith('/CNC/X-axis/')?['x']:[];}
export function sceneMotion(values,axes,modelScale=1){const s=.001*modelScale;return [axes.includes('x')?-values.x*s:0,axes.includes('z')?values.z*s:0,axes.includes('y')?values.y*s:0];}

export class StockField{
  constructor(width=40,depth=60,height=20,nx=600,nz=600){Object.assign(this,{width,depth,height,nx,nz});this.dx=width/nx;this.dz=depth/nz;this.heights=new Float32Array((nx+1)*(nz+1));this.reset();}
  reset(){this.heights.fill(this.height);this.removedVolume=0;this.maxDepth=0;this.revision=0;this.lastChanged=[];}
  sample(x,z){if(Math.abs(x)>this.width/2||Math.abs(z)>this.depth/2)return null;const i=Math.min(this.nx,Math.max(0,Math.round((x+this.width/2)/this.dx))),j=Math.min(this.nz,Math.max(0,Math.round((z+this.depth/2)/this.dz)));return this.heights[j*(this.nx+1)+i];}
  // Sweep the scene's circular cutter footprint through a complete jog segment.
  // Inputs are millimetres in the moving stock's local coordinates, with bottom Y=0.
  carve(from,to,radius=1){
    this.lastChanged=[];
    if(![...from,...to,radius].every(Number.isFinite)||radius<=0)throw Error('Invalid cutter coordinates');
    if(Math.min(from[1],to[1])>=this.height)return 0;
    const imin=Math.max(0,Math.floor((Math.min(from[0],to[0])-radius+this.width/2)/this.dx)),imax=Math.min(this.nx,Math.ceil((Math.max(from[0],to[0])+radius+this.width/2)/this.dx));
    const jmin=Math.max(0,Math.floor((Math.min(from[2],to[2])-radius+this.depth/2)/this.dz)),jmax=Math.min(this.nz,Math.ceil((Math.max(from[2],to[2])+radius+this.depth/2)/this.dz));
    const vx=to[0]-from[0],vz=to[2]-from[2],length2=vx*vx+vz*vz;let changed=0;
    for(let j=jmin;j<=jmax;j++)for(let i=imin;i<=imax;i++){
      const px=i*this.dx-this.width/2-from[0],pz=j*this.dz-this.depth/2-from[2];let lowY;
      if(length2<1e-14){if(px*px+pz*pz>radius*radius)continue;lowY=Math.min(from[1],to[1]);}
      else{const t=(px*vx+pz*vz)/length2,perp2=Math.max(0,px*px+pz*pz-t*t*length2);if(perp2>radius*radius)continue;const margin=Math.sqrt((radius*radius-perp2)/length2),lo=Math.max(0,t-margin),hi=Math.min(1,t+margin);if(lo>hi)continue;const best=to[1]<from[1]?hi:lo;lowY=from[1]+(to[1]-from[1])*best;}
      const index=j*(this.nx+1)+i,old=this.heights[index],next=Math.max(0,Math.min(old,lowY));
      if(next<old-1e-5){this.heights[index]=next;this.lastChanged.push(index);changed++;const weight=((i===0||i===this.nx)? .5:1)*((j===0||j===this.nz)? .5:1);this.removedVolume+=(old-next)*this.dx*this.dz*weight;this.maxDepth=Math.max(this.maxDepth,this.height-next);}
    }
    if(changed)this.revision++;return changed;
  }
}
