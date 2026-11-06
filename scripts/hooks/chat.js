import { AfflictionService } from '../services/AfflictionService.js';
import { AfflictionParser } from '../services/AfflictionParser.js';
import { AfflictionItemResolver } from '../services/AfflictionItemResolver.js';
import * as AfflictionStore from '../stores/AfflictionStore.js';
import * as WeaponCoatingStore from '../stores/WeaponCoatingStore.js';
import { WeaponCoatingService } from '../services/WeaponCoatingService.js';
import { DEGREE_OF_SUCCESS, MODULE_ID } from '../constants.js';
import { getSystemFlags } from '../systemCompat.js';
import { FeatsService } from '../services/FeatsService.js';
import { shouldSkipPromptAffliction } from '../utils.js';
import { RecoveryRestrictionService } from '../services/RecoveryRestrictionService.js';

const processedAttackMessageIds = new Set();

function getGmWhisper() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

function getOriginTraits(message) {
  const rollOptions = getSystemFlags(message)?.origin?.rollOptions || [];
  return rollOptions
    .filter(option => option.startsWith('origin:item:trait:'))
    .map(option => option.replace('origin:item:trait:', ''));
}

function hasInjuryPoisonTraits(itemOrTraits) {
  const rawTraits = Array.isArray(itemOrTraits)
    ? itemOrTraits
    : (itemOrTraits?.system?.traits?.value || []);
  const traits = rawTraits instanceof Set ? Array.from(rawTraits) : (Array.isArray(rawTraits) ? rawTraits : []);
  return traits.includes('injury') && traits.includes('poison');
}

function isInjuryPoisonItemCard(message) {
  const flags = getSystemFlags(message);
  if (flags?.context?.type) return false;
  if (hasInjuryPoisonTraits(getOriginTraits(message))) return true;

  const item = message.getAssociatedItem?.();
  return hasInjuryPoisonTraits(item);
}

async function getOriginItem(message) {
  const uuid = getSystemFlags(message)?.origin?.uuid;
  if (!uuid || typeof fromUuid !== 'function') return null;

  try {
    return await fromUuid(uuid);
  } catch {
    return null;
  }
}

export function onPreCreateChatMessage(message) {
  if (!game.user.isGM) return;
  if (!isInjuryPoisonItemCard(message)) return;
  const whisper = getGmWhisper();
  if (!whisper.length) return;
  message.updateSource?.({ whisper });
}

function isAttackRollMessage(message, flags) {
  const context = flags?.context;
  return context?.type === 'attack-roll' ||
    context?.action === 'strike' ||
    !!message?._strike;
}

async function ensureInjuryPoisonItemCardWhispered(message) {
  if (!game.user.isGM) return;
  if (message.whisper?.length) return;
  const flags = getSystemFlags(message);
  if (flags?.context?.type) return;
  let shouldWhisper = isInjuryPoisonItemCard(message);
  if (!shouldWhisper) {
    shouldWhisper = hasInjuryPoisonTraits(await getOriginItem(message));
  }
  if (!shouldWhisper) return;
  const whisper = getGmWhisper();
  if (!whisper.length) return;
  await message.update?.({ whisper });
}

