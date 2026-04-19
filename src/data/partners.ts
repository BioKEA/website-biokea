// src/data/partners.ts
export interface Partner {
  name: string;
  note?: string;
  url?: string;
  major?: boolean;
}

export const partners: Partner[] = [
  {
    name: 'California Institute of Biodiversity',
    note: 'major partner',
    major: true,
  },
  {
    name: 'San Francisco Estuary Institute',
    note: 'collaboration',
  },
  {
    name: 'Coastal Quest',
    note: 'collaboration',
  },
];
