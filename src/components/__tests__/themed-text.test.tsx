import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

const colorOf = (text: string) => flatten(screen.getByText(text).props.style).color;

const flatten = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

describe('ThemedText', () => {
  it('renders its children', async () => {
    await render(<ThemedText>Hello</ThemedText>);

    expect(screen.getByText('Hello')).toBeOnTheScreen();
  });

  it('colors primary links with the link token rather than a hardcoded hex', async () => {
    await render(<ThemedText type="linkPrimary">Learn more</ThemedText>);

    expect(colorOf('Learn more')).toBe(Colors.light.link);
  });

  it('lets themeColor override the default color', async () => {
    await render(<ThemedText themeColor="textSecondary">Muted</ThemedText>);

    expect(colorOf('Muted')).toBe(Colors.light.textSecondary);
  });

  it('applies the type variant styles', async () => {
    await render(<ThemedText type="title">Big</ThemedText>);

    expect(flatten(screen.getByText('Big').props.style).fontSize).toBe(48);
  });
});
