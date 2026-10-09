import React from 'react';
import { Image } from 'react-native';

/** Complete MedLink SmartTech 2026 mark used consistently across the app. */
export function BrandLogo({ width = 180 }: { width?: number }) {
  return (
    <Image
      source={require('../../assets/branding/logo.png')}
      accessibilityLabel="MedLink SmartTech 2026"
      resizeMode="contain"
      style={{ width, height: width * (1146 / 1372) }}
    />
  );
}
