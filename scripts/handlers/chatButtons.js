import { registerSaveButtonHandlers, injectConfirmationButton } from './saveButtons.js';
import { registerAfflictionButtonHandlers } from './afflictionButtons.js';
import { registerTreatmentButtonHandlers, addTreatmentAfflictionSelection } from './treatmentButtons.js';
import { registerCounteractButtonHandlers, addCounteractAfflictionSelection, injectCounteractConfirmButton } from './counteractButtons.js';
import { VishkanyaService } from '../services/VishkanyaService.js';
import { AfflictionService } from '../services/AfflictionService.js';
import { getSystemFlags } from '../systemCompat.js';
import { MODULE_ID } from '../constants.js';

const chatLayoutDiagnosticsLogged = new Set();
const CHAT_LOG_RESET_STYLE_ID = `${MODULE_ID}-chat-log-padding-reset`;

export function onRenderChatMessage(message, root) {
  if (!(root instanceof HTMLElement)) return;

  injectConfirmationButton(message, root);
  injectCounteractConfirmButton(message, root);
  injectHazardAfflictionButton(message, root);
  injectItemCardAfflictionButton(message, root);

  registerSaveButtonHandlers(root);
  registerAfflictionButtonHandlers(root, message);
  registerTreatmentButtonHandlers(root);
  registerCounteractButtonHandlers(root);

  addTreatmentAfflictionSelection(message, root);
  addCounteractAfflictionSelection(message, root);

  registerMaxDurationRemovalHandler(root);
  registerDeathConfirmationHandler(root);
  registerApplyWeaponPoisonHandler(root);
  registerApplyWeaponInjectionHandler(root);
  registerPoisonSprayHandler(root);

  injectCoatWeaponButton(message, root);
  scheduleChatLayoutDiagnostics(message, root);
}

function scheduleChatLayoutDiagnostics(message, root) {
  if (!root.querySelector('.pf2e-afflictioner-save-request, .pf2e-afflictioner-apply-weapon-poison, .pf2e-afflictioner-apply-item-affliction')) return;

  const messageId = message?.id ?? root.dataset?.messageId ?? foundry.utils.randomID();
  if (chatLayoutDiagnosticsLogged.has(messageId)) return;
  chatLayoutDiagnosticsLogged.add(messageId);

  globalThis.setTimeout?.(() => {
    const chatLog = findChatLog(root);
    const before = getChatLayoutSnapshot(root, chatLog);
    ensureChatLogPaddingResetStyle(root);
    resetChatLogPadding(chatLog);

    globalThis.requestAnimationFrame?.(() => {
      const after = getChatLayoutSnapshot(root, chatLog);
      const hadPadding = before.chatLog?.computed?.paddingLeft !== '0px' || before.chatLog?.computed?.paddingInlineStart !== '0px';
      const stillHasPadding = after.chatLog?.computed?.paddingLeft !== '0px' || after.chatLog?.computed?.paddingInlineStart !== '0px';

      if (!hadPadding && !stillHasPadding) return;

      console[stillHasPadding ? 'error' : 'warn']('PF2e Afflictioner | Chat layout diagnostics', {
        messageId,
        before,
        after,
        parentChain: getParentChain(root),
        stylesheets: getAfflictionerStylesheetSnapshot(),
        matchingPaddingRules: chatLog ? getMatchingPaddingRules(chatLog) : []
      });
    });
  }, 0);
}

function findChatLog(root) {
  let current = root;
  while (current) {
    if (isChatLogElement(current)) return current;
    current = current.parentElement;
  }

  const rootNode = root.getRootNode?.();
  const scopedQuery = rootNode?.querySelector?.bind(rootNode);
  return scopedQuery?.('ol#chat-log, ul#chat-log, .chat-log, ol:has(> li.chat-message), ul:has(> li.chat-message), #chat-log') ??
    document.querySelector('ol#chat-log, ul#chat-log, .chat-log, ol:has(> li.chat-message), ul:has(> li.chat-message), #chat-log');
}

function isChatLogElement(element) {
  if (!element) return false;
  if (element.id === 'chat-log' || element.classList?.contains('chat-log')) return true;
  if (element.tagName !== 'OL' && element.tagName !== 'UL') return false;
  return [...element.children].some(child => child.matches?.('li.chat-message'));
}

