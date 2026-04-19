// src/data/partners.ts
export interface Partner {
  name: string;
  note?: string;
  url?: string;
}

export const partners: Partner[] = [
  {
    name: 'California Institute of Biodiversity',
    note: 'collaboration',
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
