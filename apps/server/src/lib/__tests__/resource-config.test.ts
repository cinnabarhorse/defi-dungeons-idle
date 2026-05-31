import { RESOURCE_CONFIGS, getResourceConfig } from '../resource-config';

describe('lib/resource-config', () => {
  describe('getResourceConfig', () => {
    it('returns the config for known resource types', () => {
      expect(getResourceConfig('tree')).toEqual(RESOURCE_CONFIGS.tree);
      expect(getResourceConfig('stone')).toEqual(RESOURCE_CONFIGS.stone);
    });

    it('returns null and warns with available types for unknown resources', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(getResourceConfig('mystery')).toBeNull();

      expect(warn).toHaveBeenCalledTimes(1);
      const [msg] = warn.mock.calls[0] ?? [];
      expect(String(msg)).toContain('Unknown resource type requested: mystery');
      expect(String(msg)).toContain('Available types:');
      expect(String(msg)).toContain(Object.keys(RESOURCE_CONFIGS).join(', '));

      warn.mockRestore();
    });
  });
});
