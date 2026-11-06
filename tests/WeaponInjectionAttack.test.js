import { onCreateChatMessage, onUpdateChatMessage } from '../scripts/hooks/chat.js';

describe('weapon injection attack prompts', () => {
  beforeEach(() => {
    jest.resetModules();
    game.user = {
      isGM: true,
      targets: new Set(),
    };
    game.users = [{ id: 'gm-1', isGM: true }];
    game.settings.get = jest.fn((moduleId, key) => (
      moduleId === 'pf2e-afflictioner' && key === 'autoDetectAfflictions'
    ));
    game.i18n.localize = jest.fn(key => key);
    game.i18n.format = jest.fn((key, data = {}) => `${key}:${JSON.stringify(data)}`);
    ChatMessage.create = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.canvas;
    delete global.fromUuid;
  });

  test('successful attack with loaded injection trait weapon posts an inject save prompt', async () => {
    const actor = {
      id: 'actor-1',
      uuid: 'Actor.actor-1',
      name: 'Alchemist',
      type: 'character',
      getFlag: jest.fn((_moduleId, key) => {
        if (key === 'weaponInjections') {
          return {
            'weapon-1': {
              poisonName: 'Giant Centipede Venom',
              weaponName: 'Injection Spear',
              afflictionData: {
                name: 'Giant Centipede Venom',
                type: 'poison',
                traits: ['injury', 'poison'],
              },
            },
          };
        }
        return {};
      }),
    };
    const weapon = {
      id: 'weapon-1',
      uuid: 'Item.weapon-1',
      name: 'Injection Spear',
      parent: actor,
      system: {
        traits: { value: new Set(['injection']) },
        damage: { damageType: 'piercing' },
      },
    };
    const target = { id: 'target-1', name: 'Ogre' };

    global.canvas = {
      tokens: {
        get: jest.fn(id => (id === 'target-1' ? target : null)),
      },
    };
    global.fromUuid = jest.fn(async uuid => {
      if (uuid === 'Item.weapon-1') return weapon;
      if (uuid === 'Scene.scene.Token.target-1') return { id: 'target-1' };
      return null;
    });

    await onCreateChatMessage({
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            outcome: 'success',
            target: { token: 'Scene.scene.Token.target-1' },
          },
          origin: { uuid: 'Item.weapon-1' },
        },
      },
    });

    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_HIT_TITLE'),
      whisper: ['gm-1'],
    }));
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('pf2e-afflictioner-inject-weapon-poison');
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('data-weapon-id="weapon-1"');
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('Giant%20Centipede%20Venom');
  });

  test('successful attack with a loaded Injection Reservoir weapon posts an inject save prompt', async () => {
    const actor = {
      id: 'actor-1',
      uuid: 'Actor.actor-1',
      name: 'Alchemist',
      type: 'character',
      getFlag: jest.fn((_moduleId, key) => (key === 'weaponInjections'
        ? {
          'weapon-1': {
            poisonName: 'Giant Centipede Venom',
            weaponName: 'Shortsword',
            afflictionData: { name: 'Giant Centipede Venom', type: 'poison', traits: ['injury', 'poison'] },
          },
        }
        : {})),
    };
    const weapon = {
      id: 'weapon-1',
      uuid: 'Item.weapon-1',
      name: 'Shortsword',
      parent: actor,
      flags: { 'pf2e-afflictioner': { injectionReservoir: true } },
      system: {
        traits: { value: [] },
        damage: { damageType: 'piercing' },
      },
    };
    const target = { id: 'target-1', name: 'Ogre' };

    global.canvas = { tokens: { get: jest.fn(id => (id === 'target-1' ? target : null)) } };
    global.fromUuid = jest.fn(async uuid => {
      if (uuid === 'Item.weapon-1') return weapon;
      if (uuid === 'Scene.scene.Token.target-1') return { id: 'target-1' };
      return null;
    });

    await onCreateChatMessage({
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            outcome: 'success',
            target: { token: 'Scene.scene.Token.target-1' },
          },
          origin: { uuid: 'Item.weapon-1' },
        },
      },
    });

    expect(ChatMessage.create.mock.calls[0][0].content).toContain('pf2e-afflictioner-inject-weapon-poison');
  });

  test('coated unlinked token attack looks up coating on the token document instead of the base actor', async () => {
    const baseActor = {
      id: 'actor-1',
      uuid: 'Actor.actor-1',
      name: 'Blacknoon Apprentice',
      type: 'npc',
      getFlag: jest.fn(() => ({})),
    };
    const weapon = {
      id: 'weapon-1',
      uuid: 'Actor.actor-1.Item.weapon-1',
      name: 'Dagger',
      parent: baseActor,
      system: {
        traits: { value: [] },
        damage: { damageType: 'piercing' },
      },
    };
    const syntheticWeapon = { ...weapon, uuid: 'Scene.scene.Token.attacker-1.Actor.actor-1.Item.weapon-1' };
    const syntheticActor = {
      id: 'actor-1',
      uuid: 'Scene.scene.Token.attacker-1.Actor.actor-1',
      name: 'Blacknoon Apprentice',
      type: 'npc',
      items: Object.assign([], { get: jest.fn(() => syntheticWeapon) }),
      getFlag: jest.fn(() => ({})),
    };
    const tokenDocument = {
      id: 'attacker-1',
      uuid: 'Scene.scene.Token.attacker-1',
      actorLink: false,
      getFlag: jest.fn((_moduleId, key) => {
        if (key === 'weaponCoatings') {
          return {
            'weapon-1': {
              poisonName: 'Giant Centipede Venom',
              weaponName: 'Dagger',
              afflictionData: {
                name: 'Giant Centipede Venom',
                type: 'poison',
                traits: ['injury', 'poison'],
                level: 1,
              },
            },
          };
        }
        return {};
      }),
    };
    const attackerToken = { id: 'attacker-1', actor: syntheticActor, document: tokenDocument };
    syntheticWeapon.parent = syntheticActor;
    const target = { id: 'target-1', name: 'Ogre' };

    global.canvas = {
      tokens: {
        get: jest.fn(id => {
          if (id === 'attacker-1') return attackerToken;
          if (id === 'target-1') return target;
          return null;
        }),
      },
    };
    global.fromUuid = jest.fn(async uuid => {
      if (uuid === 'Actor.actor-1.Item.weapon-1') return weapon;
      if (uuid === 'Scene.scene.Token.target-1') return { id: 'target-1' };
      return null;
    });

    await onCreateChatMessage({
      speaker: { token: 'attacker-1' },
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            outcome: 'success',
            target: { token: 'Scene.scene.Token.target-1' },
          },
          origin: { uuid: 'Actor.actor-1.Item.weapon-1' },
        },
      },
    });

    expect(baseActor.getFlag).not.toHaveBeenCalledWith('pf2e-afflictioner', 'weaponCoatings');
    expect(syntheticActor.getFlag).not.toHaveBeenCalledWith('pf2e-afflictioner', 'weaponCoatings');
    expect(tokenDocument.getFlag).toHaveBeenCalledWith('pf2e-afflictioner', 'weaponCoatings');
    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('PF2E_AFFLICTIONER.WEAPON_COATING.HIT_TITLE'),
      whisper: ['gm-1'],
    }));
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('data-actor-uuid="Scene.scene.Token.attacker-1.Actor.actor-1"');
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('data-token-id="attacker-1"');
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('Giant%20Centipede%20Venom');
  });

  test('coated NPC strike without origin uuid uses message item and roll degree', async () => {
    const weapon = {
      id: 'weapon-1',
      uuid: 'Scene.scene.Token.attacker-1.Actor.actor-1.Item.weapon-1',
      name: 'Hook Sword',
      system: {
        traits: { value: [] },
        damage: { damageType: 'slashing' },
      },
    };
    const actor = {
      id: 'actor-1',
      uuid: 'Scene.scene.Token.attacker-1.Actor.actor-1',
      name: 'Giant Centipede',
      type: 'npc',
      items: Object.assign([], { get: jest.fn(() => weapon) }),
      getFlag: jest.fn((_moduleId, key) => {
        if (key === 'weaponCoatings') {
          return {
            'weapon-1': {
              poisonName: 'Giant Centipede Venom',
              weaponName: 'Hook Sword',
              afflictionData: {
                name: 'Giant Centipede Venom',
                type: 'poison',
                traits: ['injury', 'poison'],
                level: 1,
              },
            },
          };
        }
        return {};
      }),
    };
    weapon.parent = actor;
    const target = { id: 'target-1', name: 'Flint Glade' };

    global.canvas = {
      tokens: {
        get: jest.fn(id => (id === 'target-1' ? target : null)),
      },
    };

    await onCreateChatMessage({
      id: 'attack-message-no-origin',
      speakerActor: actor,
      item: weapon,
      rolls: [{ options: { degreeOfSuccess: 2 } }],
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            target: { token: 'Scene.scene.Token.target-1' },
          },
        },
      },
    });

    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('PF2E_AFFLICTIONER.WEAPON_COATING.HIT_TITLE'),
      whisper: ['gm-1'],
    }));
  });

  test('coated NPC melee strike uses damageRolls damage type', async () => {
    const meleeAttack = {
      id: 'melee-1',
      name: 'Hook Sword',
      system: {
        traits: { value: [] },
        damageRolls: {
          main: { damage: '1d8', damageType: 'slashing' },
        },
      },
    };
    const actor = {
      id: 'actor-1',
      uuid: 'Scene.scene.Token.attacker-1.Actor.actor-1',
      name: 'Giant Centipede',
      type: 'npc',
      items: Object.assign([meleeAttack], { get: jest.fn(id => (id === 'melee-1' ? meleeAttack : null)) }),
      getFlag: jest.fn((_moduleId, key) => {
        if (key === 'weaponCoatings') {
          return {
            'melee-1': {
              poisonName: 'Giant Centipede Venom',
              weaponName: 'Hook Sword',
              afflictionData: {
                name: 'Giant Centipede Venom',
                type: 'poison',
                traits: ['injury', 'poison'],
                level: 1,
              },
            },
          };
        }
        return {};
      }),
    };
    meleeAttack.parent = actor;

    global.canvas = { tokens: { get: jest.fn() } };

    await onCreateChatMessage({
      id: 'npc-melee-damage-rolls',
      speakerActor: actor,
      item: meleeAttack,
      rolls: [{ options: { degreeOfSuccess: 2 } }],
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            identifier: 'melee-1.hook-sword.melee',
          },
        },
      },
    });

    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('PF2E_AFFLICTIONER.WEAPON_COATING.HIT_TITLE'),
      whisper: ['gm-1'],
    }));
  });

  test('linked NPC melee strike finds loaded injection stored on inventory weapon', async () => {
    const inventoryWeapon = {
      id: 'weapon-1',
      name: 'Longsword',
      system: {
        traits: { value: ['injection'] },
        damage: { damageType: 'slashing' },
      },
    };
    const meleeAttack = {
      id: 'melee-1',
      name: 'Longsword',
      flags: { pf2e: { linkedWeapon: 'weapon-1' } },
      system: {
        traits: { value: ['injection'] },
        damageRolls: {
          main: { damage: '1d8', damageType: 'slashing' },
        },
      },
    };
    const actor = {
      id: 'actor-1',
      uuid: 'Scene.scene.Token.attacker-1.Actor.actor-1',
      name: 'Giant Centipede',
      type: 'npc',
      items: Object.assign([meleeAttack, inventoryWeapon], {
        get: jest.fn(id => ({ 'melee-1': meleeAttack, 'weapon-1': inventoryWeapon }[id] || null)),
      }),
      getFlag: jest.fn((_moduleId, key) => {
        if (key === 'weaponInjections') {
          return {
            'weapon-1': {
              poisonName: 'Giant Centipede Venom',
              weaponName: 'Longsword',
              afflictionData: {
                name: 'Giant Centipede Venom',
                type: 'poison',
                traits: ['injury', 'poison'],
                level: 1,
              },
            },
          };
        }
        return {};
      }),
    };
    inventoryWeapon.parent = actor;
    meleeAttack.parent = actor;

    global.canvas = { tokens: { get: jest.fn() } };
    game.user.targets.add({ id: 'target-1', name: 'Flint Glade' });

    await onCreateChatMessage({
      id: 'linked-npc-melee-injection',
      speakerActor: actor,
      item: meleeAttack,
      rolls: [{ options: { degreeOfSuccess: 3 } }],
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            identifier: 'melee-1.longsword.melee',
          },
        },
      },
    });

    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_HIT_TITLE'),
      whisper: ['gm-1'],
    }));
    expect(ChatMessage.create.mock.calls[0][0].content).toContain('data-weapon-id="weapon-1"');
  });

  test('updated strike card with hit text can trigger coated weapon prompt once', async () => {
    const weapon = {
      id: 'weapon-1',
      name: 'Hook Sword',
      system: {
        traits: { value: [] },
        damage: { damageType: 'slashing' },
      },
    };
    const actor = {
      id: 'actor-1',
      uuid: 'Scene.scene.Token.attacker-2.Actor.actor-1',
      name: 'Giant Centipede',
      type: 'npc',
      items: Object.assign([], { get: jest.fn(() => weapon) }),
      getFlag: jest.fn((_moduleId, key) => {
        if (key === 'weaponCoatings') {
          return {
            'weapon-1': {
              poisonName: 'Giant Centipede Venom',
              weaponName: 'Hook Sword',
              afflictionData: {
                name: 'Giant Centipede Venom',
                type: 'poison',
                traits: ['injury', 'poison'],
                level: 1,
              },
            },
          };
        }
        return {};
      }),
    };
    weapon.parent = actor;
    const target = { id: 'target-1', name: 'Flint Glade' };

    global.canvas = {
      tokens: {
        get: jest.fn(id => (id === 'target-1' ? target : null)),
      },
    };

    const message = {
      id: 'updated-strike-card',
      speakerActor: actor,
      item: weapon,
      content: '<div>Result: Hit by +4</div>',
      flags: {
        pf2e: {
          context: {
            type: 'attack-roll',
            target: { token: 'Scene.scene.Token.target-1' },
          },
        },
      },
    };

    await onUpdateChatMessage(message);
    await onUpdateChatMessage(message);

    expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('PF2E_AFFLICTIONER.WEAPON_COATING.HIT_TITLE'),
      whisper: ['gm-1'],
    }));
  });
});
