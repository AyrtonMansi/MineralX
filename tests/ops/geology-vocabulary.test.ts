import test from 'node:test';
import assert from 'node:assert/strict';
import {COORD_SOURCES} from '../../components/mineralx/project-store.js';
import {geologyActions} from '../../components/ops/geology-specs';
import {CAPTURED_GPS_COORDINATE_SOURCE,EXPLORATION_COORDINATE_SOURCES,capturedGpsCoordinateFields} from '../../lib/ops/geology-vocabulary';

test('Exploration uses Globe coordinate sources for new captures while legacy corrections remain non-destructive',()=>{
 const field=geologyActions.sample.fields.find((candidate:any)=>candidate.key==='coordSource');
 assert.deepEqual(EXPLORATION_COORDINATE_SOURCES,COORD_SOURCES);
 assert.deepEqual(field?.options,COORD_SOURCES);
 assert.equal(geologyActions.sample.defaults?.coordSource,'unknown');
 assert.equal(CAPTURED_GPS_COORDINATE_SOURCE,'gps_handheld');
 assert.deepEqual(capturedGpsCoordinateFields({latitude:-20.1,longitude:146.2,accuracy:3.5}),{lat:-20.1,lng:146.2,coordinateAccuracyM:3.5,coordSource:'gps_handheld'});
 assert.equal(geologyActions.correct.fields.some((candidate:any)=>candidate.key==='coordSource'),false);
});
