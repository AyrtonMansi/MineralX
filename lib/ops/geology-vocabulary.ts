import {COORD_SOURCES} from '@/components/mineralx/project-store.js';

/** Shared Globe vocabulary for new Exploration coordinate observations. */
export const EXPLORATION_COORDINATE_SOURCES=[...COORD_SOURCES];
export const CAPTURED_GPS_COORDINATE_SOURCE='gps_handheld';

type CapturedCoordinates={latitude:number;longitude:number;accuracy:number};
export const capturedGpsCoordinateFields=({latitude,longitude,accuracy}:CapturedCoordinates)=>({
  lat:latitude,lng:longitude,coordinateAccuracyM:accuracy,coordSource:CAPTURED_GPS_COORDINATE_SOURCE,
});
