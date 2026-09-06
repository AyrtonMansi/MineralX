'use client';
import { useEffect, useRef, type Dispatch, type SetStateAction, type PointerEvent, type RefObject } from 'react';
import { gestureView, screenPoint, distance, type View, type Point } from '@/lib/plant/viewport';

type Touch = Point & { start: Point; target: Element };
export function usePlanGestures(svg: RefObject<SVGSVGElement|null>, view: View, setView: Dispatch<SetStateAction<View>>, maxWidth: number, active: boolean, onTap: (point: Point, target: Element)=>void) {
  const pointers=useRef(new Map<number,Touch>());
  const moved=useRef(false), suppressClick=useRef(false);
  const current=useRef({view,onTap});
  useEffect(()=>{current.current={view,onTap};},[view,onTap]);
  useEffect(()=>{
    const el=svg.current;
    if (!el || !active) return;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
      const pixelDelta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?500:1);
      const point={x:event.clientX,y:event.clientY};
      setView(v=>gestureView(v,el.getBoundingClientRect(),point,point,Math.exp(Math.max(-.35,Math.min(.35,pixelDelta*.0015))),maxWidth));
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return ()=>{el.removeEventListener('wheel',wheel);pointers.current.clear();};
  },[svg,active,maxWidth,setView]);
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button!==0 && e.pointerType==='mouse') return;
    if (pointers.current.size===0) { moved.current=false;suppressClick.current=false; }
    const p={x:e.clientX,y:e.clientY};
    pointers.current.set(e.pointerId,{...p,start:p,target:e.target as Element});
    if(pointers.current.size>1)moved.current=true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const old=pointers.current.get(e.pointerId);if(!old)return;
    const next={...old,x:e.clientX,y:e.clientY};
    const prior=[...pointers.current.values()];
    pointers.current.set(e.pointerId,next);
    if(distance(old.start,next)>4)moved.current=true;
    if(!moved.current)return;
    const b=e.currentTarget.getBoundingClientRect();
    const list=[...pointers.current.values()];
    if(list.length===2 && prior.length===2) {
      const middle=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const ratio=distance(prior[0],prior[1])/Math.max(1,distance(list[0],list[1]));
      setView(v=>gestureView(v,b,middle(prior[0],prior[1]),middle(list[0],list[1]),ratio,maxWidth));
    } else if(list.length===1) setView(v=>gestureView(v,b,old,next,1,maxWidth));
  }
  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const p=pointers.current.get(e.pointerId);
    if(p && !moved.current && pointers.current.size===1) {
      current.current.onTap(screenPoint({x:e.clientX,y:e.clientY},e.currentTarget.getBoundingClientRect(),current.current.view),p.target);
    }
    pointers.current.delete(e.pointerId);
    suppressClick.current=true;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return { onPointerDown,onPointerMove,onPointerUp,
    onPointerCancel:(e:PointerEvent<SVGSVGElement>)=>{pointers.current.delete(e.pointerId);moved.current=true;suppressClick.current=true;},
    onClickCapture:(e:React.MouseEvent<SVGSVGElement>)=>{if(suppressClick.current && e.detail!==0){e.stopPropagation();e.preventDefault();}},
  };
}
