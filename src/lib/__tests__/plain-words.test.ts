import assert from 'node:assert';
import { friendlyDose, friendlyTime, mlToCups } from '../plain-words';
import { dialysisDayInfo } from '../../components/patient/PatientTodayCard';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepStrictEqual(a, b, m); n++; };

eq(friendlyDose('800 mg (1 tablet)', true), 'حبة واحدة', 'one tablet in Arabic');
eq(friendlyDose('1600 mg (2 tablets)', true), 'حبتين', 'two tablets in Arabic');
eq(friendlyDose('0.5 tablet', true), 'نص حبة', 'half tablet');
eq(friendlyDose('5 mg', true), '5 mg', 'unknown form left as is');
eq(friendlyDose('800 mg (1 tablet)', false), '1 tablet', 'English');

eq(friendlyTime('08:00')?.ar, 'الصبح الساعة 8', 'morning');
eq(friendlyTime('08:00')?.icon, '☀️', 'sun for morning');
eq(friendlyTime('13:30')?.ar, 'الظهر الساعة 1:30', 'noon with minutes');
eq(friendlyTime('21:00')?.icon, '🌙', 'moon for night');
eq(friendlyTime(''), null, 'no time');

eq(mlToCups(1820), 7, '1820 mL is 7 cups');
eq(mlToCups(250), 1, 'one cup');
eq(mlToCups(0), 0, 'nothing drunk');

// Thursday 2026-11-19 12:00 Cairo: STT (Sun/Tue/Thu) has dialysis today, SMW next on Saturday (2 days)
const thu = new Date('2026-11-19T10:00:00Z');
eq(dialysisDayInfo('STT', thu).today, true, 'STT dialysis on Thursday');
eq(dialysisDayInfo('SMW', thu), { today: false, nextWeekday: 6, inDays: 2 }, 'SMW next is Saturday');
eq(dialysisDayInfo('STT', new Date('2026-11-21T10:00:00Z')).inDays, 1, 'Saturday -> Sunday is tomorrow');

console.log(`PLAIN-WORDS SUITE PASSED: ${n} assertions.`);
