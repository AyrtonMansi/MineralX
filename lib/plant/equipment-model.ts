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
 if(/gekko.*ipj|\bipj1000\b/.test(value))return 'inline_pressure_jig';
 if(/russell|\bjig\b|j3/.test(value))return 'jig';
 if(/falcon.*sb|falcon concentrator|centrifugal concentrator/.test(value))return 'centrifugal_concentrator';
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
  case 'inline_pressure_jig':return clamp(minor*1.3,2.3,4.8);
  case 'jig':return clamp(minor*.72,1.8,3.6);
  case 'centrifugal_concentrator':return clamp(minor*1.15,2.2,4.5);
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
  case 'inline_pressure_jig':return {pressure_vessel_diameter_m:minor*.58,vessel_height_m:heightM*.62,support_height_m:heightM*.25,feed_connection_height_m:heightM*.7};
  case 'jig':return {cell_count:/j3|russell/i.test(named(equipment))?2:2,deck_height_m:heightM*.72,drive_height_m:heightM*.28,cell_width_m:w*.42};
  case 'centrifugal_concentrator':return {bowl_housing_diameter_m:minor*.64,bowl_housing_height_m:heightM*.42,frame_height_m:heightM*.38,drive_height_m:heightM*.2};
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

const requirements:Partial<Record<EquipmentArchetype,string[]>>={
 stockpile:['surveyed pile toe/crest or design storage envelope','maximum operating pile height','segregation/bund geometry if material classes are separated'],
 hopper:['overall height','top opening width/depth','outlet width/depth and discharge elevation','support/leg arrangement'],
 hammer_crusher:['OEM overall dimensions','feed hopper dimensions/elevation','crusher body and motor/drive envelope','inlet and discharge connection elevations'],
 vertical_impact_crusher:['OEM overall dimensions','rotor housing diameter/elevation','feed hopper dimensions','drive/motor envelope and discharge elevation'],
 vibrating_screen:['deck length/width','deck inclination','number of decks and screen media/opening','feed/discharge elevations and drive envelope'],
 inline_pressure_jig:['manufacturer/model confirmation','pressure vessel diameter/height','support/base arrangement','feed/tails/concentrate connection positions','required access and isolation clearances'],
 jig:['manufacturer/model confirmation','cell count and cell dimensions','deck/screen elevation and opening','hutch/diaphragm/drive envelope','feed, tails, concentrate and water connection elevations'],
 centrifugal_concentrator:['manufacturer/model confirmation','bowl/housing dimensions','frame/overall height','feed/tails/concentrate connection elevations','drive/service envelope'],
 knudsen_bowl:['manufacturer/model confirmation','bowl diameter/depth','frame and overall height','feed/tails/concentrate connection elevations','drive/motor envelope'],
 sluice:['deck length/width','deck inclination','riffle/matting geometry','feed and discharge elevations'],
 shaker_table:['deck length/width','deck inclination','stroke/drive envelope','feed/wash-water and product discharge geometry'],
 spiral_concentrator:['manufacturer/model confirmation','spiral diameter','number of turns','column height','feed distributor and product splitter elevations'],
 cyclone:['body diameter','barrel and cone lengths','inlet/overflow/spigot diameters and elevations','support frame height'],
 tank:['shell diameter','shell/overall height','operating level','inlet/outlet/overflow/nozzle elevations'],
 pump:['manufacturer/model confirmation','baseplate and motor dimensions','shaft centreline','suction/discharge nozzle sizes and orientations'],
 generator:['manufacturer/model confirmation','enclosure dimensions','exhaust/ventilation clearances','service access envelope'],
 solar_array:['module dimensions','row spacing','tilt and azimuth','mounting height'],
 container:['verified external dimensions','door/opening positions','service penetrations if relevant'],
 conveyor_drive:['pulley/drive envelope','shaft elevation','motor/gearbox envelope','guard/service clearances'],
 platform:['deck elevation','deck dimensions','stairs/ladder/handrail footprint','equipment loads if structural design is in scope'],
 generic:['verified equipment identity/model','overall length/width/height','major connection points and service clearances'],
};

export function equipmentModelRequirements(equipment:Equipment){
 const profile=equipmentRenderProfile(equipment),configured=new Set(Object.keys(equipment.engineering?.dimensions||{}));
 return {
  equipmentId:equipment.id,
  name:equipment.name,
  archetype:profile.archetype,
  modelStatus:profile.modelStatus,
  currentDimensions:profile.dimensions,
  verificationTargets:requirements[profile.archetype]||requirements.generic!,
  hasExplicitEngineeringProfile:!!equipment.engineering,
  explicitDimensionKeys:[...configured].sort(),
  recommendedEvidence:['OEM/vendor general-arrangement drawing or datasheet','site measurements or survey for installed equipment','dated photos for orientation and connection context'],
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
