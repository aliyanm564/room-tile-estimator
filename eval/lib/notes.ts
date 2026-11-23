// Heuristic checks for the notes rules (prompt v3): neutral voice, and only suggest actions the app
// supports (add/retake a photo, measure the longer or shorter wall). Flags are for review; a human
// should read the flagged notes in the report.

const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|[Mm]e|[Mm]y|[Ww]e|[Ww]e've|[Ww]e're|[Oo]ur|us)\b/;

/** Suggests measuring / adding something there's no field for (closets, doors, built-ins…). */
const MEASURE = /\b(measur\w*|tape)\b/i;
const NOT_A_WALL_FIELD = /\b(closets?|obstacles?|built-?ins?|islands?|cabinets?|vanit(y|ies)|doors?|doorways?|depth|ceilings?|alcoves?|nooks?|hall(way)?s?|tub|hearth|diagonal)\b/i;
/** Measuring one of the two walls IS supported, even if the note also mentions a door photo. */
const WALL_FIELD = /\b(longer|shorter|long|short|one|a) wall\b|\bwall[ -]to[ -]wall\b|\broom'?s? (length|width)\b/i;
const ADD_UNSUPPORTED = /\b(needs? to be added|add (it|them|that|the closet|this closet)\b)/i;

/** Asks the user to tell / confirm / check something (they can't reply, and there's no field). */
const ASKS = /\b(tell|let (us|me) know|please confirm|confirm (whether|if|that)|verify|check (whether|if|that)|make sure)\b/i;

export interface NoteChecks {
  firstPerson: string[];
  unsupportedAction: string[];
  asksUser: string[];
  questions: string[];
}

export function checkNotes(notes: string[]): NoteChecks {
  return {
    firstPerson: notes.filter((n) => FIRST_PERSON.test(n)),
    unsupportedAction: notes.filter(
      (n) => (MEASURE.test(n) && NOT_A_WALL_FIELD.test(n) && !WALL_FIELD.test(n)) || ADD_UNSUPPORTED.test(n),
    ),
    asksUser: notes.filter((n) => ASKS.test(n)),
    questions: notes.filter((n) => n.trim().endsWith("?")),
  };
}

export const violationCount = (c: NoteChecks) =>
  new Set([...c.firstPerson, ...c.unsupportedAction, ...c.asksUser, ...c.questions]).size;
