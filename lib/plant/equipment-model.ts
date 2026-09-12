import type {Equipment,EquipmentArchetype,EquipmentModelStatus} from './model';

export type EquipmentRenderProfile={
 archetype:EquipmentArchetype;
 modelStatus:EquipmentModelStatus;
 heightM:number;
 rotationDeg:number;
 dimensions:Record<string,number>;
 source:'explicit'|'inferred';
 rationale:string;
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const named=(equipment:Equipment)=>`${equipment.id} ${equipment.name}`.toLowerCase();

export function inferEquipmentArchetype(equipment:Equipment):EquipmentArchetype{
 const value=named(equipment);
 if(/stockpile|rom pile|ore pile/.test(value))return 'stockpile';
 if(/\bvsi\b|vertical.*impact|impact.*crusher/.test(value))return 'vertical_impact_crusher';
 if(/hammer.*crusher|crusher.*hammer|hammer mill|mill crusher/.test(value))return 'hammer_crusher';
 if(/screen|grizzly|vibrat/.test(value))return 'vibrating_screen';
 if(/russell|\bjig\b|j3/.test(value))return 'jig';
 if(/knudsen|kneudsen|bowl concentrator|centrifugal bowl/.test(value))return 'knudsen_bowl';
 if(/sluice/.test(value))return 'sluice';
 if(/shaker|shaking table|wilfley|gemini table/.test(value))return 'shaker_table';
 if(/spiral concentrator|\bspiral\b/.test(value))return 'spiral_concentrator';
 if(/cyclone|hydrocyclone/.test(value))return 'cyclone';
 if(/hopper|surge bin|feed bin|ore bin/.test(value))return 'hopper';
 if(/tank|water store|process water|sump/.test(value))return 'tank';
 if(/pump/.test(value))return 'pump';
 if(/generator|genset/.test(value))return 'generator';
 if(/solar|pv array/.test(value))return 'solar_array';
 if(/container|control room|office|workshop/.test(value))return 'container';
 if(/conveyor drive|drive station/.test(value))return 'conveyor_drive';
 if(/platform/.test(value))return 'platform';
 return 'generic';
}

function inferredHeight(equipment:Equipment,archetype:EquipmentArchetype){
 const width=Math.max(.25,equipment.w),depth=Math.max(.25,equipment.h),span=Math.max(width,depth),minor=Math.min(width,depth);
 switch(archetype){
  case 'stockpile':return clamp(span*.32,3.5,8);
  case 'hopper':return clamp(minor*.9,2.8,6.5);
  case 'hammer_crusher':return clamp(minor*.85,2.4,5.5);
  case 'vertical_impact_crusher':return clamp(minor*1.08,2.8,6);
  case 'vibrating_screen':return clamp(minor*.55,1.8,3.8);
  case 'jig':return clamp(minor*.72,1.8,3.6);
  case 'knudsen_bowl':return clamp(minor*.8,1.7,3.4);
  case 'sluice':return clamp(minor*.32,.65,1.5);
  case 'shaker_table':return clamp(minor*.42,.85,1.5);
  case 'spiral_concentrator':return clamp(minor*1.6,2.2,5.2);
  case 'cyclone':return clamp(minor*1.5,3.5,7.5);
  case 'tank':return clamp(minor*1.05,3.0,10);
  case 'pump':return clamp(minor*.55,1.0,2.2);
  case 'generator':return clamp(minor*.65,1.8,3.2);
  case 'solar_array':return .55;
  case 'container':return clamp(minor*.45,2.4,3.2);
  case 'conveyor_drive':return clamp(minor*.6,1.2,2.8);
  case 'platform':return clamp(minor*.35,.9,2.2);
  default:return clamp(minor*.65,1.4,4.5);
 }
}

function inferredDimensions(equipment:Equipment,archetype:EquipmentArchetype,heightM:number):Record<string,number>{
 const w=equipment.w,d=equipment.h,minor=Math.min(w,d),span=Math.max(w,d);
 switch(archetype){
  case 'jig':return {cell_count:/j3|russell/i.test(named(equipment))?2:2,deck_height_m:heightM*.72,drive_height_m:heightM*.28,cell_width_m:w*.42};
  case 'knudsen_bowl':return {bowl_diameter_m:minor*.62,bowl_height_m:heightM*.48,frame_height_m:heightM*.52};
  case 'hammer_crusher':return {crusher_body_width_m:w*.62,feed_hopper_height_m:heightM*.36,motor_length_m:span*.24};
  case 'vertical_impact_crusher':return {rotor_housing_diameter_m:minor*.62,feed_hopper_height_m:heightM*.28,drive_height_m:heightM*.26};
  case 'vibrating_screen':return {deck_length_m:span*.8,deck_width_m:minor*.72,deck_slope_deg:8,frame_height_m:heightM*.42};
  case 'sluice':return {deck_length_m:span*.92,deck_width_m:minor*.76,deck_slope_deg:6,riffle_pitch_m:.08};
  case 'shaker_table':return {deck_length_m:span*.9,deck_width_m:minor*.78,deck_slope_deg:2.5,stroke_drive_height_m:heightM*.42};
  case 'spiral_concentrator':return {spiral_diameter_m:minor*.68,turns:5.5,column_height_m:heightM*.86};
  case 'cyclone':return {body_diameter_m:minor*.54,cone_height_m:heightM*.48,barrel_height_m:heightM*.3};
  case 'tank':return {shell_diameter_m:minor*.78,shell_height_m:heightM};
  case 'pump':return {motor_length_m:span*.48,pump_diameter_m:minor*.5,shaft_height_m:heightM*.52};
  case 'generator':return {enclosure_length_m:span*.84,enclosure_width_m:minor*.78,enclosure_height_m:heightM*.78};
  case 'solar_array':return {panel_rows:Math.max(1,Math.round(d/2)),tilt_deg:18,panel_height_m:.08};
  case 'stockpile':return {pile_base_width_m:w,pile_base_depth_m:d,pile_height_m:heightM};
  case 'hopper':return {upper_width_m:w*.86,upper_depth_m:d*.86,outlet_width_m:Math.max(.25,minor*.2)};
  default:return {};
 }
}

export function equipmentRenderProfile(equipment:Equipment):EquipmentRenderProfile{
 const explicit=equipment.engineering;
 const archetype=explicit?.archetype||inferEquipmentArchetype(equipment);
 const heightM=explicit?.overall_height_m||inferredHeight(equipment,archetype);
 return {
  archetype,
  modelStatus:explicit?.model_status||'inferred',
  heightM,
  rotationDeg:explicit?.rotation_deg||0,
  dimensions:{...inferredDimensions(equipment,archetype,heightM),...(explicit?.dimensions||{})},
  source:explicit?'explicit':'inferred',
  rationale:explicit
   ?`${explicit.model_status.replaceAll('_',' ')} equipment profile stored with the engineering model.`
   :`Deterministic ${archetype.replaceAll('_',' ')} geometry inferred from the equipment identity and P5 planning envelope.`,
 };
}

export function equipmentRenderSummary(equipment:Equipment){
 const profile=equipmentRenderProfile(equipment);
 return {
  archetype:profile.archetype,
  modelStatus:profile.modelStatus,
  overallHeightM:Number(profile.heightM.toFixed(3)),
  rotationDeg:Number(profile.rotationDeg.toFixed(2)),
  dimensions:profile.dimensions,
  source:profile.source,
  rationale:profile.rationale,
 };
}
