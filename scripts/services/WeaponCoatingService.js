import { MODULE_ID } from '../constants.js';
import { AfflictionParser } from './AfflictionParser.js';
import * as WeaponCoatingStore from '../stores/WeaponCoatingStore.js';
import { VishkanyaService } from './VishkanyaService.js';
import { FeatsService } from './FeatsService.js';
import { AfflictionService } from './AfflictionService.js';

const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';
const INJECTION_RESERVOIR_SLUG = 'injection-reservoir';
const INJECTION_RESERVOIR_RULE_SLUG = 'injection-reservoir-map';
const INJECTION_RESERVOIR_FLAG = `flags.${MODULE_ID}.injectionReservoir`;

export class WeaponCoatingService {
  static _getActorReference(actor) {
    return actor?.uuid || actor?.id || null;
  }

  static _getActorFromTarget(target) {
    return target?.actor || target;
  }

  static _getStorageReference(target) {
    if (target?.document && target.document.actorLink === false) {
      return target.document.uuid || target.id || null;
    }
    if (target?.actorLink === false && target.actor) {
      return target.uuid || target.id || null;
    }
    return this._getActorReference(this._getActorFromTarget(target));
  }

  static async _resolveTarget(targetRef) {
    if (!targetRef) return null;
    if (typeof targetRef !== 'string') return targetRef;

    if (targetRef.includes('.') && typeof fromUuid === 'function') {
      try {
        const document = await fromUuid(targetRef);
        if (document) return globalThis.canvas?.tokens?.get?.(document.id) || document;
      } catch {
        // Fall back to world actor lookup below.
      }
    }

    return globalThis.canvas?.tokens?.get?.(targetRef) || game.actors.get(targetRef) || null;
  }

  static async _resolveActor(actorRef) {
    return this._getActorFromTarget(await this._resolveTarget(actorRef));
  }

  static _getSelectedStorageTarget(selected, actor) {
    return selected.target || selected.storageTarget || selected.token || actor;
  }

  static async openCoatDialog(itemUuid, speakerActorId, speakerTokenId, targetTokenIds = []) {
    const i = game.i18n;
    const item = await fromUuid(itemUuid);
    if (!item) {
      ui.notifications.error(i.localize(`${K}.ITEM_LOAD_ERROR`));
      return;
    }

    const afflictionData = AfflictionParser.parseFromItem(item);
    if (!afflictionData) {
      ui.notifications.error(i.localize(`${K}.PARSE_ERROR`));
      return;
    }

    const allWeapons = this._collectWeapons(speakerActorId, speakerTokenId, targetTokenIds);
    const weapons = allWeapons.filter(w => w.damageType === 'piercing' || w.damageType === 'slashing');

    if (!weapons.length) {
      ui.notifications.warn(i.localize(`${K}.NO_APPLICABLE_WEAPONS`));
      return;
    }

    // Group weapons by actor, preserving insertion order (speaker first, then targets)
    const groups = [];
    const groupIndex = new Map();
    weapons.forEach((w, idx) => {
      const groupKey = w.groupKey ?? w.actorUuid ?? w.actorId;
      if (!groupIndex.has(groupKey)) {
        groupIndex.set(groupKey, groups.length);
        groups.push({ actorName: w.actorName, weapons: [] });
      }
      groups[groupIndex.get(groupKey)].weapons.push({ ...w, idx });
    });

    const sections = groups.map(g => `
      <div class="wcs-section">
        <h3 class="wcs-section-title">${g.actorName}</h3>
        <div class="wcs-grid">
          ${g.weapons.map(w => `
            <div class="wcs-card" data-index="${w.idx}">
              <img src="${w.img}" alt="${w.weaponName}" />
              <div class="wcs-card-info">
                <span class="wcs-card-name">${w.weaponName}</span>
                <span class="wcs-card-damage">${w.damageType}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const content = `
      <p class="wcs-label">${i.format(`${K}.DIALOG_SELECT_LABEL`, { poisonName: `<strong>${afflictionData.name}</strong>` })}</p>
      ${sections}
      <p class="wcs-hint">${i.localize(`${K}.DIALOG_HINT`)}</p>
    `;

    const selected = await new Promise((resolve) => {
      let hookId;

      hookId = Hooks.on('renderDialogV2', (_app, element) => {
        if (!element.querySelector('.wcs-grid')) return;
        Hooks.off('renderDialogV2', hookId);

        element.querySelectorAll('.wcs-card').forEach((card) => {
          card.addEventListener('click', async () => {
            const index = parseInt(card.dataset.index);
            element.querySelectorAll('.wcs-card').forEach(c => c.classList.remove('wcs-selected'));
            card.classList.add('wcs-selected');
            resolve(weapons[index]);
            await _app.close();
          });
        });
      });

      foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${K}.DIALOG_TITLE`) },
        content,
        buttons: [{ action: 'cancel', label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'), icon: 'fas fa-times' }],
        rejectClose: false
      }).then(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      }).catch(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      });
    });

    if (!selected) return;

    const actor = await this._resolveActor(selected.actor || selected.actorUuid || selected.actorId);
    if (!actor) {
      ui.notifications.error(i.localize(`${K}.ACTOR_NOT_FOUND`));
      return;
    }
    const storageTarget = this._getSelectedStorageTarget(selected, actor);

    // Check for existing coating before replacing
    const existing = WeaponCoatingStore.getCoating(storageTarget, selected.weaponId);
    if (existing && !this._shouldOfferDoublePoison(actor, existing, afflictionData)) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        title: i.localize(`${K}.REPLACE_TITLE`),
        content: `<p>${i.format(`${K}.REPLACE_CONTENT`, { weaponName: selected.weaponName, existingPoison: existing.poisonName })}</p>`,
        defaultYes: false
      });
      if (!confirmed) return;
    }

    // Prompt for coating duration (always shows on GM client)
    const expirationMode = await this.promptCoatingDuration();
    if (expirationMode === null) return;

    const finalAfflictionData = this._withOriginActor(actor, afflictionData);

    const applied = await this._applyCoatingWithPermission(storageTarget, selected.weaponId, {
      poisonItemUuid: itemUuid,
      poisonName: finalAfflictionData.name,
      weaponName: selected.weaponName,
      afflictionData: finalAfflictionData,
      expirationMode,
      poisonImg: item.img || null
    });
    if (!applied) return;

    // Consume one dose of the poison item
    const quantity = item.system?.quantity ?? 1;
    if (quantity <= 1) {
      await item.delete();
    } else {
      await item.update({ 'system.quantity': quantity - 1 });
    }

    ui.notifications.info(i.format(`${K}.COATED`, { weaponName: selected.weaponName, poisonName: finalAfflictionData.name }));

    const { AfflictionManager } = await import('../managers/AfflictionManager.js');
    if (AfflictionManager.currentInstance) {
      AfflictionManager.currentInstance.render({ force: true });
    }

    return true;
  }

  static async openInjectionLoadDialog(itemUuid, speakerActorId, speakerTokenId, targetTokenIds = []) {
    const i = game.i18n;
    const item = await fromUuid(itemUuid);
    if (!item) {
      ui.notifications.error(i.localize(`${K}.ITEM_LOAD_ERROR`));
      return;
    }

    const afflictionData = AfflictionParser.parseFromItem(item);
    if (!afflictionData) {
      ui.notifications.error(i.localize(`${K}.PARSE_ERROR`));
      return;
    }

    const allWeapons = this._collectWeapons(speakerActorId, speakerTokenId, targetTokenIds);
    const weapons = allWeapons.filter(w => this._isInjectionWeapon(w));

    if (!weapons.length) {
      ui.notifications.warn(i.localize(`${K}.NO_INJECTION_WEAPONS`));
      return;
    }

    const groups = [];
    const groupIndex = new Map();
    weapons.forEach((w, idx) => {
      const groupKey = w.groupKey ?? w.actorUuid ?? w.actorId;
      if (!groupIndex.has(groupKey)) {
        groupIndex.set(groupKey, groups.length);
        groups.push({ actorName: w.actorName, weapons: [] });
      }
      groups[groupIndex.get(groupKey)].weapons.push({ ...w, idx });
    });

    const sections = groups.map(g => `
      <div class="wcs-section">
        <h3 class="wcs-section-title">${g.actorName}</h3>
        <div class="wcs-grid">
          ${g.weapons.map(w => `
            <div class="wcs-card" data-index="${w.idx}">
              <img src="${w.img}" alt="${w.weaponName}" />
              <div class="wcs-card-info">
                <span class="wcs-card-name">${w.weaponName}</span>
                <span class="wcs-card-damage">${i.localize(`${K}.INJECTION_TRAIT_LABEL`)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const content = `
      <p class="wcs-label">${i.format(`${K}.INJECTION_DIALOG_SELECT_LABEL`, { poisonName: `<strong>${afflictionData.name}</strong>` })}</p>
      ${sections}
      <p class="wcs-hint">${i.localize(`${K}.INJECTION_DIALOG_HINT`)}</p>
    `;

    const selected = await new Promise((resolve) => {
      let hookId;

      hookId = Hooks.on('renderDialogV2', (_app, element) => {
        if (!element.querySelector('.wcs-grid')) return;
        Hooks.off('renderDialogV2', hookId);

        element.querySelectorAll('.wcs-card').forEach((card) => {
          card.addEventListener('click', async () => {
            const index = parseInt(card.dataset.index);
            element.querySelectorAll('.wcs-card').forEach(c => c.classList.remove('wcs-selected'));
            card.classList.add('wcs-selected');
            resolve(weapons[index]);
            await _app.close();
          });
        });
      });

      foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${K}.INJECTION_DIALOG_TITLE`) },
        content,
        buttons: [{ action: 'cancel', label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'), icon: 'fas fa-times' }],
        rejectClose: false
      }).then(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      }).catch(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      });
    });

