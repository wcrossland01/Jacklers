/* Jacklers Match Engine — commentary.
   Turns bare events into short, varied broadcast lines. Kept separate from
   the engine so wording can change without touching match logic. */

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

const CARRY = [
  '{p} takes it up.', '{p} carries hard into contact.', '{p} makes a strong carry.',
  '{p} bends the line forward.', '{p} crashes it up the middle.'
];
const TACKLE = ['{p} shuts down {q}.', '{p} makes the tackle on {q}.', '{p} with a big hit on {q}.', '{p} stops {q} dead.'];
const BREAK = ['{p} breaks the line!', '{p} slices through the defence!', '{p} finds the gap and goes!'];
const TURNOVER = ['{team} turn it over.', '{team} win the ball back.', 'Turnover - {team} in possession.'];
const KICK = { chip: 'chips it into space.', box: 'box kick from the base.', long: 'clears the lines.', cross: 'a cross-field kick.' };
const PENALTY_REASON = ['not releasing', 'offside', 'holding on', 'not rolling away', 'a high tackle', 'coming in from the side'];

export function carryLine(rand, whoLabel) { return pick(rand, CARRY).replace('{p}', whoLabel); }
export function tackleLine(rand, tacklerLabel, carrierLabel) { return pick(rand, TACKLE).replace('{p}', tacklerLabel).replace('{q}', carrierLabel); }
export function breakLine(rand, whoLabel) { return pick(rand, BREAK).replace('{p}', whoLabel); }
export function turnoverLine(rand, teamName) { return pick(rand, TURNOVER).replace('{team}', teamName); }
export function kickLine(kind) { return KICK[kind] || KICK.long; }
export function penaltyReason(rand) { return pick(rand, PENALTY_REASON); }