function ensureChatLogPaddingResetStyle(root) {
  const rootNode = root.getRootNode?.();
  const styleParent = typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot
    ? rootNode
    : document.head;
  if (styleParent.querySelector?.(`#${CHAT_LOG_RESET_STYLE_ID}`)) return;

  const style = document.createElement('style');
  style.id = CHAT_LOG_RESET_STYLE_ID;
  style.textContent = `
ol#chat-log,
ul#chat-log,
#chat ol#chat-log,
#chat ul#chat-log,
#sidebar #chat-log,
.chat-log,
ol.chat-log,
ul.chat-log,
ol:has(> li.chat-message),
ul:has(> li.chat-message),
#chat-log {
  padding-left: 0 !important;
  padding-inline-start: 0 !important;
}
`;
  styleParent.appendChild(style);
}

function resetChatLogPadding(chatLog) {
  if (!chatLog) return;
  chatLog.style.setProperty('padding-left', '0', 'important');
  chatLog.style.setProperty('padding-inline-start', '0', 'important');
}

function describeElement(element) {
  if (!element) return null;
  const id = element.id ? `#${element.id}` : '';
  const classes = typeof element.className === 'string' && element.className
    ? `.${element.className.trim().replace(/\s+/g, '.')}`
    : '';
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function getElementSnapshot(element) {
  if (!element) return null;
  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    element: describeElement(element),
    style: element.getAttribute('style') ?? '',
    computed: {
      padding: computed.padding,
      paddingLeft: computed.paddingLeft,
      paddingInlineStart: computed.paddingInlineStart,
      width: computed.width,
      maxWidth: computed.maxWidth,
      boxSizing: computed.boxSizing,
      marginLeft: computed.marginLeft,
      overflowX: computed.overflowX
    },
    rect: {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width)
    },
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    offsetWidth: element.offsetWidth
  };
}

function getChatLayoutSnapshot(root, chatLog) {
  const message = root.closest?.('.chat-message') ?? root;
  return {
    chatLog: getElementSnapshot(chatLog),
    message: getElementSnapshot(message),
    content: getElementSnapshot(root.querySelector?.('.message-content') ?? null),
    card: getElementSnapshot(root.querySelector?.('.pf2e-afflictioner-save-request, .pf2e-afflictioner-apply-weapon-poison, .pf2e-afflictioner-apply-item-affliction') ?? null)
  };
}

function getParentChain(root) {
  const chain = [];
  let current = root;
  while (current && chain.length < 10) {
    chain.push(getElementSnapshot(current));
    current = current.parentElement;
  }
  return chain;
}