    if (!selected) return;

    const actor = await this._resolveActor(selected.actor || selected.actorUuid || selected.actorId);
    if (!actor) {
      ui.notifications.error(i.localize(`${K}.ACTOR_NOT_FOUND`));
      return;
    }
    const storageTarget = this._getSelectedStorageTarget(selected, actor);

    const existing = WeaponCoatingStore.getInjection(storageTarget, selected.weaponId);
    if (existing) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        title: i.localize(`${K}.INJECTION_REPLACE_TITLE`),
        content: `<p>${i.format(`${K}.INJECTION_REPLACE_CONTENT`, { weaponName: selected.weaponName, existingPoison: existing.poisonName })}</p>`,
        defaultYes: false
      });
      if (!confirmed) return;
    }

    const finalAfflictionData = this._getPreparedInjectionAfflictionData(actor, item);
    if (!finalAfflictionData) {
      ui.notifications.error(i.localize(`${K}.PARSE_ERROR`));
      return;
    }

    const applied = await this._applyInjectionWithPermission(storageTarget, selected.weaponId, {
      poisonItemUuid: itemUuid,
      poisonName: finalAfflictionData.name,
      weaponName: selected.weaponName,
      afflictionData: finalAfflictionData,
      poisonImg: item.img || null
    });
    if (!applied) return;

    const quantity = item.system?.quantity ?? 1;
    if (quantity <= 1) {
      await item.delete();
    } else {
      await item.update({ 'system.quantity': quantity - 1 });
    }

    ui.notifications.info(i.format(`${K}.INJECTION_LOADED`, { weaponName: selected.weaponName, poisonName: finalAfflictionData.name }));

    const { AfflictionManager } = await import('../managers/AfflictionManager.js');
    if (AfflictionManager.currentInstance) {
      AfflictionManager.currentInstance.render({ force: true });
    }

    return true;
  }

  /**
   * Opens the coat-weapon dialog for a Versatile Vial (Field Vials feature).
   * Instead of an affliction, stores direct damage data on the coating.
   * Auto-expires at end of current turn per Field Vials rules.
   *
   * @param {Item} item - The Versatile Vial item
   * @param {string} speakerActorId
   * @param {string} speakerTokenId
   * @param {string[]} targetTokenIds
   * @returns {Promise<boolean|undefined>}
   */
  static async openCoatDialogForFieldVial(item, speakerActorId, speakerTokenId, targetTokenIds = []) {
    const i = game.i18n;

    const dmg = this._extractItemDamageFormula(item);
    if (!dmg) {
      ui.notifications.error(i.localize(`${K}.PARSE_ERROR`));
      return;
    }

    const coatingData = {
      isDirectDamage: true,
      name: item.name,
      damageFormula: dmg.formula,
      damageType: dmg.type,
    };

    const allWeapons = this._collectWeapons(speakerActorId, speakerTokenId, targetTokenIds);
    const weapons = allWeapons.filter(w => w.damageType === 'piercing' || w.damageType === 'slashing');

    if (!weapons.length) {
      ui.notifications.warn(i.localize(`${K}.NO_APPLICABLE_WEAPONS`));
      return;
    }

    const groups = [];
    const groupIndex = new Map();
    weapons.forEach((w, idx) => {
      const groupKey = w.groupKey ?? w.actorUuid ?? w.actorId;
      if (!groupIndex.has(groupKey)) {
        groupIndex.set(groupKey, groups.length);
        groups.push({ actorName: w.actorName, weapons: [] });
      }
      groups[groupIndex.get(groupKey)].weapons.push({ ...w, idx });
    });

    const sections = groups.map(g => `
      <div class="wcs-section">
        <h3 class="wcs-section-title">${g.actorName}</h3>
        <div class="wcs-grid">
          ${g.weapons.map(w => `
            <div class="wcs-card" data-index="${w.idx}">
              <img src="${w.img}" alt="${w.weaponName}" />
              <div class="wcs-card-info">
                <span class="wcs-card-name">${w.weaponName}</span>
                <span class="wcs-card-damage">${w.damageType}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const content = `
      <p class="wcs-label">${i.format(`${K}.DIALOG_SELECT_LABEL`, { poisonName: `<strong>${item.name}</strong>` })}</p>
      ${sections}
      <p class="wcs-hint">${i.localize(`${K}.FIELD_VIAL_HINT`)}</p>
    `;

    const selected = await new Promise((resolve) => {
      let hookId;

      hookId = Hooks.on('renderDialogV2', (_app, element) => {
        if (!element.querySelector('.wcs-grid')) return;
        Hooks.off('renderDialogV2', hookId);

        element.querySelectorAll('.wcs-card').forEach((card) => {
          card.addEventListener('click', async () => {
            const index = parseInt(card.dataset.index);
            element.querySelectorAll('.wcs-card').forEach(c => c.classList.remove('wcs-selected'));
            card.classList.add('wcs-selected');
            resolve(weapons[index]);
            await _app.close();
          });
        });
      });

      foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${K}.DIALOG_TITLE`) },
        content,
        buttons: [{ action: 'cancel', label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'), icon: 'fas fa-times' }],
        rejectClose: false
      }).then(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      }).catch(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      });
    });

    if (!selected) return;

    const actor = await this._resolveActor(selected.actor || selected.actorUuid || selected.actorId);
    if (!actor) {
      ui.notifications.error(i.localize(`${K}.ACTOR_NOT_FOUND`));
      return;
    }
    const storageTarget = this._getSelectedStorageTarget(selected, actor);

    const existing = WeaponCoatingStore.getCoating(storageTarget, selected.weaponId);
    if (existing) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        title: i.localize(`${K}.REPLACE_TITLE`),
        content: `<p>${i.format(`${K}.REPLACE_CONTENT`, { weaponName: selected.weaponName, existingPoison: existing.poisonName })}</p>`,
        defaultYes: false
      });
      if (!confirmed) return;
    }

    // Field Vials: "The substance becomes inert at the end of your current turn."
    const expirationMode = 'end-next-turn';

    const applied = await this._applyCoatingWithPermission(storageTarget, selected.weaponId, {
      poisonItemUuid: item.uuid,
      poisonName: item.name,
      weaponName: selected.weaponName,
      afflictionData: coatingData,
      expirationMode,
      poisonImg: item.img || null
    });
    if (!applied) return;

    // Consume one dose
    const quantity = item.system?.quantity ?? 1;
    if (quantity <= 1) {
      await item.delete();
    } else {
      await item.update({ 'system.quantity': quantity - 1 });
    }

    ui.notifications.info(i.format(`${K}.COATED`, { weaponName: selected.weaponName, poisonName: item.name }));

    const { AfflictionManager } = await import('../managers/AfflictionManager.js');
    if (AfflictionManager.currentInstance) {
      AfflictionManager.currentInstance.render({ force: true });
    }

    return true;
  }

  /**
   * Extracts the damage formula and type from a PF2e item's system data.
   * @param {Item} item
   * @returns {{ formula: string, type: string } | null}
   */
  static _extractItemDamageFormula(item) {
    const dmg = item.system?.damage;
    if (!dmg) return null;
    const type = dmg.damageType || 'untyped';
    if (dmg.formula) return { formula: dmg.formula, type };
    if (dmg.die && dmg.dice) return { formula: `${dmg.dice}${dmg.die}`, type };
    if (dmg.die) return { formula: `1${dmg.die}`, type };
    return null;
  }

  /**
   * Opens the coat-weapon dialog using pre-built affliction data (no item to load or consume).
   * Used by the Envenom flow where venom is produced by an ability, not a consumable item.
   *
   * @param {object} afflictionData - Pre-built affliction data from VishkanyaService
   * @param {string} speakerActorId
   * @param {string} speakerTokenId
   * @param {string[]} targetTokenIds
   * @param {{ hasDebilitatingVenom?: boolean, hasStrongerDebilitatingVenom?: boolean }} options
   * @returns {Promise<boolean|undefined>}
   */
  static async openCoatDialogWithData(afflictionData, speakerActorId, speakerTokenId, targetTokenIds = [], options = {}) {
    const i = game.i18n;
    const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';

    let finalAfflictionData = afflictionData;

    if (options.hasDebilitatingVenom) {
      const choice = await this._promptDebilitation({ stronger: !!options.hasStrongerDebilitatingVenom });
      if (choice === null) return; // User cancelled
      finalAfflictionData = VishkanyaService.applyDebilitation(afflictionData, choice);
    }

    const allWeapons = this._collectWeapons(speakerActorId, speakerTokenId, targetTokenIds);
    const weapons = allWeapons.filter(w => w.damageType === 'piercing' || w.damageType === 'slashing');

    if (!weapons.length) {
      ui.notifications.warn(i.localize(`${K}.NO_APPLICABLE_WEAPONS`));
      return;
    }

    const groups = [];
    const groupIndex = new Map();
    weapons.forEach((w, idx) => {
      const groupKey = w.groupKey ?? w.actorUuid ?? w.actorId;
      if (!groupIndex.has(groupKey)) {
        groupIndex.set(groupKey, groups.length);
        groups.push({ actorName: w.actorName, weapons: [] });
      }
      groups[groupIndex.get(groupKey)].weapons.push({ ...w, idx });
    });

    const sections = groups.map(g => `
      <div class="wcs-section">
        <h3 class="wcs-section-title">${g.actorName}</h3>
        <div class="wcs-grid">
          ${g.weapons.map(w => `
            <div class="wcs-card" data-index="${w.idx}">
              <img src="${w.img}" alt="${w.weaponName}" />
              <div class="wcs-card-info">
                <span class="wcs-card-name">${w.weaponName}</span>
                <span class="wcs-card-damage">${w.damageType}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const content = `
      <p class="wcs-label">${i.format(`${K}.DIALOG_SELECT_LABEL`, { poisonName: `<strong>${finalAfflictionData.name}</strong>` })}</p>
      ${sections}
      <p class="wcs-hint">${i.localize(`${K}.DIALOG_HINT`)}</p>
    `;

    const selected = await new Promise((resolve) => {
      let hookId;

      hookId = Hooks.on('renderDialogV2', (_app, element) => {
        if (!element.querySelector('.wcs-grid')) return;
        Hooks.off('renderDialogV2', hookId);

        element.querySelectorAll('.wcs-card').forEach((card) => {
          card.addEventListener('click', async () => {
            const index = parseInt(card.dataset.index);
            element.querySelectorAll('.wcs-card').forEach(c => c.classList.remove('wcs-selected'));
            card.classList.add('wcs-selected');
            resolve(weapons[index]);
            await _app.close();
          });
        });
      });

      foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${K}.DIALOG_TITLE`) },
        content,
        buttons: [{ action: 'cancel', label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'), icon: 'fas fa-times' }],
        rejectClose: false
      }).then(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      }).catch(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      });
    });

    if (!selected) return;

    const actor = await this._resolveActor(selected.actor || selected.actorUuid || selected.actorId);
    if (!actor) {
      ui.notifications.error(i.localize(`${K}.ACTOR_NOT_FOUND`));
      return;
    }
    const storageTarget = this._getSelectedStorageTarget(selected, actor);

    // Check for existing coating before replacing
    const existing = WeaponCoatingStore.getCoating(storageTarget, selected.weaponId);
    if (existing && !this._shouldOfferDoublePoison(actor, existing, finalAfflictionData)) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        title: i.localize(`${K}.REPLACE_TITLE`),
        content: `<p>${i.format(`${K}.REPLACE_CONTENT`, { weaponName: selected.weaponName, existingPoison: existing.poisonName })}</p>`,
        defaultYes: false
      });
      if (!confirmed) return;
    }

    // Prompt for coating duration (always shows on GM client)
    const expirationMode = await this.promptCoatingDuration();
    if (expirationMode === null) return;

    finalAfflictionData = this._withOriginActor(actor, finalAfflictionData);

    const applied = await this._applyCoatingWithPermission(storageTarget, selected.weaponId, {
      poisonItemUuid: null,
      poisonName: finalAfflictionData.name,
      weaponName: selected.weaponName,
      afflictionData: finalAfflictionData,
      expirationMode,
      poisonImg: null
    });
    if (!applied) return;

    ui.notifications.info(i.format(`${K}.COATED`, { weaponName: selected.weaponName, poisonName: finalAfflictionData.name }));

    const { AfflictionManager } = await import('../managers/AfflictionManager.js');
    if (AfflictionManager.currentInstance) {
      AfflictionManager.currentInstance.render({ force: true });
    }

    return true;
  }

  /**
   * Routes the coating duration prompt to the GM client via socket.
   * If the current user is GM (or socketlib is unavailable), calls directly.
   * @returns {Promise<string|null>} The chosen mode, or null if cancelled
   */
  static async promptCoatingDuration() {
    if (!game.settings.get(MODULE_ID, 'promptCoatingDuration')) {
      return 'unlimited';
    }
    const { SocketService } = await import('./SocketService.js');
    if (game.user.isGM || !SocketService.socket) {
      return this._promptCoatingDuration();
    }
    return SocketService.requestPromptCoatingDuration();
  }

  /**
   * Prompts the user to choose a coating duration for this specific coating.
   * Uses a card-based UI for preset durations with a custom option.
   * @returns {Promise<string|null>} The chosen mode, or null if cancelled
   */
  static async _promptCoatingDuration() {
    const i = game.i18n;
    const S = 'PF2E_AFFLICTIONER.SETTINGS';

    const options = [
      { value: 'start-next-turn', label: i.localize(`${S}.COATING_DURATION_START_NEXT_TURN`), icon: 'fas fa-hourglass-start', hint: i.localize(`${K}.DURATION_HINT_STRICT`) },
      { value: 'end-next-turn', label: i.localize(`${S}.COATING_DURATION_END_NEXT_TURN`), icon: 'fas fa-hourglass-end', hint: i.localize(`${K}.DURATION_HINT_MODERATE`) },
      { value: '1-minute', label: i.localize(`${S}.COATING_DURATION_1_MIN`), icon: 'fas fa-stopwatch', hint: '10 rounds' },
      { value: '10-minutes', label: i.localize(`${S}.COATING_DURATION_10_MIN`), icon: 'fas fa-clock', hint: '100 rounds' },
      { value: '1-hour', label: i.localize(`${S}.COATING_DURATION_1_HOUR`), icon: 'fas fa-history', hint: '600 rounds' },
      { value: 'unlimited', label: i.localize(`${S}.COATING_DURATION_UNLIMITED`), icon: 'fas fa-infinity', hint: i.localize(`${K}.DURATION_HINT_UNLIMITED`) },
    ];

    const cards = options.map(o => `
      <div class="cd-card" data-value="${o.value}">
        <i class="${o.icon} cd-card-icon"></i>
        <span class="cd-card-label">${o.label}</span>
        <span class="cd-card-hint">${o.hint}</span>
      </div>
    `).join('');

    const content = `
      <p class="cd-prompt">${i.localize(`${K}.DURATION_PROMPT`)}</p>
      <div class="cd-grid">${cards}</div>
      <div class="cd-custom">
        <label class="cd-custom-label">${i.localize(`${K}.DURATION_CUSTOM_LABEL`)}</label>
        <div class="cd-custom-row">
          <input type="number" class="cd-custom-value" min="1" value="5" />
          <select class="cd-custom-unit">
            <option value="rounds">${i.localize(`${K}.DURATION_UNIT_ROUNDS`)}</option>
            <option value="minutes" selected>${i.localize(`${K}.DURATION_UNIT_MINUTES`)}</option>
            <option value="hours">${i.localize(`${K}.DURATION_UNIT_HOURS`)}</option>
          </select>
          <button type="button" class="cd-custom-apply"><i class="fas fa-check"></i></button>
        </div>
      </div>
    `;

    const result = await new Promise((resolve) => {
      let hookId;

      hookId = Hooks.on('renderDialogV2', (_app, element) => {
        if (!element.querySelector('.cd-grid')) return;
        Hooks.off('renderDialogV2', hookId);

        element.querySelectorAll('.cd-card').forEach((card) => {
          card.addEventListener('click', async () => {
            resolve(card.dataset.value);
            await _app.close();
          });
        });

        const applyBtn = element.querySelector('.cd-custom-apply');
        if (applyBtn) {
          applyBtn.addEventListener('click', async () => {
            const val = parseInt(element.querySelector('.cd-custom-value')?.value) || 1;
            const unit = element.querySelector('.cd-custom-unit')?.value || 'minutes';
            resolve(`custom:${val}:${unit}`);
            await _app.close();
          });
        }
      });

      foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${K}.DURATION_TITLE`) },
        content,
        buttons: [{ action: 'cancel', label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'), icon: 'fas fa-times' }],
        rejectClose: false
      }).then(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      }).catch(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      });
    });

    return result ?? null;
  }

  /**
   * Creates a PF2e effect on the actor to visually indicate a coated weapon.
   * @param {Actor} actor
   * @param {string} weaponName
   * @param {string} poisonName
   * @param {string} expirationMode
   * @param {string|null} [poisonImg] - Image from the poison item
   * @returns {Promise<string|null>} Effect UUID or null
   */
  static async createCoatingEffect(actor, weaponName, poisonName, expirationMode, poisonImg = null) {
    const i = game.i18n;
    const durationConfig = this._getEffectDuration(expirationMode);
    const effectName = i.format(`${K}.EFFECT_NAME`, { poisonName, weaponName });
    const effectDesc = i.format(`${K}.EFFECT_DESCRIPTION`, { poisonName, weaponName });

    const effectData = {
      type: 'effect',
      name: effectName,
      img: poisonImg || 'icons/svg/poison.svg',
      system: {
        description: { value: `<p>${effectDesc}</p>` },
        tokenIcon: { show: true },
        duration: durationConfig,
        badge: null,
        rules: [],
        slug: `coating-${poisonName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        unidentified: false
      },
      flags: {
        [MODULE_ID]: {
          isCoatingEffect: true,
          weaponName,
          poisonName
        }
      }
    };

    try {
      const [created] = await actor.createEmbeddedDocuments('Item', [effectData]);
      return created?.uuid ?? null;
    } catch (error) {
      console.error('PF2e Afflictioner | Error creating coating effect:', error);
      return null;
    }
  }

  static _getEffectDuration(mode) {
    if (mode?.startsWith('custom:')) {
      const [, val, unit] = mode.split(':');
      return { value: parseInt(val) || 1, unit: unit || 'minutes', expiry: null, sustained: false };
    }

    switch (mode) {
      case 'start-next-turn':
        return { value: 1, unit: 'rounds', expiry: 'turn-start', sustained: false };
      case 'end-next-turn':
        return { value: 1, unit: 'rounds', expiry: 'turn-end', sustained: false };
      case '1-minute':
        return { value: 1, unit: 'minutes', expiry: null, sustained: false };
      case '10-minutes':
        return { value: 10, unit: 'minutes', expiry: null, sustained: false };
      case '1-hour':
        return { value: 1, unit: 'hours', expiry: null, sustained: false };
      default: // unlimited
        return { value: -1, unit: 'unlimited', expiry: null, sustained: false };
    }
  }

  /**
   * Finds the combatant ID for the given actor in the current combat.
   * @param {Actor} actor
   * @returns {string|null}
   */
  static _findCombatantId(actor, target = null) {
    if (!game.combat?.started) return null;
    const combatants = Array.from(game.combat.combatants ?? []);
    const actorUuid = actor.uuid;
    const tokenId = target?.id || target?.document?.id || actor.token?.id;
    const combatant = combatants.find(c =>
      (tokenId && c.tokenId === tokenId) ||
      c.actor === actor ||
      (actorUuid && c.actor?.uuid === actorUuid) ||
      c.token?.actor === actor ||
      (actorUuid && c.token?.actor?.uuid === actorUuid) ||
      c.actorId === actor.id
    );
    return combatant?.id ?? null;
  }

  static _withOriginActor(actor, afflictionData) {
    if (!actor || !afflictionData) return afflictionData;
    const withOrigin = {
      ...afflictionData,
      originActorUuid: actor.uuid || afflictionData.originActorUuid || null,
      originActorId: actor.id || afflictionData.originActorId || null,
    };
    return AfflictionService.applyOriginActorMetadata(withOrigin, actor);
  }

  static _canUseDoublePoison(actor) {
    return FeatsService.hasDoublePoison(actor);
  }

  static _shouldOfferDoublePoison(actor, existingCoating, afflictionData) {
    return !!(
      this._canAddSecondPoison(actor, existingCoating) &&
      this._isDoublePoisonCandidate(afflictionData) &&
      this._isPoisonLowEnoughForDoublePoison(actor, existingCoating.afflictionData) &&
      this._isPoisonLowEnoughForDoublePoison(actor, afflictionData)
    );
  }

  static _canAddSecondPoison(actor, existingCoating) {
    return !!(
      existingCoating &&
      this._canUseDoublePoison(actor) &&
      this._isDoublePoisonCandidate(existingCoating.afflictionData)
    );
  }

  static _isDoublePoisonCandidate(afflictionData) {
    if (!afflictionData || afflictionData.isDirectDamage) return false;
    if (afflictionData.doublePoison) return false;
    if (!Array.isArray(afflictionData.stages) || afflictionData.stages.length === 0) return false;
    const traits = afflictionData.traits || [];
    return afflictionData.type === 'poison' || traits.includes('poison');
  }

  static _isPoisonLowEnoughForDoublePoison(actor, afflictionData) {
    const actorLevel = Number(actor?.system?.details?.level?.value ?? actor?.level);
    const poisonLevel = Number(afflictionData?.level ?? 0);
    if (!Number.isFinite(actorLevel)) return false;
    if (!Number.isFinite(poisonLevel)) return false;
    return poisonLevel <= actorLevel - 2;
  }

  static _hasDoublePoisonLevelViolation(actor, existingCoating, afflictionData) {
    if (!this._canAddSecondPoison(actor, existingCoating)) return false;
    if (!this._isDoublePoisonCandidate(afflictionData)) return false;
    return !this._isPoisonLowEnoughForDoublePoison(actor, existingCoating.afflictionData) ||
      !this._isPoisonLowEnoughForDoublePoison(actor, afflictionData);
  }

  static _getPreparedCoatingAfflictionData(actor, item) {
    const afflictionData = AfflictionParser.parseFromItem(item);
    if (!afflictionData) return null;
    return this._withOriginActor(actor, afflictionData);
  }

  static async createInjectionEffect(actor, weaponName, poisonName, poisonImg = null) {
    const i = game.i18n;
    const effectName = i.format(`${K}.INJECTION_EFFECT_NAME`, { poisonName, weaponName });
    const effectDesc = i.format(`${K}.INJECTION_EFFECT_DESCRIPTION`, { poisonName, weaponName });

    const effectData = {
      type: 'effect',
      name: effectName,
      img: poisonImg || 'icons/svg/poison.svg',
      system: {
        description: { value: `<p>${effectDesc}</p>` },
        tokenIcon: { show: true },
        duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false },
        badge: null,
        rules: [],
        slug: `injection-${poisonName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        unidentified: false
      },
      flags: {
        [MODULE_ID]: {
          isInjectionEffect: true,
          weaponName,
          poisonName
        }
      }
    };

    try {
      if (!actor.createEmbeddedDocuments) return null;
      const [created] = await actor.createEmbeddedDocuments('Item', [effectData]);
      return created?.uuid ?? null;
    } catch (error) {
      console.error('PF2e Afflictioner | Error creating injection effect:', error);
      return null;
    }
  }

  static _getPreparedInjectionAfflictionData(actor, item) {
    return this._getPreparedCoatingAfflictionData(actor, item);
  }

  static _getWeaponTraits(weapon) {
    const traits = weapon?.traits || weapon?.system?.traits?.value || [];
    return this._normalizeTraitCollection(traits);
  }

  static _getWeaponDamageType(weapon) {
    const directDamageType = weapon?.system?.damage?.damageType;
    if (directDamageType) return directDamageType;

    const damageRolls = weapon?.system?.damageRolls;
    const firstDamageRoll = Array.isArray(damageRolls)
      ? damageRolls[0]
      : Object.values(damageRolls || {})[0];
    return firstDamageRoll?.damageType || 'unknown';
  }

  static _getLinkedWeaponId(item) {
    return item?.flags?.pf2e?.linkedWeapon || item?.system?.linkedWeapon || item?.system?.linkedWeaponId || null;
  }

  static _getWeaponDuplicateKey(item) {
    return [
      String(item?.name || '').trim().toLowerCase(),
      this._getWeaponDamageType(item),
    ].join('|');
  }

  static _getCoatableWeaponItems(actor) {
    const inventoryWeapons = actor?.itemTypes?.weapon || [];
    const meleeAttacks = actor?.itemTypes?.melee || [];
    const seen = new Set();
    const validInventoryWeapons = inventoryWeapons.filter(item => item?.id);
    const inventoryWeaponIds = new Set(validInventoryWeapons.map(item => item.id));
    const inventoryWeaponKeys = new Set(validInventoryWeapons.map(item => this._getWeaponDuplicateKey(item)));
    const result = [];

    for (const item of inventoryWeapons) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }

    for (const item of meleeAttacks) {
      if (!item?.id || seen.has(item.id)) continue;
      const linkedWeaponId = this._getLinkedWeaponId(item);
      if (linkedWeaponId && inventoryWeaponIds.has(linkedWeaponId)) continue;
      if (inventoryWeaponKeys.has(this._getWeaponDuplicateKey(item))) continue;
      seen.add(item.id);
      result.push(item);
    }

    return result;
  }

  static _normalizeTraitCollection(traits) {
    if (!traits) return [];
    if (Array.isArray(traits)) return traits;
    if (typeof traits === 'string') return [traits];
    if (traits.value && traits.value !== traits) return this._normalizeTraitCollection(traits.value);

    if (typeof traits[Symbol.iterator] === 'function') {
      return Array.from(traits)
        .map(trait => this._normalizeTraitValue(trait))
        .filter(Boolean);
    }

    if (typeof traits === 'object') {
      return Object.entries(traits)
        .map(([key, value]) => (value === true ? key : this._normalizeTraitValue(value)))
        .filter(Boolean);
    }

    return [];
  }

  static _normalizeTraitValue(trait) {
    if (!trait) return null;
    if (typeof trait === 'string') return trait;
    if (Array.isArray(trait)) return this._normalizeTraitValue(trait[0]);
    return trait.slug || trait.value || trait.id || null;
  }

  static _isInjectionWeapon(weapon) {
    return this._getWeaponTraits(weapon).includes('injection') || this._hasInjectionReservoir(weapon);
  }

  static _hasInjectionReservoir(weapon) {
    return !!(weapon?.hasInjectionReservoir || weapon?.flags?.[MODULE_ID]?.injectionReservoir);
  }

  /** Injection Reservoir usage: a non-injection melee weapon that deals piercing damage. */
  static _canFitInjectionReservoir(weapon) {
    if (!weapon || weapon.system?.range || this._isInjectionWeapon(weapon)) return false;
    return this._getWeaponDamageType(weapon) === 'piercing' ||
      this._getWeaponTraits(weapon).includes('versatile-p');
  }

  static _getAvailableInjectionReservoirCount(actor) {
    let available = 0;
    for (const item of actor?.items ?? []) {
      if (item.system?.slug === INJECTION_RESERVOIR_SLUG) available += item.system?.quantity ?? 1;
      else if (this._hasInjectionReservoir(item)) available -= 1;
    }
    return Math.max(available, 0);
  }

  static async installInjectionReservoir(actor, weapon) {
    if (!this._canFitInjectionReservoir(weapon)) return false;
    if (this._getAvailableInjectionReservoirCount(actor) < 1) return false;

    await weapon.update({
      [INJECTION_RESERVOIR_FLAG]: true,
      'system.rules': [
        ...(weapon.system?.rules ?? []),
        {
          key: 'FlatModifier',
          slug: INJECTION_RESERVOIR_RULE_SLUG,
          selector: '{item|id}-attack',
          label: `${K}.INJECTION_RESERVOIR_NAME`,
          value: -1,
          predicate: [{ or: ['map:increases:1', 'map:increases:2'] }],
        },
      ],
    });
    return true;
  }

  static async removeInjectionReservoir(weapon) {
    await weapon.update({
      [INJECTION_RESERVOIR_FLAG]: false,
      'system.rules': (weapon.system?.rules ?? []).filter(rule => rule.slug !== INJECTION_RESERVOIR_RULE_SLUG),
    });
  }

  static async _chooseDoublePoisonSaveType(firstPoison, secondPoison) {
    const firstSave = firstPoison?.saveType || 'fortitude';
    const secondSave = secondPoison?.saveType || 'fortitude';
    if (firstSave === secondSave) return firstSave;

    const i = game.i18n;
    const formatSave = saveType => saveType.charAt(0).toUpperCase() + saveType.slice(1);

    try {
      return await foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${K}.DOUBLE_POISON_SAVE_TITLE`) },
        content: `
          <p>${i.format(`${K}.DOUBLE_POISON_SAVE_PROMPT`, {
            firstPoison: firstPoison.name,
            secondPoison: secondPoison.name,
          })}</p>
        `,
        buttons: [
          {
            action: firstSave,
            label: `${formatSave(firstSave)} (${firstPoison.name})`,
            icon: 'fas fa-shield-halved',
          },
          {
            action: secondSave,
            label: `${formatSave(secondSave)} (${secondPoison.name})`,
            icon: 'fas fa-shield-halved',
          },
          {
            action: 'cancel',
            label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'),
            icon: 'fas fa-times',
          },
        ],
        rejectClose: false,
      });
    } catch {
      return null;
    }
  }

  static _buildDoublePoisonAffliction(firstPoison, secondPoison, saveType) {
    const first = JSON.parse(JSON.stringify(firstPoison));
    const second = JSON.parse(JSON.stringify(secondPoison));
    const stageCount = Math.min(first.stages?.length || 0, second.stages?.length || 0);
    const traits = Array.from(new Set([...(first.traits || []), ...(second.traits || []), 'poison']));

    return {
      ...first,
      name: `Double Poison: ${first.name} + ${second.name}`,
      type: 'poison',
      traits,
      dc: Math.min(first.dc || second.dc || 0, second.dc || first.dc || 0),
      saveType: saveType || first.saveType || second.saveType || 'fortitude',
      isVirulent: !!first.isVirulent && !!second.isVirulent,
      stages: Array.from({ length: stageCount }, (_unused, index) => {
        const firstStage = first.stages[index];
        const secondStage = second.stages[index];
        return this._mergeDoublePoisonStage(firstStage, secondStage, index + 1, first.name, second.name);
      }),
      doublePoison: true,
      componentPoisons: [
        {
          name: first.name,
          dc: first.dc,
          saveType: first.saveType,
          isVirulent: !!first.isVirulent,
          sourceItemUuid: first.sourceItemUuid || null,
        },
        {
          name: second.name,
          dc: second.dc,
          saveType: second.saveType,
          isVirulent: !!second.isVirulent,
          sourceItemUuid: second.sourceItemUuid || null,
        },
      ],
    };
  }

  static _mergeDoublePoisonStage(firstStage, secondStage, number, firstPoisonName, secondPoisonName) {
    const firstEffects = firstStage.effects || firstStage.rawText || '';
    const secondEffects = secondStage.effects || secondStage.rawText || '';
    const effects = [firstEffects, secondEffects].filter(Boolean).join('<br>');
    const duration = this._longerDuration(firstStage.duration, secondStage.duration);
    const effectInterval = this._longerDuration(firstStage.effectInterval, secondStage.effectInterval);

    const merged = {
      ...firstStage,
      number,
      rawText: effects,
      effects,
      componentEffects: [
        { poisonName: firstPoisonName, effects: firstEffects },
        { poisonName: secondPoisonName, effects: secondEffects },
      ].filter(component => component.effects),
      duration,
      damage: [...(firstStage.damage || []), ...(secondStage.damage || [])],
      conditions: [...(firstStage.conditions || []), ...(secondStage.conditions || [])],
      weakness: [...(firstStage.weakness || []), ...(secondStage.weakness || [])],
      requiresManualHandling: !!firstStage.requiresManualHandling || !!secondStage.requiresManualHandling,
      isDead: !!firstStage.isDead || !!secondStage.isDead,
    };

    if (effectInterval) {
      merged.effectInterval = effectInterval;
    } else {
      delete merged.effectInterval;
    }

    return merged;
  }

  static _longerDuration(firstDuration, secondDuration) {
    if (!firstDuration) return secondDuration ? JSON.parse(JSON.stringify(secondDuration)) : null;
    if (!secondDuration) return JSON.parse(JSON.stringify(firstDuration));

    const firstSeconds = AfflictionParser.durationToSeconds(firstDuration);
    const secondSeconds = AfflictionParser.durationToSeconds(secondDuration);
    const longer = secondSeconds > firstSeconds ? secondDuration : firstDuration;
    return JSON.parse(JSON.stringify(longer));
  }

  /**
   * Prompts the GM to choose a Debilitating Venom debilitation before coating.
   * @returns {Promise<'none'|'hampering'|'stumbling'|null>} null means the dialog was cancelled
   */
  static async _promptDebilitation({ stronger = false } = {}) {
    const i = game.i18n;
    const V = 'PF2E_AFFLICTIONER.VISHKANYA';
    const strongerCards = stronger
      ? [['bungling', 'fa-hand-sparkles'], ['devitalizing', 'fa-heart-crack'], ['nauseating', 'fa-face-dizzy'], ['weakening', 'fa-hand-fist']]
        .map(([value, icon]) => `
        <div class="dv-card" data-value="${value}">
          <div class="dv-card-icon"><i class="fas ${icon}"></i></div>
          <div class="dv-card-label">${i.localize(`${V}.DEBILITATION_${value.toUpperCase()}`)}</div>
          <div class="dv-card-hint">${i.localize(`${V}.DEBILITATION_${value.toUpperCase()}_HINT`)}</div>
        </div>`).join('')
      : '';

    const content = `
      <p class="dv-prompt">${i.localize(`${V}.DEBILITATION_PROMPT`)}</p>
      <div class="dv-grid">
        <div class="dv-card" data-value="none">
          <div class="dv-card-icon"><i class="fas fa-times-circle"></i></div>
          <div class="dv-card-label">${i.localize(`${V}.DEBILITATION_NONE`)}</div>
          <div class="dv-card-hint">${i.localize(`${V}.DEBILITATION_NONE_HINT`)}</div>
        </div>
        <div class="dv-card dv-card--hampering" data-value="hampering">
          <div class="dv-card-icon"><i class="fas fa-shoe-prints"></i></div>
          <div class="dv-card-label">${i.localize(`${V}.DEBILITATION_HAMPERING`)}</div>
          <div class="dv-card-hint">${i.localize(`${V}.DEBILITATION_HAMPERING_HINT`)}</div>
        </div>
        <div class="dv-card dv-card--stumbling" data-value="stumbling">
          <div class="dv-card-icon"><i class="fas fa-person-falling"></i></div>
          <div class="dv-card-label">${i.localize(`${V}.DEBILITATION_STUMBLING`)}</div>
          <div class="dv-card-hint">${i.localize(`${V}.DEBILITATION_STUMBLING_HINT`)}</div>
        </div>
        ${strongerCards}
      </div>
    `;

    const result = await new Promise((resolve) => {
      let hookId;

      hookId = Hooks.on('renderDialogV2', (_app, element) => {
        if (!element.querySelector('.dv-grid')) return;
        Hooks.off('renderDialogV2', hookId);

        element.querySelectorAll('.dv-card').forEach((card) => {
          card.addEventListener('click', async () => {
            resolve(card.dataset.value);
            await _app.close();
          });
        });
      });

      foundry.applications.api.DialogV2.wait({
        window: { title: i.localize(`${V}.DEBILITATION_TITLE`) },
        content,
        buttons: [{ action: 'cancel', label: i.localize('PF2E_AFFLICTIONER.DIALOG.CANCEL'), icon: 'fas fa-times' }],
        rejectClose: false
      }).then(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      }).catch(() => {
        Hooks.off('renderDialogV2', hookId);
        resolve(null);
      });
    });

    return result ?? null;
  }

  static async _applyCoatingToActor(actorRef, weaponId, coatingParams) {
    const target = await this._resolveTarget(actorRef);
    const actor = this._getActorFromTarget(target);
    if (!actor) return false;

    const existing = WeaponCoatingStore.getCoating(target, weaponId);
    let { poisonItemUuid, poisonName, weaponName, afflictionData, expirationMode, poisonImg } = coatingParams;

    if (
      this._shouldOfferDoublePoison(actor, existing, afflictionData)
    ) {
      const saveType = await this._chooseDoublePoisonSaveType(existing.afflictionData, afflictionData);
      if (!saveType || saveType === 'cancel') return false;

      afflictionData = this._buildDoublePoisonAffliction(existing.afflictionData, afflictionData, saveType);
      poisonName = afflictionData.name;
      poisonItemUuid = null;
      poisonImg = null;
    }

    if (existing) {
      await WeaponCoatingStore.removeCoating(target, weaponId);
    }

    const combat = game.combat;

    await WeaponCoatingStore.addCoating(target, weaponId, {
      poisonItemUuid,
      poisonName,
      weaponName,
      afflictionData,
      appliedRound: combat?.started ? combat.round : null,
      appliedTimestamp: game.time.worldTime,
      appliedCombatantId: this._findCombatantId(actor, target),
      expirationMode
    });

    const coatingEffectUuid = await this.createCoatingEffect(actor, weaponName, poisonName, expirationMode, poisonImg);
    if (coatingEffectUuid) {
      await WeaponCoatingStore.updateCoating(target, weaponId, { coatingEffectUuid });
    }

    return true;
  }

  static async _applyInjectionToActor(actorRef, weaponId, injectionParams) {
    const target = await this._resolveTarget(actorRef);
    const actor = this._getActorFromTarget(target);
    if (!actor) return false;

    const existing = WeaponCoatingStore.getInjection(target, weaponId);
    if (existing) {
      await WeaponCoatingStore.removeInjection(target, weaponId);
    }

    const { poisonItemUuid, poisonName, weaponName, afflictionData, poisonImg } = injectionParams;

    await WeaponCoatingStore.addInjection(target, weaponId, {
      poisonItemUuid,
      poisonName,
      weaponName,
      afflictionData,
      loadedTimestamp: game.time?.worldTime ?? null,
    });

    const injectionEffectUuid = await this.createInjectionEffect(actor, weaponName, poisonName, poisonImg);
    if (injectionEffectUuid) {
      await WeaponCoatingStore.updateInjection(target, weaponId, { injectionEffectUuid });
    }

    return true;
  }

  static async _removeCoatingFromActor(actorRef, weaponId) {
    const target = await this._resolveTarget(actorRef);
    if (!this._getActorFromTarget(target)) return false;
    await WeaponCoatingStore.removeCoating(target, weaponId);
    return true;
  }

  static async _removeInjectionFromActor(actorRef, weaponId) {
    const target = await this._resolveTarget(actorRef);
    if (!this._getActorFromTarget(target)) return false;
    await WeaponCoatingStore.removeInjection(target, weaponId);
    return true;
  }

  /**
   * Routes coating application through GM socket if the current user doesn't own the actor.
   */
  static async _applyCoatingWithPermission(actor, weaponId, coatingParams) {
    const targetActor = this._getActorFromTarget(actor);
    if (!targetActor) return false;
    if (targetActor.isOwner) {
      return this._applyCoatingToActor(actor, weaponId, coatingParams);
    }
    const { SocketService } = await import('./SocketService.js');
    if (SocketService.socket) {
      return SocketService.requestApplyWeaponCoating(this._getStorageReference(actor), weaponId, coatingParams);
    }
    console.error('PF2e Afflictioner | socketlib is required for coating weapons on unowned actors');
    return false;
  }

  static async _applyInjectionWithPermission(actor, weaponId, injectionParams) {
    const targetActor = this._getActorFromTarget(actor);
    if (!targetActor) return false;
    if (targetActor.isOwner) {
      return this._applyInjectionToActor(actor, weaponId, injectionParams);
    }
    const { SocketService } = await import('./SocketService.js');
    if (SocketService.socket) {
      return SocketService.requestApplyWeaponInjection(this._getStorageReference(actor), weaponId, injectionParams);
    }
    console.error('PF2e Afflictioner | socketlib is required for loading injection weapons on unowned actors');
    return false;
  }

  static async removeCoatingWithPermission(actor, weaponId) {
    const targetActor = this._getActorFromTarget(actor);
    if (!targetActor) return false;
    if (targetActor.isOwner) {
      return this._removeCoatingFromActor(actor, weaponId);
    }
    const { SocketService } = await import('./SocketService.js');
    if (SocketService.socket) {
      return SocketService.requestRemoveWeaponCoating(this._getStorageReference(actor), weaponId);
    }
    console.error('PF2e Afflictioner | socketlib is required for removing coatings on unowned actors');
    return false;
  }

  static async removeInjectionWithPermission(actor, weaponId) {
    const targetActor = this._getActorFromTarget(actor);
    if (!targetActor) return false;
    if (targetActor.isOwner) {
      return this._removeInjectionFromActor(actor, weaponId);
    }
    const { SocketService } = await import('./SocketService.js');
    if (SocketService.socket) {
      return SocketService.requestRemoveWeaponInjection(this._getStorageReference(actor), weaponId);
    }
    console.error('PF2e Afflictioner | socketlib is required for removing injection loads on unowned actors');
    return false;
  }

  static _collectWeapons(speakerActorId, speakerTokenId, targetTokenIds = []) {
    const weapons = [];
    const seen = new Set();

    const addWeaponsForToken = (token) => {
      if (!token || seen.has(token.id)) return;
      seen.add(token.id);
      const actor = token.actor;
      if (!actor) return;
      const actorUuid = this._getActorReference(actor);
      const storageTarget = token.document?.actorLink ? actor : token;
      const groupKey = token.document?.actorLink
        ? (actorUuid || actor.id)
        : (token.id || actorUuid || actor.id);
      for (const weapon of this._getCoatableWeaponItems(actor)) {
        weapons.push({
          actor,
          target: storageTarget,
          storageRef: this._getStorageReference(storageTarget),
          actorId: actor.id,
          actorUuid,
          tokenId: token.id,
          groupKey,
          actorName: token.name || actor.name,
          weaponId: weapon.id,
          weaponName: weapon.name,
          traits: weapon.system?.traits?.value || [],
          hasInjectionReservoir: this._hasInjectionReservoir(weapon),
          damageType: this._getWeaponDamageType(weapon),
          img: weapon.img || 'icons/svg/sword.svg'
        });
      }
    };

    // Speaker's token first
    if (speakerTokenId) {
      addWeaponsForToken(canvas.tokens.get(speakerTokenId));
    } else if (speakerActorId) {
      const controlled = canvas.tokens.controlled?.find(t => t.actor?.id === speakerActorId);
      if (controlled) {
        addWeaponsForToken(controlled);
      } else {
        for (const token of canvas.tokens.placeables) {
          if (token.actor?.id === speakerActorId) { addWeaponsForToken(token); break; }
        }
      }
    }

    // Targeted tokens
    for (const tokenId of targetTokenIds) {
      addWeaponsForToken(canvas.tokens.get(tokenId));
    }

    return weapons;
  }
}