export async function onCreateChatMessage(message, options, userId) {
  if (!game.user.isGM) return;

  if (!game.users?.activeGM || game.users.activeGM.id === game.user.id) {
    try {
      await RecoveryRestrictionService.recordAppliedDamage(message);
      await RecoveryRestrictionService.annotateHealingMessage(message);
    } catch (error) {
      console.error('PF2e Afflictioner | Failed to process unhealable damage:', error);
    }
  }

  await ensureInjuryPoisonItemCardWhispered(message);

  if (!game.settings.get('pf2e-afflictioner', 'autoDetectAfflictions')) return;

  const flags = getSystemFlags(message);
  if (!flags?.context) return;

  if (isAttackRollMessage(message, flags)) {
    await processAttackRollMessage(message, flags);
    return;
  }

  if (flags.context.type !== 'saving-throw') return;

  const origin = flags.origin;
  if (!origin?.uuid) return;

  let item;
  try {
    item = await fromUuid(origin.uuid);
  } catch {
    return;
  }

  if (!item) return;

  const afflictionData = await AfflictionItemResolver.resolveFromItem(item);
  if (!afflictionData || shouldSkipPromptAffliction(afflictionData)) return;

  // Store the origin actor so referenced afflictions can look up items on it later
  afflictionData.originActorUuid = item.parent?.uuid || flags.origin?.actor || null;
  afflictionData.originActorId = item.parent?.id || afflictionData.originActorId || null;
  AfflictionService.applyOriginActorMetadata(afflictionData, item.parent);

  // Use the DC from the saving throw context — it includes elite/weak adjustments
  const contextDC = flags.context?.dc?.value;
  if (contextDC) afflictionData.dc = contextDC;

  const actorUuid = flags.actor?.uuid;
  if (!actorUuid) return;

  let actor;
  try {
    actor = await fromUuid(actorUuid);
  } catch {
    return;
  }

  if (!actor) return;

  const token = canvas.tokens.placeables.find(t => t.actor?.uuid === actor.uuid);
  if (!token) {
    return;
  }

  const degreeOfSuccess = flags.context?.outcome;
  if (!degreeOfSuccess) return;

  if (degreeOfSuccess === DEGREE_OF_SUCCESS.SUCCESS || degreeOfSuccess === DEGREE_OF_SUCCESS.CRITICAL_SUCCESS) {
    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.RESISTED', {
      tokenName: token.name,
      afflictionName: afflictionData.name
    }));
    return;
  }

  if (afflictionData.isEffectOnly) {
    await AfflictionService.applyEffectOnlyResult(token, afflictionData, degreeOfSuccess);
    return;
  }

  const afflictionId = foundry.utils.randomID();
  const combat = game.combat;

  const affliction = {
    id: afflictionId,
    ...afflictionData,
    currentStage: 0,
    inOnset: !!afflictionData.onset,
    onsetRemaining: AfflictionParser.durationToSeconds(afflictionData.onset),
    nextSaveRound: combat ? combat.round : null,
    nextSaveInitiative: combat ? combat.combatant?.initiative : null,
    applicationInitiative: combat?.combatant?.initiative ?? null,
    stageStartRound: combat ? combat.round : null,
    durationElapsed: 0,
    nextSaveTimestamp: !combat ? game.time.worldTime + AfflictionParser.durationToSeconds(afflictionData.onset || afflictionData.stages?.[0]?.duration) : null,
    treatmentBonus: 0,
    treatedThisStage: false,
    addedTimestamp: Date.now(),
    addedInCombat: !!combat,
    combatId: combat?.id
  };
  let afflictionStored = false;

  if (afflictionData.onset) {
    if (combat) {
      const onsetRounds = Math.ceil(affliction.onsetRemaining / 6);
      affliction.nextSaveRound = combat.round + onsetRounds;
    }
  } else {
    const firstStage = afflictionData.stages[0];
    affliction.currentStage = 1;
    affliction.inOnset = false;
    if (firstStage?.duration) {
      const durationCopy = { ...firstStage.duration };
      const durationSeconds = await AfflictionParser.resolveStageDuration(durationCopy, `${afflictionData.name} Stage 1`);
      if (combat) {
        const durationRounds = Math.ceil(durationSeconds / 6);
        affliction.nextSaveRound = combat.round + durationRounds;
      } else {
        affliction.nextSaveTimestamp = game.time.worldTime + durationSeconds;
      }
      if (durationCopy.value > 0) {
        affliction.currentStageResolvedDuration = { value: durationCopy.value, unit: durationCopy.unit };
      }
    }

    await AfflictionStore.addAffliction(token, affliction);
    afflictionStored = true;
    await AfflictionService.applyStageEffects(token, affliction, firstStage);
  }

  if (!afflictionStored) await AfflictionStore.addAffliction(token, affliction);

  const { VisualService } = await import('../services/VisualService.js');
  await VisualService.addAfflictionIndicator(token);

  ui.notifications.warn(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.AFFLICTED', {
    tokenName: token.name,
    afflictionName: afflictionData.name
  }));
}