function getAfflictionerStylesheetSnapshot() {
  return [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .filter(element => {
      const id = element.id ?? '';
      const href = element.href ?? '';
      const text = element.tagName === 'STYLE' ? element.textContent ?? '' : '';
      return id.includes(MODULE_ID) ||
        href.includes(MODULE_ID) ||
        href.includes('styles/chat.css') ||
        text.includes('pf2e-afflictioner-save-request') ||
        text.includes('pf2e-afflictioner-chat-log-padding-reset');
    })
    .map(element => ({
      element: describeElement(element),
      href: element.href ?? null,
      disabled: !!element.disabled,
      media: element.media?.mediaText ?? ''
    }));
}

function getMatchingPaddingRules(element) {
  const matches = [];

  for (const sheet of [...document.styleSheets]) {
    collectMatchingPaddingRules(sheet, element, matches);
  }

  return matches.slice(-30);
}

function collectMatchingPaddingRules(sheetOrRule, element, matches) {
  let rules;
  try {
    rules = sheetOrRule.cssRules;
  } catch {
    return;
  }
  if (!rules) return;

  for (const rule of [...rules]) {
    if (rule.cssRules) {
      collectMatchingPaddingRules(rule, element, matches);
      continue;
    }

    if (!rule.selectorText || !rule.style) continue;
    const hasPaddingDeclaration = rule.style.padding ||
      rule.style.paddingLeft ||
      rule.style.paddingInlineStart ||
      rule.style.getPropertyValue('padding-left') ||
      rule.style.getPropertyValue('padding-inline-start');
    if (!hasPaddingDeclaration) continue;

    const selectors = rule.selectorText.split(',').map(selector => selector.trim()).filter(Boolean);
    const matchedSelector = selectors.find(selector => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
    if (!matchedSelector) continue;

    matches.push({
      href: rule.parentStyleSheet?.href ?? 'inline',
      selector: matchedSelector,
      padding: rule.style.padding,
      paddingLeft: rule.style.getPropertyValue('padding-left'),
      paddingLeftPriority: rule.style.getPropertyPriority('padding-left'),
      paddingInlineStart: rule.style.getPropertyValue('padding-inline-start'),
      paddingInlineStartPriority: rule.style.getPropertyPriority('padding-inline-start')
    });
  }
}

function injectHazardAfflictionButton(message, root) {
  if (!game.user.isGM) return;
  if (root.dataset.hazardAfflictionInjected === 'true') return;

  const flagData = message.getFlag(MODULE_ID, 'hazardAffliction');
  if (!flagData) return;

  const { afflictionData, targets } = flagData;
  const i = game.i18n;
  const K = 'PF2E_AFFLICTIONER.WEAPON_COATING';

  // Insert after .chat-buttons (not inside it) so PF2e system styles don't override ours
  const chatButtons = root.querySelector('.chat-buttons');
  const parent = chatButtons?.parentElement ?? root.querySelector('.message-content') ?? root;

  for (const target of targets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pf2e-afflictioner-apply-weapon-poison pf2e-afflictioner-apply-hazard-btn';
    btn.dataset.targetTokenId = target.tokenId;
    btn.dataset.afflictionData = encodeURIComponent(JSON.stringify(afflictionData));
    btn.innerHTML = `<i class="fas fa-biohazard"></i> ${i.format(`${K}.HIT_APPLY_BTN`, { targetName: target.name })}`;
    if (chatButtons) {
      chatButtons.insertAdjacentElement('afterend', btn);
    } else {
      parent.appendChild(btn);
    }
  }

  root.dataset.hazardAfflictionInjected = 'true';
}

async function resolveWeaponStorageTargetFromButton(button) {
  const tokenId = button.dataset.tokenId;
  const token = tokenId ? globalThis.canvas?.tokens?.get?.(tokenId) : null;
  if (token?.document?.actorLink === false) return token;
  if (token?.actor) return token.actor;

  const actorUuid = button.dataset.actorUuid;
  if (actorUuid && typeof fromUuid === 'function') {
    try {
      const document = await fromUuid(actorUuid);
      if (document?.actorLink === false && document.actor) return document;
      if (document) return document;
    } catch {
      // Fall back to world actor lookup below.
    }
  }

  const actorId = button.dataset.actorId;
  return actorId ? game.actors.get(actorId) : null;
}

function registerApplyWeaponPoisonHandler(root) {
  const btn = root.querySelector('.pf2e-afflictioner-apply-weapon-poison');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const targetTokenId = btn.dataset.targetTokenId;
    const actorId = btn.dataset.actorId;
    const weaponId = btn.dataset.weaponId;
    // Delivered by a Strike: enables Deadly Poison Weapon, Pinpoint Poisoner, Greater Field Discovery
    const afflictionData = { ...JSON.parse(decodeURIComponent(btn.dataset.afflictionData)), deliveredByStrike: true };

    const target = canvas.tokens.get(targetTokenId);
    if (!target) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.TARGET_NOT_FOUND'));
      return;
    }

    if ((actorId || btn.dataset.actorUuid || btn.dataset.tokenId) && weaponId) {
      const storageTarget = await resolveWeaponStorageTargetFromButton(btn);
      if (storageTarget) {
        const stickyPoisonSuccess = btn.dataset.stickyPoisonSuccess === 'true';
        if (stickyPoisonSuccess) {
          const { updateCoating } = await import('../stores/WeaponCoatingStore.js');
          const combat = game.combat;
          await updateCoating(storageTarget, weaponId, {
            expirationMode: 'end-next-turn',
            appliedRound: combat?.started ? combat.round : null
          });
        } else {
          const { removeCoating } = await import('../stores/WeaponCoatingStore.js');
          await removeCoating(storageTarget, weaponId);
        }
        const { AfflictionManager } = await import('../managers/AfflictionManager.js');
        if (AfflictionManager.currentInstance) AfflictionManager.currentInstance.render({ force: true });
      }
    }

    const { AfflictionService } = await import('../services/AfflictionService.js');
    await AfflictionService.promptInitialSave(target, afflictionData);

    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.SAVE_PROMPTED')}`;
  });
}

