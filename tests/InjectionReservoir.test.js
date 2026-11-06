import { WeaponCoatingService } from '../scripts/services/WeaponCoatingService.js';

const FLAG_MODULE = 'pf2e-afflictioner';

function makeWeapon(overrides = {}) {
  const { system = {}, ...rest } = overrides;
  const weapon = {
    id: 'weapon-1',
    type: 'weapon',
    name: 'Shortsword',
    flags: {},
    system: {
      traits: { value: [] },
      damage: { damageType: 'piercing' },
      range: null,
      rules: [],
      ...system,
    },
    update: jest.fn(async (changes) => {
      if (changes['system.rules']) weapon.system.rules = changes['system.rules'];
      const flagKey = `flags.${FLAG_MODULE}.injectionReservoir`;
      if (flagKey in changes) {
        weapon.flags[FLAG_MODULE] = { injectionReservoir: changes[flagKey] };
      }
    }),
    ...rest,
  };
  return weapon;
}

function makeReservoir(quantity = 1) {
  return { id: 'reservoir-1', type: 'equipment', system: { slug: 'injection-reservoir', quantity } };
}

describe('Injection Reservoir', () => {
  beforeEach(() => {
    game.i18n.localize = jest.fn(key => key);
  });

  describe('eligibility', () => {
    test('accepts a melee weapon dealing piercing damage', () => {
      expect(WeaponCoatingService._canFitInjectionReservoir(makeWeapon())).toBe(true);
    });

    test('accepts a melee weapon with versatile piercing', () => {
      const weapon = makeWeapon({
        system: { damage: { damageType: 'slashing' }, traits: { value: ['versatile-p'] } },
      });
      expect(WeaponCoatingService._canFitInjectionReservoir(weapon)).toBe(true);
    });

    test('rejects ranged, non-piercing, injection, and already adjusted weapons', () => {
      const ranged = makeWeapon({ system: { range: 30 } });
      const slashing = makeWeapon({ system: { damage: { damageType: 'slashing' } } });
      const injection = makeWeapon({ system: { traits: { value: ['injection'] } } });
      const adjusted = makeWeapon({ flags: { [FLAG_MODULE]: { injectionReservoir: true } } });

      for (const weapon of [ranged, slashing, injection, adjusted]) {
        expect(WeaponCoatingService._canFitInjectionReservoir(weapon)).toBe(false);
      }
    });
  });

  describe('injection weapon detection', () => {
    test('treats an adjusted weapon as an injection weapon', () => {
      const adjusted = makeWeapon({ flags: { [FLAG_MODULE]: { injectionReservoir: true } } });
      expect(WeaponCoatingService._isInjectionWeapon(adjusted)).toBe(true);
      expect(WeaponCoatingService._isInjectionWeapon(makeWeapon())).toBe(false);
    });

    test('collected weapon entries stay detectable for the load dialog', () => {
      const adjusted = makeWeapon({ flags: { [FLAG_MODULE]: { injectionReservoir: true } } });
      const plain = makeWeapon({ id: 'weapon-2' });
      const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Alchemist', itemTypes: { weapon: [adjusted, plain] } };
      const token = { id: 'token-1', name: 'Alchemist', actor, document: { actorLink: true } };
      global.canvas = { tokens: { get: () => token, placeables: [token], controlled: [token] } };

      const entries = WeaponCoatingService._collectWeapons('actor-1', 'token-1');

      expect(entries.filter(entry => WeaponCoatingService._isInjectionWeapon(entry)).map(entry => entry.weaponId))
        .toEqual(['weapon-1']);
      delete global.canvas;
    });
  });

  describe('available count', () => {
    test('subtracts reservoirs already installed on weapons', () => {
      const adjusted = makeWeapon({ flags: { [FLAG_MODULE]: { injectionReservoir: true } } });
      const actor = { items: [makeReservoir(2), adjusted, makeWeapon({ id: 'weapon-2' })] };
      expect(WeaponCoatingService._getAvailableInjectionReservoirCount(actor)).toBe(1);
    });

    test('is zero when the actor owns no reservoir', () => {
      expect(WeaponCoatingService._getAvailableInjectionReservoirCount({ items: [makeWeapon()] })).toBe(0);
    });
  });

  describe('install and remove', () => {
    test('install flags the weapon and adds one to its multiple attack penalty', async () => {
      const existingRule = { key: 'Strike', slug: 'existing' };
      const weapon = makeWeapon({ system: { rules: [existingRule] } });
      const actor = { items: [makeReservoir(), weapon] };

      expect(await WeaponCoatingService.installInjectionReservoir(actor, weapon)).toBe(true);

      expect(WeaponCoatingService._hasInjectionReservoir(weapon)).toBe(true);
      expect(weapon.system.rules).toEqual([
        existingRule,
        {
          key: 'FlatModifier',
          slug: 'injection-reservoir-map',
          selector: '{item|id}-attack',
          label: 'PF2E_AFFLICTIONER.WEAPON_COATING.INJECTION_RESERVOIR_NAME',
          value: -1,
          predicate: [{ or: ['map:increases:1', 'map:increases:2'] }],
        },
      ]);
    });

    test('install refuses when no reservoir is free or the weapon is ineligible', async () => {
      const weapon = makeWeapon();
      expect(await WeaponCoatingService.installInjectionReservoir({ items: [weapon] }, weapon)).toBe(false);

      const ranged = makeWeapon({ system: { range: 30 } });
      expect(await WeaponCoatingService.installInjectionReservoir({ items: [makeReservoir(), ranged] }, ranged)).toBe(false);

      expect(weapon.update).not.toHaveBeenCalled();
      expect(ranged.update).not.toHaveBeenCalled();
    });

    test('remove clears the flag and only its own rule', async () => {
      const existingRule = { key: 'Strike', slug: 'existing' };
      const weapon = makeWeapon({ system: { rules: [existingRule] } });
      await WeaponCoatingService.installInjectionReservoir({ items: [makeReservoir(), weapon] }, weapon);

      await WeaponCoatingService.removeInjectionReservoir(weapon);

      expect(WeaponCoatingService._hasInjectionReservoir(weapon)).toBe(false);
      expect(weapon.system.rules).toEqual([existingRule]);
    });
  });
});
