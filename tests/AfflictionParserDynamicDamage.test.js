import { AfflictionParser } from '../scripts/services/AfflictionParser.js';
import { RecoveryRestrictionService } from '../scripts/services/RecoveryRestrictionService.js';
import { resetParserLocaleCache } from '../scripts/locales/parser-locales.js';

// Curse of Death (Witch hex) as shipped in the PF2e system compendium.
const STAGE_1 = '(max(4,(@item.rank)-1))d6';
const STAGE_2 = '(max(8,@item.rank+3))d6';
const STAGE_3 = '(max(12,@item.rank+7))d6';

const CURSE_OF_DEATH =
  '<p>Your patron wraps a hand around your target\'s heart. The target must attempt a Fortitude saving throw.</p><hr />' +
  '<p><strong>Failure</strong> The target is afflicted with the <em>curse of death</em> at stage 1.</p><hr />' +
  '<p><strong>Curse of Death</strong> (curse, death, void) This curse ends when the spell ends</p>\n' +
  `<p><strong>Stage 1</strong> @Damage[${STAGE_1}[void]] damage and @UUID[Compendium.pf2e.conditionitems.Item.Fatigued] (1 round)</p>\n` +
  `<p><strong>Stage 2</strong> @Damage[${STAGE_2}[void]] damage and fatigued (1 round)</p>\n` +
  `<p><strong>Stage 3</strong> @Damage[${STAGE_3}[void]] damage and fatigued (1 round)</p>\n` +
  '<p><strong>Stage 4</strong> death</p><hr />' +
  '<p><strong>Heightened (+1)</strong> Increase the void damage taken by 1d6.</p>';

function makeSpell({ rank = 5, rollData, ...overrides } = {}) {
  const item = {
    name: 'Curse of Death',
    type: 'spell',
    uuid: 'Actor.witch.Item.curse-of-death',
    img: 'icons/curse.webp',
    rank,
    system: {
      description: { value: CURSE_OF_DEATH },
      traits: { value: ['curse', 'death', 'focus', 'hex', 'void', 'witch'] },
      level: { value: 5 },
      defense: { save: { statistic: 'fortitude', basic: false } },
      location: {},
    },
    ...overrides,
  };
  if (rollData !== undefined) item.getRollData = () => rollData;
  return item;
}

function stageFormulas(parsed) {
  return parsed.stages.filter(stage => stage.number <= 3).map(stage => stage.damage[0]);
}

beforeEach(() => {
  game.i18n.lang = 'en';
  resetParserLocaleCache();
});

describe('AfflictionParser — dynamic @Damage formulas (Curse of Death)', () => {
  test('extracts nested-parenthesis formulas whole instead of treating them as stage durations', () => {
    const stages = AfflictionParser.extractStages(CURSE_OF_DEATH);

    expect(stages.map(stage => stage.number)).toEqual([1, 2, 3, 4]);
    expect(stages.slice(0, 3).map(stage => stage.damage)).toEqual([
      [{ formula: STAGE_1, type: 'void' }],
      [{ formula: STAGE_2, type: 'void' }],
      [{ formula: STAGE_3, type: 'void' }],
    ]);
    for (const stage of stages.slice(0, 3)) {
      expect(stage.duration).toEqual({ value: 1, unit: 'round', isDice: false });
      expect(stage.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'fatigued' })]));
      expect(stage.effects).toContain('@Damage[');
      expect(stage.effects).not.toMatch(/@Damage\[\s*[-)]/);
    }
    expect(stages[3].isDead).toBe(true);
  });

  test('resolves @item.rank and max() against the source spell roll data', () => {
    const parsed = AfflictionParser.parseFromItem(makeSpell({ rollData: { item: { rank: 5 } } }));

    expect(stageFormulas(parsed)).toEqual([
      { formula: '4d6', type: 'void' },
      { formula: '8d6', type: 'void' },
      { formula: '12d6', type: 'void' },
    ]);
  });

  test('uses the heightened spell rank when it exceeds the max() floor', () => {
    const parsed = AfflictionParser.parseFromItem(makeSpell({ rank: 8, rollData: { item: { rank: 8 } } }));

    expect(stageFormulas(parsed)).toEqual([
      { formula: '7d6', type: 'void' },
      { formula: '11d6', type: 'void' },
      { formula: '15d6', type: 'void' },
    ]);
  });

  test('falls back to the item rank when the item has no roll data', () => {
    const parsed = AfflictionParser.parseFromItem(makeSpell({ rank: 6 }));

    expect(stageFormulas(parsed).map(entry => entry.formula)).toEqual(['5d6', '9d6', '13d6']);
  });

  test('keeps the full original formula when roll data cannot resolve it', () => {
    const item = makeSpell({ rank: null, rollData: {} });
    delete item.system.level;
    const parsed = AfflictionParser.parseFromItem(item);

    expect(stageFormulas(parsed)).toEqual([
      { formula: STAGE_1, type: 'void' },
      { formula: STAGE_2, type: 'void' },
      { formula: STAGE_3, type: 'void' },
    ]);
  });

  test('chat damage link keeps an unresolved formula intact inside @Damage[...]', () => {
    const affliction = { id: 'cod', name: 'Curse of Death' };
    expect(RecoveryRestrictionService.buildDamageLink(STAGE_2, 'void', affliction)).toBe(
      `@Damage[${STAGE_2}[void]|immutable]`,
    );
  });
});

describe('AfflictionParser.resolveDamageFormula', () => {
  const rollData = { item: { rank: 5, level: 9 } };

  test.each([
    [STAGE_1, '4d6'],
    [STAGE_2, '8d6'],
    [STAGE_3, '12d6'],
    ['(max(4,(@item.rank-1)))d6', '4d6'],
    ['(floor(@item.level/2))d8+@item.rank', '4d8+5'],
    ['2d6+3', '2d6+3'],
  ])('%s -> %s', (formula, expected) => {
    expect(AfflictionParser.resolveDamageFormula(formula, rollData)).toBe(expected);
  });

  test('returns the original formula when a reference is missing', () => {
    expect(AfflictionParser.resolveDamageFormula(STAGE_2, { item: {} })).toBe(STAGE_2);
    expect(AfflictionParser.resolveDamageFormula('(@actor.level)d6', rollData)).toBe('(@actor.level)d6');
  });

  test('returns the original formula for unsupported functions', () => {
    expect(AfflictionParser.resolveDamageFormula('(evil(@item.rank))d6', rollData)).toBe('(evil(@item.rank))d6');
  });
});
