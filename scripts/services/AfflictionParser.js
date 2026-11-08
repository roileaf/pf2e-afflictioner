import { PF2E_CONDITIONS, DURATION_MULTIPLIERS } from '../constants.js';
import { getParserLocale, getEnParserLocale, withLocale } from '../locales/parser-locales.js';
import { DEFAULT_AFFLICTION_ICON } from '../constants.js';

const PAREN_OPEN_MASK = '\uE000';
const PAREN_CLOSE_MASK = '\uE001';
const FORMULA_FUNCTIONS = {
  max: Math.max,
  min: Math.min,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
};

export class AfflictionParser {
  static extractAfflictionTypeFromDescription(description) {
    const traitsMatch = description.match(/<section[^>]*class="[^"]*traits[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
    if (!traitsMatch) return null;
    const traitsHtml = traitsMatch[1].toLowerCase();
    if (traitsHtml.includes('poison')) return 'poison';
    if (traitsHtml.includes('disease')) return 'disease';
    if (traitsHtml.includes('curse')) return 'curse';
    return null;
  }

  static getAfflictionType(item) {
    const traits = item.system?.traits?.value || [];
    const fromTraits = traits.includes('poison') ? 'poison' :
      traits.includes('disease') ? 'disease' :
        traits.includes('curse') ? 'curse' : null;
    if (fromTraits) return fromTraits;
    const description = item.system?.description?.value || '';
    return this.extractAfflictionTypeFromDescription(description);
  }

  static parseFromItem(item) {
    const type = this.getAfflictionType(item);

    if (!type) return null;

    const traits = item.system?.traits?.value || [];
    const isVirulent = traits.includes('virulent');

    if (item.system?.stage) {
      return this.parseStructuredAffliction(item);
    }

    const description = item.system?.description?.value || '';

    let stages = this.extractStages(description);

    // Fallback: if the current locale found no stages and we're not already
    // using English, retry with the EN locale (handles untranslated items in
    // non-EN game sessions).
    const needsEnFallback = (!stages || stages.length === 0) && getParserLocale().id !== 'en';
    if (needsEnFallback) {
      stages = withLocale(getEnParserLocale(), () => this.extractStages(description));
    }

    if (!stages || stages.length === 0) {
      const effectOnly = this.parseEffectOnlyItem(item);
      if (effectOnly) return effectOnly;
      return { skip: true };
    }

    stages = this.resolveStageDamageFormulas(stages, item);

    // If the item is a spell containing an embedded affliction (e.g. Spider Sting → Spider Venom),
    // try to extract the actual affliction name from the description.
    const afflictionName = this.extractEmbeddedAfflictionName(description, type) || item.name;

    // If EN fallback matched, run remaining extractions under EN locale too.
    const buildResult = () => ({
      name: afflictionName,
      type,
      dc: this.extractDC(description, item),
      saveType: this.extractSaveType(description, item),
      onset: item.system?.onset ? this.parseDuration(item.system.onset) : this.extractOnset(description),
      stages,
      maxDuration: item.system?.maxDuration ? this.parseDuration(item.system.maxDuration) : this.extractMaxDuration(description),
      isVirulent,
      multipleExposure: this.extractMultipleExposure(description),
      recoveryRestriction: this.extractRecoveryRestriction(description),
      sourceItemUuid: item.uuid,
      level: item.system?.level?.value || 0,
      img: item.img || DEFAULT_AFFLICTION_ICON,
      traits,
    });

    return needsEnFallback
      ? withLocale(getEnParserLocale(), buildResult)
      : buildResult();
  }

  static parseStructuredAffliction(item) {
    const stageData = item.system?.stage || 1;
    const dc = item.system?.save?.dc || item.system?.save?.value || item.system?.dc?.value;

    if (!dc) {
      console.warn(`PF2e Afflictioner | No DC found for affliction item "${item.name}" (${item.uuid}).`);
      ui.notifications.warn(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.NO_DC_FOUND', {
        itemName: item.name,
      }));
      return null;
    }

    const traits = item.system?.traits?.value || [];
    const isVirulent = traits.includes('virulent');

    const stages = [];
    if (typeof stageData === 'object' && !Array.isArray(stageData)) {
      for (const [stageNum, stageInfo] of Object.entries(stageData)) {
        if (!isNaN(stageNum)) {
          const effectsText = this.formatEffectsFromStructured(stageInfo.effects || []);
          stages.push({
            number: parseInt(stageNum),
            effects: effectsText,
            rawText: `Stage ${stageNum}: ${effectsText}`,
            duration: stageInfo.duration ? this.parseDuration(stageInfo.duration) || { value: 1, unit: 'hour', isDice: false } : { value: 1, unit: 'hour', isDice: false },
            damage: this.extractDamageFromStructured(stageInfo.effects || []),
            conditions: this.extractConditionsFromStructured(stageInfo.effects || []),
            weakness: this.extractWeaknessFromStructured(stageInfo.effects || []),
            requiresManualHandling: false,
            isDead: this.detectDeath(effectsText)
          });
        }
      }
    }