function registerPoisonSprayHandler(root) {
  const btn = root.querySelector('.affliction-spray-exposure');
  if (!btn || !game.user.isGM) return;

  btn.addEventListener('click', async () => {
    const targets = Array.from(game.user.targets ?? []);
    if (targets.length === 0) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.FEATS.SPRAY_NO_TARGET'));
      return;
    }

    const afflictionData = JSON.parse(decodeURIComponent(btn.dataset.afflictionData));
    const { AfflictionService } = await import('../services/AfflictionService.js');
    for (const target of targets) {
      await AfflictionService.promptInitialSave(target, { ...afflictionData });
    }
    btn.disabled = true;
  });
}

function registerApplyWeaponInjectionHandler(root) {
  const btn = root.querySelector('.pf2e-afflictioner-inject-weapon-poison');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const targetTokenId = btn.dataset.targetTokenId;
    const actorId = btn.dataset.actorId;
    const weaponId = btn.dataset.weaponId;
    // Delivered by a Strike: enables Deadly Poison Weapon, Pinpoint Poisoner, Greater Field Discovery
    const afflictionData = { ...JSON.parse(decodeURIComponent(btn.dataset.afflictionData)), deliveredByStrike: true };

    const target = canvas.tokens.get(targetTokenId);
    if (!target) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.TARGET_NOT_FOUND'));
      return;
    }

    if ((actorId || btn.dataset.actorUuid || btn.dataset.tokenId) && weaponId) {
      const storageTarget = await resolveWeaponStorageTargetFromButton(btn);
      if (storageTarget) {
        const { removeInjection } = await import('../stores/WeaponCoatingStore.js');
        await removeInjection(storageTarget, weaponId);
        const { AfflictionManager } = await import('../managers/AfflictionManager.js');
        if (AfflictionManager.currentInstance) AfflictionManager.currentInstance.render({ force: true });
      }
    }

    const { AfflictionService } = await import('../services/AfflictionService.js');
    await AfflictionService.promptInitialSave(target, afflictionData);

    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.SAVE_PROMPTED')}`;
  });
}

