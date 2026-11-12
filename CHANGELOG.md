# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.7.6] - 2026-11-12

### Added

- **`openEditedAfflictions()` API call**: GMs can open the Edited Afflictions window from a macro with `game.modules.get('pf2e-afflictioner').api.openEditedAfflictions()` instead of going through the module settings.

### Fixed

- **Edited afflictions missing from Add Affliction**: The Add Affliction dialog now lists every edited affliction, including ones made by dragging a poison, disease or curse item into Manage Edited Afflictions. Before, it only showed custom afflictions that had no item behind them. The section is now called "Edited & Custom Afflictions".

## [3.7.5] - 2026-11-12

### Fixed

- **False curse detection on items that mention curses generically**: Items such as the Paradigm Cube no longer show an "Apply to Target / Selected Token" button. Text like "saving throws against fear, curse, or visual effects" was being read as a reference to a named curse. Curse references now have to fit inside a single phrase, and wording such as "curse effects" is ignored. Real references like "save against the forbidden cravings curse" still work.

## [3.7.4] - 2026-11-08

### Fixed

- **Spell stage damage with dynamic formulas** ([#33](https://github.com/roileaf/pf2e-afflictioner/issues/33)): Afflictions created from spells whose stages scale with rank, such as Curse of Death, now get a working damage button. Formulas like `(max(4,@item.rank-1))d6` resolve against the spell's rank, so Curse of Death at rank 5 rolls 4d6, 8d6 and 12d6. A formula that can't be resolved is passed to PF2e whole instead of being cut apart.

## [3.7.3] - 2026-11-06

### Added

- **Injection Reservoir**: With an Injection Reservoir in inventory, the Coatings tab offers an install button on melee weapons that deal piercing damage. The weapon can then be loaded with an injury poison and prompts to inject it after a hit, just like an injection weapon. Its multiple attack penalty is 1 worse while the reservoir is installed. The reservoir can be removed again when nothing is loaded.

## [3.7.2] - 2026-10-23

### Fixed

- **Smoother token movement and selection on big scenes**: Loading a scene no longer tries to rewrite the affliction marker on every token. The GM affliction monitor no longer rescans every token and actor each time a token moves, and selecting many tokens at once now refreshes the monitor and the scene controls once instead of once per token.

## [3.7.1] - 2026-10-19

### Added

- **Toxicologist infused poisons**: Infused poisons from an alchemist with the Toxicologist research field now affect poison-immune creatures and deal acid damage instead. Against other creatures, poison damage links offer poison or acid for the GM to choose. This replaces the old weapon-coating acid choice, which applied to any Toxicologist poison, not just infused ones.
- **Fast Recovery variants**: Strong-Blooded Dwarf, Venom-Resistant Vishkanya, Wash Out, Inoculation Subroutine, and Inured to Alchemy now reduce stages like Fast Recovery for the affliction types they cover. Heritages are detected too. The chat note and button tooltip name the feature that applied.
- **Robust Recovery**: Successful Treat Poison or Treat Disease grants +4 instead of +2 when the healer or the patient has the feat, and the patient's next successful save becomes a critical success.
- **Exposure feats**: Potent Poisoner (+4 DC, up to class DC), Deadly Poison Weapon (+2 DC for injury poisons delivered by a Strike), Tenacious Toxins (longer maximum duration), Pinpoint Poisoner (–2 initial save vs off-guard targets), and the Stronggut Shisk heritage (50% longer onset and stages).
- **Save notes**: Greater Field Discovery and Chemical Contagion post a button to spray the poison onto an adjacent creature after a failed initial save. Combustible Poison posts a persistent fire link. Poison Drinker posts a healing link on a critical success.
- **Feat actions in the manager**: A star button offers Coral Detoxification (+2 save), Resilient Physiology (save where the stage can't increase), Virulent Strike (save where the stage can't decrease, –4 on a critical hit), and Purge System (reduce stage by 1 or 2).
- **Stronger Debilitating Venom**: The Debilitating Venom picker adds Bungling, Devitalizing, Nauseating, and Weakening.

### Fixed

- **PF2e save adjustments**: Affliction saves now use the result PF2e computed. Rule elements that change the degree of success (Affliction Resistance, Divine Health, Lab Rat, Juggernaut, and similar) now apply. Falls back to the total when the roll used a different DC.
- **Treat Poison/Disease roll options**: The module's Medicine roll is tagged as Treat Poison or Treat Disease, so PF2e bonuses tied to those actions apply.
- **Live test harness**: Login works with Foundry 14.369's renamed join form. The addiction case checks conditions with `hasCondition` for PF2e 8.6.1. Slow dialog and ownership waits get longer timeouts, and a missing test icon was replaced. Added 8 live cases for the integrations above.

## [3.7.0] - 2026-10-09

### Added

- **Optional legacy addiction rules**: Added a GM world setting, disabled by default, for per-drug addiction tracking. Each drug retains its highest stage after recovery; failed drug-use saves advance from that maximum, while weekly recovery saves can improve the current stage without worsening it.
- **Drug item picker**: Add addictions by dragging a drug item or selecting one from actor and compendium lists. The item's name, icon, and Fortitude DC are read automatically; missing DCs prompt for the DC only. Manual entry remains available for custom drugs.
- **Addiction symptoms and timers**: Drug use suppresses symptoms for one day. World time drives onset, suppression expiry, and weekly saves, including off-scene actors. Symptoms stay bound to the addiction until suppression or recovery. Turning the setting off pauses automation while keeping records and effects available for GM removal. Drug inventory and separate poison effects are handled independently.

## [3.6.1] - 2026-10-06

### Added

- **Optional poison house rule**: Added a GM world setting, disabled by default, that applies a new poison on a successful initial save with a maximum stage of 1. Critical success avoids the poison. Later failed recovery saves cannot exceed stage 1; failed re-exposure removes the cap and advances normally. Onset and recovery still apply.

### Fixed

- **Poison re-exposure without a token**: Failed re-exposure now advances the existing poison on off-scene actors instead of creating a separate affliction.

## [3.6.0] - 2026-09-16

### Added

- **Automated live Foundry validation**: Added isolated GM and player workflows covering affliction parsing, lifecycle, effects, recovery, weapon poison handling, permissions, regions, settings, and optional integrations in the shared disposable QA world.
- **Feature coverage guard**: Every focused unit feature suite must map to automated live evidence, preventing new features from silently bypassing Foundry runtime validation.

### Fixed

- **Explicit condition durations**: Conditions with their own duration now use expiring PF2e Effect wrappers that grant the condition, so Foundry preserves and enforces the configured duration instead of normalizing it to unlimited.
- **Foundry 14 token indicators**: Afflicted-token tinting now handles Foundry's Color objects and default-white stored tint correctly, while cleanup removes only Afflictioner's own tint.

## [3.5.3] - 2026-09-12

### Added

- **Elite/Weak damage setting**: Added a GM world setting, enabled by default, to apply source creature adjustments to affliction damage. Disable it to use base damage. Newly generated damage cards and persistent damage use the setting; existing chat cards retain their formulas.

### Fixed

- **Elite/Weak affliction damage**: Affliction damage now includes +2 from an Elite source or -2 from a Weak source across stage and onset cards, stage-description links, direct rolls, and persistent damage. Recipient damage bonuses remain excluded, and Pernicious Poison retains its fixed damage.

## [3.5.2] - 2026-09-09

### Fixed

- **Dice-valued stage durations**: Save timers, the monitor, and stage-effect expiration now use the rolled duration instead of treating dice formulas as zero seconds. Prevents a save prompt on every world-time tick for on-scene and off-scene actors. Stage changes clear old timing, and chat-detected afflictions and counteract reductions correctly store fresh rolls. Fixes #32.
- **Darkvision-dependent stage effects**: Affliction stages that conceal or hide creatures seen only through darkvision now apply relative visibility through PF2e Visioner when available, rather than placing a blanket condition on the afflicted actor. Stage cleanup restores tracked visibility.
- **Stage-change chat cards**: Long stage descriptions and headings wrap within the card while condition links and roll buttons stay together.

## [3.5.1] - 2026-09-07

### Fixed

- **Affliction damage bonuses**: Damage suffered from afflictions no longer gains Courageous Anthem or other damage bonuses from the afflicted actor. Applies to stage damage, interval damage, stage-description damage links, and Pernicious Poison while preserving unhealable-damage tracking.

## [3.5.0] - 2026-08-20

### Added

- **Affliction recovery restrictions**: Afflictioner now detects rules such as Bog Rot's minimum stage and unhealable damage, keeps the affliction at its required stage until successful special treatment, and tracks exact tagged damage as PF2e-native unrecoverable HP without blocking healing of unrelated wounds.
- **Recovery treatment and healing feedback**: Successful counteract treatment clears the recovery restriction without automatically curing the disease, while healing-result chat cards identify each affliction and the HP that remains unrecoverable.

## [3.4.2] - 2026-07-18

### Fixed

- **Variable stage duration modifiers**: Stage durations such as `1d4+1 minutes` now roll the complete formula and schedule the next save from that result instead of being treated as a fixed 1-minute duration.

## [3.4.1] - 2026-06-30

### Fixed

- **Player-side token permission errors**: Visual indicator refresh no longer attempts to write token flags or tint on tokens the player cannot modify. Document writes are now guarded so only a GM or token owner persists indicator state, preventing the permission errors that appeared on `canvasReady` when players were moved to a new scene.

## [3.4.0] - 2026-06-23

### Added

- **Custom affliction icons**: Saved custom afflictions can now store a themed icon path, choose it through the Affliction Editor file picker, show it in the saved affliction list, and apply it to created or updated affliction effects.

## [3.3.9] - 2026-06-23

### Fixed

- **Affliction manager malformed stage data**: Opening or refreshing the Affliction Manager no longer crashes when saved affliction flag data has an invalid current stage or missing stage list. The row now shows fallback stage information, disables invalid stage controls, and remains removable.

## [3.3.8] - 2026-06-03

### Fixed

- **Explicit condition durations**: Stage conditions with their own written duration, such as "clumsy 2 for 1 minute", now become timed standalone conditions instead of clearing immediately when the affliction stage changes.

## [3.3.7] - 2026-06-03

### Fixed

- **Affliction condition cleanup**: Conditions with built-in PF2e recovery or removal rules now remain after an affliction stage or affliction ends, while stage-bound conditions continue to clear with the affliction effect.
- **Persistent damage cleanup**: Persistent damage applied by affliction stages now follows PF2e recovery instead of being removed with the affliction, while reapplying the same affliction damage type replaces the older matching condition to prevent duplicates.

## [3.3.6] - 2026-06-02

### Fixed

- **Manual stage auto-effects**: Stages that require manual handling now still apply configured automatic effects such as multiple conditions, preventing mixed stages like Enfeebled plus Stupefied from dropping the later condition.

## [3.3.5] - 2026-06-01

### Fixed

- **Incapacitation source level**: Incapacitation afflictions now compare non-spell effects against the item, creature, or hazard generating the effect, while spell effects use twice the spell rank. This prevents high-level creature afflictions from granting lower-level targets an incorrect degree-of-success upgrade.

## [3.3.4] - 2026-06-01

### Fixed

- **Affliction editor stage rules**: Stage rule elements added through the Affliction Editor are now applied to active affliction effects, with rule labels shortened to the affliction name and stage.
- **Multiple stage conditions**: Stages edited through the Affliction Editor now preserve multiple conditions, allowing combinations such as Enfeebled and Stupefied on the same stage to apply together.

## [3.3.3] - 2026-05-24

### Fixed

- **Combat save prompt timing**: Scheduled affliction save prompts now fire while the current combatant's turn is ending, before Foundry advances to the next combatant, and cleared save prompts no longer retrigger on the following turn.
- **Attack affliction DCs**: Afflictions triggered from attack roll chat cards no longer replace the affliction save DC with the target's AC from PF2e attack-roll flags.

## [3.3.2] - 2026-05-23

### Fixed

- **Chat card sizing**: Afflictioner chat cards now reset Foundry chat-log list padding and injected action buttons use border-box sizing, preventing poison prompts from narrowing or padding out the chat log.

## [3.3.1] - 2026-05-23

### Fixed

- **NPC coating and injection prompts**: Coated or injection-loaded NPC melee Strikes now resolve PF2e melee attack items, linked inventory weapons, and unlinked token document flags before posting GM poison prompts.
- **Weapon coating list duplicates**: NPC melee attack entries that duplicate inventory weapons are now hidden from coating controls, preventing repeated Hook Sword/Longsword rows.
- **Poison item privacy**: Using an injury poison item now keeps the item card whispered to GMs while still offering coating and injection controls.

## [3.3.0] - 2026-05-22

### Added

- **Injection weapon support**: Weapons with the `injection` trait can now be loaded with injury poisons separately from normal weapon coatings. Successful hits post a GM injection prompt that consumes the loaded contents and opens the normal Afflictioner initial save flow.

### Fixed

- **Injection trait detection**: Weapon trait collections from PF2e are now normalized before checking for `injection`, preventing Affliction Manager render crashes when traits are stored as a Set.
- **Weapon control layout**: Coating and injection select/button controls now stay inline as paired controls and only wrap together when the manager is too narrow.

## [3.2.7] - 2026-05-19

### Fixed

- **Manual stage controls**: Progress Stage and Regress Stage now change afflictions by exactly one stage even when save modifiers such as Incapacitation would alter a real save result.
- **Stage condition lookup**: Stage conditions now resolve through PF2e's condition manager before falling back to compendium lookup, improving Foundry v14 condition application reliability.

## [3.2.6] - 2026-05-10

### Fixed

- **Save dialog shift-click toggle**: Save buttons on Afflictioner chat cards now explicitly apply PF2e's shift-click dialog toggle, restoring both skip-dialog and show-dialog behavior based on the user's default setting.

## [3.2.5] - 2026-05-10

### Fixed

- **Hero point reroll confirmation**: Save rerolls now receive Afflictioner confirmation flags as the new PF2e chat message is created, so the Apply Consequences button can reappear reliably after hero point rerolls.

## [3.2.4] - 2026-05-10

### Fixed

- **Affliction save roll traits**: Saves rolled from Afflictioner chat cards now include PF2e item trait roll options such as `item:trait:poison`, allowing antidotes and similar conditional bonuses to activate correctly.

## [3.2.3] - 2026-05-09

### Fixed

- **Mysterious GM save roll visibility**: GM-rolled mysterious initial saves now use PF2e's blind chat message mode instead of the ignored legacy roll mode option. NPC stage saves and referenced NPC saves use the same blind message mode path.

## [3.2.2] - 2026-05-08

### Fixed

- **NPC curse action support**: NPC abilities that directly have the `curse` trait or reference a curse in their action text now resolve to curse afflictions from the source actor, world items, or compendiums instead of being skipped or rejected by poison/disease-only checks.
- **Legacy curse parsing**: Plain-text curse entries such as Curse of Death and Forbidden Cravings now parse semicolon-separated stages, void damage, death stages, plain saving throw labels, actor spell DCs, and repeated stage references like "as stage 2".
- **Spell affliction DC and damage extraction**: Spell-based afflictions now prefer computed spell or message DCs over placeholder item DCs and parse nested PF2e `@Damage[...]` formulas with options.

## [3.2.1] - 2026-05-04

### Added

- **Double Poison feat support**: Actors with the Double Poison feat can apply a second injury poison to an already-coated weapon. The module merges the poisons into a single double poison using the lower DC and stage count, combined stage effects, longer stage intervals, and virulent only when both poisons are virulent. If the poisons use different saving throws, the GM is prompted to choose the save used by the double poison.

## [3.2.0] - 2026-05-04

### Added

- **Source actor immunity bypass rules**: Added a GM-only Overrides tab in the Affliction Manager where a source actor can be configured to bypass poison, disease, or curse immunity for afflictions they apply. This supports cases like Toxicologist poisons affecting poison-immune creatures without changing the target's global immunities.
- **Named affliction bypass exceptions**: Added draggable named affliction tags to the override rule editor. Dropped affliction items resolve to clickable tags that open item details and can be removed before saving.
- **GM bypass notice**: Added a GM-only chat notice when a source override actually bypasses a target immunity.

### Changed

- **Override rule UI**: Bypass categories are now limited to affliction immunity categories (`poison`, `disease`, and `curse`) and use removable tags with autocomplete instead of raw text fields.

## [3.1.2] - 2026-05-01

### Fixed

- **Incapacitation affliction saves**: Initial and stage saves against incapacitation afflictions now upgrade the target's degree of success when the target's level is higher than the affliction's level. Confirmation buttons, rerolled confirmation messages, and immediate no-confirmation handling now show GM-only chat notes for supported save modifiers such as Incapacitation, Blowgun Poisoner, and Fast Recovery.

## [3.1.1] - 2026-04-30

### Added

- **Immunities support**: Added support for affliction immunities. When an affliction is applied, the module now checks if the target has any immunities that match the affliction's traits (e.g. poison immunity for a poison affliction) and prevents application if a relevant immunity is found. Immunity types are determined from the affliction item traits and matched against actor immunities.

## [3.1.0] - 2026-04-30

### Added

- **Affliction region behavior**: Added a Foundry Region Behavior that applies configured afflictions to tokens when they enter a region.
- **Region affliction item editor**: Added a compact region configuration UI for managing affliction item UUIDs with add/remove rows, resolved item names, UUID tooltips, and per-affliction "Skip active" controls.

## [3.0.1] - 2026-06-01

### Changed

- **Affliction monitor interaction**: The floating monitor no longer opens a panel on hover. Click opens a pinned interactive popover, and clicking any token/affliction row opens the manager filtered to that token or actor.

### Fixed

- **Token indicator refresh performance**: Affliction indicators no longer refresh from Foundry's per-frame `refreshToken` hook during canvas movement. Indicators now update from actor/item state changes, token control, and canvas readiness, avoiding repeated store lookups and token flag writes while panning or zooming scenes with many tokens.

## [3.0.0] - 2026-04-12

### Added

- **Foundry V14 support**: Updated module compatibility and verified support for Foundry VTT v14.
- **Reusable saved custom afflictions**: Custom/manual afflictions saved through the editor now appear in the Add Affliction dialog under a dedicated "Saved Custom Afflictions" section, allowing them to be reapplied without recreating them from scratch.
- **Apply saved custom afflictions from manager**: The Edited Afflictions manager now includes a direct "Apply to Controlled Token" action for saved definitions.
- **Optional player access to weapon coatings**: New world setting allows players to open a limited Affliction Manager view for tokens they own, exposing the Weapon Coatings tab while keeping affliction management GM-only.

### Changed

- **Weapon coating permission flow**: Coating apply/remove actions now route through the same ownership-aware permission path, with socket-based GM fallback when needed.
- **Player-facing manager entry points**: Token HUD and Token Tools access can now expose the limited weapon-coating view to owners when the new setting is enabled.

## [2.0.4] - 2026-04-07

### Added

- **Apply Affliction button on item card chat messages**: When an item with poison, disease, or curse traits (including effect-type items like Lamashtu's Bloom where traits are embedded in the description HTML) is posted to chat, a styled "Apply Affliction to Target" button is injected for the GM. Clicking it opens the initial save prompt for all currently targeted tokens.
- **Target button on stage-increase messages with damage**: Stage change chat messages now include a "Target [name]" button whenever the new stage has damage (parsed or in raw effects text), matching the existing behaviour of timed stage increase messages.

### Fixed

- **Effect items with traits in description HTML not recognised**: Items of type `effect` (e.g. Lamashtu's Bloom) store poison/disease/curse traits in the card HTML rather than `system.traits.value`. `AfflictionParser.getAfflictionType()` now falls back to parsing the `<section class="traits">` block, and all drop/listing checks use this helper.

## [2.0.3] - 2026-04-06

### Added

- **Hazard affliction button on attack messages**: When a hazard (e.g. Poisoned Dart Trap) lands a hit with a weapon that has an associated poison/disease/curse item, an "Apply Affliction" button is now injected directly into the attack roll chat message (alongside Damage/Critical), rather than creating a separate message. Clicking the button prompts the initial save for the targeted token.

## [2.0.2] - 2026-04-03

### Changed

- **Removed flashing animations**: Replaced pulsing/flashing animations on the floating affliction monitor indicator and chat message icons (save request, treatment request) with static styles for a less distracting UI.

## [2.0.1] - 2026-03-31

### Fixed

- **Non-ASCII manual-handling keywords ignored**: `detectManualHandling` used `\b` word boundaries unconditionally, which silently failed for Cyrillic (e.g. "или", "тайный") and CJK (e.g. "秘密", "或") keywords since JS `\b` only matches ASCII word characters. Now uses space/punctuation boundaries for Cyrillic and plain substring matching for CJK locales.
- **Non-ASCII condition names not matched in plain text**: `extractConditions` plain-text path used `\b` for all condition display names, causing Russian conditions like "тошнота" to never match. Now detects non-ASCII display names and applies appropriate boundary strategy per locale.
- **"Each time you are exposed" multiple-exposure pattern not matching**: The regex `you(?:'re|are)` matched `you're` but not `you are` (with space). Fixed to `you(?:'re|\s+are)` in EN and RU locale files.

## [2.0.0] - 2026-03-25

### Added

- **Referenced affliction detection**: When an affliction stage references another affliction, curse, or effect by name (e.g., "the target is exposed to the curse of flawed history"), the module now automatically detects the reference, finds the item on the attacking creature, and prompts a separate save for the target. Supports "exposed to", "contracts", and "afflicted with" patterns in EN, RU, and ZH.
- **Effect-only item support**: Curse/disease/poison items without stages (just an "Effect" section) can now be parsed and applied as PF2e effects with rule elements. Penalties like "–2 status penalty to Recall Knowledge checks" are automatically converted to FlatModifier rules.
- **Penalty parsing**: `extractBonuses` now handles status/circumstance/item penalty patterns (en-dash, em-dash, hyphen) in addition to bonuses. Added Recall Knowledge support to selector and predicate parsing.
- **Origin actor tracking**: Affliction data now stores `originActorUuid` so referenced items can be looked up on the attacking creature when stage effects are applied.

### Fixed

- **Stage condition parsing false positive**: `detectManualHandling` used naive substring matching (`includes('or')`), causing words like "history" to falsely trigger manual handling and skip condition application. Now uses word-boundary regex (`\bor\b`) with HTML/enrichment stripping.

## [1.8.1] - 2026-03-19

### Fixed

- **Apply Affliction target override**: The "Apply Affliction to Target" button on attack chat cards now respects the currently targeted token at click time. If exactly one token is targeted when the button is clicked, that token receives the affliction instead of the original attack target — allowing GMs to redirect afflictions without manually dragging via the HUD.

## [1.8.0] - 2026-03-18

### Added

- **Starfinder 2e (SF2e) system support**: The module now works with both PF2e and SF2e systems. Since both systems share the same codebase, all features (affliction tracking, saves, counteract, treatment) work identically. Message flag namespaces are detected automatically at runtime.

## [1.7.0] - 2026-03-17

### Added

- **Actor-based affliction storage for linked tokens**: Afflictions on linked tokens (PCs, named NPCs) are now stored on the actor document instead of the token document. This means afflictions persist across scene changes — no more navigating back to the original scene to manage them. Unlinked tokens (mooks, summons) continue to use per-token storage.
- **Off-scene affliction management**: The Affliction Manager now shows afflictions for actors that have no token on the current scene, with an "(off-scene)" label. All management operations (edit, remove, clear all) work for off-scene actors.
- **Off-scene time progression**: World time advancement now correctly processes afflictions for off-scene actors (onset countdown, max duration expiry, save due notifications).
- **Affliction Monitor off-scene support**: The floating monitor indicator now includes off-scene actor afflictions in its count and tooltip.

### Changed

- **Automatic migration**: On first load after update, existing afflictions on linked tokens are automatically migrated from token flags to actor flags. This is a one-time operation.
- **Full off-scene operation support**: All Affliction Manager actions (roll save, progress/regress stage, roll damage, treat, counteract, edit, remove) now work for off-scene actors. Saves post to chat with clickable roll buttons, and results are properly processed through the full save chain.

### Fixed

- **Compatibility with Image Hover module**: The floating monitor indicator no longer registers persistent global `mousemove`/`mouseup` listeners on `document`. These are now only attached during active drag operations, preventing interference with other modules' hover detection.
- **Off-scene max duration tracking**: Fixed incorrect field usage (`durationElapsed` vs `maxDurationElapsed`) that could cause premature affliction removal for off-scene actors.
- **Counteract confirmation button missing for off-scene actors**: The counteract roll message now stores `actorId` in its flags so the confirmation button renders correctly when the token is not on the current scene.

## [1.6.6] - 2026-03-17

### Fixed

- **Apply Affliction button missing for spell item activations**: Spell-cast messages (e.g. Spider Sting) that lack `casting.embeddedSpell` or `context` flags now correctly show the Apply Affliction button. Added a fallback that parses affliction data directly from the rendered message content and origin rollOptions when the item can't be resolved via `fromUuid`.
- **Save type not extracted from spell defense data**: `extractSaveType` now checks `item.system.defense.save.statistic` where PF2e spells store their save type, fixing incorrect Fortitude defaults for Will/Reflex spell saves.
- **Affliction name uses spell name instead of embedded affliction name**: Spells containing an embedded affliction (e.g. Spider Sting containing Spider Venom) now correctly display the affliction name by extracting it from the description pattern `<strong>Name</strong> (poison/disease/curse)`.

## [1.6.5] - 2026-03-14

### Fixed

- **Save type still defaulting to Fortitude**: The `@Check` enricher regex now handles PF2e's positional format (`@Check[will|dc:28]`) in addition to the keyed format (`@Check[type:will|dc:28]`). Also extract save type from roll note HTML when processing attack messages, matching how DC is already extracted.

## [1.6.4] - 2026-03-09

### Fixed

- **Save type always Fortitude**: Afflictions that require Will or Reflex saves now correctly roll the proper save type instead of always rolling Fortitude. The save type is extracted from the item's system data, `@Check` enrichers, or `data-pf2-check` attributes in descriptions. Chat messages and button labels also display the correct save type.

## [1.6.3] - 2026-03-08

### Fixed

- **Stage-less affliction button**: The "Apply Affliction to Target" button no longer appears for abilities that have poison/disease/curse traits but no actual affliction stages (e.g. Soul Eater's Mind-Numbing Touch).

## [1.6.2] - 2026-03-08

### Added

- **Sticky Poison feat**: Automated support for the Sticky Poison alchemist feat. On critical failure or wrong damage type (poison expended without a save), a DC 5 flat check is rolled to retain the poison. On a successful hit, a DC 17 flat check is rolled; on success, the weapon stays poisoned until the end of the attacker's next turn.

### Fixed

- **Field Vial damage type**: Field Vial bonus damage now uses a properly typed `@Damage` enricher link (e.g. `@Damage[1d6[poison]]`) instead of a plain untyped roll, matching how all other damage in the module is displayed.

## [1.6.1] - 2026-03-07

### Fixed

- **Russian parser**: Fixed stage, onset, and max duration parsing failing on Russian-translated items that use colons after labels (e.g. `Стадия 1:`, `Макс.продолжительность:`).
- **Russian death detection**: Fixed `\b` word boundaries not working with Cyrillic text in JavaScript, causing death-stage detection to silently fail for Russian keywords.
- **Russian AFFLICTION_SKIPPED message**: Improved wording to "В описании не указаны КС или Стадии, добавление не удалось".

### Changed

- **Locale architecture**: Moved label regex construction from the parser into individual locale files (`stageLabelRe`, `onsetLabelRe`, `maxDurationLabelRe`, `afterLabel`, `afterLabelOpt`), so each locale controls its own punctuation conventions.
- **English fallback for untranslated items**: When the current locale fails to parse stages from an item description, the parser automatically retries with the English locale. This allows untranslated items to work in non-EN game sessions without duplicating English patterns in every locale.

### Added

- **Parser unit tests**: 56 tests covering stage extraction, DC, onset, max duration, conditions, damage, duration parsing, death detection, stage references, and EN fallback across all three locales (EN, RU, ZH).

## [1.6.0] - 2026-03-06

### Added

- **Russian language support**: Added Russian (Thanks Alinarin) (`ru`) parser locale for automatic affliction parsing from item descriptions, including all condition names, damage types, duration units (with declension forms), structural headers, and pattern matching. Registered Russian in `module.json` languages.

## [1.5.0] - 2026-03-02

### Added

- **Onset Effects dropdowns**: Condition name, damage type, and weakness type in the Onset Effects section are now dropdowns matching the Stage Editor, with the full PF2e condition list, damage types, and weakness type groups.
- **Effect interval chat improvements**: Onset interval messages now include a conditions/weakness summary alongside the existing damage links. Stage interval messages now include a conditions/weakness summary and inline damage links; damage previously appeared as a separate second message.
- **Per-stage Effect Interval**: Each affliction stage can now have an independent Effect Interval — a recurring timer that re-applies full stage effects (conditions, damage, auto-effects) without triggering a saving throw. Separate from and independent of Save Duration. Example: a disease that deals damage every 6 hours but only allows a save every 48 hours.
- **Effect Interval editor UI**: Added Effect Interval toggle to the Stage Editor dialog, with value/unit inputs matching the existing Duration style. An info tooltip explains the feature on hover.
- **Effect Interval chat notification**: When an Effect Interval fires, a purple-bordered chat message is posted to the GM noting the affliction name, actor, current stage, and that no save is triggered.

### Fixed

- **Editor showing stale data on reopen**: Opening the editor a second time showed the original affliction data instead of any previously saved edits.

## [1.4.2] - 2026-03-01

### Fixed

- **Manual stage progression while awaiting initial save**: Manually increasing the stage of an affliction before the initial save was rolled left the affliction stuck in "awaiting initial roll" state, preventing timers from working and breaking subsequent rolls. The `needsInitialSave` flag is now properly cleared when a stage change occurs.

## [1.4.1] - 2026-02-25

### Added

- **Versatile Vial weapon coating (Field Vials)**: Versatile Vials now show a "Coat Weapon" button in chat. Applies the vial's damage as bonus damage on next hit, auto-expires at end of current turn per Field Vials rules. Consumes one vial dose on coating.

- **Debilitating Venom dialog restyle**: Replaced plain dialog buttons with styled card-based UI matching the coating duration picker — each option shows an icon, label, and description with distinct hover colors.

### Fixed

- **Debilitating Venom dialog not rendering**: Fixed dialog failing to render when `buttons: []` was passed to `DialogV2.wait`. Now passes a hidden cancel button (same pattern as coating duration picker).

## [1.4.0] - 2026-02-25

### Added

- **Pernicious Poison feat automation**: When an attacker with the Pernicious Poison feat coats a weapon with a leveled poison and the target succeeds (not critically succeeds) on their initial saving throw, flat poison damage equal to the poison's level is automatically prompted. A skull-crossbones indicator appears on the save confirmation button when this feat will trigger. Auto-detected from actor feats, consistent with Blowgun Poisoner behavior.

### Fixed

- **Weapon coating on targeted tokens**: Players can now coat weapons on tokens they don't own by targeting them. The actor update is routed to the GM via socketlib, fixing the "lacks permission to update Actor" error.

## [1.3.0] - 2026-02-24

### Added

- **Coating duration timer**: When coating a weapon, the GM is prompted to choose how long the coating lasts. Options include start of next turn, end of next turn, 1 minute, 10 minutes, 1 hour, unlimited, or a custom duration. Coatings auto-expire via combat turn hooks or world time progression. The duration is set per-coating at application time.

- **Coating visual effect on token**: Coated weapons now create a PF2e effect item on the actor, showing the poison icon on the token. The effect syncs bidirectionally — removing the coating deletes the effect, and deleting the effect removes the coating data. Effect duration matches the selected coating duration.

- **Toxicologist acid damage swap**: When a character with the Toxicologist feat coats a weapon, poison damage entries are automatically marked as a choice between poison and acid, using the existing damage choice UI. The feat is auto-detected from the actor's feats.

- **Prompt Coating Duration setting**: New world setting (default: on) that controls whether the GM sees the duration picker when coating. When disabled, all coatings default to unlimited duration — useful for GMs who don't want to manage coating timers.

- **GM-routed duration dialog**: The coating duration prompt always appears on the GM's client, even when a player initiates the coating. Uses socketlib to route the dialog to the GM and return the selection.

## [1.2.2] - 2026-02-24

### Added

- **Player weapon coating**: Players can now coat their own weapons with injury poisons and use the Envenom/Vishkanya flow directly from chat buttons, without requiring GM intervention. The "Coat Weapon" button appears for any user who owns the speaker's actor.

### Fixed

- **Attack roll target detection**: Fixed coated weapon hit detection always showing "No targets selected" because it read the GM's targets instead of the actual attack target. Now extracts the target from PF2e's message flags embedded in the attack roll.

## [1.2.1] - 2026-02-24

### Fixed

- **Chinese speed penalty parsing**: Added locale-aware speed penalty pattern (`速度-N尺状态减值`) to the Chinese parser locale, and refactored `AfflictionEffectBuilder` to use locale-driven `speedPenaltyPatterns` instead of a hardcoded English regex.

- **Apply Consequences button crash**: Fixed `Cannot read properties of undefined (reading 'get')` error on `canvas.tokens` when the button is rendered before the canvas is fully initialised.

## [1.2.0] - 2026-02-24

### Added

- **Vishkanya ancestry feat support**: The "Coat Weapon" button now appears on chat cards for the Envenom action and all Enhance Venom feat actions (Lesser, Moderate, Greater). Venom tier and damage are determined automatically from the actor's feats (base 1d4, lesser 1d6/2d6, moderate 3–5d6, greater 7–11d6). The Vicious Venom feat marks the venom as virulent. The Debilitating Venom feat prompts a choice of Hampering (–5/–10ft Speed penalty) or Stumbling (Off-Guard on stages 2–3) before coating. Envenom venom is not consumed on use.
- **Blowgun Poisoner feat support**: When an attacker with the Blowgun Poisoner feat critically succeeds at a blowgun Strike with a coated or innate-note poison, the target's initial Fortitude save is treated as one degree worse.
- **Fast Recovery feat support**: When a character with Fast Recovery succeeds at a stage save against a disease or poison, the affliction regresses by 2 stages (1 on a critical success it regresses by 3; virulent afflictions reduce those values by 1). Fast Recovery bypasses the virulent consecutive-successes mechanic.

## [1.1.10] - 2026-02-23

### Added

- **Token Tools button mode**: New setting "Use Token Tools Button" moves the Affliction Manager button from the Token HUD to the Scene Controls token tools sidebar. The button appears only when a token is selected, glows red with a pulsing animation when the selected token has active afflictions, and updates in real time as afflictions are added or removed.

### Fixed

- **Show Visual Indicators now controls the monitor panel**: The "Show Visual Indicators" setting now correctly hides the affliction monitor panel (floating corner widget) when turned off, in addition to the token tint it already controlled.
- **Show Visual Indicators description corrected**: The setting hint now accurately describes what it controls — a red tint on afflicted tokens and the monitor panel — replacing the incorrect "biohazard icon" wording.

## [1.1.9] - 2026-02-23

### Added

- **Simplified Chinese locale**: Affliction descriptions from the PF2e CN community pack are now parsed correctly — stage headers, onset, duration units, condition names, damage types, and weakness phrases are all matched against their Chinese equivalents.

### Fixed

- **Chinese stage parsing — optional space**: Stage headers written without a space between the label and number (e.g. `阶段1` instead of `阶段 1`) are now recognised correctly.
- **Chinese stage duration — full-width parentheses**: Stage durations enclosed in full-width brackets `（1轮）` are now parsed correctly alongside the standard ASCII form `(1 round)`.

## [1.1.8] - 2026-02-23

### Added

- **Token Tools button mode**: New setting "Use Token Tools Button" that moves the Affliction Manager button from the Token HUD to the Scene Controls token tools sidebar. When enabled, the biohazard button appears only when a token is selected and glows red when the selected token has active afflictions.

## [1.1.7] - 2026-02-22

### Fixed

- **Missing conditions in stage editor**: Concealed, Controlled, Encumbered, Hidden, Invisible, Observed, Off-Guard, Petrified, Quickened, and Undetected are now available in the condition dropdown when manually editing affliction stages.

## [1.1.6] - 2026-02-22

### Fixed

- **Treatment and counteract prompts are now public**: The "Roll Medicine" and counteract roll buttons are no longer whispered — they post as public chat messages so any player can see and use them to perform the check on behalf of the afflicted character.

- **Inline roll damage parsing**: Content using the `[[/r 1d6[poison]]]` inline roll syntax (e.g. Kingmaker module) now correctly parses damage, matching the behaviour of the `@Damage[1d6[poison]]` format.
- **`Flat-Footed` condition alias**: The condition name `Flat-Footed` (same UUID as `Off-Guard`) is now mapped to `off-guard` during parsing, so it is correctly applied as a stage condition.

## [1.1.5] - 2026-02-22

### Fixed

- **Weapon coating consumes a poison dose**: Coating a weapon via the chat button or the Affliction Manager now decrements the poison item's quantity by one. If it was the last dose, the item is deleted.

## [1.1.4] - 2026-02-22

### Added

- **Coat Weapon dialog includes targeted tokens' weapons**: Weapons from currently targeted tokens are now shown alongside the speaker's weapons, grouped by actor with a section header for each. Allows coating a friendly's weapon by targeting them before clicking the button.

## [1.1.3] - 2026-02-22

### Fixed

- **Coat Weapon dialog now only shows the speaker's weapons**: The weapon selection dialog triggered by the "Coat Weapon" chat button no longer lists weapons from all canvas tokens — it filters to only the actor/token that sent the item card.

## [1.1.2] - 2026-02-22

### Fixed

- **Persistent conditions now survive stage changes and affliction end**: Conditions with natural duration or self-modifying behavior (`frightened`, `drained`, `stunned`, `doomed`, `wounded`) are now applied as real condition items instead of being tied to the affliction effect — they persist after stage transitions and after the affliction ends, as per PF2e rules. Stage-tied conditions (`clumsy`, `paralyzed`, etc.) continue to be removed when the stage changes.

## [1.1.1] - 2026-02-22

### Fixed

- **Coating deferred until GM confirms**: Injury poison coating is no longer spent on hit detection — it is now removed only when the GM clicks the "Apply Affliction" button in the whisper message, allowing the GM to decline without losing the coating

## [1.1.0] - 2026-02-22

### Added

- **Weapon Coating**: Injury poisons can now be applied to weapons directly from the Affliction Manager
  - New **Weapon Coatings** tab in the Affliction Manager (tab-based navigation)
  - Shows all piercing/slashing weapons for the selected token; each row has an inline poison selector
  - Coating data persisted as actor flags (`pf2e-afflictioner.weaponCoatings`)
  - **"Coat Weapon" button** injected on injury-poison item cards in chat (GM only)
  - On first Strike with a coated weapon the module auto-detects the outcome:
    - **Hit (piercing/slashing)**: poison spent, GM receives a whisper with "Apply Affliction" button
    - **Miss**: poison remains on weapon, GM notified
    - **Critical miss or non-piercing/slashing hit**: poison spent with no effect
  - Hover tooltip on active coating shows DC, onset, max duration, and per-stage effects
  - Info button (ⓘ) next to poison name opens the item sheet
  - All user-facing strings fully i18n-localised under `PF2E_AFFLICTIONER.WEAPON_COATING`

## [1.0.3] - 2026-02-21

### Fixed

- **Affliction Manager Crash on Open**: Fixed `TypeError: Cannot read properties of undefined (reading '-2')` when opening the Affliction Manager with afflictions awaiting initial save (`currentStage === -1`) or with missing `stages` data
  - `currentStage - 1` evaluates to `-2` when awaiting initial save, which crashed when `stages` was `undefined`
  - Stage index lookup now guards both `stageIndex >= 0` and `aff.stages` being defined before array access
  - `hasWarning` reuses the already-safe local `currentStage` variable instead of re-indexing
  - `canProgressStage` uses `aff.stages?.length ?? 0` to avoid crashing on undefined stages

### Changed

- **Full i18n Coverage**: All hard-coded user-visible strings replaced with `game.i18n` calls, making the module fully localizable
  - Added ~100 new localization keys across new sections (`CHAT`, `MONITOR`) and additions to `MANAGER`, `BUTTONS`, `ERRORS`, `EDITOR`, `DIALOG`, `CONFLICT`, `NOTIFICATIONS`, and `SETTINGS`
  - All module settings `name` and `hint` strings now use i18n keys (Foundry localizes them automatically)
  - Chat message templates (save requests, stage changes, death confirmation, re-exposure, max duration) now use `game.i18n.format()`
  - Token HUD tooltip, notification messages, button labels, and dialog content all localized
  - Affliction Monitor Indicator tooltip strings (onset, initial save, save countdown, stage display) localized
  - Degree-of-success labels in counteract confirm button now use `DEGREES.*` keys
  - No behavior changes — purely a localization coverage improvement

## [1.0.2] - 2026-02-20

### Fixed

- **Affliction Button Injection**: "Apply Affliction to Target" button now injects after the last roll note instead of the first, placing it correctly below the affliction description
  - "Apply to Target / Selected Token" button no longer appears on items with no stages (e.g. Dread Ampoule)
- **Skip No-Stage Afflictions**: Affliction processing loops now skip afflictions with no stages, preventing unnecessary processing of non-affliction items
- **Septic Malaria DC Parsing**: DC now correctly extracted from rendered note HTML (`data-pf2-dc`) for NPC action-type afflictions where DC is not stored on the item
- **Structured Affliction Duration**: Stage durations from structured PF2e affliction items now normalize plural unit strings (e.g. `"days"` → `"day"`) to match duration multiplier keys, fixing duration tracking

### Changed

- **Applied Button State**: "Apply Affliction to Target" button now shows a check-circle icon and muted red styling after being clicked

## [1.0.1] - 2026-02-19

### Added

- **Community Afflictions Auto-Import**: Bundled community affliction definitions are now automatically imported on world load
  - Compares bundled data version against last imported version
  - Auto-merges new entries without conflicts
  - Shows conflict resolution dialog when GM edits overlap with community data
  - Tracks import version via `communityDataVersion` setting

### Changed

- **Removed Default DC Setting**: Afflictions without a parseable DC now warn the GM via notification instead of silently falling back to a configurable default
  - Added `NO_DC_FOUND` notification: "No DC found for affliction item {itemName}"
  - Prevents incorrect DCs from being used unknowingly

- **Visual Indicator Setting Scope**: Changed "Show Visual Indicators" setting from client to world scope

### Fixed

- **Storyframe Integration**: Rolls sent through Storyframe now work correctly with the save confirmation system
  - Removed unnecessary participant requirement — requests now use actor UUID and user ID directly
  - Save results route through SocketService with the roll message ID, enabling "Apply Consequences" button injection
  - Added fallback to find roll message by actor and total when `chatMessageId` is unavailable

## [1.0.0-alpha.10] - 2026-02-19

### Changed

- **NPC Saves are Blind GM Rolls**: NPC affliction saves now automatically roll as blind GM rolls
  - Both initial saves and stage saves use `CONST.DICE_ROLL_MODES.BLIND` for NPC actors
  - Players never see NPC save rolls or results in chat

- **NPC Save Messages Whispered to GM**: Save request messages for NPCs now whispered to GM instead of posted publicly
  - Both initial save and stage save prompts whispered when actor has no player owner
  - Prevents players from seeing NPC affliction save prompts

- **Apply to Target / Selected Token**: Button now prioritizes user targets over selected tokens
  - Checks `game.user.targets` first, falls back to `canvas.tokens.controlled`
  - Button label updated to "Apply to Target / Selected Token"

### Fixed

- **Spell DC Parsing**: Afflictions from spells now extract DC from the chat message save button when the item has no DC
  - Spells have dynamic DCs not stored on the item — now parsed from `data-dc` in message content
  - Prevents afflictions from falling back to the default DC setting

- **Storyframe Participant Prompt Removed**: Storyframe integration now silently falls back to chat buttons when actor is not a participant
  - Previously prompted GM to add actor as participant, blocking the flow

## [1.0.0-alpha.9] - 2026-02-18

### Fixed

- **Counteract: Multiple Spellcasting Entries**: Characters with multiple spellcasting entries of the same tradition (e.g., Wizard + Magus archetype, class spells + innate spells) now all appear individually in the counteract check type dropdown
  - Previously deduplicated by tradition, showing only one "Arcane Spellcasting" option even with multiple arcane entries
  - Now lists each entry by name (e.g., "Arcane Spells", "Arcane Innate Spells") using the entry's unique ID
  - Rolling uses the exact selected entry's statistic for accurate modifiers
  - Backward compatible with existing counteract buttons in chat history

## [1.0.0-alpha.8] - 2026-02-18

### Added

- **"Dead" Stage Support**: Affliction stages with "dead" effect now prompt GM for confirmation before killing character
  - GM receives whispered chat message with "Confirm Kill" button
  - On approval: sets character HP to 0 and applies the Dead condition
  - Prevents accidental kills with explicit GM confirmation step

- **"As Stage X" Reference Support**: Stages referencing another stage (e.g. "as stage 2") now inherit that stage's damage, conditions, and effects
  - Referenced stage's damage, conditions, and weakness are copied automatically
  - Own duration and raw text are preserved

- **Week Duration Unit**: Added "week" as a valid duration unit for onset, stage duration, and max duration fields

- **Application Initiative Setting**: New "Use Application Initiative" world setting
  - When enabled, affliction saves trigger on the initiative step the affliction was first applied rather than the afflicted token's own initiative
  - Unofficial rule — not explicitly in the PF2e rulebook, off by default

### Fixed

- **Persistent Damage Conditions**: Persistent damage now applied directly on the actor instead of via GrantItem
  - GrantItem cannot represent persistent damage with formula/type, causing it to be silently skipped
  - Uses `game.pf2e.ConditionManager` to create a proper persistent-damage condition with correct formula, damage type, and recovery DC
  - Old persistent damage is removed before applying a new stage and on affliction removal
  - Tooltip and chat messages now display persistent damage correctly (e.g. "1d6 fire persistent damage")

- **Valueless Conditions**: On/off conditions (blinded, paralyzed, prone, etc.) no longer show a numeric value field in the stage editor

- **Condition Name Validation**: Condition names with spaces (e.g. "persistent damage") now validate correctly against hyphenated slug form

## [1.0.0-alpha.7] - 2026-02-18

### Added

- **Dynamic Stage Duration Rolling**: Dice-based stage durations (e.g. "Paralyzed for 2d4 hours") now roll automatically on stage entry
  - Rolls posted as GM-whispered chat message with dice formula and result
  - ui.notifications toast also shown
  - Rolled value persisted to affliction store so subsequent saves use the correct duration
  - Supports Foundry inline roll notation `[[/br 2d4 #hours]]` in addition to plain text

- **Max Duration Effect Expiry**: When an affliction hits max duration and GM clicks "Remove", the Foundry effect is now updated to the stage's rolled duration so conditions expire naturally rather than persisting indefinitely
  - Only applies if the current stage had a timed duration (e.g. Paralyzed for 2d4 hours)
  - Stages without explicit duration continue existing behavior (effect remains until manually removed)

- **Counteract: Spellcasting Proficiency**: Counteract check type dropdown now includes spellcasting traditions
  - **Arcane / Divine / Occult / Primal Spellcasting** options listed first (ability mod + proficiency, per PF2e rules)
  - Auto-detected from the caster's spellcasting entries when available
  - Rolls via `spellcastingEntry.statistic.check.roll()` for accurate modifier
  - Falls back to relevant knowledge skill (arcana/religion/etc.) if no matching entry found
  - Skills still available as fallback

- **Counteract: Apply Consequences Button**: When "Require Save Confirmation" is enabled, counteract rolls now inject an "Apply Counteract Consequences" button directly onto the roll message (matching the save confirmation pattern)
  - Button color-coded by degree of success
  - Shows rank explanation (e.g. "Can counteract up to rank 4 — affliction rank 3 is within range")
  - Button omitted entirely on failure/critical failure when counteract cannot succeed
  - Supports hero point rerolls — degree recomputed from live roll each render
  - Uses `pf2e.preReroll` hook to copy flags to new message on reroll

- **Counteract: Spell Rank as Default**: Counteract rank dialog now defaults to the spell's cast rank (per PF2e rule: spell rank = counteract rank)

### Fixed

- **Dynamic Stage Duration**: Fixed `Roll.evaluate({ async: false })` removed in Foundry v12 causing stage duration rolls to silently fail
  - Now uses `await roll.evaluate()` with Math.random fallback
  - All call sites updated to properly `await` the async method

- **Foundry Enrichment Parsing**: Stage durations using Foundry inline roll notation (`[[/br 2d4 #hours]]`) now parse correctly
  - Previous plain-text regex failed on enriched descriptions
  - New `stripEnrichment()` helper also added for general use

- **Edited Definition Override**: Fixed edited affliction definitions overwriting freshly-parsed stage durations with stale null values
  - Edited definitions stored before the parsing fix had null durations that silently replaced correct values

- **Counteract Apply Button**: Fixed "Apply Counteract Consequences" button doing nothing when injected asynchronously
  - Button now has event listener attached directly at injection time (not via `registerCounteractButtonHandlers`)

### [1.0.0-alpha.6] - 2026-02-17

### Added

- **Anonymize Save Messages Setting**: New GM setting to hide affliction details from players
  - New world setting: "Anonymize Save Messages"
  - When enabled, players only see "Fortitude Save Required" without affliction name or details
  - Hides affliction name, exposure text, current stage, and virulent trait information
  - Players still see DC (if PF2e metagame setting allows) and treatment bonuses
  - GMs continue to see full details in their separate GM-only messages
  - Useful for keeping the nature of afflictions secret from players
  - Works for both initial saves and stage saves

- **Unidentified Affliction Effects**: Affliction effects are now automatically unidentified for players when mysterious
  - Effects appear as "Unknown Affliction" to players when the affliction's nature is unknown
  - Automatically unidentified when:
    - Affliction is currently in onset period (not yet affecting the character), OR
    - Current stage has no mechanical effects (no conditions, weakness, or damage)
  - Automatically identified when:
    - Character experiences mechanical effects (conditions, weakness, or damage)
  - Once identified, stays identified even if character regresses to earlier stages
  - Effect text alone (flavor text) does NOT reveal the affliction's identity
  - GMs always see the true affliction name
  - Prevents meta-gaming by hiding affliction details until they become mechanically apparent

- **Onset Effects with Duration**: Onset effects now show countdown timer
  - Onset effects display actual onset duration (e.g., "10 MINUTES REMAINING")
  - Duration automatically counts down using Foundry's built-in timer system
  - Description shows simple "Onset" text (no redundant time information)
  - Stages continue to use unlimited duration (they end via saves, not time)

- **GM Rolls Mysterious Initial Saves**: New setting for complete secrecy with mysterious afflictions
  - New world setting: "GM Rolls Mysterious Initial Saves"
  - When enabled, GM rolls initial saves in secret for mysterious afflictions
  - Mysterious affliction criteria:
    - Affliction has an onset period, OR
    - Stage 1 has no mechanical effects (no conditions, weakness, or damage)
  - Players never see the save request - complete secrecy maintained
  - **Rolls are automatically made as blind GM rolls** - players don't see roll or result
  - Temporarily sets roll mode to blind, skips dialog, then restores original mode
  - GM receives special message with red border and secret icon
  - Indicates reason for secrecy (onset or no mechanical effects)
  - Works with "Anonymize Save Messages" and unidentified effects for maximum mystery

### Changed

- **Effect Timing**: Effects now only appear after initial save completes
  - No effect created during "Awaiting initial save" state
  - Effect appears when character enters onset or first stage
  - Reduces clutter and confusion during initial exposure

- **Badge Numbering**: Badge range changed from 0-max to 1-max
  - Onset effects have no badge (onset is not a numbered stage)
  - Stage effects show badge numbered 1 to max stage
  - Prevents confusion with badge value 0

### Fixed

- **Initial Save Effect Deletion**: Fixed effect being deleted when closing sheet during initial save
  - Added check to skip badge sync when affliction is awaiting initial save
  - Prevents premature affliction removal from badge normalization

- **Blind Roll Implementation**: GM secret saves now properly use blind roll mode
  - Temporarily sets core roll mode to blind before rolling
  - Skips dialog to prevent mode override
  - Restores original roll mode after roll completes
  - Ensures players never see the roll or result in chat

### Refactored

- **AfflictionService Code Organization**: Major refactor splitting monolithic service into focused modules
  - Created **AfflictionEffectBuilder** (374 lines) - Effect creation, updates, and configuration
  - Created **AfflictionChatService** (375 lines) - Chat message generation and prompts
  - Created **AfflictionTimerService** (217 lines) - Duration tracking and timing logic
  - Reduced **AfflictionService** from 1580 lines to 818 lines (-48% reduction)
  - Total code extracted: 966 lines into 3 focused services
  - **Benefits:**
    - Single Responsibility Principle - each service has clear focus
    - DRY Compliance - eliminated all duplicated logic
    - Improved testability - services can be tested independently
    - Better maintainability - changes are isolated to specific services
    - Cleaner imports - each service only imports what it needs
  - **Zero behavior changes** - pure code organization refactor
  - All code passes linting with no errors

## [1.0.0-alpha.5] - 2026-02-17

### Added

- **Condition Protection System**: Prevents manual removal or modification of affliction-managed conditions
  - New hook system to intercept condition deletion and updates
  - Players cannot manually remove or modify conditions applied by afflictions
  - Conditions show lock icon in UI to indicate they are protected
  - Prevents players from bypassing affliction mechanics by removing conditions directly
  - Module code uses bypass flags to allow proper cleanup during stage changes

- **GM Manual Stage Control**: GMs can manually adjust affliction stages via badge value
  - Click the badge number on affliction effects to directly change the stage
  - Setting badge to 0 removes the affliction (cures the character)
  - Automatically updates all stage effects, conditions, and bonuses
  - Properly cleans up condition instances from stacking service
  - Removes visual indicators when affliction is cured

- **GM Condition Level Override**: GMs can manually adjust condition values
  - Allows GMs to manually increase or decrease affliction-managed condition levels
  - Useful for story adjustments or correcting errors
  - Non-GMs are prevented from modifying to maintain affliction integrity

- **Maximum Duration UI**: Added affliction editor field for maximum duration
  - New UI field to manually set or adjust maximum duration
  - Toggle button to add/remove maximum duration (makes affliction indefinite when removed)
  - Supports rounds, minutes, hours, and days
  - Backend tracking and parsing was already implemented in v1.0.0-alpha.3

- **Maximum Duration Chat Notifications**: GMs receive chat messages with removal button when max duration expires
  - Whispered chat message when affliction reaches maximum duration
  - **Requires GM confirmation** - Affliction is NOT auto-removed, button provided for manual removal
  - **Conditions persist** after removal (per PF2e rules) - must be removed separately
  - Shows the stage at expiration and duration that was reached
  - Button to remove affliction while preserving conditions
  - Respects official PF2e rule: "conditions persist and must be removed through other means"

- **Live Affliction Updates**: Edited affliction changes now apply to active afflictions immediately
  - When saving affliction editor changes, updates all matching active afflictions on canvas
  - Updates DC, save type, maximum duration, stages, and traits
  - Preserves current stage and progression state
  - Re-applies current stage effects with updated definition
  - Shows notification with count of updated afflictions
  - Ensures active afflictions immediately reflect edited values

- **Save Confirmation Setting**: New "Require Save Confirmation" world setting to prevent meta-gaming
  - When enabled, GM must confirm save results before consequences are applied
  - Allows players to use hero points or other reroll abilities after seeing the roll result
  - Shows roll result and degree of success (Critical Success/Success/Failure/Critical Failure) in chat
  - **Button injected directly onto roll message** - No separate confirmation message needed
  - Button appears below the roll result with color-coded border matching degree of success
  - Consequences (conditions, stage changes) only apply after GM clicks "Apply Consequences"
  - **Automatic Reroll Update**: Uses `pf2e.preReroll` and `pf2e.reroll` hooks
  - When player rerolls, button automatically updates with new result and degree
  - Button color changes to match new degree (green→orange for success→failure)
  - No separate messages - everything stays on the original roll message
  - Stores roll message ID (not result value) so button always applies latest outcome
  - Player can reroll multiple times - button always shows current result
  - GM-only feature - prevents revealing success/failure through immediate consequence application
  - Works for both initial saves and stage saves

### Fixed

- **Condition Cleanup on Cure**: Fixed conditions not being removed when affliction is cured
  - Now properly removes condition instances from ConditionStackingService
  - Recalculates conditions to update or remove displayed conditions
  - Ensures no orphaned conditions remain after affliction removal

- **Maximum Duration Saving**: Fixed maximum duration not being saved in affliction editor
  - Affliction editor now properly saves maxDuration field when form is submitted
  - Fixed Foundry v13+ flat form data structure handling for maxDuration fields
  - Maximum duration changes are now persisted to edited affliction definitions

- **Maximum Duration Unified Tracking**: Fixed max duration to work correctly across combat and world time
  - Previously used separate tracking systems that didn't account for mode transitions
  - Combat tracking used stage start round instead of affliction start time
  - World time tracking didn't account for combat rounds
  - Now uses unified `maxDurationElapsed` counter that accumulates time in seconds
  - Combat: Adds 6 seconds per round to counter
  - World Time: Adds delta seconds to counter
  - **Correctly starts counting AFTER onset completes** (per PF2e rules, not during onset)
  - Properly handles afflictions that transition between combat and exploration mode
  - Example: Onset 10 minutes → max duration counting starts after onset → Affliction lasts onset + max duration

- **Initial Save Permission Error**: Fixed bug where non-GM players rolling initial saves would trigger "Only GMs can manage afflictions" error
  - Initial saves now properly use socket communication to send results to GM for processing
  - Prevents desync between active effects and affliction manager
  - Matches existing stage save behavior for consistent multi-user support

- **Curse Detection**: Improved "Apply Affliction" button detection for curses with non-standard formatting
  - Previously only detected afflictions with "Saving Throw" AND ("Stage 1" OR "Stage 2") text pattern
  - Now also detects curses that don't follow standard poison/disease format
  - Checks for any note matching an item with curse/poison/disease trait
  - Fixes detection for curses like Witchflame and Debilitating Bite

- **Edited Affliction DC**: Chat save buttons now use current DC from edited afflictions
  - Previously, buttons in old chat messages used the DC from when the message was posted
  - Now checks for edited affliction definitions and uses current DC when rolling saves
  - Applies to both initial saves and stage saves
  - Ensures DC changes in the affliction editor are immediately reflected

- **Natural 1/20 Degree of Success**: Fixed degree of success calculation to account for natural 1s and 20s
  - Natural 20: Improves degree by one step (e.g., success → critical success)
  - Natural 1: Reduces degree by one step (e.g., success → failure)
  - Applies PF2e Core Rulebook rules correctly

- **Cleanse Affliction Spell**: Fixed to properly handle base vs heightened versions
  - Base (Rank 2): Now reduces stage by 1 without counteract check (only for stage 2+)
  - Reduction can only be applied once per affliction case (per rules)
  - Heightened (Rank 3): Counteract only for disease or poison
  - Heightened (Rank 4+): Counteract for curse, disease, or poison
  - Previous implementation incorrectly allowed counteract checks at all ranks
  - Example: DC 16, +15 modifier, roll nat 1 = total 16 → Now correctly counts as **Failure** (not Success)
  - Fixes both save confirmation messages and immediate application

### Changed

- **Condition System Architecture**: Migrated to PF2e GrantItem rule elements for condition management
  - Conditions now granted via GrantItem rules on affliction effects (native PF2e system)
  - Uses `onDeleteActions: { grantee: 'restrict' }` for built-in deletion prevention
  - PF2e natively handles multiple sources granting the same condition (highest value shown)
  - Automatic condition cleanup when affliction effect is removed
  - **Deleted ConditionStackingService.js entirely** - PF2e's GrantItem system handles all stacking natively
  - **Removed all condition protection hooks** - GrantItem handles deletion and update prevention
  - Deleted ~400 lines of custom condition stacking logic
  - Only remaining hook: GM badge→stage sync for manual control
  - More maintainable and aligned with PF2e's native architecture
  - Significant code reduction and performance improvement

- **Code Organization**: Refactored hook registration into modular file structure
  - Split monolithic `registration.js` (~900 lines) into focused modules
  - **New hooks/** directory: `damage.js`, `chat.js`, `combat.js`, `worldTime.js`, `tokenHUD.js`, `conditions.js`
  - **New handlers/** directory: `saveButtons.js`, `afflictionButtons.js`, `treatmentButtons.js`, `counteractButtons.js`, `chatButtons.js`
  - Main `registration.js` now acts as orchestrator (40 lines)
  - Improves maintainability, testability, and navigation
  - Each file has single, clear responsibility
  - Easier for developers to find and modify specific functionality

### Technical Details

- **New Files**:
  - `scripts/hooks/conditions.js`: GM badge sync for manual stage control

- **Deleted Files**:
  - `scripts/services/ConditionStackingService.js`: Entire service removed (~400 lines), replaced by PF2e GrantItem

- **Updated Files**:
  - `scripts/hooks/registration.js`: Simplified condition hook registration (only badge sync)
  - `scripts/hooks/conditions.js`: Simplified to only GM badge→stage sync
  - `scripts/hooks/combat.js`: Removed ConditionStackingService calls
  - `scripts/hooks/worldTime.js`: Removed ConditionStackingService calls, updated max duration check
  - `scripts/managers/AfflictionManager.js`: Removed ConditionStackingService cleanup
  - `scripts/services/AfflictionService.js`: Added getConditionUuid, GrantItem rules, max duration improvements, removed condition creation/cleanup
  - `scripts/handlers/chatButtons.js`: Added max duration removal button handler
  - `templates/affliction-editor.hbs`: Added maximum duration UI field
  - `scripts/managers/AfflictionEditorDialog.js`: Added toggleMaxDuration, live affliction updates, flat form data handling
  - `lang/en.json`: Added maximum duration localization strings

- **Hook System**:
  - `preDeleteItem`: Prevents deletion of affliction-managed conditions
  - `preUpdateItem`: Prevents updates and handles GM badge/condition changes
  - Uses `fromAffliction` flag to identify protected conditions
  - Uses `bypassAfflictionLock` option for module cleanup operations
  - Uses `bypassAfflictionSync` option for internal badge updates

## [1.0.0-alpha.4] - 2026-02-15

### Added

- **Storyframe Integration**: Optional integration with Storyframe module
  - New setting: "Integrate with Storyframe" (world, GM only)
  - When enabled, sends save and counteract rolls through Storyframe's pending roll system
  - Players receive roll prompts in Storyframe UI instead of chat buttons
  - Automatically falls back to chat buttons if player offline or Storyframe unavailable
  - Prompts GM to add actors as Storyframe participants if needed
  - Results processed via polling and routed to existing affliction handlers

## [1.0.0-alpha.3] - 2026-02-15

### Added

- **Condition Stacking (PF2e Rules)**: Implements official condition stacking rules
  - Tracks multiple condition instances with different values from different afflictions
  - Applies highest value when multiple sources exist
  - Automatically downgrades to next highest when top value expires
  - Example: slowed 2 (1 round) + slowed 1 (6 rounds) = slowed 2 for round 1, then slowed 1 for rounds 2-6
  - Stored in actor flags: `pf2e-afflictioner.conditionInstances`

- **Maximum Duration Expiration**: World time support for afflictions with maximum duration
  - Afflictions with max duration now expire correctly in both combat and world time
  - Combat: Uses elapsed rounds vs max duration
  - World time: Uses elapsed time vs max duration in seconds

- **Clickable Affliction Indicator**: Token names in indicator tooltip are now clickable
  - Click token name to open Affliction Manager filtered to that token
  - Tooltip stays visible when hovering over it
  - Improved hover behavior with 200ms delay

### Fixed

- **Duration Display**: Show durations in appropriate units instead of always minutes
  - Days for 24+ hours, hours for 1-23 hours, minutes for 1-59 minutes, seconds for < 1 minute
  - Applied to onset timers, save countdowns, and all duration displays
  - Example: "4320m" now shows as "3d"

- **Dice Roll Duration**: Fixed 1d4 rolling 0 due to Foundry v11+ async evaluation
  - Added fallback manual dice simulation when roll.evaluate() fails
  - Custom chat message ensures correct total is displayed

- **Onset Save Timing**: Fixed save prompts during onset period
  - No save prompts during onset - only when onset completes or stage duration expires
  - Added `inOnset` checks to both combat and world time save logic
  - Reset `durationElapsed` when onset completes to start stage duration fresh

- **World Time Save Prompts**: Always send chat prompts when saves are due during world time
  - Previously only sent if `autoPromptSaves` setting enabled
  - Now consistent with combat save behavior

- **Treatment Target Selection**: Treatment actions now use targeted tokens
  - Shows afflictions from targeted token(s), not all tokens
  - Falls back to all tokens if no targets selected

- **Affliction Editor (Foundry v13+ Compatibility)**:
  - Fixed FormDataExtended reference for Foundry v13+
  - Fixed TextEditor reference for Foundry v13+
  - Fixed form data extraction to handle flat structure (condition.0.name vs nested arrays)
  - Conditions, damage, and weakness now save correctly

- **Stage Change Edge Cases**:
  - Cap target stage when onset completes if affliction has fewer stages than expected
  - Prevents "Stage 2 not found" errors when afflictions are edited to have fewer stages

- **Affliction Indicator Display**: Show "Initial Save" instead of "Stage -1" for afflictions awaiting initial save

- **Backward Compatibility**: Conditions from old afflictions (before stacking service) are now cleaned up properly on removal

### Changed

- Treatment buttons now prioritize targeted tokens over all tokens on canvas

## [1.0.0-alpha.2] - 2026-02-14

### Added

- **Curse Affliction Support**: Full support for curse afflictions alongside poisons and diseases
  - Curse trait detection and parsing
  - Updated all UI elements to handle curses
  - Updated language strings and documentation

- **Virulent Trait (Official PF2e Rules)**:
  - Properly implements the virulent trait per Core Rulebook rules
  - Requires **two consecutive successful saves** to reduce stage by 1
  - Critical success reduces stage by only 1 (instead of 2)
  - Tracks consecutive success counter across saves
  - Shows notification when first success is achieved
  - Resets counter on failures or critical successes
  - UI badge shows `[Virulent]` with tooltip in Affliction Manager
  - Chat messages display virulent trait status and mechanics

- **Multiple Exposure (Official PF2e Rules)**:
  - **Poisons** (default behavior):
    - Failing initial save against new exposure increases stage by 1 (or 2 on critical failure)
    - Maximum duration remains unchanged
    - Works even during onset period (doesn't change onset length)
    - If no onset or already elapsed, immediately applies new stage effects
  - **Curses & Diseases** (default behavior):
    - Multiple exposures have no effect
    - Shows notification when re-exposed
  - **Custom Multiple Exposure Rules**:
    - Parses affliction-specific multiple exposure rules from item descriptions
    - Recognizes patterns like "Each additional exposure advances the stage by 2"
    - Supports minimum stage requirements (e.g., "when already at stage 2 or higher")
    - Custom rules override default behavior for all affliction types
  - UI badge shows `[Multiple Exposure +X]` with stage increase amount

- **UI Enhancements**:
  - Affliction Manager displays trait badges for virulent and multiple exposure
  - Chat save prompts show virulent trait warnings and mechanics
  - Tooltips explain trait effects on hover
  - Color-coded badges (virulent: orange, multiple exposure: blue)

- **New Language Strings**:
  - `MULTIPLE_EXPOSURE_NO_EFFECT_DEFAULT`: For curse/disease re-exposure
  - `POISON_RE_EXPOSURE`: For poison stage increase notification
  - `VIRULENT_CONSECUTIVE_SUCCESS`: First successful save against virulent affliction

- **Manual Affliction Entry**: Create custom afflictions directly via "Manual Entry" button
  - Prompts for name, type, DC, and number of stages
  - Creates template affliction that can be customized via editor

- **"OR" Damage Parsing**: Automatically detect and display damage choices
  - Parses patterns like "3d6 cold or fire damage"
  - Shows both options as clickable damage links
  - Vertical layout with "Choose one:" header for clarity

- **Counteract Button**: New button in Affliction Manager to counteract afflictions
  - Prompts for counteract rank and check result
  - Calculates affliction counteract rank (half level, rounded up)
  - Uses official counteract rules to determine success
  - Reduces stage by 1 on success, cures if at stage 1
  - Supports spells like Cleanse Affliction

- **Treat Poison/Disease Integration**: Automatic integration with native PF2e actions
  - Detects when Treat Poison/Treat Disease is used
  - Shows "Apply Treatment To:" buttons for matching afflictions
  - Automatically applies treatment bonus based on check result
  - Green-highlighted selection UI appears in chat

### Fixed

- **Max/Min Stage Bugs**:
  - Fixed incorrect "stage changed" notification when already at max/min stage
  - Added early return when stage doesn't actually change
  - Prevent misleading "Stage 2 (was Stage 2)" messages

- **Stage Button Controls**:
  - Disabled increase stage button when at maximum stage
  - Disabled decrease stage button when at stage 1
  - Added visual disabled state (30% opacity, grayed out)
  - Added tooltips for stage limits

- **Virulent Manual Control**:
  - Manual stage decrease now works immediately for virulent afflictions
  - GM has full control via buttons without consecutive success requirement
  - Virulent logic only applies to automatic save rolls

### Changed

- Treatment effect names now include result: "Affliction (Treatment: Critical Success)"
- Clearer labeling for treatment circumstance bonuses/penalties
- Reduced virulent tooltip text size to 85% for better fit
- Updated stage control logic to check limits before processing
- Updated all trait detection logic to include curse trait
- Updated `AFFLICTION_TYPES` constant to include `CURSE: 'curse'`
- Revised README.md to accurately describe PF2e affliction mechanics
- Updated settings hint to mention curse detection

### Technical Details

- **AfflictionParser.js**:
  - Added `extractMultipleExposure()` method to parse custom rules
  - Enhanced `parseFromItem()` to detect virulent and curse traits
  - Updated structured affliction parsing for curse support

- **AfflictionService.js**:
  - Added `handlePoisonReExposure()` for default poison behavior
  - Modified `handleInitialSave()` to detect and handle re-exposure
  - Updated `handleStageSave()` to implement two-consecutive-saves for virulent
  - Added `findExistingAffliction()` helper method
  - Added `virulentConsecutiveSuccesses` counter to affliction data

- **AfflictionManager.js**:
  - Updated `_prepareContext()` to pass trait flags to template
  - Added `isVirulent`, `hasMultipleExposure`, and `multipleExposureIncrease` properties

- **Templates**:
  - Updated `affliction-manager.hbs` to display trait badges

- **Hooks & Dialogs**:
  - Updated all curse/disease/poison detection in `registration.js`
  - Updated `AddAfflictionDialog.js` for curse item handling

## [1.0.0-alpha.1] - Previous Release

- Initial alpha release with basic affliction management
- Auto-detection of poison/disease items
- Stage tracking and automatic saves
- Treatment support
- Visual indicators
- Manager UI

[1.0.0-alpha.2]: https://github.com/yourusername/pf2e-afflictioner/releases/tag/v1.0.0-alpha.2