export async function onUpdateChatMessage(message) {
  if (!game.user.isGM) return;
  if (!game.users?.activeGM || game.users.activeGM.id === game.user.id) {
    try {
      await RecoveryRestrictionService.releaseRevertedDamage(message);
    } catch (error) {
      console.error('PF2e Afflictioner | Failed to release reverted unhealable damage:', error);
    }
  }
  if (!game.settings.get('pf2e-afflictioner', 'autoDetectAfflictions')) return;

  const flags = getSystemFlags(message);
  if (!isAttackRollMessage(message, flags)) return;

  await processAttackRollMessage(message, flags);
}

async function processAttackRollMessage(message, flags) {
  if (message.id && processedAttackMessageIds.has(message.id)) return;

  const handled = await handleAttackRoll(message, flags);
  if (handled && message.id) processedAttackMessageIds.add(message.id);
}

async function rollStickyPoisonFlatCheck(actor, weapon, coating, dc, gmWhisper) {
  const roll = new Roll('1d20');
  await roll.evaluate();
  const success = roll.total >= dc;
  const i = game.i18n;
  const FK = 'PF2E_AFFLICTIONER.FEATS';
  const descKey = dc === 5 ? 'STICKY_POISON_DC5_DESC' : 'STICKY_POISON_DC17_DESC';

  await roll.toMessage({
    flavor: `<div class="pf2e-afflictioner-save-request"><h3><i class="fas fa-flask"></i> ${i.localize(`${FK}.STICKY_POISON_TITLE`)}</h3><p>${i.format(`${FK}.${descKey}`, { actorName: actor.name, weaponName: weapon.name, poisonName: coating.poisonName })}</p><p><strong>${success ? i.localize(`${FK}.STICKY_POISON_SUCCESS`) : i.localize(`${FK}.STICKY_POISON_FAILURE`)}</strong></p></div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmWhisper
  });

  return success;
}

async function resolveAttackTargets(flags) {
  const targets = [];
  const pf2eTarget = flags.context?.target;
  if (pf2eTarget?.token) {
    try {
      const tokenDoc = await fromUuid(pf2eTarget.token);
      if (tokenDoc) {
        const canvasToken = canvas.tokens.get(tokenDoc.id);
        if (canvasToken) targets.push(canvasToken);
      }
    } catch { /* ignore */ }
  }

  if (!targets.length) {
    targets.push(...game.user.targets);
  }

  return targets;
}

async function resolveAttackActor(message, flags, weapon) {
  if (message?.speakerActor) return message.speakerActor;
  if (message?.actor) return message.actor;

  const speakerToken = message?.speaker?.token ? globalThis.canvas?.tokens?.get?.(message.speaker.token) : null;
  if (speakerToken?.actor) return speakerToken.actor;

  const actorUuid = flags.actor?.uuid || flags.origin?.actor;
  if (actorUuid && typeof fromUuid === 'function') {
    try {
      const actor = await fromUuid(actorUuid);
      if (actor) return actor;
    } catch {
      // Fall back to weapon parent below.
    }
  }

  return weapon?.parent || null;
}

function resolveAttackStorageTarget(message, actor) {
  const speakerToken = message?.speaker?.token ? globalThis.canvas?.tokens?.get?.(message.speaker.token) : null;
  if (speakerToken?.document?.actorLink === false) return speakerToken;

  const actorUuid = actor?.uuid;
  const matchingToken = globalThis.canvas?.tokens?.placeables?.find(token =>
    token.actor === actor || (actorUuid && token.actor?.uuid === actorUuid)
  );
  if (matchingToken?.document?.actorLink === false) return matchingToken;

  return actor;
}

function storageTokenId(storageTarget) {
  if (storageTarget?.document?.actorLink === false) return storageTarget.id;
  if (storageTarget?.actorLink === false && storageTarget.actor) return storageTarget.id;
  return '';
}

async function resolveAttackWeapon(message, flags) {
  const originUuid = flags.origin?.uuid;
  if (originUuid) {
    try {
      const weapon = await fromUuid(originUuid);
      if (weapon) return weapon;
    } catch {
      // Fall back to message item below.
    }
  }

  return message?.item || message?._strike?.item || null;
}

function resolveActorWeapon(actor, weapon) {
  return actor?.items?.get?.(weapon.id) || weapon;
}

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function getItemIdFromUuid(uuid) {
  return String(uuid || '').match(/(?:^|\.)Item\.([^.]+)$/)?.[1] || null;
}

function getLinkedWeaponId(item) {
  return item?.flags?.pf2e?.linkedWeapon || item?.system?.linkedWeapon || item?.system?.linkedWeaponId || null;
}

function getActionItem(actor, strikeFlag) {
  const index = strikeFlag && Number.isInteger(strikeFlag.index) ? strikeFlag.index : null;
  return index === null ? null : actor?.system?.actions?.[index]?.item || null;
}

function getStoredWeaponIds(actor, weapon, message, flags) {
  const ids = [];
  const candidates = [
    weapon,
    message?.item,
    message?._strike?.item,
    getActionItem(actor, flags?.strike),
  ].filter(Boolean);

  for (const item of candidates) {
    addUnique(ids, item.id);
    addUnique(ids, getLinkedWeaponId(item));
  }

  addUnique(ids, getItemIdFromUuid(flags?.origin?.uuid));

  const identifierWeaponId = String(flags?.context?.identifier || '').split('.')[0];
  addUnique(ids, identifierWeaponId);

  const actorItems = actor?.items;
  for (const id of [...ids]) {
    const item = actorItems?.get?.(id);
    addUnique(ids, getLinkedWeaponId(item));
  }

  return ids;
}

function findStoredWeaponData(storageTarget, actor, weapon, message, flags, getAll) {
  const records = getAll(storageTarget);
  for (const weaponId of getStoredWeaponIds(actor, weapon, message, flags)) {
    if (records[weaponId]) return { weaponId, data: records[weaponId] };
  }

  const weaponName = String(weapon?.name || '').trim().toLowerCase();
  if (weaponName) {
    const nameMatches = Object.entries(records)
      .filter(([, record]) => String(record?.weaponName || '').trim().toLowerCase() === weaponName);
    if (nameMatches.length === 1) {
      const [weaponId, data] = nameMatches[0];
      return { weaponId, data };
    }
  }

  return { weaponId: weapon?.id || null, data: null };
}

function outcomeFromDegree(degree) {
  return {
    0: DEGREE_OF_SUCCESS.CRITICAL_FAILURE,
    1: DEGREE_OF_SUCCESS.FAILURE,
    2: DEGREE_OF_SUCCESS.SUCCESS,
    3: DEGREE_OF_SUCCESS.CRITICAL_SUCCESS,
  }[degree] || null;
}

function stripHtml(html) {
  const withoutTags = String(html || '').replace(/<[^>]*>/g, ' ');
  const textarea = document?.createElement?.('textarea');
  if (!textarea) return withoutTags;
  textarea.innerHTML = withoutTags;
  return textarea.value;
}

function resolveAttackOutcome(message, flags) {
  const contextOutcome = flags.context?.outcome || flags.context?.unadjustedOutcome;
  if (contextOutcome) return contextOutcome;

  const rollDegree = message?.rolls?.find?.(roll => Number.isInteger(roll?.options?.degreeOfSuccess))?.options?.degreeOfSuccess;
  const degreeOutcome = outcomeFromDegree(rollDegree);
  if (degreeOutcome) return degreeOutcome;

  const content = stripHtml(message?.content).toLowerCase();
  if (/\bcritical\s+(hit|success)\b/.test(content)) return DEGREE_OF_SUCCESS.CRITICAL_SUCCESS;
  if (/\bhit\s+by\b/.test(content) || /\bsuccess\b/.test(content)) return DEGREE_OF_SUCCESS.SUCCESS;
  if (/\bcritical\s+(miss|failure)\b/.test(content)) return DEGREE_OF_SUCCESS.CRITICAL_FAILURE;
  if (/\bmiss\s+by\b/.test(content) || /\bfailure\b/.test(content)) return DEGREE_OF_SUCCESS.FAILURE;

  return null;
}

async function postInjectionHitPrompt(actor, weapon, injection, flags, gmWhisper, weaponId = weapon.id, storageTarget = actor) {
  const i = game.i18n;
  const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';
  const targets = await resolveAttackTargets(flags);
  const actorName = actor.name;
  const weaponName = weapon.name;
  const poisonName = injection.poisonName;

  let buttonAfflictionData = {
    ...injection.afflictionData,
    originActorUuid: injection.afflictionData.originActorUuid || actor.uuid || null,
    originActorId: injection.afflictionData.originActorId || actor.id || null,
  };
  AfflictionService.applyOriginActorMetadata(buttonAfflictionData, actor);

  if (FeatsService.hasPerniciousPoison(actor) && injection.afflictionData.level > 0) {
    buttonAfflictionData = { ...buttonAfflictionData, perniciousPoisonLevel: injection.afflictionData.level };
  }

  if (targets.length) {
    for (const target of targets) {
      await ChatMessage.create({
        content: `
          <div class="pf2e-afflictioner-save-request pf2e-afflictioner-injection-request">
            <h3><i class="fas fa-syringe"></i> ${i.format(`${K}.INJECTION_HIT_TITLE`, { poisonName })}</h3>
            <p>${i.format(`${K}.INJECTION_HIT_DESC`, { actorName, targetName: target.name, weaponName })}</p>
            <button class="pf2e-afflictioner-inject-weapon-poison"
                    data-target-token-id="${target.id}"
                    data-actor-id="${actor.id}"
                    data-actor-uuid="${actor.uuid || actor.id}"
                    data-token-id="${storageTokenId(storageTarget)}"
                    data-weapon-id="${weaponId}"
                    data-affliction-data="${encodeURIComponent(JSON.stringify(buttonAfflictionData))}">
              <i class="fas fa-syringe"></i> ${i.format(`${K}.INJECTION_APPLY_BTN`, { targetName: target.name })}
            </button>
          </div>`,
        whisper: gmWhisper
      });
    }
    return;
  }

  await ChatMessage.create({
    content: `
      <div class="pf2e-afflictioner-save-request pf2e-afflictioner-injection-request">
        <h3><i class="fas fa-syringe"></i> ${i.format(`${K}.INJECTION_HIT_TITLE`, { poisonName })}</h3>
        <p>${i.format(`${K}.INJECTION_NO_TARGET`, { actorName, weaponName })}</p>
        <p><em>${i.localize(`${K}.INJECTION_NO_TARGET_HINT`)}</em></p>
      </div>`,
    whisper: gmWhisper
  });
}

async function handleAttackRoll(_message, flags) {
  let weapon = await resolveAttackWeapon(_message, flags);
  if (!weapon) return;

  const actor = await resolveAttackActor(_message, flags, weapon);
  if (!actor) return;
  weapon = resolveActorWeapon(actor, weapon);
  const storageTarget = resolveAttackStorageTarget(_message, actor);

  const outcome = resolveAttackOutcome(_message, flags);
  if (!outcome) return;

  const gmWhisper = game.users.filter(u => u.isGM).map(u => u.id);
  let handled = false;
  const injectionRecord = findStoredWeaponData(storageTarget, actor, weapon, _message, flags, WeaponCoatingStore.getInjections);
  const injection = injectionRecord.data;
  if (
    injection &&
    (WeaponCoatingService._isInjectionWeapon(weapon) ||
      WeaponCoatingService._isInjectionWeapon(actor.items?.get?.(injectionRecord.weaponId))) &&
    (outcome === DEGREE_OF_SUCCESS.SUCCESS || outcome === DEGREE_OF_SUCCESS.CRITICAL_SUCCESS)
  ) {
    await postInjectionHitPrompt(actor, weapon, injection, flags, gmWhisper, injectionRecord.weaponId, storageTarget);
    handled = true;
  }

  const coatingRecord = findStoredWeaponData(storageTarget, actor, weapon, _message, flags, WeaponCoatingStore.getCoatings);
  const coating = coatingRecord.data;
  if (!coating) {
    if (actor.type === 'hazard') {
      await handleHazardAttackRoll(_message, flags, actor);
    }
    return handled;
  }

  const weaponName = weapon.name;
  const actorName = actor.name;
  const poisonName = coating.poisonName;

  if (outcome === DEGREE_OF_SUCCESS.SUCCESS || outcome === DEGREE_OF_SUCCESS.CRITICAL_SUCCESS) {
    // Direct damage coatings (Field Vials) — roll bonus damage, no save
    if (coating.afflictionData?.isDirectDamage) {
      await WeaponCoatingStore.removeCoating(storageTarget, coatingRecord.weaponId);
      const i = game.i18n;
      const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';
      const { damageFormula, damageType: dmgType } = coating.afflictionData;

      const damageLink = dmgType && dmgType !== 'untyped'
        ? `@Damage[${damageFormula}[${dmgType}]]`
        : `@Damage[${damageFormula}]`;

      await ChatMessage.create({
        content: `<div class="pf2e-afflictioner-save-request"><h3><i class="fas fa-flask"></i> ${i.format(`${K}.FIELD_VIAL_HIT_TITLE`, { poisonName })}</h3><p>${i.format(`${K}.FIELD_VIAL_HIT_DESC`, { actorName, weaponName, damageType: dmgType })}</p><p><strong>${i.localize('PF2E_AFFLICTIONER.CHAT.DAMAGE_LABEL')}</strong> ${damageLink}</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: gmWhisper
      });

      const { AfflictionManager } = await import('../managers/AfflictionManager.js');
      if (AfflictionManager.currentInstance) AfflictionManager.currentInstance.render({ force: true });
      return true;
    }

    const damageType = WeaponCoatingService._getWeaponDamageType(weapon);
    const hasPiercingOrSlashing = damageType === 'piercing' || damageType === 'slashing';

    if (hasPiercingOrSlashing) {
      // Blowgun Poisoner: if the attacker critted with a blowgun and has the feat, degrade target's initial save
      const weaponTraits = weapon.system?.traits?.value ?? [];
      const isBlowgunStrike = weaponTraits.includes('blowgun') || weapon.system?.slug === 'blowgun';
      let buttonAfflictionData = (
        outcome === DEGREE_OF_SUCCESS.CRITICAL_SUCCESS &&
        isBlowgunStrike &&
        FeatsService.hasBlowgunPoisoner(actor)
      )
        ? { ...coating.afflictionData, blowgunPoisonerCrit: true }
        : coating.afflictionData;

      buttonAfflictionData = {
        ...buttonAfflictionData,
        originActorUuid: buttonAfflictionData.originActorUuid || actor.uuid || null,
        originActorId: buttonAfflictionData.originActorId || actor.id || null,
      };
      AfflictionService.applyOriginActorMetadata(buttonAfflictionData, actor);

      // Pernicious Poison: mark affliction so success still deals flat poison damage
      if (FeatsService.hasPerniciousPoison(actor) && coating.afflictionData.level > 0) {
        buttonAfflictionData = { ...buttonAfflictionData, perniciousPoisonLevel: coating.afflictionData.level };
      }

      // Sticky Poison: DC 17 flat check to retain poison on successful hit
      let stickyPoisonSuccess = false;
      if (FeatsService.hasStickyPoison(actor)) {
        stickyPoisonSuccess = await rollStickyPoisonFlatCheck(actor, weapon, coating, 17, gmWhisper);
      }

      const i = game.i18n;
      const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';

      const targets = await resolveAttackTargets(flags);

      if (targets.length) {
        for (const target of targets) {
          await ChatMessage.create({
            content: `
              <div class="pf2e-afflictioner-save-request">
                <h3><i class="fas fa-flask"></i> ${i.format(`${K}.HIT_TITLE`, { poisonName })}</h3>
                <p><strong>${actorName}</strong> hit <strong>${target.name}</strong> with <strong>${weaponName}</strong>.</p>
                <button class="pf2e-afflictioner-apply-weapon-poison"
                        data-target-token-id="${target.id}"
                        data-actor-id="${actor.id}"
                        data-actor-uuid="${actor.uuid || actor.id}"
                        data-token-id="${storageTokenId(storageTarget)}"
                        data-weapon-id="${coatingRecord.weaponId}"
                        data-affliction-data="${encodeURIComponent(JSON.stringify(buttonAfflictionData))}"
                        data-sticky-poison-success="${stickyPoisonSuccess}">
                  <i class="fas fa-biohazard"></i> ${i.format(`${K}.HIT_APPLY_BTN`, { targetName: target.name })}
                </button>
              </div>`,
            whisper: gmWhisper
          });
        }
      } else {
        await ChatMessage.create({
          content: `
            <div class="pf2e-afflictioner-save-request">
              <h3><i class="fas fa-flask"></i> ${i.format(`${K}.HIT_TITLE`, { poisonName })}</h3>
              <p>${i.format(`${K}.HIT_NO_TARGET`, { actorName, weaponName })}</p>
              <p><em>${i.localize(`${K}.HIT_NO_TARGET_HINT`)}</em></p>
            </div>`,
          whisper: gmWhisper
        });
      }
      return true;
    } else {
      let removed = true;
      if (FeatsService.hasStickyPoison(actor)) {
        const kept = await rollStickyPoisonFlatCheck(actor, weapon, coating, 5, gmWhisper);
        if (kept) removed = false;
      }
      if (removed) {
        await WeaponCoatingStore.removeCoating(storageTarget, coatingRecord.weaponId);
        const i = game.i18n;
        const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';
        await ChatMessage.create({
          content: `<div class="pf2e-afflictioner-save-request"><p>${i.format(`${K}.HIT_WRONG_DAMAGE`, { weaponName, poisonName })}</p></div>`,
          whisper: gmWhisper
        });
      }
      return true;
    }
  } else if (outcome === DEGREE_OF_SUCCESS.FAILURE) {
    const i = game.i18n;
    const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';
    await ChatMessage.create({
      content: `<div class="pf2e-afflictioner-save-request"><p>${i.format(`${K}.MISS`, { actorName, weaponName, poisonName })}</p></div>`,
      whisper: gmWhisper
    });
    return true;
  } else if (outcome === DEGREE_OF_SUCCESS.CRITICAL_FAILURE) {
    let removed = true;
    if (FeatsService.hasStickyPoison(actor)) {
      const kept = await rollStickyPoisonFlatCheck(actor, weapon, coating, 5, gmWhisper);
      if (kept) removed = false;
    }
    if (removed) {
      await WeaponCoatingStore.removeCoating(storageTarget, coatingRecord.weaponId);
      const i = game.i18n;
      const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';
      await ChatMessage.create({
        content: `<div class="pf2e-afflictioner-save-request"><p>${i.format(`${K}.CRIT_MISS`, { actorName, weaponName, poisonName })}</p></div>`,
        whisper: gmWhisper
      });
    }
    return true;
  }

  return false;
}