async function injectCoatWeaponButton(message, root) {
  const speakerActor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
  if (!game.user.isGM && !speakerActor?.isOwner) return;

  // Prevent double-injection on re-renders
  if (root.dataset.coatWeaponInjected === 'true') return;

  const itemUuid = getSystemFlags(message)?.origin?.uuid;
  if (!itemUuid) return;

  let item;
  try {
    item = await fromUuid(itemUuid);
  } catch {
    return;
  }
  if (!item) return;

  const traits = item.system?.traits?.value || [];
  const isInjuryPoison = traits.includes('injury');
  const isEnvenom = VishkanyaService.isEnvenomItem(item);
  const isFieldVial = item.system?.slug === 'versatile-vial' && traits.includes('poison');

  if (!isInjuryPoison && !isEnvenom && !isFieldVial) return;

  const speakerActorId = message.speaker?.actor;
  const speakerTokenId = message.speaker?.token;

  const footer = root.querySelector('.card-footer, .chat-card footer, .item-card footer');
  const container = footer || root.querySelector('.chat-card, .item-card') || root;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf2e-afflictioner-coat-weapon-btn';
  btn.innerHTML = `<i class="fas fa-flask"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.COAT_WEAPON_BTN')}`;

  const injectBtn = isInjuryPoison && document.createElement('button');
  if (injectBtn) {
    injectBtn.type = 'button';
    injectBtn.className = 'pf2e-afflictioner-load-injection-btn';
    injectBtn.dataset.itemUuid = itemUuid;
    injectBtn.innerHTML = `<i class="fas fa-syringe"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.LOAD_INJECTION_BTN')}`;
    injectBtn.addEventListener('click', async () => {
      const targetTokenIds = [...game.user.targets].map(t => t.id);
      const { WeaponCoatingService } = await import('../services/WeaponCoatingService.js');
      const loaded = await WeaponCoatingService.openInjectionLoadDialog(itemUuid, speakerActorId, speakerTokenId, targetTokenIds);
      if (loaded) {
        injectBtn.disabled = true;
        injectBtn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.LOAD_INJECTION_DONE')}`;
      }
    });
  }

  if (isEnvenom) {
    const actor = speakerActorId ? game.actors.get(speakerActorId) : null;
    if (!actor) return;

    const afflictionData = VishkanyaService.buildVenomAfflictionData(actor);
    btn.dataset.envenomData = encodeURIComponent(JSON.stringify(afflictionData));

    btn.addEventListener('click', async () => {
      const targetTokenIds = [...game.user.targets].map(t => t.id);
      const hasDebilitatingVenom = VishkanyaService.hasDebilitatingVenom(actor);
      const hasStrongerDebilitatingVenom = VishkanyaService.hasStrongerDebilitatingVenom(actor);
      const data = JSON.parse(decodeURIComponent(btn.dataset.envenomData));
      const { WeaponCoatingService } = await import('../services/WeaponCoatingService.js');
      const coated = await WeaponCoatingService.openCoatDialogWithData(data, speakerActorId, speakerTokenId, targetTokenIds, { hasDebilitatingVenom, hasStrongerDebilitatingVenom });
      if (coated) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.COAT_WEAPON_DONE')}`;
      }
    });
  } else if (isFieldVial) {
    btn.addEventListener('click', async () => {
      const targetTokenIds = [...game.user.targets].map(t => t.id);
      const { WeaponCoatingService } = await import('../services/WeaponCoatingService.js');
      const coated = await WeaponCoatingService.openCoatDialogForFieldVial(item, speakerActorId, speakerTokenId, targetTokenIds);
      if (coated) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.COAT_WEAPON_DONE')}`;
      }
    });
  } else {
    btn.dataset.itemUuid = itemUuid;

    btn.addEventListener('click', async () => {
      const targetTokenIds = [...game.user.targets].map(t => t.id);
      const { WeaponCoatingService } = await import('../services/WeaponCoatingService.js');
      const coated = await WeaponCoatingService.openCoatDialog(itemUuid, speakerActorId, speakerTokenId, targetTokenIds);
      if (coated) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.COAT_WEAPON_DONE')}`;
      }
    });
  }

  root.dataset.coatWeaponInjected = 'true';
  container.appendChild(btn);
  if (injectBtn) container.appendChild(injectBtn);
}

async function injectItemCardAfflictionButton(message, root) {
  if (!game.user.isGM) return;
  if (root.dataset.itemAfflictionInjected === 'true') return;

  // Only item card messages
  if (!root.querySelector('.pf2e.item-card, .pf2e.chat-card.item-card')) return;

  const flags = getSystemFlags(message);
  const originUuid = flags?.origin?.uuid;
  if (!originUuid) return;

  let item;
  try {
    item = await fromUuid(originUuid);
  } catch {
    return;
  }
  if (!item) return;

  const { AfflictionItemResolver } = await import('../services/AfflictionItemResolver.js');
  const { applyMessageAfflictionContext, shouldSkipPromptAffliction } = await import('../utils.js');
  const afflictionData = await AfflictionItemResolver.resolveFromItem(item);
  if (!afflictionData || shouldSkipPromptAffliction(afflictionData)) return;
  afflictionData.originActorUuid = item.parent?.uuid || flags.origin?.actor || null;
  afflictionData.originActorId = item.parent?.id || message.speaker?.actor || null;
  AfflictionService.applyOriginActorMetadata(afflictionData, item.parent);
  applyMessageAfflictionContext(afflictionData, message);

  root.dataset.itemAfflictionInjected = 'true';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf2e-afflictioner-apply-item-affliction';
  btn.innerHTML = `<i class="fas fa-biohazard"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.CHAT.APPLY_AFFLICTION_BTN')}`;
  btn.dataset.afflictionData = encodeURIComponent(JSON.stringify(afflictionData));

  btn.addEventListener('click', async () => {
    const targets = [...game.user.targets];
    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize('PF2E_AFFLICTIONER.CHAT.APPLY_AFFLICTION_NO_TARGET'));
      return;
    }
    const data = JSON.parse(decodeURIComponent(btn.dataset.afflictionData));
    for (const target of targets) {
      await AfflictionService.promptInitialSave(target, data);
    }
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.WEAPON_COATING.SAVE_PROMPTED')}`;
  });

  const footer = root.querySelector('.card-footer, .chat-card footer, .item-card footer');
  const container = footer || root.querySelector('.chat-card, .item-card') || root;
  container.appendChild(btn);
}

