import * as AfflictionStore from '../stores/AfflictionStore.js';
import * as AfflictionDefinitionStore from '../stores/AfflictionDefinitionStore.js';
import * as WeaponCoatingStore from '../stores/WeaponCoatingStore.js';
import { AfflictionService } from '../services/AfflictionService.js';
import { AfflictionEditorService } from '../services/AfflictionEditorService.js';
import { TreatmentService } from '../services/TreatmentService.js';
import { CounteractService } from '../services/CounteractService.js';
import { AfflictionParser } from '../services/AfflictionParser.js';
import { WeaponCoatingService } from '../services/WeaponCoatingService.js';
import { shouldSkipAffliction, shouldSkipPromptAffliction } from '../utils.js';
import { AfflictionItemResolver } from '../services/AfflictionItemResolver.js';
import * as ImmunityBypassRuleStore from '../stores/ImmunityBypassRuleStore.js';
import { AddictionService } from '../services/AddictionService.js';
import { FeatModifierService } from '../services/FeatModifierService.js';
import { FeatsService } from '../services/FeatsService.js';
export class AfflictionManager extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static currentInstance = null;

  static _getTargetToken(options = {}) {
    return options.filterTokenId
      ? canvas.tokens.get(options.filterTokenId)
      : canvas.tokens.controlled[0] || null;
  }

  static _getTargetActor(options = {}) {
    if (options.filterActorId) return game.actors.get(options.filterActorId) || null;
    return this._getTargetToken(options)?.actor || null;
  }

  static _getStageNumber(affliction) {
    if (affliction?.currentStage === null || affliction?.currentStage === undefined || affliction?.currentStage === '') {
      return null;
    }
    const stageNumber = Number(affliction?.currentStage);
    return Number.isInteger(stageNumber) ? stageNumber : null;
  }

  static _getStageCount(affliction) {
    return Array.isArray(affliction?.stages) ? affliction.stages.length : 0;
  }

  static _getCurrentStageData(affliction) {
    const stageNumber = this._getStageNumber(affliction);
    if (stageNumber === null || stageNumber < 1 || !Array.isArray(affliction?.stages)) return undefined;
    return affliction.stages[stageNumber - 1];
  }

  static canOpenLimitedCoatingView(options = {}) {
    if (game.user.isGM) return true;
    if (!game.settings.get('pf2e-afflictioner', 'allowPlayerWeaponCoatingAccess')) return false;

    const token = this._getTargetToken(options);
    const actor = this._getTargetActor(options);
    return !!(token?.actor?.isOwner || actor?.isOwner);
  }

  static DEFAULT_OPTIONS = {
    id: 'pf2e-afflictioner-manager',
    classes: ['pf2e-afflictioner', 'affliction-manager'],
    tag: 'div',
    window: {
      title: 'PF2E_AFFLICTIONER.MANAGER.TITLE',
      icon: 'fas fa-biohazard',
      resizable: true
    },
    position: {
      width: 600,
      height: 'auto'
    },
    actions: {
      addAffliction: AfflictionManager.addAffliction,
      addAddiction: AfflictionManager.addAddiction,
      takeDrug: AfflictionManager.takeDrug,
      removeAffliction: AfflictionManager.removeAffliction,
      clearAllAfflictions: AfflictionManager.clearAllAfflictions,
      editAffliction: AfflictionManager.editAffliction,
      progressStage: AfflictionManager.progressStage,
      regressStage: AfflictionManager.regressStage,
      rollSave: AfflictionManager.rollSave,
      rollDamage: AfflictionManager.rollDamage,
      treatAffliction: AfflictionManager.treatAffliction,
      counteractAffliction: AfflictionManager.counteractAffliction,
      specialSave: AfflictionManager.specialSave,
      removeCoating: AfflictionManager.removeCoating,
      addCoating: AfflictionManager.addCoating,
      removeInjection: AfflictionManager.removeInjection,
      addInjection: AfflictionManager.addInjection,
      installInjectionReservoir: AfflictionManager.installInjectionReservoir,
      removeInjectionReservoir: AfflictionManager.removeInjectionReservoir,
      openPoisonItem: AfflictionManager.openPoisonItem,
      saveSourceImmunityBypassRule: AfflictionManager.saveSourceImmunityBypassRule,
      openSourceRuleAffliction: AfflictionManager.openSourceRuleAffliction,
      removeSourceRuleAffliction: AfflictionManager.removeSourceRuleAffliction,
      addSourceRuleTrait: AfflictionManager.addSourceRuleTrait,
      removeSourceRuleTrait: AfflictionManager.removeSourceRuleTrait
    }
  };

  static PARTS = {
    form: {
      template: 'modules/pf2e-afflictioner/templates/affliction-manager.hbs'
    }
  };

  constructor(options = {}) {
    super(options);

    this.filterTokenId = options.filterTokenId || null;
    this.filterActorId = options.filterActorId || null;
    this.playerCoatingOnly = !game.user.isGM;

    if (!AfflictionManager.canOpenLimitedCoatingView(options)) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.GM_ONLY_MANAGER'));
      this.close();
      return;
    }

    this._activeTab = this.playerCoatingOnly ? 'coatings' : 'afflictions';
    AfflictionManager.currentInstance = this;
    this._setupAutoRefresh();
  }

  _setupAutoRefresh() {
    this._combatHook = Hooks.on('updateCombat', () => {
      this.render({ force: true });
    });

    this._tokenUpdateHook = Hooks.on('updateToken', () => {
      this.render({ force: true });
    });

    this._worldTimeHook = Hooks.on('updateWorldTime', (_worldTime, _delta) => {
      this.render({ force: true });
    });

    this._actorUpdateHook = Hooks.on('updateActor', () => {
      this.render({ force: true });
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    const element = this.element;
    if (!element) return;

    // Tab switching (runs every render to reflect active tab)
    const tabBtns = element.querySelectorAll('.affliction-manager-tab-btn');
    const tabPanels = element.querySelectorAll('.affliction-manager-tab-panel');

    const applyTab = (tabName) => {
      this._activeTab = tabName;
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
      tabPanels.forEach(p => {
        p.style.display = p.dataset.tab === tabName ? '' : 'none';
      });
    };

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => applyTab(btn.dataset.tab));
    });

    applyTab(this._activeTab);

    element.querySelectorAll('.source-rule-trait-input').forEach(input => {
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const panel = input.closest('.source-immunity-bypass-rule');
        this.constructor._appendTraitTag(panel, input.value);
        input.value = '';
      });
    });

    if (this._dropHandlersInitialized) return;
    this._dropHandlersInitialized = true;

    element.addEventListener('drop', this._onDrop.bind(this));
    element.addEventListener('dragover', this._onDragOver.bind(this));
    element.addEventListener('dragenter', this._onDragEnter.bind(this));
    element.addEventListener('dragleave', this._onDragLeave.bind(this));
  }

  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  _onDragEnter(event) {
    event.preventDefault();
    const element = this.element;
    if (element) {
      element.classList.add('drag-over');
      element.style.outline = '2px dashed #4CAF50';
    }
  }

  _onDragLeave(event) {
    if (event.target === this.element) {
      const element = this.element;
      if (element) {
        element.classList.remove('drag-over');
        element.style.outline = '';
      }
    }
  }

  async _onDrop(event) {
    event.preventDefault();

    const element = this.element;
    if (element) {
      element.classList.remove('drag-over');
      element.style.outline = '';
    }

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.INVALID_DRAG_DATA'));
      return;
    }

    const sourceRulePanel = event.target.closest('.source-immunity-bypass-rule');
    if (sourceRulePanel) {
      await this._addDroppedAfflictionKeyToSourceRule(data, sourceRulePanel);
      return;
    }

    const tokenSection = event.target.closest('.token-section');
    let targetTokenId = null;

    if (tokenSection) {
      const firstAffliction = tokenSection.querySelector('[data-token-id]');
      if (firstAffliction) {
        targetTokenId = firstAffliction.dataset.tokenId;
      }
    }

    if (data.type === 'Affliction' && data.afflictionData) {
      await this._applyDraggedAffliction(data.afflictionData, data.itemUuid, targetTokenId);
      return;
    }

    if (data.type === 'Item') {
      await this._applyDraggedItem(data.uuid, targetTokenId);
      return;
    }
  }

  async _addDroppedAfflictionKeyToSourceRule(data, panel) {
    if (!game.user.isGM || data.type !== 'Item' || !data.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item || !AfflictionParser.getAfflictionType(item)) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.ITEM_MUST_HAVE_TRAIT_FULL'));
      return;
    }

    this.constructor._appendAfflictionKeyTag(panel, {
      key: item.uuid,
      name: item.name,
      uuid: item.uuid,
    });
  }

  async _applyDraggedAffliction(afflictionData, _itemUuid, targetTokenId = null) {
    let token = null;

    if (targetTokenId) {
      token = canvas.tokens.get(targetTokenId);
    } else if (this.filterTokenId) {
      token = canvas.tokens.get(this.filterTokenId);
    } else {
      token = canvas.tokens.controlled[0];
    }

    if (!token) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.SELECT_TOKEN_OR_DROP'));
      return;
    }

    const { AfflictionService } = await import('../services/AfflictionService.js');
    await AfflictionService.promptInitialSave(token, afflictionData);

    this.render({ force: true });
  }

  async _applyDraggedItem(itemUuid, targetTokenId = null) {
    let token = null;

    if (targetTokenId) {
      token = canvas.tokens.get(targetTokenId);
    } else if (this.filterTokenId) {
      token = canvas.tokens.get(this.filterTokenId);
    } else {
      token = canvas.tokens.controlled[0];
    }

    if (!token) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.SELECT_TOKEN_OR_DROP'));
      return;
    }

    const item = await fromUuid(itemUuid);
    if (!item) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.COULD_NOT_LOAD_ITEM'));
      return;
    }

    if (!AfflictionItemResolver.hasDirectOrReferencedAfflictionText(item)) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.ITEM_MUST_HAVE_TRAIT_FULL'));
      return;
    }

    const afflictionData = await AfflictionItemResolver.resolveFromItem(item);
    if (shouldSkipPromptAffliction(afflictionData)) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_SKIPPED'));
      return;
    }

    if (!afflictionData) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.COULD_NOT_PARSE'));
      return;
    }
    afflictionData.originActorUuid = item.parent?.uuid || null;
    afflictionData.originActorId = item.parent?.id || null;
    AfflictionService.applyOriginActorMetadata(afflictionData, item.parent);

    await this._applyDraggedAffliction(afflictionData, itemUuid);
  }

  async close(options = {}) {
    if (this._combatHook) {
      Hooks.off('updateCombat', this._combatHook);
    }
    if (this._tokenUpdateHook) {
      Hooks.off('updateToken', this._tokenUpdateHook);
    }
    if (this._worldTimeHook) {
      Hooks.off('updateWorldTime', this._worldTimeHook);
    }
    if (this._actorUpdateHook) {
      Hooks.off('updateActor', this._actorUpdateHook);
    }

    this._dropHandlersInitialized = false;

    AfflictionManager.currentInstance = null;
    return super.close(options);
  }

  static _isVirulentStrikeAvailable() {
    const actors = game.actors?.contents ?? [];
    return actors.some(actor => FeatsService.hasFeat(actor, 'virulent-strike'));
  }

  _enrichAfflictions(afflictions, actor = null) {
    const virulentStrikeAvailable = this.constructor._isVirulentStrikeAvailable();
    return Object.values(afflictions).map(aff => {
      const specialSaveOptions = FeatModifierService.getSpecialSaveOptions(actor, aff, { virulentStrikeAvailable });
      const stageNumber = this.constructor._getStageNumber(aff);
      const stageCount = this.constructor._getStageCount(aff);
      const currentStage = this.constructor._getCurrentStageData(aff);
      const hasDamage = !!(currentStage?.damage?.length > 0);
      const stageDisplay = stageNumber === -1
        ? game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.INITIAL_SAVE')
        : aff.inOnset
          ? game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.ONSET')
          : stageNumber === null
            ? 'Stage information unavailable'
            : `${game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.STAGE')} ${stageNumber}`;

      return {
        ...aff,
        canTakeDrug: aff.isAddiction && AddictionService.isEnabled(),
        canRollSave: !aff.isAddiction || AddictionService.isEnabled(),
        addictionMaximum: aff.isAddiction ? game.i18n.format('PF2E_AFFLICTIONER.ADDICTION.MAXIMUM', { stage: aff.addictionMaximumStage || 0 }) : '',
        addictionSuppression: aff.isAddiction && aff.suppressedUntil > game.time.worldTime
          ? game.i18n.format('PF2E_AFFLICTIONER.ADDICTION.SUPPRESSED', { duration: AfflictionParser.formatDuration(aff.suppressedUntil - game.time.worldTime) }) : '',
        stageDisplay,
        nextSaveDisplay: this.formatNextSave(aff),
        treatmentDisplay: this.formatTreatment(aff),
        hasWarning: currentStage?.requiresManualHandling || false,
        hasDamage: hasDamage,
        stageTooltip: this.formatStageTooltip(aff),
        isVirulent: aff.isVirulent || false,
        hasMultipleExposure: aff.multipleExposure?.enabled || false,
        multipleExposureIncrease: aff.multipleExposure?.stageIncrease || 0,
        canProgressStage: (!aff.isAddiction || AddictionService.isEnabled()) && stageNumber !== null && stageNumber < stageCount,
        canRegressStage: (!aff.isAddiction || AddictionService.isEnabled()) && stageNumber !== null && stageNumber > 1,
        hasSpecialSaves: specialSaveOptions.length > 0
      };
    });
  }

  async _prepareContext(_options) {
    const tokensWithAfflictions = [];
    const seenActorIds = new Set();
    const canManageAfflictions = !this.playerCoatingOnly;

    const tokensToCheck = canManageAfflictions
      ? (this.filterTokenId
      ? [canvas.tokens.get(this.filterTokenId)].filter(t => t)
      : canvas.tokens.placeables)
      : [];

    const combat = game.combat;

    for (const token of tokensToCheck) {
      const afflictions = AfflictionStore.getAfflictions(token);

      for (const [id, affliction] of Object.entries(afflictions)) {
        if (affliction.isAddiction && !AddictionService.isEnabled()) continue;
        if (!combat && !affliction.inOnset) {
          const needsMigration = !affliction.nextSaveTimestamp || affliction.nextSaveTimestamp > 1000000000000;

          if (needsMigration) {
            const currentStage = this.constructor._getCurrentStageData(affliction);
            if (currentStage?.duration) {
              const durationSeconds = AfflictionParser.durationToSeconds(AfflictionParser.getStageDuration(affliction, currentStage));
              const nextSaveTimestamp = game.time.worldTime + durationSeconds;

              await AfflictionStore.updateAffliction(token, id, {
                nextSaveTimestamp: nextSaveTimestamp
              });
            }
          }
        }
      }

      const updatedAfflictions = AfflictionStore.getAfflictions(token);
      if (Object.keys(updatedAfflictions).length > 0) {
        const actorId = (token.document.actorLink && token.actor) ? token.actor.id : null;
        if (actorId) seenActorIds.add(actorId);
        tokensWithAfflictions.push({
          token: token,
          tokenId: token.id,
          actorId,
          name: token.name,
          img: token.document.texture.src,
          afflictions: this._enrichAfflictions(updatedAfflictions, token.actor)
        });
      }
    }

    // Off-scene linked actors with afflictions (not already shown via a canvas token)
    if (canManageAfflictions && !this.filterTokenId) {
      const actorsToCheck = this.filterActorId
        ? [game.actors.get(this.filterActorId)].filter(a => a)
        : game.actors.contents;

      for (const actor of actorsToCheck) {
        if (seenActorIds.has(actor.id)) continue;
        const afflictions = AfflictionStore.getAfflictionsForActor(actor);
        if (Object.keys(afflictions).length === 0) continue;

        tokensWithAfflictions.push({
          token: null,
          tokenId: null,
          actorId: actor.id,
          name: actor.name,
          img: actor.img,
          afflictions: this._enrichAfflictions(afflictions, actor)
        });
      }
    }

    // Build weapons list for the currently controlled/filtered token only
    const actorsWithWeapons = [];
    const controlledToken = this.filterTokenId
      ? canvas.tokens.get(this.filterTokenId)
      : canvas.tokens.controlled[0];

    if (controlledToken?.actor) {
      const actor = controlledToken.actor;
      const storageTarget = controlledToken.document?.actorLink ? actor : controlledToken;
      const weapons = WeaponCoatingService._getCoatableWeaponItems(actor).filter(w => {
        const dt = WeaponCoatingService._getWeaponDamageType(w);
        return dt === 'piercing' || dt === 'slashing' || WeaponCoatingService._isInjectionWeapon(w);
      });
      if (weapons.length) {
        const actorUuid = WeaponCoatingService._getActorReference(actor);
        const entry = { actorId: actor.id, actorUuid, tokenId: controlledToken.id, actorName: controlledToken.name || actor.name, weapons: [] };
        const hasFreeReservoir = !!actor.isOwner && WeaponCoatingService._getAvailableInjectionReservoirCount(actor) > 0;
        for (const weapon of weapons) {
          const coating = WeaponCoatingStore.getCoating(storageTarget, weapon.id);
          const injection = WeaponCoatingStore.getInjection(storageTarget, weapon.id);
          entry.weapons.push({
            actorId: actor.id,
            actorUuid,
            tokenId: controlledToken.id,
            weaponId: weapon.id,
            weaponName: weapon.name,
            damageType: WeaponCoatingService._getWeaponDamageType(weapon),
            canCoat: ['piercing', 'slashing'].includes(WeaponCoatingService._getWeaponDamageType(weapon)),
            hasInjectionTrait: WeaponCoatingService._isInjectionWeapon(weapon),
            hasInjectionReservoir: WeaponCoatingService._hasInjectionReservoir(weapon),
            canInstallInjectionReservoir: hasFreeReservoir && WeaponCoatingService._canFitInjectionReservoir(weapon),
            isCoated: !!coating,
            poisonName: coating?.poisonName || null,
            poisonItemUuid: coating?.poisonItemUuid || null,
            componentPoisonLinks: coating ? this.constructor._getCoatingComponentLinks(coating) : [],
            coatingTooltip: coating ? this.constructor._formatCoatingTooltip(coating.afflictionData) : null,
            canAddDoublePoison: WeaponCoatingService._canAddSecondPoison(actor, coating),
            isInjectionLoaded: !!injection,
            injectionName: injection?.poisonName || null,
            injectionItemUuid: injection?.poisonItemUuid || null,
            injectionTooltip: injection ? this.constructor._formatCoatingTooltip(injection.afflictionData) : null,
          });
        }
        actorsWithWeapons.push(entry);
      }
    }

    // Collect injury-trait items from the controlled token's inventory only
    const injuryItems = [];
    const hasInjuryTrait = (item) => (item.system?.traits?.value || []).includes('injury');

    if (controlledToken?.actor) {
      for (const item of controlledToken.actor.items) {
        if (hasInjuryTrait(item)) {
          injuryItems.push({ uuid: item.uuid, name: item.name, ownerName: null });
        }
      }
    }

    const hasAnyCoating = actorsWithWeapons.some(a => a.weapons.some(w => w.isCoated || w.isInjectionLoaded));
    const sourceRuleActor = this.filterActorId
      ? game.actors.get(this.filterActorId) || null
      : controlledToken?.actor || null;
    const sourceImmunityBypassRule = sourceRuleActor
      ? ImmunityBypassRuleStore.getRule(sourceRuleActor)
      : null;
    if (sourceImmunityBypassRule) {
      sourceImmunityBypassRule.traitTags = sourceImmunityBypassRule.traits.map(trait => ({
        value: trait,
        label: this.constructor._formatTraitLabel(trait)
      })).filter(tag => this.constructor._isKnownBypassTrait(tag.value));
      sourceImmunityBypassRule.afflictionKeyTags = await this.constructor._resolveAfflictionKeyTags(sourceImmunityBypassRule.afflictionKeys);
    }

    return {
      playerCoatingOnly: this.playerCoatingOnly,
      canManageAfflictions,
      addictionRulesEnabled: canManageAfflictions && AddictionService.isEnabled(),
      sourceRuleActor: sourceRuleActor ? { id: sourceRuleActor.id, name: sourceRuleActor.name } : null,
      sourceImmunityBypassRule,
      sourceRuleTraitOptions: this.constructor._getTraitOptions(),
      tokens: tokensWithAfflictions,
      hasAfflictions: tokensWithAfflictions.length > 0,
      actorsWithWeapons,
      hasWeapons: actorsWithWeapons.length > 0,
      hasAnyCoating,
      injuryItems,
      hasInjuryItems: injuryItems.length > 0
    };
  }

  formatNextSave(affliction) {
    const combat = game.combat;

    if (affliction.inOnset && affliction.onsetRemaining) {
      return game.i18n.format('PF2E_AFFLICTIONER.MANAGER.ONSET_PREFIX', { duration: AfflictionParser.formatDuration(affliction.onsetRemaining) });
    }

    const stage = this.constructor._getCurrentStageData(affliction);
    const durationUnit = stage?.duration?.unit?.toLowerCase();

    if (combat && affliction.nextSaveRound) {
      const remaining = affliction.nextSaveRound - combat.round;

      if (remaining <= 0) {
        return game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.NOW');
      }

      if (durationUnit === 'round') {
        return game.i18n.format('PF2E_AFFLICTIONER.MANAGER.IN_ROUNDS', {
          rounds: remaining
        });
      } else {
        const remainingSeconds = remaining * 6;
        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.ceil((remainingSeconds % 3600) / 60);

        if (hours > 0) {
          return game.i18n.format('PF2E_AFFLICTIONER.MANAGER.TIME_HOURS_MIN', { hours, minutes });
        }
        return game.i18n.format('PF2E_AFFLICTIONER.MANAGER.TIME_MIN', { minutes });
      }
    }

    if (!combat || affliction.isAddiction) {
      if (affliction.nextSaveTimestamp) {
        const remainingSeconds = Math.max(0, affliction.nextSaveTimestamp - game.time.worldTime);

        if (remainingSeconds <= 0) return game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.SAVE_DUE');

        return `${AfflictionParser.formatDuration(remainingSeconds)} until save`;
      }

      if (stage?.duration) {
        const durationSeconds = AfflictionParser.durationToSeconds(AfflictionParser.getStageDuration(affliction, stage));
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.ceil((durationSeconds % 3600) / 60);

        if (hours > 0) {
          return game.i18n.format('PF2E_AFFLICTIONER.MANAGER.TIME_APPROX_HOURS_MIN', { hours, minutes });
        }
        return game.i18n.format('PF2E_AFFLICTIONER.MANAGER.TIME_APPROX_MIN', { minutes });
      }
    }

    return game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.NOT_AVAILABLE');
  }

  static durationToSeconds(duration) {
    if (!duration) return 0;
    return AfflictionParser.durationToSeconds(duration);
  }

  formatTreatment(affliction) {
    if (affliction.treatedThisStage) {
      const bonus = affliction.treatmentBonus;
      return `${game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.TREATMENT')}: ${bonus > 0 ? '+' : ''}${bonus}`;
    }
    return game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.NOT_TREATED');
  }

  static _formatCoatingTooltip(aff) {
    if (!aff) return '';
    const i = game.i18n;
    const lines = [];
    lines.push(i.format('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_DC', { dc: aff.dc }));
    if (aff.isVirulent) lines.push(i.localize('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_VIRULENT'));
    if (aff.onset) lines.push(i.format('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_ONSET', { value: aff.onset.value, unit: aff.onset.unit }));
    if (aff.maxDuration) lines.push(i.format('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_MAX_DURATION', { value: aff.maxDuration.value, unit: aff.maxDuration.unit }));
    if (aff.stages?.length) {
      for (const stage of aff.stages) {
        if (aff.doublePoison && stage.componentEffects?.length) {
          lines.push(i.format('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_DOUBLE_STAGE', { number: stage.number }));
          for (const component of stage.componentEffects) {
            const effects = this.cleanTooltipText(component.effects) || i.localize('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_NO_EFFECTS');
            lines.push(i.format('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_DOUBLE_COMPONENT', { poisonName: component.poisonName, effects }));
          }
          continue;
        }
        const effects = this.cleanTooltipText(stage.effects) || i.localize('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_NO_EFFECTS');
        lines.push(i.format('PF2E_AFFLICTIONER.WEAPON_COATING.TOOLTIP_STAGE', { number: stage.number, effects }));
      }
    }
    return lines.join('<br>');
  }

  static _getCoatingComponentLinks(coating) {
    if (!coating?.afflictionData?.doublePoison) return [];
    return (coating.afflictionData.componentPoisons || [])
      .map(component => ({
        name: component.name,
        uuid: component.sourceItemUuid,
      }))
      .filter(component => component.uuid);
  }

  static cleanTooltipText(text) {
    if (!text) return '';

    let cleaned = text.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/@UUID\[[^\]]+\]/g, '');
    cleaned = cleaned.replace(/@Damage\[([^[]+)\[([^\]]+)\]\]/g, '$1 ($2 damage)');
    cleaned = cleaned.replace(/@Damage\[([^\]]+)\]/g, '$1');

    return cleaned.trim();
  }

  formatStageTooltip(affliction) {
    const stageNumber = this.constructor._getStageNumber(affliction);

    if (stageNumber === -1) {
      return `Awaiting initial Fortitude save (DC ${affliction.dc}) to determine if afflicted`;
    }

    if (affliction.inOnset) {
      if (affliction.onset) {
        return `Onset: ${affliction.onset.value} ${affliction.onset.unit}(s) - No effects yet`;
      }
      return 'Onset period - No effects yet';
    }

    if (stageNumber === 0) {
      return 'Not yet afflicted';
    }

    const stage = this.constructor._getCurrentStageData(affliction);
    if (!stage) {
      return 'Stage information unavailable';
    }

    let tooltip = `Stage ${stageNumber}:\n`;

    if (stage.effects) {
      const cleanEffects = this.constructor.cleanTooltipText(stage.effects);
      tooltip += `${cleanEffects}\n`;
    }

    if (stage.damage && stage.damage.length > 0) {
      const damageText = stage.damage.map(d => {
        if (typeof d === 'string') return d;
        return `${d.formula} ${d.type}`;
      }).join(', ');
      tooltip += `Damage: ${damageText}\n`;
    }

    if (stage.conditions && stage.conditions.length > 0) {
      const conditionText = stage.conditions
        .map(c => {
          if (c.name === 'persistent damage' || c.name === 'persistent-damage') {
            return `${c.persistentFormula || '1d6'} ${c.persistentType || 'untyped'} persistent damage`;
          }
          return c.value ? `${c.name} ${c.value}` : c.name;
        })
        .join(', ');
      tooltip += `Conditions: ${conditionText}\n`;
    }

    if (stage.weakness && stage.weakness.length > 0) {
      const weaknessText = stage.weakness
        .map(w => `Weakness to ${w.type} ${w.value}`)
        .join(', ');
      tooltip += `${weaknessText}\n`;
    }

    if (stage.duration) {
      tooltip += `Duration: ${stage.duration.value} ${stage.duration.unit}(s)`;
    }

    if (stage.requiresManualHandling) {
      tooltip += `\n⚠️ Requires manual handling`;
    }

    return tooltip.trim();
  }

  static async addAffliction(_event, _button) {
    if (this.playerCoatingOnly) return;

    const token = canvas.tokens.controlled[0] ||
      (this.filterTokenId ? canvas.tokens.get(this.filterTokenId) : null);

    if (!token) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.SELECT_TOKEN_FIRST'));
      return;
    }

    const { AddAfflictionDialog } = await import('./AddAfflictionDialog.js');
    new AddAfflictionDialog(token).render(true);
  }

  static async addAddiction() {
    if (this.playerCoatingOnly || !game.user.isGM || !AddictionService.isEnabled()) return;
    const actor = AfflictionManager._getTargetActor(this);
    const token = this.filterActorId ? AfflictionStore.findTokenForActor(actor) : AfflictionManager._getTargetToken(this);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.SELECT_TOKEN_FIRST'));
      return;
    }
    const { AddAfflictionDialog } = await import('./AddAfflictionDialog.js');
    new AddAfflictionDialog(token, { actor, addictionMode: true }).render(true);
  }

  static async takeDrug(_event, button) {
    if (this.playerCoatingOnly || !game.user.isGM || !AddictionService.isEnabled()) return;
    const { token, actor } = AfflictionManager._resolveTarget(button);
    const affliction = AddictionService.get(token, actor, button.dataset.afflictionId);
    if (!affliction?.isAddiction) return;
    await AfflictionService.promptInitialSave(token, affliction, actor);
    this.render({ force: true });
  }

  /**
   * Resolve a token and/or actor from a button's dataset.
   * Returns { token, actor } where token may be null for off-scene actors.
   */
  static _resolveTarget(button) {
    const tokenId = button.dataset.tokenId;
    const actorId = button.dataset.actorId;
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    const actor = actorId ? game.actors.get(actorId) : token?.actor;
    if (!token && actor) token = AfflictionStore.findTokenForActor(actor);
    return { token, actor };
  }

  static async _resolveCoatingActor(button) {
    const tokenId = button.dataset.tokenId;
    const token = tokenId ? globalThis.canvas?.tokens?.get?.(tokenId) : null;
    if (token?.actor) return token.actor;

    const actorUuid = button.dataset.actorUuid;
    if (actorUuid && typeof fromUuid === 'function') {
      try {
        const actor = await fromUuid(actorUuid);
        if (actor) return actor;
      } catch {
        // Fall back to world actor lookup below.
      }
    }

    const actorId = button.dataset.actorId;
    return actorId ? game.actors.get(actorId) : null;
  }

  static async _resolveCoatingTarget(button) {
    const tokenId = button.dataset.tokenId;
    const token = tokenId ? globalThis.canvas?.tokens?.get?.(tokenId) : null;
    if (token?.document?.actorLink === false) return token;
    if (token?.actor) return token.actor;

    return this._resolveCoatingActor(button);
  }

  static async removeAffliction(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);

    if (!token && !actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.TOKEN_NOT_FOUND'));
      return;
    }

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : AfflictionStore.getAfflictionForActor(actor, afflictionId);

    const oldStageData = AfflictionManager._getCurrentStageData(affliction) ?? null;

    if (affliction?.isAddiction) {
      await AddictionService.remove(token, actor, affliction);
    } else if (token) {
      await AfflictionStore.removeAffliction(token, afflictionId);
    } else {
      await AfflictionStore.removeAfflictionForActor(actor, afflictionId);
    }

    if (affliction && token) {
      await AfflictionService.removeStageEffects(token, affliction, oldStageData, null);
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    if (token) {
      const remainingAfflictions = AfflictionStore.getAfflictions(token);
      if (Object.keys(remainingAfflictions).length === 0) {
        const { VisualService } = await import('../services/VisualService.js');
        await VisualService.removeAfflictionIndicator(token);
      }
    }

    this.render({ force: true });
  }

  static async editAffliction(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);

    if (!token && !actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.TOKEN_NOT_FOUND'));
      return;
    }

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : AfflictionStore.getAfflictionForActor(actor, afflictionId);
    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    const { AfflictionEditorDialog } = await import('./AfflictionEditorDialog.js');
    const key = AfflictionDefinitionStore.generateDefinitionKey(affliction);
    const existingEdit = key ? AfflictionDefinitionStore.getEditedDefinition(key) : null;
    const afflictionData = existingEdit
      ? AfflictionEditorService.applyEditedDefinition(affliction, existingEdit)
      : affliction;
    new AfflictionEditorDialog(afflictionData).render(true);
  }

  static async clearAllAfflictions(_event, _button) {
    if (this.playerCoatingOnly) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      title: game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.CLEAR_ALL_CONFIRM_TITLE'),
      content: `<p>${game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.CLEAR_ALL_CONFIRM_CONTENT')}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;

    let clearedCount = 0;
    const clearedNames = [];

    // Clear on-scene tokens
    const tokensToCheck = this.filterTokenId
      ? [canvas.tokens.get(this.filterTokenId)].filter(t => t)
      : canvas.tokens.placeables;

    for (const token of tokensToCheck) {
      const afflictions = AfflictionStore.getAfflictions(token);
      const afflictionIds = Object.keys(afflictions);

      if (afflictionIds.length === 0) continue;

      for (const afflictionId of afflictionIds) {
        const affliction = afflictions[afflictionId];
        const oldStageData = AfflictionManager._getCurrentStageData(affliction) ?? null;

        await AfflictionStore.removeAffliction(token, afflictionId);
        await AfflictionService.removeStageEffects(token, affliction, oldStageData, null);
        clearedCount++;
      }

      const { VisualService } = await import('../services/VisualService.js');
      await VisualService.removeAfflictionIndicator(token);
      clearedNames.push(token.name);
    }

    // Clear off-scene actor afflictions
    if (!this.filterTokenId) {
      const seenActorIds = new Set(tokensToCheck
        .filter(t => t.document.actorLink && t.actor)
        .map(t => t.actor.id));

      for (const actor of game.actors) {
        if (seenActorIds.has(actor.id)) continue;
        const afflictions = AfflictionStore.getAfflictionsForActor(actor);
        const afflictionIds = Object.keys(afflictions);
        if (afflictionIds.length === 0) continue;

        for (const afflictionId of afflictionIds) {
          if (afflictions[afflictionId].isAddiction) await AddictionService.remove(null, actor, afflictions[afflictionId]);
          else await AfflictionStore.removeAfflictionForActor(actor, afflictionId);
          clearedCount++;
        }
        clearedNames.push(actor.name);
      }
    }

    if (clearedCount > 0) {
      ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.MANAGER.CLEARED_ALL', {
        count: clearedCount,
        tokens: clearedNames.join(', ')
      }));
    } else {
      ui.notifications.info(game.i18n.localize('PF2E_AFFLICTIONER.MANAGER.NO_AFFLICTIONS_TO_CLEAR'));
    }

    this.render({ force: true });
  }

  static async progressStage(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);
    const entityName = token?.name || actor?.name || 'Unknown';

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;

    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    const stageNumber = AfflictionManager._getStageNumber(affliction);
    const stageCount = AfflictionManager._getStageCount(affliction);
    if (stageNumber === null || stageCount === 0) {
      ui.notifications.warn(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.NO_STAGES_DEFINED', { name: affliction.name }));
      return;
    }

    if (stageNumber >= stageCount) {
      ui.notifications.warn(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.MAX_STAGE', {
        tokenName: entityName,
        afflictionName: affliction.name
      }));
      return;
    }

    await AfflictionService.adjustStageManually(token, affliction, 1, actor);
    this.render({ force: true });
  }

  static async regressStage(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);
    const entityName = token?.name || actor?.name || 'Unknown';

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;

    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    const stageNumber = AfflictionManager._getStageNumber(affliction);
    if (stageNumber === null || stageNumber <= 1) {
      ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.MANAGER.AT_STAGE_ONE', { tokenName: entityName, afflictionName: affliction.name }));
      return;
    }

    await AfflictionService.adjustStageManually(token, affliction, -1, actor);
    this.render({ force: true });
  }

  static async rollSave(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;

    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    await AfflictionService.promptSave(token, affliction, actor);
  }

  /** Feat-granted saves and stage reductions (Coral Detoxification, Virulent Strike, Purge System...). */
  static async specialSave(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);
    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;
    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    const options = FeatModifierService.getSpecialSaveOptions(token?.actor || actor, affliction, {
      virulentStrikeAvailable: AfflictionManager._isVirulentStrikeAvailable(),
    });
    if (options.length === 0) return;

    const kind = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize('PF2E_AFFLICTIONER.FEATS.SPECIAL_SAVE_TITLE') },
      content: `<p>${game.i18n.format('PF2E_AFFLICTIONER.FEATS.SPECIAL_SAVE_PROMPT', { afflictionName: affliction.name })}</p>`,
      buttons: options.map(option => ({ action: option.kind, label: option.label })),
      rejectClose: false,
    }).catch(() => null);
    if (!kind || !options.some(option => option.kind === kind)) return;

    await AfflictionService.startSpecialSave(token, affliction, kind, token?.actor || actor);
  }

  static async rollDamage(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;

    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    await AfflictionService.promptDamage(token, affliction, actor);
  }

  static async treatAffliction(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;

    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    await TreatmentService.promptTreatment(token, affliction, actor);
  }

  static async openPoisonItem(_event, button) {
    const uuid = button.dataset.uuid;
    if (!uuid) return;
    const item = await fromUuid(uuid);
    item?.sheet?.render(true);
  }

  static async removeCoating(_event, button) {
    const weaponId = button.dataset.weaponId;
    const target = await AfflictionManager._resolveCoatingTarget(button);
    const actor = WeaponCoatingService._getActorFromTarget(target);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }
    const removed = await WeaponCoatingService.removeCoatingWithPermission(target, weaponId);
    if (!removed) return;
    ui.notifications.info(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.REMOVE_SUCCESS'));
    this.render({ force: true });
  }

  static async removeInjection(_event, button) {
    const weaponId = button.dataset.weaponId;
    const target = await AfflictionManager._resolveCoatingTarget(button);
    const actor = WeaponCoatingService._getActorFromTarget(target);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }
    const removed = await WeaponCoatingService.removeInjectionWithPermission(target, weaponId);
    if (!removed) return;
    ui.notifications.info(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_REMOVE_SUCCESS'));
    this.render({ force: true });
  }

  static async addCoating(_event, button) {
    const weaponId = button.dataset.weaponId;
    const row = button.closest('.weapon-row');
    const select = row?.querySelector('.coating-poison-select');
    const itemUuid = select?.value;

    if (!itemUuid) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.SELECT_FIRST'));
      return;
    }

    const target = await AfflictionManager._resolveCoatingTarget(button);
    const actor = WeaponCoatingService._getActorFromTarget(target);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }

    const weapon = actor.items.get(weaponId);
    const item = await fromUuid(itemUuid);
    if (!item) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ITEM_LOAD_ERROR'));
      return;
    }

    const finalAfflictionData = WeaponCoatingService._getPreparedCoatingAfflictionData(actor, item);
    if (!finalAfflictionData) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.PARSE_ERROR'));
      return;
    }

    if (button.dataset.doublePoison === 'true') {
      const existing = WeaponCoatingStore.getCoating(target, weaponId);
      if (WeaponCoatingService._hasDoublePoisonLevelViolation(actor, existing, finalAfflictionData)) {
        ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.DOUBLE_POISON_LEVEL_INVALID'));
        return;
      }
      if (!WeaponCoatingService._shouldOfferDoublePoison(actor, existing, finalAfflictionData)) {
        ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.DOUBLE_POISON_INVALID'));
        return;
      }
    }

    // Prompt for coating duration (always shows on GM client)
    const expirationMode = await WeaponCoatingService.promptCoatingDuration();
    if (expirationMode === null) return;

    const weaponName = weapon?.name ?? weaponId;
    const combat = game.combat;
    const poisonImg = item.img || null;

    const applied = await WeaponCoatingService._applyCoatingWithPermission(target, weaponId, {
      poisonItemUuid: itemUuid,
      poisonName: finalAfflictionData.name,
      weaponName,
      afflictionData: finalAfflictionData,
      expirationMode,
      poisonImg
    });
    if (!applied) return;

    // Consume one dose of the poison item
    const quantity = item.system?.quantity ?? 1;
    if (quantity <= 1) {
      await item.delete();
    } else {
      await item.update({ 'system.quantity': quantity - 1 });
    }

    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.WEAPON_COATING.COATED', { weaponName, poisonName: finalAfflictionData.name }));
    this.render({ force: true });
  }

  static async installInjectionReservoir(_event, button) {
    const target = await AfflictionManager._resolveCoatingTarget(button);
    const actor = WeaponCoatingService._getActorFromTarget(target);
    const weapon = actor?.items?.get(button.dataset.weaponId);
    if (!weapon) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }

    const installed = await WeaponCoatingService.installInjectionReservoir(actor, weapon);
    if (!installed) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_RESERVOIR_UNAVAILABLE'));
      return;
    }

    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_RESERVOIR_INSTALLED', { weaponName: weapon.name }));
    this.render({ force: true });
  }

  static async removeInjectionReservoir(_event, button) {
    const target = await AfflictionManager._resolveCoatingTarget(button);
    const actor = WeaponCoatingService._getActorFromTarget(target);
    const weapon = actor?.items?.get(button.dataset.weaponId);
    if (!weapon) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }

    await WeaponCoatingService.removeInjectionReservoir(weapon);
    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_RESERVOIR_REMOVED', { weaponName: weapon.name }));
    this.render({ force: true });
  }

  static async addInjection(_event, button) {
    const weaponId = button.dataset.weaponId;
    const row = button.closest('.weapon-row');
    const select = row?.querySelector('.injection-poison-select');
    const itemUuid = select?.value;

    if (!itemUuid) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.SELECT_FIRST'));
      return;
    }

    const target = await AfflictionManager._resolveCoatingTarget(button);
    const actor = WeaponCoatingService._getActorFromTarget(target);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }

    const weapon = actor.items.get(weaponId);
    if (!WeaponCoatingService._isInjectionWeapon(weapon)) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.NO_INJECTION_WEAPONS'));
      return;
    }

    const item = await fromUuid(itemUuid);
    if (!item) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ITEM_LOAD_ERROR'));
      return;
    }

    const finalAfflictionData = WeaponCoatingService._getPreparedInjectionAfflictionData(actor, item);
    if (!finalAfflictionData) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.PARSE_ERROR'));
      return;
    }

    const existing = WeaponCoatingStore.getInjection(target, weaponId);
    if (existing) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        title: game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_REPLACE_TITLE'),
        content: `<p>${game.i18n.format('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_REPLACE_CONTENT', { weaponName: weapon.name, existingPoison: existing.poisonName })}</p>`,
        defaultYes: false
      });
      if (!confirmed) return;
    }

    const poisonImg = item.img || null;
    const applied = await WeaponCoatingService._applyInjectionWithPermission(target, weaponId, {
      poisonItemUuid: itemUuid,
      poisonName: finalAfflictionData.name,
      weaponName: weapon.name,
      afflictionData: finalAfflictionData,
      poisonImg
    });
    if (!applied) return;

    const quantity = item.system?.quantity ?? 1;
    if (quantity <= 1) {
      await item.delete();
    } else {
      await item.update({ 'system.quantity': quantity - 1 });
    }

    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_LOADED', { weaponName: weapon.name, poisonName: finalAfflictionData.name }));
    this.render({ force: true });
  }

  static _parseRuleList(value) {
    return String(value || '')
      .split(/[\n,]/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  static _getTraitOptions() {
    return ['curse', 'disease', 'poison'].map(value => ({
      value,
      label: this._formatTraitLabel(value),
    }));
  }

  static _isKnownBypassTrait(trait) {
    return this._getTraitOptions().some(option => option.value === trait);
  }

  static _formatTraitLabel(value) {
    return String(value || '')
      .split('-')
      .map(part => part ? part[0].toUpperCase() + part.slice(1) : part)
      .join(' ');
  }

  static _collectTraitTags(panel) {
    return [...panel.querySelectorAll('.source-rule-trait-tag')]
      .map(tag => tag.dataset.trait)
      .filter(Boolean);
  }

  static _appendTraitTag(panel, trait) {
    const value = String(trait || '').trim();
    if (!value) return;
    if (!this._isKnownBypassTrait(value)) {
      ui.notifications.warn(game.i18n.format('PF2E_AFFLICTIONER.MANAGER.SOURCE_IMMUNITY_UNKNOWN_TRAIT', { trait: value }));
      return;
    }

    const list = panel.querySelector('.source-rule-trait-tags');
    if (!list) return;
    if ([...list.querySelectorAll('.source-rule-trait-tag')].some(tag => tag.dataset.trait === value)) return;

    const tag = document.createElement('span');
    tag.className = 'source-rule-trait-tag';
    tag.dataset.trait = value;

    const label = document.createElement('span');
    label.className = 'source-rule-trait-label';
    label.textContent = this._formatTraitLabel(value);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.dataset.action = 'removeSourceRuleTrait';
    removeButton.className = 'source-rule-trait-remove';
    const removeIcon = document.createElement('i');
    removeIcon.className = 'fas fa-times';
    removeButton.append(removeIcon);

    tag.append(label, removeButton);
    list.appendChild(tag);
  }

  static async _resolveAfflictionKeyTags(entries) {
    const tags = [];
    for (const entry of entries || []) {
      const key = entry.key || entry;
      const uuid = entry.uuid || key;
      let name = entry.name || key;
      let canOpen = false;

      if (uuid && typeof fromUuid === 'function') {
        try {
          const item = await fromUuid(uuid);
          if (item) {
            name = item.name || name;
            canOpen = !!item.sheet;
          }
        } catch { /* keep stored label */ }
      }

      tags.push({ key, uuid, name, canOpen });
    }
    return tags;
  }

  static _collectAfflictionKeyTags(panel) {
    return [...panel.querySelectorAll('.source-rule-key-tag')].map(tag => ({
      key: tag.dataset.key,
      name: tag.dataset.name || tag.dataset.key,
      uuid: tag.dataset.uuid || tag.dataset.key,
    })).filter(entry => entry.key);
  }

  static _appendAfflictionKeyTag(panel, entry) {
    const list = panel.querySelector('.source-rule-key-tags');
    if (!list || !entry?.key) return;
    if ([...list.querySelectorAll('.source-rule-key-tag')].some(tag => tag.dataset.key === entry.key)) return;

    const tag = document.createElement('span');
    tag.className = 'source-rule-key-tag';
    tag.dataset.key = entry.key;
    tag.dataset.name = entry.name || entry.key;
    tag.dataset.uuid = entry.uuid || entry.key;

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.dataset.action = 'openSourceRuleAffliction';
    openButton.dataset.uuid = entry.uuid || entry.key;
    openButton.className = 'source-rule-key-open';
    const openIcon = document.createElement('i');
    openIcon.className = 'fas fa-circle-info';
    openButton.append(openIcon, document.createTextNode(` ${entry.name || entry.key}`));

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.dataset.action = 'removeSourceRuleAffliction';
    removeButton.className = 'source-rule-key-remove';
    const removeIcon = document.createElement('i');
    removeIcon.className = 'fas fa-times';
    removeButton.append(removeIcon);

    tag.append(openButton, removeButton);
    list.appendChild(tag);
  }

  static async saveSourceImmunityBypassRule(_event, button) {
    if (!game.user.isGM) return;

    const actor = game.actors.get(button.dataset.actorId);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.ACTOR_NOT_FOUND'));
      return;
    }

    const panel = button.closest('.source-immunity-bypass-rule');
    if (!panel) return;

    const rule = {
      enabled: panel.querySelector('[name="sourceRule.enabled"]')?.checked === true,
      traits: AfflictionManager._collectTraitTags(panel),
      afflictionKeys: AfflictionManager._collectAfflictionKeyTags(panel),
    };

    const saved = await ImmunityBypassRuleStore.saveRule(actor, rule);
    if (!saved) return;

    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.MANAGER.SOURCE_IMMUNITY_RULE_SAVED', {
      actorName: actor.name
    }));
    this.render({ force: true });
  }

  static async openSourceRuleAffliction(_event, button) {
    const uuid = button.dataset.uuid;
    if (!uuid) return;
    const item = await fromUuid(uuid);
    item?.sheet?.render(true);
  }

  static async removeSourceRuleAffliction(_event, button) {
    button.closest('.source-rule-key-tag')?.remove();
  }

  static async addSourceRuleTrait(_event, button) {
    const panel = button.closest('.source-immunity-bypass-rule');
    const input = panel?.querySelector('.source-rule-trait-input');
    if (!panel || !input) return;

    AfflictionManager._appendTraitTag(panel, input.value);
    input.value = '';
  }

  static async removeSourceRuleTrait(_event, button) {
    button.closest('.source-rule-trait-tag')?.remove();
  }

  static async counteractAffliction(_event, button) {
    if (this.playerCoatingOnly) return;

    const afflictionId = button.dataset.afflictionId;
    const { token, actor } = AfflictionManager._resolveTarget(button);

    const affliction = token
      ? AfflictionStore.getAffliction(token, afflictionId)
      : actor ? AfflictionStore.getAfflictionForActor(actor, afflictionId) : null;

    if (!affliction) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    await CounteractService.promptCounteract(token, affliction);
  }
}
