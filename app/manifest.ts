import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stationery Depot Trade Portal',
    short_name: 'StatDepot',
    description: 'B2B wholesale ordering portal for approved Stationery Depot trade clients.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#0455d8',
    icons: [
      {
        src: '/brand-logo.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand-logo.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
