import { AfflictionParser } from '../scripts/services/AfflictionParser.js';
import { resetParserLocaleCache } from '../scripts/locales/parser-locales.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Switch the parser locale by changing game.i18n.lang and clearing the cache. */
function setLang(lang) {
  game.i18n.lang = lang;
  resetParserLocaleCache();
}

// Reset to English after each test so locale bleeds don't affect other tests.
afterEach(() => setLang('en'));

// ═══════════════════════════════════════════════════════════════════════════════
// ENGLISH
// ═══════════════════════════════════════════════════════════════════════════════

describe('AfflictionParser — English', () => {
  beforeEach(() => setLang('en'));

  // ── extractStages ──────────────────────────────────────────────────────────

  test('parses inline HTML stages', () => {
    const html =
      '<p><strong>Stage 1</strong> 1d4 poison damage (1 round)</p>' +
      '<p><strong>Stage 2</strong> 1d6 poison damage and @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Enfeebled 1} (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[0].number).toBe(1);
    expect(stages[0].duration).toEqual({ value: 1, unit: 'round', isDice: false });
    expect(stages[1].number).toBe(2);
    expect(stages[1].conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'enfeebled', value: 1 })]),
    );
  });

  test('parses paragraph HTML stages', () => {
    const html =
      '<p><strong>Stage 1</strong> @Damage[1d4[poison]] damage (1 round)</p>' +
      '<p><strong>Stage 2</strong> @Damage[1d6[poison]] damage (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[0].damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '1d4', type: 'poison' })]),
    );
  });

  test('parses Darkening Poison damage without applying its relative visibility as actor conditions', () => {
    const html =
      '<p><strong>Stage 1</strong> @Damage[1d6[poison]] (1 round)</p>' +
      '<p><strong>Stage 2</strong> 1d6 poison and creatures you can see only with darkvision are @UUID[Compendium.pf2e.conditionitems.Item.concealed]{Concealed} from you (1 round)</p>' +
      '<p><strong>Stage 3</strong> 1d6 poison and creatures you can see only with darkvision are @UUID[Compendium.pf2e.conditionitems.Item.hidden]{Hidden} from you (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);

    expect(stages.map(stage => stage.damage)).toEqual([
      [{ formula: '1d6', type: 'poison' }],
      [{ formula: '1d6', type: 'poison' }],
      [{ formula: '1d6', type: 'poison' }],
    ]);
    expect(stages[1].conditions).toEqual([]);
    expect(stages[1].visibilityEffects).toEqual([
      { state: 'concealed', sense: 'darkvision', only: true },
    ]);
    expect(stages[2].conditions).toEqual([]);
    expect(stages[2].visibilityEffects).toEqual([
      { state: 'hidden', sense: 'darkvision', only: true },
    ]);
  });

  test('normalizes legacy stored Darkening Poison stages at runtime', () => {
    const stage = {
      effects: '1d6 poison and creatures you can see only with darkvision are Concealed from you',
      conditions: [{ name: 'concealed', value: null }],
    };

    expect(AfflictionParser.normalizeStageVisibility(stage)).toEqual({
      ...stage,
      conditions: [],
      visibilityEffects: [{ state: 'concealed', sense: 'darkvision', only: true }],
    });
  });

  test('parses stages with dice duration', () => {
    const html = '<p><strong>Stage 1</strong> 1d6 fire damage (2d6 hours)</p>';
    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(1);
    expect(stages[0].duration).toEqual({ formula: '2d6', value: null, unit: 'hour', isDice: true });
  });

  test('preserves arithmetic modifiers in variable stage durations', () => {
    const html = '<p><strong>Stage 1</strong> sickened 1 (1d4+1 minutes)</p>';
    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(1);
    expect(stages[0].duration).toEqual({ formula: '1d4+1', value: null, unit: 'minute', isDice: true });
  });

  // ── extractDC ─────────────────────────────────────────────────────────────

  test('extracts DC from @Check enricher', () => {
    const desc = '<p><strong>Saving Throw</strong> @Check[fortitude|dc:15]</p>';
    const item = { system: { description: { value: desc } } };
    expect(AfflictionParser.extractDC(desc, item)).toBe(15);
  });

  test('extracts DC from data-pf2-dc attribute', () => {
    const desc = '<span data-pf2-dc="22">DC 22 Fortitude</span>';
    const item = { system: { description: { value: desc } } };
    expect(AfflictionParser.extractDC(desc, item)).toBe(22);
  });

  test('extracts DC from plain text', () => {
    const desc = 'DC 18 Fortitude save';
    const item = { system: {} };
    expect(AfflictionParser.extractDC(desc, item)).toBe(18);
  });

  test('prefers system DC over description', () => {
    const desc = 'DC 18 Fortitude save';
    const item = { system: { save: { dc: 20 } } };
    expect(AfflictionParser.extractDC(desc, item)).toBe(20);
  });

  test('prefers spellcasting DC over placeholder spell check DC', () => {
    const desc = '<p><strong>Saving Throw</strong> @Check[fortitude|dc:15|against:spell]</p>';
    const item = {
      system: { description: { value: desc } },
      spellcasting: { statistic: { dc: { value: 31 } } },
    };
    expect(AfflictionParser.extractDC(desc, item)).toBe(31);
  });

  // ── extractOnset ──────────────────────────────────────────────────────────

  test('extracts onset from HTML', () => {
    const desc = '<p><strong>Onset</strong> 1 round</p>';
    expect(AfflictionParser.extractOnset(desc)).toEqual({ value: 1, unit: 'round', isDice: false });
  });

  test('extracts onset from plain text', () => {
    const desc = 'Onset 10 minutes';
    expect(AfflictionParser.extractOnset(desc)).toEqual({ value: 10, unit: 'minute', isDice: false });
  });

  // ── extractMaxDuration ────────────────────────────────────────────────────

  test('extracts max duration from HTML', () => {
    const desc = '<p><strong>Maximum Duration</strong> 6 rounds</p>';
    expect(AfflictionParser.extractMaxDuration(desc)).toEqual({ value: 6, unit: 'round', isDice: false });
  });

  test('extracts max duration from plain text', () => {
    const desc = 'Maximum Duration 4 hours';
    expect(AfflictionParser.extractMaxDuration(desc)).toEqual({ value: 4, unit: 'hour', isDice: false });
  });

  // ── extractConditions ─────────────────────────────────────────────────────

  test('extracts conditions from UUID enricher', () => {
    const text = '@UUID[Compendium.pf2e.conditionitems.Item.abc]{Enfeebled 2}';
    const conditions = AfflictionParser.extractConditions(text);
    expect(conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'enfeebled', value: 2 })]),
    );
  });

  test('extracts conditions from plain text', () => {
    const text = 'sickened 1 and slowed 1';
    const conditions = AfflictionParser.extractConditions(text);
    expect(conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'sickened', value: 1 }),
        expect.objectContaining({ name: 'slowed', value: 1 }),
      ]),
    );
  });

  test('extracts condition-specific explicit duration from plain text', () => {
    const text = 'clumsy 2 for 1 minute and enfeebled 1';
    const conditions = AfflictionParser.extractConditions(text);
    expect(conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'clumsy',
          value: 2,
          duration: { value: 1, unit: 'minute', isDice: false },
        }),
        expect.objectContaining({ name: 'enfeebled', value: 1 }),
      ]),
    );
  });

  // ── detectManualHandling ─────────────────────────────────────────────────

  test('does not flag "or" substring in words like "history"', () => {
    const text = '5d6 mental damage, Stupefied 2, and the target is exposed to the curse of flawed history';
    expect(AfflictionParser.detectManualHandling(text)).toBe(false);
  });

  test('flags standalone "or" as manual handling', () => {
    const text = '1d6 fire or cold damage';
    expect(AfflictionParser.detectManualHandling(text)).toBe(true);
  });

  test('does not flag "or" inside HTML attributes', () => {
    const text = '<a class="inline-roll roll" data-formula="{5d6[mental]}"><span>5d6 mental</span></a> damage and Stupefied 2';
    expect(AfflictionParser.detectManualHandling(text)).toBe(false);
  });

  test('stage with "history" text parses conditions correctly', () => {
    const html =
      '<p><strong>Stage 1</strong> @Damage[4d6[mental]] damage and @UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]{Stupefied 1} (1 round)</p>' +
      '<p><strong>Stage 2</strong> @Damage[5d6[mental]] damage, @UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]{Stupefied 2}, and the target is exposed to the curse of flawed history (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[1].requiresManualHandling).toBe(false);
    expect(stages[1].conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'stupefied', value: 2 })]),
    );
  });

  // ── extractReferencedAfflictions ──────────────────────────────────────────

  test('extracts referenced affliction from "exposed to" text', () => {
    const text = 'damage, Stupefied 2, and the target is exposed to the curse of flawed history (1 round)';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].toLowerCase()).toBe('curse of flawed history');
  });

  test('extracts referenced affliction from "contracts" text', () => {
    const text = 'the target contracts ghoul fever';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].toLowerCase()).toBe('ghoul fever');
  });

  test('extracts referenced curse from "save against" action text', () => {
    const text = 'The target must save against the forbidden cravings curse.';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].toLowerCase()).toBe('forbidden cravings curse');
  });

  test('does not treat generic "save against ... curse effects" text as a referenced curse (Paradigm Cube)', () => {
    const html =
      '<p><strong>Mythic Enhancement:</strong> Attempts made by allies to counteract or disbelieve illusions or to save against confusion effects are attempted at mythic proficiency.</p>' +
      '<p><strong>6—Indigo</strong> (darkness, shadow) Indigo is the color of ignorance and the unknown. <strong>Mythic Enhancement:</strong> Allies\' saving throws against fear, curse, or visual effects are attempted at mythic proficiency.</p>';
    expect(AfflictionParser.extractReferencedAfflictions(html)).toEqual([]);
    expect(AfflictionParser.extractReferencedAfflictions('You gain a +1 status bonus to saves against curse effects.')).toEqual([]);
    expect(AfflictionParser.extractReferencedAfflictions('You gain a +2 bonus to saving throws against fear, curse, or visual effects.')).toEqual([]);
  });

  test('returns empty array when no reference found', () => {
    const text = '1d6 poison damage and sickened 1';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(0);
  });

  test('stage 2 of Retrocognitive Ink includes referencedAfflictions', () => {
    const html =
      '<p><strong>Stage 1</strong> @Damage[4d6[mental]] damage and @UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]{Stupefied 1} (1 round)</p>' +
      '<p><strong>Stage 2</strong> @Damage[5d6[mental]] damage, @UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]{Stupefied 2}, and the target is exposed to the curse of flawed history (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages[0].referencedAfflictions).toHaveLength(0);
    expect(stages[1].referencedAfflictions).toHaveLength(1);
    expect(stages[1].referencedAfflictions[0].toLowerCase()).toBe('curse of flawed history');
  });

  // ── extractEffectSection ────────────────────────────────────────────────

  test('extracts Effect section from HTML', () => {
    const html = '<p><strong>Effect</strong> The creature takes a -2 status penalty to checks.</p>';
    const effect = AfflictionParser.extractEffectSection(html);
    expect(effect).toContain('creature takes a -2 status penalty');
  });

  test('returns null when no Effect section', () => {
    const html = '<p><strong>Stage 1</strong> 1d6 poison (1 round)</p>';
    expect(AfflictionParser.extractEffectSection(html)).toBeNull();
  });

  // ── parseEffectOnlyItem ─────────────────────────────────────────────────

  test('parses effect-only curse item', () => {
    const item = {
      name: 'Curse of Flawed History',
      uuid: 'test-uuid',
      system: {
        traits: { value: ['curse', 'primal'] },
        level: { value: 18 },
        description: {
          value:
            '<p><strong>Saving Throw</strong> <a class="inline-check" data-pf2-check="will" data-pf2-dc="37">DC 37 Will</a></p>' +
            '<p><strong>Effect</strong> The creature takes a \u20132 status penalty to checks made to Recall Knowledge. This curse has an unlimited duration.</p>',
        },
      },
    };

    const result = AfflictionParser.parseEffectOnlyItem(item);
    expect(result).not.toBeNull();
    expect(result.isEffectOnly).toBe(true);
    expect(result.name).toBe('Curse of Flawed History');
    expect(result.type).toBe('curse');
    expect(result.dc).toBe(37);
    expect(result.saveType).toBe('will');
    expect(result.effectText).toContain('status penalty');
  });

  // ── extractDamage ─────────────────────────────────────────────────────────

  test('extracts damage from @Damage enricher', () => {
    const text = '@Damage[1d6[poison]]';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '1d6', type: 'poison' })]),
    );
  });

  test('extracts damage from plain text', () => {
    const text = '2d6 fire damage';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '2d6', type: 'fire' })]),
    );
  });

  test('extracts damage from expression @Damage enrichers with nested type and options', () => {
    const text = '@Damage[(max(4,(@item.rank)-1))d6[void]] damage and @Damage[2d6[void]|immutable] damage';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ formula: '(max(4,(@item.rank)-1))d6', type: 'void' }),
        expect.objectContaining({ formula: '2d6', type: 'void' }),
      ]),
    );
  });

  // ── parseDuration ─────────────────────────────────────────────────────────

  test('parses fixed duration', () => {
    expect(AfflictionParser.parseDuration('6 rounds')).toEqual({ value: 6, unit: 'round', isDice: false });
  });

  test('parses dice duration', () => {
    expect(AfflictionParser.parseDuration('2d6 hours')).toEqual({ formula: '2d6', value: null, unit: 'hour', isDice: true });
  });

  test('parses structured duration object', () => {
    expect(AfflictionParser.parseDuration({ value: 3, unit: 'days' })).toEqual({ value: 3, unit: 'day', isDice: false });
  });

  // ── parseFromItem (integration) ───────────────────────────────────────────

  test('parses a full poison item', () => {
    const item = {
      name: 'Spear Frog Poison',
      uuid: 'test-uuid',
      system: {
        traits: { value: ['poison'] },
        level: { value: 2 },
        description: {
          value:
            '<p><strong>Saving Throw</strong> @Check[fortitude|dc:15]</p>' +
            '<p><strong>Maximum Duration</strong> 6 rounds</p>' +
            '<p><strong>Stage 1</strong> @Damage[1d4[poison]] damage (1 round)</p>' +
            '<p><strong>Stage 2</strong> @Damage[1d6[poison]] damage and @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Enfeebled 1} (1 round)</p>',
        },
      },
    };

    const result = AfflictionParser.parseFromItem(item);
    expect(result.skip).toBeUndefined();
    expect(result.name).toBe('Spear Frog Poison');
    expect(result.type).toBe('poison');
    expect(result.dc).toBe(15);
    expect(result.maxDuration).toEqual({ value: 6, unit: 'round', isDice: false });
    expect(result.stages).toHaveLength(2);
  });

  test('preserves all item traits on parsed affliction data', () => {
    const item = {
      name: 'Blightburn Bomb',
      uuid: 'test-uuid',
      system: {
        traits: { value: ['uncommon', 'alchemical', 'bomb', 'consumable', 'disease', 'poison', 'splash'] },
        level: { value: 11 },
        description: {
          value:
            '<p><strong>Saving Throw</strong> @Check[fortitude|dc:28]</p>' +
            '<p><strong>Stage 1</strong> @Damage[1d6[poison]] damage (1 round)</p>',
        },
      },
    };

    const result = AfflictionParser.parseFromItem(item);
    expect(result.traits).toEqual(['uncommon', 'alchemical', 'bomb', 'consumable', 'disease', 'poison', 'splash']);
  });

  test('returns skip when no stages found', () => {
    const item = {
      name: 'Empty Poison',
      uuid: 'test-uuid',
      system: {
        traits: { value: ['poison'] },
        description: { value: '<p>This poison has no structured stages.</p>' },
      },
    };
    expect(AfflictionParser.parseFromItem(item)).toEqual({ skip: true });
  });

  test('returns null for non-affliction items', () => {
    const item = {
      name: 'Sword',
      uuid: 'test-uuid',
      system: { traits: { value: ['weapon'] }, description: { value: '' } },
    };
    expect(AfflictionParser.parseFromItem(item)).toBeNull();
  });

  // ── extractWeakness ─────────────────────────────────────────────────────────

  test('extracts "weakness to fire 5"', () => {
    const text = 'weakness to fire 5';
    const weakness = AfflictionParser.extractWeakness(text);
    expect(weakness).toEqual([{ type: 'fire', value: 5 }]);
  });

  test('extracts "weakness 5 to fire" (flipped)', () => {
    const text = 'weakness 5 to fire';
    const weakness = AfflictionParser.extractWeakness(text);
    expect(weakness).toEqual([{ type: 'fire', value: 5 }]);
  });

  test('returns empty array when no weakness', () => {
    expect(AfflictionParser.extractWeakness('1d6 poison damage')).toEqual([]);
  });

  // ── extractDamage (or-damage pattern) ─────────────────────────────────────

  test('extracts "or" damage choice', () => {
    const text = '2d6 fire or cold damage';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ formula: '2d6', type: 'fire', isChoice: true, alternativeType: 'cold' }),
      ]),
    );
  });

  // ── extractMultipleExposure ───────────────────────────────────────────────

  test('extracts "each time you are exposed" pattern', () => {
    const desc = '<p>Each time you are exposed to this poison, increase the stage by 1.</p>';
    const result = AfflictionParser.extractMultipleExposure(desc);
    expect(result).not.toBeNull();
    expect(result.enabled).toBe(true);
    expect(result.stageIncrease).toBe(1);
  });

  test('extracts "multiple exposures" with min stage qualifier', () => {
    const desc = '<p>Each additional exposure while at stage 2 increases the stage by 1.</p>';
    const result = AfflictionParser.extractMultipleExposure(desc);
    expect(result).not.toBeNull();
    expect(result.stageIncrease).toBe(1);
    expect(result.minStage).toBe(2);
  });

  test('returns null when no multiple exposure', () => {
    const desc = '<p><strong>Stage 1</strong> 1d6 poison (1 round)</p>';
    expect(AfflictionParser.extractMultipleExposure(desc)).toBeNull();
  });

  // ── Recovery restrictions ─────────────────────────────────────────────────

  test('extracts Bog Rot stage floor, unhealable damage, and counteract unlock', () => {
    const desc = '<p>This affliction can’t be reduced below stage 1, nor can the damage from it be healed, until it’s successfully treated with remove curse or a similar effect.</p>';
    expect(AfflictionParser.extractRecoveryRestriction(desc)).toEqual({
      minimumStage: 1,
      unhealableDamage: true,
      requiresCounteract: true,
    });
  });

  test('returns null when an affliction has no recovery restriction', () => {
    expect(AfflictionParser.extractRecoveryRestriction('<p>A normal disease.</p>')).toBeNull();
  });

  // ── extractEmbeddedAfflictionName ─────────────────────────────────────────

  test('extracts embedded affliction name from spell', () => {
    const desc = '<p>You inject venom. <strong>Spider Venom</strong> (poison)</p>';
    expect(AfflictionParser.extractEmbeddedAfflictionName(desc, 'poison')).toBe('Spider Venom');
  });

  test('returns null when no embedded name', () => {
    const desc = '<p><strong>Stage 1</strong> 1d6 poison (1 round)</p>';
    expect(AfflictionParser.extractEmbeddedAfflictionName(desc, 'poison')).toBeNull();
  });

  // ── "for duration" pattern (paragraph stage format) ───────────────────────

  test('parses stage with "for N unit" duration (no parentheses)', () => {
    const html = '<p><strong>Stage 1</strong> stunned 1 for 1 round</p>';
    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(1);
    expect(stages[0].duration).toEqual({ value: 1, unit: 'round', isDice: false });
  });

  test('preserves explicit condition duration in plain semicolon stages', () => {
    const stages = AfflictionParser.extractStages('Stage 1 clumsy 2 for 1 minute; Stage 2 enfeebled 1 (1 round)');
    expect(stages[0].conditions).toEqual([
      { name: 'clumsy', value: 2, duration: { value: 1, unit: 'minute', isDice: false } },
    ]);
  });

  test('parses legacy Curse of Death semicolon stages', () => {
    const item = {
      name: 'Curse of Death',
      uuid: 'test-curse-of-death',
      spellcasting: { statistic: { dc: { value: 31 } } },
      system: {
        traits: { value: ['curse', 'death', 'void'] },
        level: { value: 5 },
        description: {
          value:
            'Defense Fortitude; Duration sustained up to 1 minute. ' +
            'Critical Failure The target is afflicted with the curse of death at stage 2. ' +
            'Curse of Death (curse, death, void) This curse ends when the spell ends; ' +
            'Stage 1 4d6 void damage and fatigued (1 round); ' +
            'Stage 2 8d6 void damage and fatigued (1 round); ' +
            'Stage 3 12d6 void damage and fatigued (1 round); ' +
            'Stage 4 death',
        },
      },
    };

    const result = AfflictionParser.parseFromItem(item);
    expect(result.dc).toBe(31);
    expect(result.saveType).toBe('fortitude');
    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].damage).toEqual([{ formula: '4d6', type: 'void' }]);
    expect(result.stages[1].damage).toEqual([{ formula: '8d6', type: 'void' }]);
    expect(result.stages[2].damage).toEqual([{ formula: '12d6', type: 'void' }]);
    expect(result.stages[3].isDead).toBe(true);
  });

  test('parses legacy Forbidden Cravings plain text and actor spell DC', () => {
    const item = {
      name: 'Forbidden Cravings',
      uuid: 'test-forbidden-cravings',
      parent: {
        system: {
          attributes: {
            classOrSpellDC: { value: 22 },
          },
        },
      },
      system: {
        traits: { value: ['curse'] },
        description: {
          value:
            'Forbidden Cravings (curse) A creature can still eat and drink while sickened by this curse; ' +
            "Saving Throw Will, using the high spell DC for the ghoul's level; " +
            'Stage 1 carrier with no ill effects (1 day); ' +
            'Stage 2 2d6 void damage and the target is sickened 1 until it consumes raw meat (1 day); ' +
            'Stage 3 as stage 2; ' +
            'Stage 4 as stage 2 unless the target has consumed raw meat in the past 24 hours, then it takes 4d6 void damage and is sickened 2 until it consumes raw meat; ' +
            'Stage 5 if the creature has eaten raw meat in the past 24 hours, it dies and rises as a ghoul, if not, it returns to stage 4',
        },
      },
    };

    const result = AfflictionParser.parseFromItem(item);
    expect(result.dc).toBe(22);
    expect(result.saveType).toBe('will');
    expect(result.stages).toHaveLength(5);
    expect(result.stages[1].damage).toEqual([{ formula: '2d6', type: 'void' }]);
    expect(result.stages[1].conditions).toEqual([{ name: 'sickened', value: 1 }]);
    expect(result.stages[2].damage).toEqual(result.stages[1].damage);
    expect(result.stages[4].isDead).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUSSIAN
// ═══════════════════════════════════════════════════════════════════════════════

describe('AfflictionParser — Russian', () => {
  beforeEach(() => setLang('ru'));

  // ── extractStages ──────────────────────────────────────────────────────────

  test('parses stages with colon inside <strong> tag', () => {
    const html =
      '<p><strong>Стадия 1:</strong> @Damage[1d4[poison]] (1 раунд)</p>' +
      '<p><strong>Стадия 2:</strong> @Damage[1d6[poison]] и @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Ослаблен 1} (1 раунд)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[0].number).toBe(1);
    expect(stages[0].duration).toEqual({ value: 1, unit: 'round', isDice: false });
    expect(stages[1].number).toBe(2);
  });

  test('parses stages with colon outside <strong> tag', () => {
    const html =
      '<p><strong>Стадия 1</strong>: @Damage[1d4[poison]] (1 раунд)</p>' +
      '<p><strong>Стадия 2</strong>: @Damage[1d6[poison]] (1 раунд)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[0].number).toBe(1);
    expect(stages[1].number).toBe(2);
  });

  test('parses stages without colon (fallback)', () => {
    const html =
      '<p><strong>Стадия 1</strong> @Damage[1d4[poison]] (1 раунд)</p>' +
      '<p><strong>Стадия 2</strong> @Damage[1d6[poison]] (1 раунд)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
  });

  test('extracts Russian conditions from UUID enricher', () => {
    const html =
      '<p><strong>Стадия 1:</strong> @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Ослаблен 1} (1 раунд)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(1);
    expect(stages[0].conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'enfeebled', value: 1 })]),
    );
  });

  // ── extractDC ─────────────────────────────────────────────────────────────

  test('extracts DC from @Check enricher (Russian item)', () => {
    const desc = '<p><strong>Спасбросок:</strong> @Check[fortitude|dc:15]</p>';
    const item = { system: {} };
    expect(AfflictionParser.extractDC(desc, item)).toBe(15);
  });

  test('extracts DC from Russian plain text "КС 18"', () => {
    const desc = 'КС 18 Стойкость';
    const item = { system: {} };
    expect(AfflictionParser.extractDC(desc, item)).toBe(18);
  });

  // ── extractOnset ──────────────────────────────────────────────────────────

  test('extracts onset with colon', () => {
    const desc = '<p><strong>Возникновение:</strong> 1 раунд</p>';
    expect(AfflictionParser.extractOnset(desc)).toEqual({ value: 1, unit: 'round', isDice: false });
  });

  test('extracts onset without colon', () => {
    const desc = '<p><strong>Возникновение</strong> 10 минут</p>';
    expect(AfflictionParser.extractOnset(desc)).toEqual({ value: 10, unit: 'minute', isDice: false });
  });

  // ── extractMaxDuration ────────────────────────────────────────────────────

  test('extracts max duration with colon', () => {
    const desc = '<p><strong>Макс.продолжительность:</strong> 6 раундов</p>';
    expect(AfflictionParser.extractMaxDuration(desc)).toEqual({ value: 6, unit: 'round', isDice: false });
  });

  test('extracts max duration without colon', () => {
    const desc = '<p><strong>Макс.продолжительность</strong> 6 раундов</p>';
    expect(AfflictionParser.extractMaxDuration(desc)).toEqual({ value: 6, unit: 'round', isDice: false });
  });

  // ── parseDuration (Russian units) ─────────────────────────────────────────

  test.each([
    ['1 раунд', { value: 1, unit: 'round', isDice: false }],
    ['6 раундов', { value: 6, unit: 'round', isDice: false }],
    ['2 раунда', { value: 2, unit: 'round', isDice: false }],
    ['10 минут', { value: 10, unit: 'minute', isDice: false }],
    ['1 час', { value: 1, unit: 'hour', isDice: false }],
    ['3 дня', { value: 3, unit: 'day', isDice: false }],
  ])('parseDuration("%s")', (input, expected) => {
    expect(AfflictionParser.parseDuration(input)).toEqual(expected);
  });

  // ── parseFromItem (integration — Spear Frog Poison RU) ────────────────────

  test('parses full Russian poison item (colon variant)', () => {
    const item = {
      name: 'Яд копьеносной лягушки',
      uuid: 'test-uuid-ru',
      system: {
        traits: { value: ['poison'] },
        level: { value: 2 },
        description: {
          value:
            '<p><strong>Спасбросок:</strong> @Check[fortitude|dc:15]</p>' +
            '<p><strong>Макс.продолжительность:</strong> 6 раундов</p>' +
            '<p><strong>Стадия 1:</strong> @Damage[1d4[poison]] (1 раунд)</p>' +
            '<p><strong>Стадия 2:</strong> @Damage[1d6[poison]] и @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Ослаблен 1} (1 раунд)</p>',
        },
      },
    };

    const result = AfflictionParser.parseFromItem(item);
    expect(result.skip).toBeUndefined();
    expect(result.name).toBe('Яд копьеносной лягушки');
    expect(result.type).toBe('poison');
    expect(result.dc).toBe(15);
    expect(result.maxDuration).toEqual({ value: 6, unit: 'round', isDice: false });
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '1d4', type: 'poison' })]),
    );
    expect(result.stages[1].conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'enfeebled', value: 1 })]),
    );
  });

  // ── extractDamage ─────────────────────────────────────────────────────────

  test('extracts damage from @Damage enricher in Russian context', () => {
    const text = '@Damage[2d6[poison]]';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '2d6', type: 'poison' })]),
    );
  });

  test('extracts damage from Russian plain text', () => {
    const text = '2d6 яд';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '2d6', type: 'яд' })]),
    );
  });

  // ── extractConditions (plain text) ────────────────────────────────────────

  test('extracts Russian condition from plain text', () => {
    const text = 'тошнота 1 и замедлен 1';
    const conditions = AfflictionParser.extractConditions(text);
    expect(conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'sickened', value: 1 }),
        expect.objectContaining({ name: 'slowed', value: 1 }),
      ]),
    );
  });

  // ── detectManualHandling ─────────────────────────────────────────────────

  test('flags Russian "или" as manual handling', () => {
    const text = '1d6 огонь или холод';
    expect(AfflictionParser.detectManualHandling(text)).toBe(true);
  });

  test('flags Russian "тайный" as manual handling', () => {
    const text = 'тайный бросок спасения';
    expect(AfflictionParser.detectManualHandling(text)).toBe(true);
  });

  // ── extractWeakness ───────────────────────────────────────────────────────

  test('extracts Russian weakness "уязвим к огню 5"', () => {
    const text = 'уязвим к огню 5';
    const weakness = AfflictionParser.extractWeakness(text);
    expect(weakness).toEqual([{ type: 'огню', value: 5 }]);
  });

  test('extracts Russian weakness flipped "уязвим 5 к огню"', () => {
    const text = 'уязвим 5 к огню';
    const weakness = AfflictionParser.extractWeakness(text);
    expect(weakness).toEqual([{ type: 'огню', value: 5 }]);
  });

  // ── extractReferencedAfflictions ──────────────────────────────────────────

  test('extracts Russian referenced affliction "подвержен"', () => {
    const text = 'цель подвержена Демонической Лихорадке';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBe('Демонической Лихорадке');
  });

  // ── extractEffectSection ──────────────────────────────────────────────────

  test('extracts Russian effect section', () => {
    const html = '<p><strong>Эффект</strong> Существо получает штраф -2 к проверкам.</p>';
    const effect = AfflictionParser.extractEffectSection(html);
    expect(effect).toContain('штраф -2');
  });

  test('extracts English Effect label in Russian locale (fallback)', () => {
    const html = '<p><strong>Effect</strong> The creature takes a penalty.</p>';
    const effect = AfflictionParser.extractEffectSection(html);
    expect(effect).toContain('creature takes a penalty');
  });

  // ── extractMultipleExposure ───────────────────────────────────────────────

  test('extracts English multiple exposure pattern in Russian locale (fallback)', () => {
    const desc = '<p>Each time you are exposed to this poison, increase the stage by 1.</p>';
    const result = AfflictionParser.extractMultipleExposure(desc);
    expect(result).not.toBeNull();
    expect(result.stageIncrease).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHINESE
// ═══════════════════════════════════════════════════════════════════════════════

describe('AfflictionParser — Chinese', () => {
  beforeEach(() => setLang('zh'));

  test('parses stages with optional whitespace', () => {
    const html =
      '<p><strong>阶段1</strong> @Damage[1d4[poison]]（1轮）</p>' +
      '<p><strong>阶段2</strong> @Damage[1d6[poison]]（1轮）</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[0].number).toBe(1);
    expect(stages[0].duration).toEqual({ value: 1, unit: 'round', isDice: false });
  });

  test('parses stages with space before number', () => {
    const html =
      '<p><strong>阶段 1</strong> @Damage[1d4[poison]]（1轮）</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(1);
    expect(stages[0].number).toBe(1);
  });

  test('extracts max duration', () => {
    const desc = '<p><strong>最大持续时间</strong> 6轮</p>';
    expect(AfflictionParser.extractMaxDuration(desc)).toEqual({ value: 6, unit: 'round', isDice: false });
  });

  test('parses Chinese duration units', () => {
    expect(AfflictionParser.parseDuration('6轮')).toEqual({ value: 6, unit: 'round', isDice: false });
    expect(AfflictionParser.parseDuration('1小时')).toEqual({ value: 1, unit: 'hour', isDice: false });
  });

  test('parses full Chinese poison item', () => {
    const item = {
      name: '矛蛙毒素',
      uuid: 'test-uuid-zh',
      system: {
        traits: { value: ['poison'] },
        level: { value: 2 },
        description: {
          value:
            '<p><strong>豁免</strong> @Check[fortitude|dc:15]</p>' +
            '<p><strong>最大持续时间</strong> 6轮</p>' +
            '<p><strong>阶段1</strong> @Damage[1d4[poison]]（1轮）</p>' +
            '<p><strong>阶段2</strong> @Damage[1d6[poison]] @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{力竭 1}（1轮）</p>',
        },
      },
    };

    const result = AfflictionParser.parseFromItem(item);
    expect(result.skip).toBeUndefined();
    expect(result.type).toBe('poison');
    expect(result.dc).toBe(15);
    expect(result.stages).toHaveLength(2);
  });

  // ── extractDC ─────────────────────────────────────────────────────────────

  test('extracts DC from @Check enricher (Chinese item)', () => {
    const desc = '<p><strong>豁免</strong> @Check[fortitude|dc:18]</p>';
    const item = { system: {} };
    expect(AfflictionParser.extractDC(desc, item)).toBe(18);
  });

  test('extracts DC from Chinese plain text "DC 18"', () => {
    const desc = 'DC 18 强韧';
    const item = { system: {} };
    expect(AfflictionParser.extractDC(desc, item)).toBe(18);
  });

  test('extracts DC without space "DC18"', () => {
    const desc = 'DC18';
    const item = { system: {} };
    expect(AfflictionParser.extractDC(desc, item)).toBe(18);
  });

  // ── extractOnset ──────────────────────────────────────────────────────────

  test('extracts Chinese onset', () => {
    const desc = '<p><strong>潜伏期</strong> 1轮</p>';
    expect(AfflictionParser.extractOnset(desc)).toEqual({ value: 1, unit: 'round', isDice: false });
  });

  test('extracts Chinese onset with space', () => {
    const desc = '<p><strong>潜伏期</strong> 10分钟</p>';
    expect(AfflictionParser.extractOnset(desc)).toEqual({ value: 10, unit: 'minute', isDice: false });
  });

  // ── extractConditions ─────────────────────────────────────────────────────

  test('extracts Chinese condition from UUID enricher', () => {
    const text = '@UUID[Compendium.pf2e.conditionitems.Item.abc]{恶心 2}';
    const conditions = AfflictionParser.extractConditions(text);
    expect(conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'sickened', value: 2 })]),
    );
  });

  test('extracts Chinese conditions from plain text (no word boundaries)', () => {
    const text = '恶心1和缓慢1';
    const conditions = AfflictionParser.extractConditions(text);
    expect(conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'sickened', value: 1 }),
        expect.objectContaining({ name: 'slowed', value: 1 }),
      ]),
    );
  });

  // ── extractDamage ─────────────────────────────────────────────────────────

  test('extracts damage from Chinese plain text', () => {
    const text = '2d6 毒素';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '2d6', type: '毒素' })]),
    );
  });

  test('extracts Chinese "or" damage pattern', () => {
    const text = '2d6 火焰 或 寒冷 伤害';
    const damage = AfflictionParser.extractDamage(text);
    expect(damage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ formula: '2d6', type: '火焰', isChoice: true, alternativeType: '寒冷' }),
      ]),
    );
  });

  // ── detectManualHandling ─────────────────────────────────────────────────

  test('flags Chinese "或" (or) as manual handling', () => {
    const text = '1d6 火焰 或 寒冷';
    expect(AfflictionParser.detectManualHandling(text)).toBe(true);
  });

  test('flags Chinese "秘密" (secret) as manual handling', () => {
    const text = '秘密豁免检定';
    expect(AfflictionParser.detectManualHandling(text)).toBe(true);
  });

  // ── extractWeakness ───────────────────────────────────────────────────────

  test('extracts Chinese weakness "弱点 火焰 5"', () => {
    const text = '弱点火焰5';
    const weakness = AfflictionParser.extractWeakness(text);
    expect(weakness).toEqual([{ type: '火焰', value: 5 }]);
  });

  // ── extractReferencedAfflictions ──────────────────────────────────────────

  test('extracts Chinese referenced affliction "暴露于"', () => {
    const text = '暴露于 恶魔热病';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBe('恶魔热病');
  });

  test('extracts Chinese referenced affliction "感染"', () => {
    const text = '感染 污秽热病';
    const refs = AfflictionParser.extractReferencedAfflictions(text);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBe('污秽热病');
  });

  // ── extractEffectSection ──────────────────────────────────────────────────

  test('extracts Chinese effect section', () => {
    const html = '<p><strong>效果</strong> 该生物在检定中受到-2状态减值。</p>';
    const effect = AfflictionParser.extractEffectSection(html);
    expect(effect).toContain('状态减值');
  });

  // ── stage references ──────────────────────────────────────────────────────

  test('resolves Chinese "如同阶段 N" stage reference', () => {
    const html =
      '<p><strong>阶段1</strong> @Damage[1d6[poison]]（1轮）</p>' +
      '<p><strong>阶段2</strong> 如同阶段1（1轮）</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[1].damage).toEqual(stages[0].damage);
  });

  // ── extractMultipleExposure ───────────────────────────────────────────────

  test('extracts Chinese multiple exposure "每次暴露"', () => {
    const desc = '<p>每次暴露于此毒素，阶段增加1。</p>';
    const result = AfflictionParser.extractMultipleExposure(desc);
    expect(result).not.toBeNull();
    expect(result.stageIncrease).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UNTRANSLATED ITEM FALLBACK (English items in non-EN sessions)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AfflictionParser — EN fallback for untranslated items', () => {
  const enItem = {
    name: 'Spear Frog Poison',
    uuid: 'test-uuid-en-fallback',
    system: {
      traits: { value: ['poison'] },
      level: { value: 2 },
      description: {
        value:
          '<p><strong>Saving Throw</strong> @Check[fortitude|dc:15]</p>' +
          '<p><strong>Onset</strong> 1 round</p>' +
          '<p><strong>Maximum Duration</strong> 6 rounds</p>' +
          '<p><strong>Stage 1</strong> @Damage[1d4[poison]] damage (1 round)</p>' +
          '<p><strong>Stage 2</strong> @Damage[1d6[poison]] damage and @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Enfeebled 1} (1 round)</p>',
      },
    },
  };

  test('parses English item in Russian session via parseFromItem', () => {
    setLang('ru');
    const result = AfflictionParser.parseFromItem(enItem);
    expect(result.skip).toBeUndefined();
    expect(result.type).toBe('poison');
    expect(result.dc).toBe(15);
    expect(result.onset).toEqual({ value: 1, unit: 'round', isDice: false });
    expect(result.maxDuration).toEqual({ value: 6, unit: 'round', isDice: false });
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].damage).toEqual(
      expect.arrayContaining([expect.objectContaining({ formula: '1d4', type: 'poison' })]),
    );
    expect(result.stages[1].conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'enfeebled', value: 1 })]),
    );
  });

  test('parses English item in Chinese session via parseFromItem', () => {
    setLang('zh');
    const result = AfflictionParser.parseFromItem(enItem);
    expect(result.skip).toBeUndefined();
    expect(result.type).toBe('poison');
    expect(result.dc).toBe(15);
    expect(result.maxDuration).toEqual({ value: 6, unit: 'round', isDice: false });
    expect(result.stages).toHaveLength(2);
  });

  test('still prefers native locale when available (RU)', () => {
    setLang('ru');
    const ruItem = {
      name: 'Яд копьеносной лягушки',
      uuid: 'test-uuid-ru-native',
      system: {
        traits: { value: ['poison'] },
        level: { value: 2 },
        description: {
          value:
            '<p><strong>Спасбросок:</strong> @Check[fortitude|dc:15]</p>' +
            '<p><strong>Макс.продолжительность:</strong> 6 раундов</p>' +
            '<p><strong>Стадия 1:</strong> @Damage[1d4[poison]] (1 раунд)</p>' +
            '<p><strong>Стадия 2:</strong> @Damage[1d6[poison]] (1 раунд)</p>',
        },
      },
    };
    const result = AfflictionParser.parseFromItem(ruItem);
    expect(result.skip).toBeUndefined();
    expect(result.stages).toHaveLength(2);
    expect(result.maxDuration).toEqual({ value: 6, unit: 'round', isDice: false });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEATH DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('AfflictionParser — death detection', () => {
  test.each([
    ['en', 'The target dies'],
    ['en', 'The creature is dead'],
    ['en', 'instant death'],
    ['ru', 'цель мёртв'],
    ['ru', 'цель мертв'],
    ['ru', 'жертва умирает'],
    ['zh', '死亡'],
    ['zh', '即死'],
  ])('[%s] detectDeath("%s")', (lang, text) => {
    setLang(lang);
    expect(AfflictionParser.detectDeath(text)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE REFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

describe('AfflictionParser — stage references', () => {
  test('resolves "as stage N" in English', () => {
    setLang('en');
    const html =
      '<p><strong>Stage 1</strong> 1d6 poison damage (1 round)</p>' +
      '<p><strong>Stage 2</strong> as stage 1 (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[1].damage).toEqual(stages[0].damage);
  });

  test('copies relative visibility effects through stage references', () => {
    setLang('en');
    const html =
      '<p><strong>Stage 1</strong> 1d6 poison and creatures you can see only with darkvision are concealed from you (1 round)</p>' +
      '<p><strong>Stage 2</strong> as stage 1 (1 round)</p>';

    const stages = AfflictionParser.extractStages(html);

    expect(stages[1].visibilityEffects).toEqual(stages[0].visibilityEffects);
  });

  test('resolves "как стадия N" in Russian', () => {
    setLang('ru');
    const html =
      '<p><strong>Стадия 1:</strong> 1d6 poison damage (1 раунд)</p>' +
      '<p><strong>Стадия 2:</strong> как стадия 1 (1 раунд)</p>';

    const stages = AfflictionParser.extractStages(html);
    expect(stages).toHaveLength(2);
    expect(stages[1].damage).toEqual(stages[0].damage);
  });
});
