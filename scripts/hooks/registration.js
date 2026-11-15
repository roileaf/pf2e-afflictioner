import { onDamageRoll } from './damage.js';
import { onCreateChatMessage, onPreCreateChatMessage, onUpdateChatMessage } from './chat.js';
import { onCombatPreUpdate, onCombatUpdate, onPf2eStartTurn, onPf2eEndTurn, onDeleteCombat } from './combat.js';
import { onDeleteItem } from './items.js';
import { onWorldTimeUpdate } from './worldTime.js';
import { onRenderTokenHUD } from './tokenHUD.js';
import { onRenderChatMessage } from '../handlers/chatButtons.js';
import { onPreUpdateItem } from './conditions.js';
import { onGetSceneControlButtons, onRenderSceneControls, onUpdateToken, onControlToken } from './tokenTools.js';

export function registerAfflictionHooks() {
  Hooks.on('pf2e.rollDamage', onDamageRoll);
  Hooks.on('pf2e.startTurn', onPf2eStartTurn);
  Hooks.on('pf2e.endTurn', onPf2eEndTurn);
  Hooks.on('preUpdateCombat', onCombatPreUpdate);
  Hooks.on('createChatMessage', onCreateChatMessage);
  Hooks.on('preCreateChatMessage', onPreCreateChatMessage);
  Hooks.on('updateChatMessage', onUpdateChatMessage);
  Hooks.on('updateCombat', onCombatUpdate);
  Hooks.on('deleteCombat', onDeleteCombat);
  Hooks.on('deleteItem', onDeleteItem);
  Hooks.on('updateWorldTime', onWorldTimeUpdate);
  Hooks.on('renderTokenHUD', onRenderTokenHUD);
  Hooks.on('renderChatMessageHTML', onRenderChatMessage);
  Hooks.on('preUpdateItem', onPreUpdateItem);
  Hooks.on('getSceneControlButtons', onGetSceneControlButtons);
  Hooks.on('renderSceneControls', onRenderSceneControls);
  Hooks.on('updateToken', onUpdateToken);
  Hooks.on('controlToken', onControlToken);

  console.log('PF2e Afflictioner | Hooks registered');
}
