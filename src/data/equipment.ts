// src/data/equipment.ts
// Curated per-stage equipment view for /lab. Each stage features one
// hero piece (photo + name + why-it-matters) plus a secondary list.
// Full inventory lives in docs/source/equipment-list.txt.

export interface EquipmentStage {
  label: string;
  eyebrow: string;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  hero: {
    name: string;
    why: string;
  };
  secondary: string[];
}

export const equipmentByStage: EquipmentStage[] = [
  {
    label: 'Extraction',
    eyebrow: '01 · Field to plate',
    image: '/assets/images/eq-extraction.jpg',
    imageAlt: 'Two Thermo Scientific KingFisher Flex purification robots stacked',
    imageWidth: 311,
    imageHeight: 421,
    hero: {
      name: 'Thermo KingFisher Flex — 3-unit fleet',
      why: 'Magnetic-bead purification at 96-well scale, running in parallel. Paired with an Eppendorf epMotion 5075 liquid handler for end-to-end sample prep.',
    },
    secondary: [
      'Eppendorf epMotion 5075',
      'Qiagen QIAcube Connect',
      'Thermo KingFisher Presto (×2)',
    ],
  },
  {
    label: 'Prep & Amplification',
    eyebrow: '02 · Library prep',
    image: '/assets/images/eq-prep.jpg',
    imageAlt: 'Two Qiagen QIAgility automated PCR prep systems stacked',
    imageWidth: 296,
    imageHeight: 529,
    hero: {
      name: '2× Qiagen QIAgility',
      why: 'Automated PCR prep with reproducible pipetting across 96- and 384-well plates. Backed by a stable of thermal cyclers for parallel amplification.',
    },
    secondary: [
      'Bio-Rad S1000 Thermal Cycler (×2)',
      'MJ Research PTC-200 and PTC-225 Tetrad',
      'Eppendorf Mastercycler Satellite X50i',
      'CyBio CyBi-SELMA 96 semi-automated pipettor',
    ],
  },
  {
    label: 'Quantification',
    eyebrow: '03 · Measure',
    image: '/assets/images/eq-quant.jpg',
    imageAlt:
      'Applied Biosystems StepOne real-time PCR system beside two stacked Roche LightCycler 480 II systems',
    imageWidth: 398,
    imageHeight: 269,
    hero: {
      name: '2× Roche LightCycler 480 II',
      why: 'Real-time PCR on a 384-well block, doubled up for high-throughput absolute quantification. Joined by an Applied Biosystems StepOne, capillary electrophoresis, and fluorometry.',
    },
    secondary: [
      'Applied Biosystems StepOne Real-Time PCR',
      'Qiagen Qiaxcel Advanced Capillary Electrophoresis',
      'Caliper Life Sciences LabChip GXII',
      'Qubit 4 fluorometer',
      'Molecular Devices FilterMax F3 microplate reader',
    ],
  },
  {
    label: 'Sequencing',
    eyebrow: '04 · Read',
    image: '/assets/images/eq-sequencing.jpg',
    imageAlt: 'Oxford Nanopore Promethion 2 long-read sequencer with flow cells visible',
    imageWidth: 358,
    imageHeight: 306,
    hero: {
      name: 'Oxford Nanopore Promethion 2',
      why: 'Two flow cells of long-read nanopore sequencing on demand. Live on site since November 2025 — the heart of the LDC.',
    },
    secondary: ['On-site library QC (Qubit 4, LabChip GXII, Qiaxcel) feeding directly in.'],
  },
];
