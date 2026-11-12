const mockRender = jest.fn(function () { return this; });
jest.mock('../scripts/managers/EditedAfflictionsManager.js', () => ({
  EditedAfflictionsManager: class { render(...args) { return mockRender.call(this, ...args); } },
}));
jest.mock('../scripts/managers/AfflictionManager.js', () => ({ AfflictionManager: class {} }));
jest.mock('../scripts/services/VisualService.js', () => ({ VisualService: {} }));

describe('api.openEditedAfflictions', () => {
  let api;
  beforeAll(async () => { ({ api } = await import('../scripts/api.js')); });
  beforeEach(() => mockRender.mockClear());

  test('opens the Edited Afflictions window for a GM', async () => {
    game.user.isGM = true;
    await api.openEditedAfflictions();
    expect(mockRender).toHaveBeenCalledWith(true);
  });

  test('does nothing for players', async () => {
    game.user.isGM = false;
    await expect(api.openEditedAfflictions()).resolves.toBeNull();
    expect(mockRender).not.toHaveBeenCalled();
  });
});
