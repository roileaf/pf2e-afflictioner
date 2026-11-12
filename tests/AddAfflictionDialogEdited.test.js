class TestApplication {
  constructor(options = {}) { this.options = options; }
  render() { return this; }
  close() {}
  _onRender() {}
}

describe('AddAfflictionDialog edited afflictions', () => {
  let AddAfflictionDialog;

  beforeAll(async () => {
    global.foundry = {
      ...(global.foundry || {}),
      applications: { api: { ApplicationV2: TestApplication, HandlebarsApplicationMixin: Base => Base } },
      utils: { ...(global.foundry?.utils || {}), deepClone: v => JSON.parse(JSON.stringify(v)) },
    };
    ({ AddAfflictionDialog } = await import('../scripts/managers/AddAfflictionDialog.js'));
  });

  test('lists item-based edited afflictions alongside sourceless customs, but not addiction edits', () => {
    game.settings.get = jest.fn((_module, key) => key === 'editedAfflictions' ? {
      'Item.gnawingHunger': { name: 'Gnawing Hunger', type: 'curse', dc: 30, stages: [{}, {}, {}, {}], sourceItemUuid: 'Item.gnawingHunger' },
      'custom-bog-rot-disease': { name: 'Bog Rot', type: 'disease', dc: 18, stages: [{}], sourceItemUuid: null },
      'addiction-pesh': { name: 'Addiction (Pesh)', type: 'disease', dc: 20, stages: [{}] },
    } : undefined);

    const list = AddAfflictionDialog.prototype.getSavedCustomAfflictions.call({});

    expect(list.map(entry => entry.key)).toEqual(['custom-bog-rot-disease', 'Item.gnawingHunger']);
    expect(list[1]).toMatchObject({ name: 'Gnawing Hunger', type: 'curse', dc: 30, stageCount: 4 });
  });
});
