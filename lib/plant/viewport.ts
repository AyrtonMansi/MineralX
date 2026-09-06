export type View = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; width: number; height: number };
export function screenPoint(p: Point, b: Bounds, v: View): Point {
  const scale = Math.min(b.width/v.w, b.height/v.h);
  return { x: v.x+(p.x-b.left-(b.width-v.w*scale)/2)/scale, y:v.y+(p.y-b.top-(b.height-v.h*scale)/2)/scale };
}
export function gestureView(v: View, b: Bounds, from: Point, to: Point, factor: number, maxWidth: number): View {
  const anchor=screenPoint(from,b,v);
  const width=Math.min(maxWidth,Math.max(10,v.w*factor));
  const next={...v,w:width,h:width*v.h/v.w};
  const translated=screenPoint(to,b,next);
  return {...next,x:next.x+anchor.x-translated.x,y:next.y+anchor.y-translated.y};
}
export function distance(a: Point, b: Point) { return Math.hypot(a.x-b.x,a.y-b.y); }
