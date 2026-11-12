import { AfflictionParser } from '../services/AfflictionParser.js';
import { AfflictionService } from '../services/AfflictionService.js';
import * as AfflictionDefinitionStore from '../stores/AfflictionDefinitionStore.js';
import { shouldSkipPromptAffliction } from '../utils.js';
import { AfflictionItemResolver } from '../services/AfflictionItemResolver.js';
import { DEFAULT_AFFLICTION_ICON } from '../constants.js';
import { AddictionService } from '../services/AddictionService.js';

export class AddAfflictionDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-afflictioner-add-dialog',
    classes: ['pf2e-afflictioner', 'add-affliction-dialog'],
    tag: 'form',
    window: {
      title: 'PF2E_AFFLICTIONER.DIALOG.ADD_AFFLICTION_TITLE',
      icon: 'fas fa-plus',
      resizable: false
    },
    position: {
      width: 500,
      height: 'auto'
    },
    actions: {
      addFromItem: AddAfflictionDialog.addFromItem,
      addManual: AddAfflictionDialog.addManual,
      addSavedCustom: AddAfflictionDialog.addSavedCustom
    },
    form: {
      handler: AddAfflictionDialog.formHandler,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    form: {
      template: 'modules/pf2e-afflictioner/templates/add-affliction-dialog.hbs'
    }
  };

  constructor(token, { addictionMode = false, actor = token?.actor, ...options } = {}) {
    if (addictionMode) options.window = { ...options.window, title: 'PF2E_AFFLICTIONER.ADDICTION.ADD' };
    super(options);
    this.token = token;
    this.actor = actor;
    this.addictionMode = addictionMode;
    this.selectedItem = null;
  }

  async _prepareContext(_options) {
    const afflictionItems = [];
    if (this.actor) {
      for (const item of this.actor.items) {
        const afflictionType = AfflictionParser.getAfflictionType(item);
        if (this.addictionMode ? AddictionService.isDrugItem(item) : afflictionType || AfflictionItemResolver.hasDirectOrReferencedAfflictionText(item)) {
          afflictionItems.push({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            type: this.addictionMode ? 'drug' : afflictionType || 'referenced',
            img: item.img
          });
        }
      }
    }

    const compendiumItems = await this.getCompendiumAfflictions();
    const savedCustomAfflictions = this.addictionMode ? [] : this.getSavedCustomAfflictions();

    return {
      token: {
        name: this.token?.name || this.actor?.name,
        img: this.token?.document?.texture?.src || this.actor?.img
      },
      addictionMode: this.addictionMode,
      actorItems: afflictionItems,
      compendiumItems: compendiumItems,
      savedCustomAfflictions,
      hasItems: afflictionItems.length > 0 || compendiumItems.length > 0 || savedCustomAfflictions.length > 0
    };
  }

  getSavedCustomAfflictions() {
    const allEdits = AfflictionDefinitionStore.getAllEditedDefinitions();

    return Object.entries(allEdits)
      // Item-based edits are listed too; promptInitialSave re-applies the edit by key.
      .filter(([key, edit]) => edit && !key.startsWith('addiction-') && !edit.isAddiction)
      .map(([key, edit]) => ({
        key,
        name: edit.name || 'Unknown',
        type: edit.type || 'affliction',
        dc: edit.dc || 15,
        stageCount: edit.stages?.length || 0,
        img: edit.img || DEFAULT_AFFLICTION_ICON
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCompendiumAfflictions() {
    const afflictions = [];

    try {
      const packs = game.packs.filter(p =>
        p.metadata.type === 'Item' &&
        p.metadata.system === 'pf2e'
      );

      for (const pack of packs) {
        const index = this.addictionMode ? await pack.getIndex({ fields: ['system.traits.value'] }) : await pack.getIndex();
        for (const entry of index) {
          if (this.addictionMode ? AddictionService.isDrugItem(entry) : entry.type === 'affliction') {
            afflictions.push({
              uuid: entry.uuid,
              name: entry.name,
              type: this.addictionMode ? 'drug' : 'affliction',
              img: entry.img,
              pack: pack.metadata.label
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading compendium afflictions:', error);
    }

    return afflictions.slice(0, 20);
  }

  static async addFromItem(_event, button) {
    const itemUuid = button.dataset.itemUuid;

    try {
      const item = await fromUuid(itemUuid);
      if (!item) {
        ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.COULD_NOT_LOAD_ITEM'));
        return;
      }

      if (this.addictionMode) return await this._addDrugFromItem(item);

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

      await AfflictionService.promptInitialSave(this.token, afflictionData);

      this.close();
    } catch (error) {
      console.error('Error adding affliction:', error);
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.ERROR_ADDING_AFFLICTION'));
    }
  }

  static async addManual(_event, _button) {
    if (this.addictionMode) return this._addManualDrug();
    const template = `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_NAME')}</label>
          <input type="text" name="name" value="${game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_DEFAULT_NAME')}" required />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_TYPE')}</label>
          <select name="type">
            <option value="poison">Poison</option>
            <option value="disease">Disease</option>
            <option value="curse">Curse</option>
          </select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_DC')}</label>
          <input type="number" name="dc" value="15" min="1" max="50" required />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_STAGES')}</label>
          <input type="number" name="stages" value="3" min="1" max="10" required />
        </div>
      </form>
    `;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_ENTRY_TITLE') },
      content: template,
      ok: {
        label: game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_CREATE'),
        callback: (_event, button, _dialog) => new FormDataExtended(button.form).object
      }
    });

    if (!result) return;

    const stageCount = parseInt(result.stages) || 3;
    const stages = [];
    for (let i = 1; i <= stageCount; i++) {
      stages.push({
        number: i,
        effects: `Stage ${i} effects`,
        rawText: `Stage ${i}: Effects to be defined`,
        duration: { value: 1, unit: 'hour', isDice: false },
        damage: [],
        conditions: [],
        weakness: [],
        requiresManualHandling: false
      });
    }

    const afflictionData = {
      name: result.name || 'Custom Affliction',
      type: result.type || 'poison',
      dc: parseInt(result.dc) || 15,
      saveType: 'fortitude',
      stages: stages,
      onset: null,
      maxDuration: null,
      isVirulent: false,
      multipleExposure: null,
      img: DEFAULT_AFFLICTION_ICON
    };

    const { AfflictionService } = await import('../services/AfflictionService.js');
    await AfflictionService.promptInitialSave(this.token, afflictionData);

    this.close();

    ui.notifications.info(game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.AFFLICTION_ADDED'));
  }

  static async addSavedCustom(_event, button) {
    const key = button.dataset.key;
    if (!key) return;

    const editedDef = AfflictionDefinitionStore.getEditedDefinition(key);
    if (!editedDef) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.DEFINITION_NOT_FOUND'));
      return;
    }

    const afflictionData = foundry.utils.deepClone(editedDef);
    delete afflictionData.editedAt;
    delete afflictionData.editedBy;

    const { AfflictionService } = await import('../services/AfflictionService.js');
    await AfflictionService.promptInitialSave(this.token, afflictionData);
    this.close();
  }

  static async formHandler(_event, _form, _formData) {
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const element = this.element;
    if (!element || this._dropElement === element) return;
    this._dropElement = element;

    element.addEventListener('drop', this._onDrop.bind(this));
    element.addEventListener('dragover', this._onDragOver.bind(this));
  }

  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  async _onDrop(event) {
    event.preventDefault();

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }

    if (data?.type !== 'Item') return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    if (this.addictionMode) return this._addDrugFromItem(item);

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

    await AfflictionService.promptInitialSave(this.token, afflictionData);

    this.close();
  }

  async _addDrugFromItem(item) {
    if (!game.user.isGM || !AddictionService.isEnabled()) return;
    if (!AddictionService.isDrugItem(item)) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.ADDICTION.INVALID_DRUG'));
      return;
    }
    let dc = AddictionService.getDrugDC(item);
    if (dc === null) {
      const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: item.name },
        content: `<p>${game.i18n.localize('PF2E_AFFLICTIONER.ADDICTION.MISSING_DC')}</p>
          <div class="form-group"><label>${game.i18n.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_DC')}</label><input name="dc" type="number" min="1" step="1" required></div>`,
        ok: { label: game.i18n.localize('PF2E_AFFLICTIONER.ADDICTION.TAKE_DRUG'), callback: (_event, button) => new FormDataExtended(button.form).object },
      });
      if (!result) return;
      dc = Number(result.dc);
    }
    if (!Number.isInteger(dc) || dc < 1) return;
    if (!game.user.isGM || !AddictionService.isEnabled()) return;
    await AfflictionService.promptInitialSave(this.token, AddictionService.createDefinitionFromItem(item, dc), this.actor);
    this.close();
  }

  async _addManualDrug() {
    if (!game.user.isGM || !AddictionService.isEnabled()) return;
    const i = game.i18n;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: i.localize('PF2E_AFFLICTIONER.ADDICTION.ADD') },
      content: `<p>${i.localize('PF2E_AFFLICTIONER.ADDICTION.HINT')}</p>
        <div class="form-group"><label>${i.localize('PF2E_AFFLICTIONER.ADDICTION.DRUG')}</label><input name="drugName" type="text" required></div>
        <div class="form-group"><label>${i.localize('PF2E_AFFLICTIONER.DIALOG.MANUAL_DC')}</label><input name="dc" type="number" min="1" step="1" value="15" required></div>`,
      ok: { label: i.localize('PF2E_AFFLICTIONER.ADDICTION.TAKE_DRUG'), callback: (_event, button) => new FormDataExtended(button.form).object },
    });
    if (!result || !game.user.isGM || !AddictionService.isEnabled()) return;
    await AfflictionService.promptInitialSave(this.token, AddictionService.createDefinition(result.drugName, result.dc), this.actor);
    this.close();
  }
}
