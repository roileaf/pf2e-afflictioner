import { registerAfflictionHooks } from '../scripts/hooks/registration.js';
import { onRenderChatMessage } from '../scripts/handlers/chatButtons.js';

describe('chat message render hook registration', () => {
  let registered;

  beforeEach(() => {
    registered = [];
    global.Hooks = { on: jest.fn((name, fn) => registered.push([name, fn])) };
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.Hooks;
    jest.restoreAllMocks();
  });

  test('uses renderChatMessageHTML instead of deprecated renderChatMessage', () => {
    registerAfflictionHooks();

    const names = registered.map(([name]) => name);
    expect(names).toContain('renderChatMessageHTML');
    expect(names).not.toContain('renderChatMessage');
    expect(registered.find(([name]) => name === 'renderChatMessageHTML')[1]).toBe(onRenderChatMessage);
  });

  test('ignores non-HTMLElement roots', () => {
    expect(() => onRenderChatMessage({}, { jquery: '3.7.1', 0: document.createElement('div') })).not.toThrow();
    expect(() => onRenderChatMessage({}, null)).not.toThrow();
  });
});
