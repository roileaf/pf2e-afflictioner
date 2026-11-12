import { PF2E_CONDITIONS } from '../constants.js';

// Build condition display map: each PF2e condition key maps to itself, plus known aliases.
const _conditionDisplayMap = new Map(PF2E_CONDITIONS.map(c => [c, c]));
_conditionDisplayMap.set('flat-footed', 'off-guard');

export const EN_PARSER_LOCALE = {
  id: 'en',

  // ── Section header regex fragments ─────────────────────────────────────────
  // Pre-escaped for regex use.  stageLabelRe must capture the stage number in group 1.
  stageLabelRe:       'Stage\\s*(\\d+)',
  onsetLabelRe:       'Onset',
  maxDurationLabelRe: 'Maximum\\s+Duration',
  // Separator between </strong> (or label end) and content.
  afterLabel:    '\\s+',   // required (inline/plain patterns)
  afterLabelOpt: '\\s*',   // optional  (paragraph pattern)

  // ── Standalone patterns ────────────────────────────────────────────────────
  asStagePattern:      /\bas\s+stage\s+(\d+)\b/i,
  dcPattern:           /DC\s+(\d+)/i,
  deathPattern:        /\bdead\b|\bdies\b|\binstant\s+death\b/i,
  // "for 1 round" / "for 2d6 hours" at end of plain-text stage content
  forDurationPattern:  /\bfor\s+(\d+d\d+(?:\s*[+-]\s*\d+)?\s+\w+|\d+\s+\w+)\s*$/i,
  // "1d6 fire or cold damage"
  orDamagePattern:     /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(\w+)\s+or\s+(\w+)\s+damage/gi,

  // ── Duration ───────────────────────────────────────────────────────────────
  durationDiceRegex:  /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(\w+)/i,
  durationFixedRegex: /(\d+)\s+(\w+)/i,
  // Maps any text token that appears as a unit to the canonical DURATION_MULTIPLIERS key.
  durationUnitMap: {
    round: 'round', rounds: 'round',
    minute: 'minute', minutes: 'minute',
    hour: 'hour', hours: 'hour',
    day: 'day', days: 'day',
    week: 'week', weeks: 'week',
  },

  // ── Manual-handling keywords ───────────────────────────────────────────────
  manualKeywords: [
    'secret', 'gm', 'special', 'ability', 'save again',
    'choose', 'option', 'or', 'either', 'instead', 'permanent',
  ],

  // ── Plain-text damage type tokens ─────────────────────────────────────────
  // Used as a fallback when no @Damage enricher is present.
  damageTypes: [
    'acid', 'bludgeoning', 'cold', 'electricity', 'fire', 'force',
    'mental', 'piercing', 'poison', 'slashing', 'sonic', 'void', 'vitality',
    'bleed', 'persistent',
  ],

  // ── Condition matching ─────────────────────────────────────────────────────
  // Maps display name (lowercase, without numeric value) → PF2e condition key.
  // For UUID enrichers the display text is matched against these keys.
  // For plain text the keys themselves are searched in the description.
  conditionDisplayMap: _conditionDisplayMap,
  // Whether to wrap plain-text condition searches in \b word boundaries.
  // Set false for locales that don't use ASCII word separators (e.g. Chinese).
  useWordBoundaries: true,

  // ── Weakness patterns ──────────────────────────────────────────────────────
  // Each entry must have: regex (with g flag), typeGroup, valueGroup.
  weaknessPatterns: [
    { regex: /weakness\s+to\s+(\w+)\s+(\d+)/gi, typeGroup: 1, valueGroup: 2 },
    { regex: /weakness\s+(\d+)\s+to\s+(\w+)/gi, typeGroup: 2, valueGroup: 1 },
  ],

  // ── Speed penalty patterns ────────────────────────────────────────────────
  // Each entry: regex with g flag, valueGroup index for the penalty number.
  speedPenaltyPatterns: [
    { regex: /[\u2013\u2014-](\d+)[\u2013\u2014-]foot\s+status\s+penalty\s+to\s+(?:all\s+)?[Ss]peed/g, valueGroup: 1 },
  ],

  // ── Effect section label ──────────────────────────────────────────────────
  effectLabelRe: 'Effect',

  // ── Referenced affliction patterns ──────────────────────────────────────────
  // Captures the name of a referenced affliction/curse/effect in stage text.
  // Group 1 = the referenced name.
  referencedAfflictionPatterns: [
    /\b(?:exposed|subjected)\s+to\s+(?:the\s+)?(.+?)(?:\s*[（(]|\s*$)/gi,
    /\bcontracts?\s+(?:the\s+)?(.+?)(?:\s*[（(]|\s*$)/gi,
    /\bafflicted\s+with\s+(?:the\s+)?(.+?)(?:\s*[（(]|\s*$)/gi,
    // Named curse only: capture stays inside one clause (no sentence/list
    // punctuation) and generic "curse effects" wording is ignored.
    /\bsaves?\s+against\s+(?:the\s+)?([^.,;:!?\n]+?\bcurse)\b(?!\s+effects?\b)/gi,
    /\bsaving\s+throws?\s+against\s+(?:the\s+)?([^.,;:!?\n]+?\bcurse)\b(?!\s+effects?\b)/gi,
  ],

  // ── Multiple-exposure patterns ─────────────────────────────────────────────
  // Each entry: main captures stageIncrease in group 1; minStage (optional)
  // captures the minimum stage qualifier in group 1.
  multipleExposurePatterns: [
    {
      main: /(?:each\s+(?:time\s+you(?:'re|\s+are)\s+exposed|additional\s+exposure)).*?(?:increase|advance).*?(?:stage|stages)\s*(?:by\s*)?(\d+)/i,
      minStage: /(?:while|at|when)\s+(?:already\s+)?(?:at\s+)?stage\s+(\d+)/i,
    },
    {
      main: /multiple\s+exposures.*?(?:increase|advance).*?(?:stage|stages)\s*(?:by\s*)?(\d+)/i,
      minStage: null,
    },
  ],

  // ── Recovery restrictions ─────────────────────────────────────────────────
  minimumStagePattern: /can(?:not|['’]t)\s+be\s+reduced\s+below\s+stage\s+(\d+)/i,
  unhealableDamagePatterns: [
    /damage\s+from\s+(?:it|this\s+affliction)\s+can(?:not|['’]t)\s+be\s+healed/i,
    /nor\s+can\s+the\s+damage\s+from\s+(?:it|this\s+affliction)\s+be\s+healed/i,
  ],
  counteractUnlockPatterns: [
    /until\s+(?:it(?:['’]s|\s+is)\s+)?successfully\s+treated\s+with\s+(?:@UUID\[[^\]]+\]\{)?remove\s+curse/i,
  ],
};