function registerMaxDurationRemovalHandler(root) {
  const removeBtn = root.querySelector('.pf2e-afflictioner-remove-expired-btn');
  if (!removeBtn) return;

  removeBtn.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const tokenId = button.dataset.tokenId;
    const actorId = button.dataset.actorId;
    const afflictionId = button.dataset.afflictionId;

    const AfflictionStore = await import('../stores/AfflictionStore.js');
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = AfflictionStore.findTokenForActor(game.actors.get(actorId));
    }
    if (!token) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.TOKEN_NOT_FOUND'));
      return;
    }
    const affliction = AfflictionStore.getAffliction(token, afflictionId);
    if (!affliction) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.AFFLICTION_NOT_FOUND'));
      return;
    }

    const resolved = affliction.currentStageResolvedDuration;
    if (resolved?.value > 0 && affliction.appliedEffectUuid) {
      try {
        const effect = await fromUuid(affliction.appliedEffectUuid);
        if (effect) {
          const unitMap = { round: 'rounds', minute: 'minutes', hour: 'hours', day: 'days', week: 'weeks' };
          await effect.update({
            'system.duration': {
              value: resolved.value,
              unit: unitMap[resolved.unit] || resolved.unit,
              expiry: resolved.unit === 'round' ? 'turn-start' : null,
              sustained: false
            }
          });
        }
      } catch (e) {
        console.error('PF2e Afflictioner | Failed to update effect duration on max duration expiry:', e);
      }
    }

    await AfflictionStore.removeAffliction(token, afflictionId);

    const { VisualService } = await import('../services/VisualService.js');
    await VisualService.removeAfflictionIndicator(token);

    if (resolved?.value > 0) {
      ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.MANAGER.REMOVED_FROM_TRACKING_EXPIRES', {
        afflictionName: affliction.name,
        value: resolved.value,
        unit: resolved.unit
      }));
    } else {
      ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.MANAGER.REMOVED_FROM_TRACKING_PERSISTS', {
        afflictionName: affliction.name,
        tokenName: token.name
      }));
    }

    button.disabled = true;
    button.textContent = `✓ ${game.i18n.localize('PF2E_AFFLICTIONER.BUTTONS.AFFLICTION_REMOVED')}`;
  });
}

function registerDeathConfirmationHandler(root) {
  const killBtn = root.querySelector('.pf2e-afflictioner-confirm-kill-btn');
  if (!killBtn) return;

  killBtn.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const tokenId = button.dataset.tokenId;
    const actorId = button.dataset.actorId;
    const afflictionId = button.dataset.afflictionId;

    const AfflictionStore = await import('../stores/AfflictionStore.js');
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = AfflictionStore.findTokenForActor(game.actors.get(actorId));
    }
    if (!token) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.TOKEN_NOT_FOUND'));
      return;
    }

    const actor = token.actor;
    if (!actor) {
      ui.notifications.error(game.i18n.localize('PF2E_AFFLICTIONER.ERRORS.ACTOR_NOT_FOUND'));
      return;
    }
    const affliction = AfflictionStore.getAffliction(token, afflictionId);

    await actor.update({ 'system.attributes.hp.value': 0 });
    await actor.increaseCondition('dying');
    const dying = actor.getCondition('dying');
    if (dying) {
      const dyingMax = actor.system.attributes?.dying?.max ?? 4;
      await dying.update({ 'system.value.value': dyingMax });
    }

    ui.notifications.info(game.i18n.format('PF2E_AFFLICTIONER.NOTIFICATIONS.KILLED', {
      tokenName: token.name,
      afflictionName: affliction?.name ?? 'Unknown'
    }));

    button.disabled = true;
    button.innerHTML = `<i class="fas fa-skull"></i> ${game.i18n.localize('PF2E_AFFLICTIONER.BUTTONS.DEATH_CONFIRMED')}`;
  });
}