    if (!stages || stages.length === 0) {
      return { skip: true };
    }

    const description = item.system?.description?.value || '';

    const itemTraits = item.system?.traits?.value || [];
    const afflictionType = itemTraits.includes('poison') ? 'poison' :
      itemTraits.includes('disease') ? 'disease' :
        itemTraits.includes('curse') ? 'curse' : 'poison';

    return {
      name: item.name,
      type: afflictionType,
      dc,
      saveType: this.extractSaveType(description, item),
      onset: item.system?.onset ? this.parseDuration(item.system.onset) : null,
      stages: stages,
      maxDuration: item.system?.maxDuration ? this.parseDuration(item.system.maxDuration) : this.extractMaxDuration(description),
      isVirulent: isVirulent,
      multipleExposure: this.extractMultipleExposure(description),
      recoveryRestriction: this.extractRecoveryRestriction(description),
      sourceItemUuid: item.uuid,
      level: item.system?.level?.value || 0,
      img: item.img || DEFAULT_AFFLICTION_ICON,
      traits: itemTraits
    };
  }

  static formatEffectsFromStructured(effects) {
    if (!Array.isArray(effects)) return '';
    return effects.map(e => {
      if (typeof e === 'string') return e;
      if (e.name && e.value) return `${e.name} ${e.value}`;
      if (e.name) return e.name;
      return JSON.stringify(e);
    }).join(', ');
  }

  static extractDamageFromStructured(effects) {
    if (!Array.isArray(effects)) return [];
    return effects.filter(e => e.type === 'damage' || e.damageType).map(e => {
      return e.formula || `${e.value || '0'} ${e.damageType || 'damage'}`;
    });
  }

  static extractConditionsFromStructured(effects) {
    if (!Array.isArray(effects)) return [];
    return effects.filter(e => PF2E_CONDITIONS.includes(e.name?.toLowerCase() || e.condition?.toLowerCase())).map(e => {
      const condition = {
        name: e.name || e.condition,
        value: e.value || null
      };
      if (e.duration) condition.duration = this.parseDuration(e.duration);
      return condition;
    });
  }

  static extractWeaknessFromStructured(effects) {
    if (!Array.isArray(effects)) return [];
    return effects.filter(e => e.type === 'weakness' || e.weakness).map(e => ({
      type: e.damageType || e.type || 'physical',
      value: e.value || 0
    }));
  }

  static extractDC(description, item) {
    if (item.system?.save?.dc) return item.system.save.dc;
    if (item.system?.save?.value) return item.system.save.value;
    if (item.system?.dc?.value) return item.system.dc.value;

    const spellcastingDC = this.extractSpellcastingDC(item);
    if (spellcastingDC) return spellcastingDC;

    // Engine-level enricher attributes — always ASCII regardless of locale.
    let dcMatch = description.match(/@Check\[[^\]]*\bdc:(\d+)[^\]]*\]/i);
    if (dcMatch) return parseInt(dcMatch[1]);

    dcMatch = description.match(/data-pf2-dc=["'](\d+)["']/i) || description.match(/data-dc=["'](\d+)["']/i);
    if (dcMatch) return parseInt(dcMatch[1]);

    // Locale-specific plain-text fallback (e.g. "DC 18").
    dcMatch = description.match(getParserLocale().dcPattern);
    if (dcMatch) return parseInt(dcMatch[1]);

    console.warn(`PF2e Afflictioner | No DC found for affliction item "${item.name}" (${item.uuid}).`);
    return null;
  }

  static extractSpellcastingDC(item) {
    const candidates = [
      item.spellcasting?.statistic?.dc?.value,
      item.spellcasting?.statistic?.dc,
      item.spellcasting?.dc?.value,
      item.spellcasting?.dc,
      item.system?.location?.spellcasting?.statistic?.dc?.value,
      item.parent?.system?.attributes?.classOrSpellDC?.value,
      item.parent?.system?.attributes?.spellDC?.value,
      item.parent?.system?.attributes?.classDC?.value,
    ];

    for (const candidate of candidates) {
      const dc = typeof candidate === 'number' ? candidate : parseInt(candidate);
      if (Number.isFinite(dc) && dc > 0) return dc;
    }
    return null;
  }

  static extractSaveType(description, item) {
    // Structured data: item.system.save.statistic (PF2e system field)
    const statistic = item.system?.save?.statistic;
    if (statistic && ['fortitude', 'reflex', 'will'].includes(statistic)) {
      return statistic;
    }

    // PF2e spells store save info under item.system.defense.save
    const defenseStatistic = item.system?.defense?.save?.statistic;
    if (defenseStatistic && ['fortitude', 'reflex', 'will'].includes(defenseStatistic)) {
      return defenseStatistic;
    }

    const plainSaveMatch = this.stripEnrichment(description).match(/\b(?:Saving Throw|Defense)\s*:?\s*(Fortitude|Reflex|Will)\b/i);
    if (plainSaveMatch) {
      return plainSaveMatch[1].toLowerCase();
    }

    // @Check enricher: @Check[type:fortitude|dc:18] or @Check[fortitude|dc:18]
    const checkMatch = description.match(/@Check\[(?:type:)?(\w+)/i);
    if (checkMatch) {
      const type = checkMatch[1].toLowerCase();
      if (['fortitude', 'reflex', 'will'].includes(type)) return type;
    }

    // data-pf2-check attribute: data-pf2-check="will"
    const attrMatch = description.match(/data-pf2-check="(\w+)"/i);
    if (attrMatch) {
      const type = attrMatch[1].toLowerCase();
      if (['fortitude', 'reflex', 'will'].includes(type)) return type;
    }

    return 'fortitude';
  }

  static extractOnset(description) {
    const locale = getParserLocale();

    let onsetMatch = description.match(new RegExp(`<strong>${locale.onsetLabelRe}<\\/strong>${locale.afterLabel}([^<]+)`, 'i'));
    if (!onsetMatch) {
      onsetMatch = description.match(new RegExp(`${locale.onsetLabelRe}${locale.afterLabel}([^;.<]+)`, 'i'));
    }
    if (!onsetMatch) return null;

    return this.parseDuration(onsetMatch[1].trim());
  }

  static extractStages(description) {
    const locale = getParserLocale();
    // Hide parentheses inside enrichers (e.g. @Damage[(max(4,@item.rank))d6[void]])
    // so they are never mistaken for "(1 round)" stage durations.
    const masked = this.maskEnricherParens(description);
    const unmask = text => this.unmaskEnricherParens(text);

    const stages = [];
    const matchedStageNums = new Set();

    // [（(] / [)）] — accept both ASCII and full-width parentheses (used in CN)
    const htmlInlineRe = new RegExp(`<strong>${locale.stageLabelRe}<\\/strong>${locale.afterLabel}((?:(?!<\\/p>).)+?)[（(]([^)）]+)[)）]([^<]*)`, 'gi');
    for (const match of masked.matchAll(htmlInlineRe)) {
      const stageNum = parseInt(match[1]);
      const effectsBefore = unmask(match[2]).trim();
      const durationText = unmask(match[3]);
      const effectsAfter = unmask(match[4]).trim();
      const effects = [effectsBefore, effectsAfter].filter(e => e).join(' ');
      const duration = this.parseDuration(durationText);

      stages.push({
        number: stageNum,
        effects: effects,
        rawText: unmask(match[0]),
        duration: duration,
        damage: this.extractDamage(effects),
        ...this.extractStageConditionData(effects),
        weakness: this.extractWeakness(effects),
        requiresManualHandling: this.detectManualHandling(effects),
        isDead: this.detectDeath(effects),
        referencedAfflictions: this.extractReferencedAfflictions(effects)
      });
      matchedStageNums.add(stageNum);
    }

    const htmlParaRe = new RegExp(`<strong>${locale.stageLabelRe}<\\/strong>${locale.afterLabelOpt}([\\s\\S]*?)<\\/p>`, 'gi');
    for (const match of masked.matchAll(htmlParaRe)) {
      const stageNum = parseInt(match[1]);
      if (matchedStageNums.has(stageNum)) continue;

      const maskedContent = match[2];
      const rawContent = unmask(maskedContent);
      const plainText = this.stripEnrichment(rawContent);

      // Inline roll duration: [[/br 2d6 #rounds]] — FoundryVTT syntax, locale-independent.
      const inlineRollMatch = rawContent.match(/\[\[(?:\/br\s+)?(\d+d\d+(?:[+-]\d+)?)\s+#(\w+)\]\]/i);
      let duration;
      if (inlineRollMatch) {
        duration = this.parseDuration(`${inlineRollMatch[1]} ${inlineRollMatch[2]}`);
      } else {
        // Parenthetical duration — accepts both ASCII () and full-width （） brackets.
        const parenMatch = maskedContent.match(/[（(]([^)）]+)[)）]/);
        if (parenMatch) {
          duration = this.parseDuration(unmask(parenMatch[1]).trim());
        } else {
          const forMatch = plainText.match(locale.forDurationPattern);
          duration = forMatch ? this.parseDuration(forMatch[1]) : null;
        }
      }

      stages.push({
        number: stageNum,
        effects: rawContent.trim(),
        rawText: unmask(match[0]),
        duration: duration,
        damage: this.extractDamage(rawContent),
        ...this.extractStageConditionData(rawContent),
        weakness: this.extractWeakness(rawContent),
        requiresManualHandling: this.detectManualHandling(plainText),
        isDead: this.detectDeath(rawContent),
        referencedAfflictions: this.extractReferencedAfflictions(rawContent)
      });
      matchedStageNums.add(stageNum);
    }

    stages.sort((a, b) => a.number - b.number);

    if (stages.length === 0) {
      stages.push(...this.extractPlainStages(description));
    }

    this.resolveStageReferences(stages);
    return stages;
  }

  static extractPlainStages(description) {
    const locale = getParserLocale();
    const labelRe = new RegExp(`(?:^|[;；。])\\s*${locale.stageLabelRe}\\b`, 'gi');
    const labels = [...description.matchAll(labelRe)];
    const stages = [];

    for (let index = 0; index < labels.length; index++) {
      const label = labels[index];
      const stageNum = parseInt(label[1]);
      if (!Number.isFinite(stageNum)) continue;

      const start = label.index + label[0].length;
      const end = labels[index + 1]?.index ?? description.length;
      const rawContent = description.slice(start, end).replace(/^[\s:：-]+/, '').replace(/[;；。]\s*$/, '').trim();
      if (!rawContent) continue;

      const duration = this.extractStageDuration(rawContent);
      const effects = this.removeStageDurationText(rawContent).trim();

      stages.push({
        number: stageNum,
        effects,
        rawText: `${label[0].replace(/^[;；。]\s*/, '')} ${rawContent}`.trim(),
        duration,
        damage: this.extractDamage(effects),
        ...this.extractStageConditionData(rawContent),
        weakness: this.extractWeakness(effects),
        requiresManualHandling: this.detectManualHandling(effects),
        isDead: this.detectDeath(effects),
        referencedAfflictions: this.extractReferencedAfflictions(effects)
      });
    }

    return stages;
  }

  static extractStageDuration(text) {
    const inlineRollMatch = text.match(/\[\[(?:\/br\s+)?(\d+d\d+(?:[+-]\d+)?)\s+#(\w+)\]\]/i);
    if (inlineRollMatch) return this.parseDuration(`${inlineRollMatch[1]} ${inlineRollMatch[2]}`);

    const parenMatches = [...this.maskEnricherParens(text).matchAll(/[（(]([^)）]+)[)）]/g)];
    const durationMatch = parenMatches
      .map(match => this.unmaskEnricherParens(match[1]).trim())
      .findLast(value => this.looksLikeDuration(value));
    if (durationMatch) return this.parseDuration(durationMatch);

    const forMatch = this.stripEnrichment(text).match(getParserLocale().forDurationPattern);
    return forMatch ? this.parseDuration(forMatch[1]) : null;
  }

  static removeStageDurationText(text) {
    const withoutDurations = this.maskEnricherParens(text)
      .replace(/[（(]([^)）]+)[)）]/g, (match, content) => this.looksLikeDuration(content.trim()) ? '' : match);
    return this.unmaskEnricherParens(withoutDurations)
      .replace(getParserLocale().forDurationPattern, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static looksLikeDuration(text) {
    return getParserLocale().durationDiceRegex.test(text) || getParserLocale().durationFixedRegex.test(text);
  }

  /**
   * Replaces "(" and ")" inside bracketed enrichers (@Damage[...], @Check[...], [[/r ...]])
   * with private-use placeholders, keeping string length and positions unchanged.
   */
  static maskEnricherParens(text) {
    if (typeof text !== 'string' || !text.includes('[')) return text;
    let result = '';
    let depth = 0;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '[' && (depth > 0 || /@\w+$/.test(text.slice(Math.max(0, index - 32), index)) || text[index + 1] === '[')) {
        depth += 1;
      } else if (char === ']' && depth > 0) {
        depth -= 1;
      }
      if (depth > 0 && char === '(') result += PAREN_OPEN_MASK;
      else if (depth > 0 && char === ')') result += PAREN_CLOSE_MASK;
      else result += char;
    }
    return result;
  }

  static unmaskEnricherParens(text) {
    if (typeof text !== 'string') return text;
    return text.replaceAll(PAREN_OPEN_MASK, '(').replaceAll(PAREN_CLOSE_MASK, ')');
  }

  static stripEnrichment(text) {
    return text
      .replace(/\[\[[^\]]*\]\]\{([^}]+)\}/g, '$1')
      .replace(/@\w+\[[^\]]*\]\{([^}]+)\}/g, '$1')
      .replace(/@\w+\[[^\]]*\]/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static detectManualHandling(effectsText) {
    const stripped = this.stripEnrichment(effectsText).toLowerCase();
    const locale = getParserLocale();
    return locale.manualKeywords.some(keyword => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isAscii = /^[\x20-\x7e]+$/.test(keyword);
      if (isAscii) {
        return new RegExp(`\\b${escaped}\\b`).test(stripped);
      }
      // Non-ASCII: use space/punctuation boundaries for word-boundary locales,
      // plain substring match for CJK locales (no word separators).
      if (!locale.useWordBoundaries) {
        return new RegExp(escaped).test(stripped);
      }
      return new RegExp(`(?:^|[\\s,;.])${escaped}(?:[\\s,;.]|$)`).test(stripped);
    });
  }

  static detectDeath(effectsText) {
    const stripped = this.stripEnrichment(effectsText).toLowerCase();
    if (stripped === 'death') return true;
    return getParserLocale().deathPattern.test(stripped);
  }

  static resolveStageReferences(stages) {
    const { asStagePattern } = getParserLocale();
    for (const stage of stages) {
      const stripped = this.stripEnrichment(stage.effects || stage.rawText || '').toLowerCase();
      const match = stripped.match(asStagePattern);
      if (!match) continue;

      const refNum = parseInt(match[1]);
      const ref = stages.find(s => s.number === refNum);
      if (!ref) continue;

      stage.damage = ref.damage;
      stage.conditions = ref.conditions;
      stage.weakness = ref.weakness;
      if (ref.visibilityEffects) stage.visibilityEffects = ref.visibilityEffects;
      stage.requiresManualHandling = ref.requiresManualHandling;
      stage.isDead = ref.isDead;
    }
  }

  static parseDuration(text) {
    const locale = getParserLocale();

    if (text !== null && typeof text === 'object') {
      if (!text.value || text.unit === 'unlimited') return null;
      const unit = locale.durationUnitMap[text.unit.toLowerCase()] ?? text.unit.toLowerCase().replace(/s$/, '');
      return { value: text.value, unit, isDice: false };
    }

    const diceMatch = text.match(locale.durationDiceRegex);
    if (diceMatch) {
      const formula = diceMatch[1];
      const rawUnit = diceMatch[2];
      const unit = locale.durationUnitMap[rawUnit.toLowerCase()] ?? rawUnit.toLowerCase().replace(/s$/, '');
      return { formula, value: null, unit, isDice: true };
    }

    const fixedMatch = text.match(locale.durationFixedRegex);
    if (fixedMatch) {
      const rawUnit = fixedMatch[2];
      const unit = locale.durationUnitMap[rawUnit.toLowerCase()] ?? rawUnit.toLowerCase().replace(/s$/, '');
      return { value: parseInt(fixedMatch[1]), unit, isDice: false };
    }

    return { value: 1, unit: 'round', isDice: false };
  }

  static extractDamage(text) {
    const locale = getParserLocale();
    const damageEntries = [];
    const seenFormulas = new Set();

    for (const match of text.matchAll(locale.orDamagePattern)) {
      const formula = match[1].trim();
      const type1 = match[2].trim().toLowerCase();
      const type2 = match[3].trim().toLowerCase();
      if (!seenFormulas.has(formula)) {
        damageEntries.push({ formula, type: type1, isChoice: true, alternativeType: type2 });
        seenFormulas.add(formula);
      }
    }

    // Inline roll format: [[/r 1d6[poison]]] or [[/br 1d6[poison]]]
    // FoundryVTT engine syntax — locale-independent.
    for (const match of text.matchAll(/\[\[\/(?:br?\s+)([\dd\w+-]+)\[(\w+)\]\]\]/gi)) {
      const formula = match[1].trim();
      const type = match[2].trim().toLowerCase();
      if (!seenFormulas.has(formula)) {
        damageEntries.push({ formula, type });
        seenFormulas.add(formula);
      }
    }

    // @Damage enricher — FoundryVTT engine syntax, locale-independent.
    for (const content of this.extractDamageEnricherContents(text)) {
      const parsed = this.parseDamageEnricherContent(content);
      if (!parsed || seenFormulas.has(parsed.formula)) continue;
      damageEntries.push(parsed);
      seenFormulas.add(parsed.formula);
    }

    // Plain-text fallback: "1d6 fire" — uses locale damage type list.
    const typePattern = locale.damageTypes.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const plainRe = new RegExp(`(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\s+(${typePattern})(?!\\s+or)`, 'gi');
    for (const match of text.matchAll(plainRe)) {
      const formula = match[1].trim();
      const type = match[2].trim().toLowerCase();
      if (!seenFormulas.has(formula)) {
        damageEntries.push({ formula, type });
        seenFormulas.add(formula);
      }
    }

    return damageEntries;
  }

  static extractDamageEnricherContents(text) {
    const contents = [];
    const marker = '@Damage[';
    let searchStart = 0;

    while (searchStart < text.length) {
      const markerIndex = text.indexOf(marker, searchStart);
      if (markerIndex === -1) break;

      let depth = 1;
      let content = '';
      let index = markerIndex + marker.length;

      for (; index < text.length; index++) {
        const char = text[index];
        if (char === '[') {
          depth += 1;
        } else if (char === ']') {
          depth -= 1;
          if (depth === 0) break;
        }
        content += char;
      }

      if (depth === 0 && content.trim()) contents.push(content.trim());
      searchStart = index + 1;
    }

    return contents;
  }

  /**
   * Resolves roll-data references (@item.rank, @item.level, ...) and simple math
   * functions in stage damage formulas against the source item. Formulas that
   * cannot be fully resolved are kept verbatim so PF2e can still evaluate them.
   */
  static resolveStageDamageFormulas(stages, item) {
    if (!Array.isArray(stages) || !item) return stages;
    const needsResolution = entry => typeof entry?.formula === 'string' && /[@a-z]{2,}\s*\(|@|\(/i.test(entry.formula);
    if (!stages.some(stage => stage.damage?.some?.(needsResolution))) return stages;

    const sources = this.getFormulaRollDataSources(item);
    for (const stage of stages) {
      if (!Array.isArray(stage.damage)) continue;
      stage.damage = stage.damage.map(entry => needsResolution(entry)
        ? { ...entry, formula: this.resolveDamageFormula(entry.formula, ...sources) }
        : entry);
    }
    return stages;
  }

  static getFormulaRollDataSources(item) {
    let rollData = null;
    try {
      rollData = typeof item.getRollData === 'function' ? item.getRollData() : null;
    } catch {
      rollData = null;
    }

    const rankCandidates = [
      rollData?.castRank,
      item.rank,
      item.system?.location?.heightenedLevel,
      item.system?.level?.value,
    ];
    const rank = rankCandidates.map(Number).find(value => Number.isFinite(value) && value > 0);
    const level = item.type === 'spell'
      ? rank
      : [item.level, item.system?.level?.value].map(Number).find(value => Number.isFinite(value) && value >= 0);
    const fallback = { item: {} };
    if (rank !== undefined) fallback.item.rank = rank;
    if (level !== undefined) fallback.item.level = level;
    return [rollData || {}, fallback];
  }

  static resolveDamageFormula(formula, ...sources) {
    if (typeof formula !== 'string' || !formula.trim()) return formula;

    let unresolved = false;
    let result = formula.replace(/@([a-z_]\w*(?:\.\w+)*)/gi, (_match, path) => {
      for (const source of sources) {
        const value = this.getFormulaValue(source, path);
        if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
          return String(Number(value));
        }
      }
      unresolved = true;
      return _match;
    });
    if (unresolved) return formula;

    // Collapse innermost dice-free groups: "(5)" -> "5", "max(4,5-1)" -> "4".
    const groupRe = /([a-z]+)?\(([^()]*)\)/gi;
    for (let pass = 0; pass < 50; pass++) {
      let failed = false;
      const next = result.replace(groupRe, (match, fn, inner) => {
        if (!/^[\d.\s+\-*/,]*$/.test(inner)) return match;
        const args = inner.split(',').map(arg => this.evaluateArithmetic(arg));
        let value;
        if (fn) {
          const handler = FORMULA_FUNCTIONS[fn.toLowerCase()];
          if (!handler || args.some(arg => !Number.isFinite(arg))) {
            failed = true;
            return match;
          }
          value = handler(...args);
        } else {
          if (args.length !== 1 || !Number.isFinite(args[0])) return match;
          value = args[0];
        }
        if (!Number.isFinite(value)) {
          failed = true;
          return match;
        }
        return value < 0 ? `(${value})` : String(value);
      });
      if (failed) return formula;
      if (next === result) break;
      result = next;
    }

    // Anything function-like left over means we could not fully evaluate it.
    if (/[a-z]{2,}\s*\(/i.test(result)) return formula;
    return result;
  }

  static getFormulaValue(source, path) {
    let value = source;
    for (const key of path.split('.')) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    return value;
  }

  /** Evaluates a dice-free arithmetic expression (numbers, + - * /, unary minus). Returns NaN on failure. */
  static evaluateArithmetic(expression) {
    const tokens = String(expression).match(/\d+(?:\.\d+)?|[+\-*/]|\S/g) || [];
    let position = 0;
    const parseFactor = () => {
      const token = tokens[position++];
      if (token === '-') return -parseFactor();
      if (token === '+') return parseFactor();
      return token !== undefined && /^\d/.test(token) ? Number(token) : NaN;
    };
    const parseTerm = () => {
      let value = parseFactor();
      while (tokens[position] === '*' || tokens[position] === '/') {
        const operator = tokens[position++];
        const right = parseFactor();
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    };
    let value = parseTerm();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return position === tokens.length && tokens.length > 0 ? value : NaN;
  }

  static parseDamageEnricherContent(content) {
    const core = content.split('|')[0]?.trim();
    if (!core) return null;

    const typedMatch = core.match(/^(.+)\[([^\]]+)\]$/);
    if (typedMatch) {
      return {
        formula: typedMatch[1].trim(),
        type: typedMatch[2].trim().toLowerCase()
      };
    }

    return { formula: core, type: 'untyped' };
  }

  static extractWeakness(text) {
    const weaknesses = [];
    const seenTypes = new Set();

    for (const { regex, typeGroup, valueGroup } of getParserLocale().weaknessPatterns) {
      for (const match of text.matchAll(regex)) {
        const type = match[typeGroup].trim().toLowerCase();
        const value = parseInt(match[valueGroup]);
        if (!seenTypes.has(type)) {
          weaknesses.push({ type, value });
          seenTypes.add(type);
        }
      }
    }
    return weaknesses;
  }

  static extractConditions(text) {
    const conditions = [];
    const foundConditions = new Set();
    const locale = getParserLocale();

    // ── UUID enricher matches: @UUID[...]{Display Name} ────────────────────
    for (const match of text.matchAll(/@UUID\[[^\]]+\]\{([^}]+)\}/gi)) {
      const raw = match[1].trim();
      for (const [displayName, conditionKey] of locale.conditionDisplayMap) {
        const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`^${escaped}\\s*(\\d+)?$`, 'i').test(raw)) continue;

        const condKey = conditionKey.toLowerCase();
        if (!foundConditions.has(condKey)) {
          const valueMatch = raw.match(/\d+/);
          conditions.push({ name: conditionKey, value: valueMatch ? parseInt(valueMatch[0]) : null });
          foundConditions.add(condKey);
        }
        break;
      }
    }

    // ── Plain-text fallback ─────────────────────────────────────────────────
    const plainText = text.replace(/<[^>]+>/g, ' ').replace(/@UUID\[[^\]]+\]\{[^}]+\}/g, ' ');
    const b = locale.useWordBoundaries ? '\\b' : '';

    for (const [displayName, conditionKey] of locale.conditionDisplayMap) {
      const condKey = conditionKey.toLowerCase();
      if (foundConditions.has(condKey)) continue;

      const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // \b only works for ASCII characters; non-ASCII names need space/punctuation boundaries
      const isAscii = /^[\x20-\x7e]+$/.test(displayName);
      const bStart = isAscii ? b : (locale.useWordBoundaries ? '(?:^|[\\s,;.])' : '');
      const bEnd = isAscii ? b : (locale.useWordBoundaries ? '(?=[\\s,;.]|$)' : '');
      const regex = new RegExp(`${bStart}(${escaped}\\s*(\\d+)?)(?:\\s+for\\s+((?:\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?|\\d+)\\s+\\w+))?${bEnd}`, 'gi');
      const match = regex.exec(plainText);
      if (match) {
        const condition = {
          name: conditionKey,
          value: match[2] ? parseInt(match[2]) : null
        };
        if (match[3]) condition.duration = this.parseDuration(match[3]);
        conditions.push(condition);
        foundConditions.add(condKey);
      }
    }

    return conditions;
  }

  static extractStageConditionData(text) {
    const visibilityEffects = this.extractVisibilityEffects(text);
    const relativeStates = new Set(visibilityEffects.map(effect => effect.state));
    const conditions = this.extractConditions(text).filter(condition => !relativeStates.has(condition.name));
    return visibilityEffects.length > 0
      ? { conditions, visibilityEffects }
      : { conditions };
  }

  static normalizeStageVisibility(stage) {
    if (!stage) return stage;

    const parsedEffects = this.extractVisibilityEffects(stage.effects || stage.rawText || '');
    const visibilityEffects = stage.visibilityEffects?.length > 0
      ? stage.visibilityEffects
      : parsedEffects;
    if (visibilityEffects.length === 0) return stage;

    const relativeStates = new Set(visibilityEffects.map(effect => effect.state));
    return {
      ...stage,
      conditions: (stage.conditions ?? []).filter(condition => !relativeStates.has(condition.name)),
      visibilityEffects,
    };
  }

  static extractVisibilityEffects(text) {
    const effects = [];
    const seen = new Set();
    const plainText = this.stripEnrichment(text);
    const relativeDarkvisionPattern = /\bcreatures?\s+you\s+can\s+see\s+only\s+with\s+darkvision\s+are\s+(concealed|hidden)\s+from\s+you\b/gi;

    for (const match of plainText.matchAll(relativeDarkvisionPattern)) {
      const state = match[1].toLowerCase();
      if (seen.has(state)) continue;
      effects.push({ state, sense: 'darkvision', only: true });
      seen.add(state);
    }

    return effects;
  }

  static extractMaxDuration(description) {
    const locale = getParserLocale();
    const maxMatch = description.match(new RegExp(`${locale.maxDurationLabelRe}(?:<\\/[^>]+>)?${locale.afterLabel}([^;.<]+)`, 'i'));
    if (maxMatch) return this.parseDuration(maxMatch[1].trim());
    return null;
  }

  static durationToSeconds(duration) {
    if (!duration) return 0;
    const unit = duration.unit.toLowerCase();
    const multiplier = DURATION_MULTIPLIERS[unit] || DURATION_MULTIPLIERS['round'];
    return (duration.value ?? 0) * multiplier;
  }

  static getStageDuration(affliction, stage = affliction.stages?.[affliction.currentStage - 1]) {
    if (!stage?.duration) return null;
    // Stage definitions retain their formula; the roll belongs to this stage visit.
    return stage.duration.isDice
      ? affliction.currentStageResolvedDuration ?? stage.duration
      : stage.duration;
  }

  static async resolveStageDuration(duration, stageName = 'Stage') {
    if (!duration) return 0;

    if (!duration.isDice || !duration.formula) {
      return this.durationToSeconds(duration);
    }

    const formula = duration.formula;
    let total;
    try {
      const roll = new Roll(formula);
      await roll.evaluate();
      total = roll.total;
    } catch (e) {
      console.warn('PF2e Afflictioner | Roll.evaluate failed, using fallback:', e);
    }
    if (!total || total < 1) {
      const [numDice, dieSize] = formula.split('d').map(Number);
      total = 0;
      for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * dieSize) + 1;
      }
    }

    ChatMessage.create({
      flavor: `${stageName} Duration`,
      content: `<div class="dice-roll"><div class="dice-result"><h4 class="dice-formula">${formula} ${duration.unit}(s)</h4><div class="dice-total">${total}</div></div></div>`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.DICE_DURATION_ROLLED', {
      stageName,
      formula,
      total,
      unit: duration.unit
    }));

    duration.value = total;

    const unit = duration.unit.toLowerCase();
    const multiplier = DURATION_MULTIPLIERS[unit] || DURATION_MULTIPLIERS['round'];
    return total * multiplier;
  }

  static formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0s';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * For spells that contain an embedded affliction (e.g. "Spider Sting" spell embeds "Spider Venom"),
   * extract the actual affliction name from the description.
   * Looks for patterns like: <strong>Spider Venom</strong> (poison)
   */
  static extractEmbeddedAfflictionName(description, type) {
    if (!description || !type) return null;
    const typePattern = type === 'poison' ? 'poison' : type === 'disease' ? 'disease' : type === 'curse' ? 'curse' : 'poison|disease|curse';
    const match = description.match(new RegExp(`<strong>([^<]+)<\\/strong>\\s*\\(${typePattern}\\)`, 'i'));
    if (match) return match[1].trim();
    return null;
  }

  static extractMultipleExposure(description) {
    if (!description) return null;
    const plainText = description.replace(/<[^>]+>/g, ' ');

    for (const { main, minStage } of getParserLocale().multipleExposurePatterns) {
      const match = plainText.match(main);
      if (!match) continue;

      const stageIncrease = parseInt(match[1]) || 1;
      const minStageMatch = minStage ? plainText.match(minStage) : null;
      return {
        enabled: true,
        stageIncrease,
        minStage: minStageMatch ? parseInt(minStageMatch[1]) : null,
        rawText: match[0]
      };
    }

    return null;
  }

  static extractRecoveryRestriction(description) {
    if (!description) return null;
    const plainText = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const locale = getParserLocale();
    const minimumStageMatch = locale.minimumStagePattern?.exec(plainText) || null;
    const unhealableDamage = (locale.unhealableDamagePatterns || []).some(pattern => pattern.test(plainText));
    const requiresCounteract = (locale.counteractUnlockPatterns || []).some(pattern => pattern.test(plainText));

    if (!minimumStageMatch && !unhealableDamage) return null;
    return {
      minimumStage: minimumStageMatch ? parseInt(minimumStageMatch[1]) : null,
      unhealableDamage,
      requiresCounteract,
    };
  }

  static extractReferencedAfflictions(text) {
    const locale = getParserLocale();
    if (!locale.referencedAfflictionPatterns) return [];

    const stripped = this.stripEnrichment(text);
    const references = [];
    const seenNames = new Set();

    for (const pattern of locale.referencedAfflictionPatterns) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      for (const match of stripped.matchAll(pattern)) {
        const name = match[1].trim().replace(/[,;.]+$/, '');
        if (name.length > 2 && !seenNames.has(name.toLowerCase())) {
          references.push(name);
          seenNames.add(name.toLowerCase());
        }
      }
    }
    return references;
  }

  static extractEffectSection(description) {
    const locale = getParserLocale();
    if (!locale.effectLabelRe) return null;

    // HTML: <strong>Effect</strong> content until next <strong> or end
    const htmlMatch = description.match(
      new RegExp(`<strong>${locale.effectLabelRe}<\\/strong>${locale.afterLabelOpt}([\\s\\S]*?)(?=<strong>|$)`, 'i')
    );
    if (htmlMatch) return htmlMatch[1].trim();

    // Plain text fallback
    const plainMatch = description.match(
      new RegExp(`${locale.effectLabelRe}${locale.afterLabel}([^<]+)`, 'i')
    );
    return plainMatch ? plainMatch[1].trim() : null;
  }

  static parseEffectOnlyItem(item) {
    const traits = item.system?.traits?.value || [];
    const type = traits.includes('poison') ? 'poison' :
      traits.includes('disease') ? 'disease' :
        traits.includes('curse') ? 'curse' : null;
    if (!type) return null;

    const description = item.system?.description?.value || '';

    const effectText = this.extractEffectSection(description);
    if (!effectText) return null;

    const strippedEffect = this.stripEnrichment(effectText);

    return {
      name: item.name,
      type,
      dc: this.extractDC(description, item),
      saveType: this.extractSaveType(description, item),
      onset: null,
      stages: null,
      isEffectOnly: true,
      effectText: effectText,
      effectConditions: this.extractConditions(effectText),
      maxDuration: this.extractMaxDuration(description) || null,
      isVirulent: traits.includes('virulent'),
      sourceItemUuid: item.uuid,
      level: item.system?.level?.value || 0,
      img: item.img || DEFAULT_AFFLICTION_ICON,
      traits,
      requiresManualHandling: this.detectManualHandling(strippedEffect),
    };
  }
}