async function handleHazardAttackRoll(message, flags, actor) {
  const outcome = flags.context?.outcome;
  if (outcome !== DEGREE_OF_SUCCESS.SUCCESS && outcome !== DEGREE_OF_SUCCESS.CRITICAL_SUCCESS) return;

  // Find affliction items on the hazard actor (poison/disease/curse)
  const afflictionItems = actor.items.filter(item => {
    const traits = item.system?.traits?.value || [];
    return traits.includes('poison') || traits.includes('disease') || traits.includes('curse');
  });
  if (!afflictionItems.length) return;

  let afflictionData = null;
  for (const afflictionItem of afflictionItems) {
    const parsed = AfflictionParser.parseFromItem(afflictionItem);
    if (parsed && !parsed.skip) {
      afflictionData = parsed;
      break;
    }
  }
  if (!afflictionData) return;

  afflictionData.originActorUuid = actor.uuid;
  afflictionData.originActorId = actor.id || afflictionData.originActorId || null;
  AfflictionService.applyOriginActorMetadata(afflictionData, actor);

  const contextDC = flags.context?.dc?.value;
  if (contextDC) afflictionData.dc = contextDC;

  // Resolve target from message flags, fall back to user's current targets
  const targets = [];
  const pf2eTarget = flags.context?.target;
  if (pf2eTarget?.token) {
    try {
      const tokenDoc = await fromUuid(pf2eTarget.token);
      if (tokenDoc) {
        const canvasToken = canvas.tokens.get(tokenDoc.id);
        if (canvasToken) targets.push(canvasToken);
      }
    } catch { /* ignore */ }
  }
  if (!targets.length) targets.push(...game.user.targets);

  // Store data on the message so onRenderChatMessage can inject the button
  await message.setFlag(MODULE_ID, 'hazardAffliction', {
    afflictionData,
    targets: targets.map(t => ({ tokenId: t.id, name: t.name }))
  });
}
