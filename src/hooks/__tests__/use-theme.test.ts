import { renderHook } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme, useThemeName } from '@/hooks/use-theme';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: jest.fn() }));

const mockScheme = jest.mocked(useColorScheme);

describe('useThemeName', () => {
  it('reports dark when the system is dark', async () => {
    mockScheme.mockReturnValue('dark');

    const { result } = await renderHook(() => useThemeName());

    expect(result.current).toBe('dark');
  });

  // `unspecified` comes from native, `null`/`undefined` from react-native-web
  // before the color-scheme media query resolves.
  it.each(['light', 'unspecified', null, undefined] as const)(
    'falls back to light for %p',
    async (scheme) => {
      mockScheme.mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

      const { result } = await renderHook(() => useThemeName());

      expect(result.current).toBe('light');
    }
  );
});

describe('useTheme', () => {
  it('returns the palette for the active theme', async () => {
    mockScheme.mockReturnValue('dark');

    const { result } = await renderHook(() => useTheme());

    expect(result.current).toBe(Colors.dark);
  });
});

describe('Colors', () => {
  it('defines the same tokens in both themes', () => {
    expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
  });
});
