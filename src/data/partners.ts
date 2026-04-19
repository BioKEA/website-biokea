// src/data/partners.ts
export interface Partner {
  name: string;
  note?: string;
  url?: string;
  description?: string;
  major?: boolean;
}

// VERIFY: URLs and descriptions below were drafted for machine-readability
// and the partners section; confirm canonical URLs and preferred wording
// with each partner before publishing at scale.
export const partners: Partner[] = [
  {
    name: 'California Institute of Biodiversity',
    note: 'major partner',
    major: true,
    url: 'https://www.cabiodiversity.org/',
    description:
      'Bay Area nonprofit coordinating biodiversity research, specimen curation, and field inventories across California.',
  },
  {
    name: 'San Francisco Estuary Institute',
    note: 'collaboration',
    url: 'https://www.sfei.org/',
    description:
      'Independent research institute focused on the ecology, water quality, and habitat of the San Francisco Bay-Delta estuary.',
  },
  {
    name: 'Coastal Quest',
    note: 'collaboration',
    url: 'https://www.coastalquest.org/',
    description:
      'California-based nonprofit supporting coastal stewardship, conservation, and habitat restoration.',
  },
];
