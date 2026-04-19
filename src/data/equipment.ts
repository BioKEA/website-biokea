// src/data/equipment.ts
// Curated equipment view for the /lab page. The full inventory lives in
// docs/equipment-list.txt — this is the narrative summary.

export interface EquipmentStage {
  label: string;
  title: string;
  items: string[];
}

export const equipmentByStage: EquipmentStage[] = [
  {
    label: 'Extraction',
    title: 'Automated sample extraction',
    items: [
      '4× Thermo Scientific KingFisher (Flex, Presto, 711 Flex, 96 Deep Well)',
      'Qiagen QIAcube Connect',
      'Eppendorf epMotion 5075 liquid handler',
    ],
  },
  {
    label: 'Prep & Amplification',
    title: 'Library prep and thermal cycling',
    items: [
      '3× Qiagen QIAgility Automated PCR Prep System',
      '2× Bio-Rad S1000 Thermal Cycler (96W Fast)',
      'MJ Research PTC-200 and PTC-225 Tetrad thermal cyclers',
      'Eppendorf Mastercycler Satellite X50i',
      'CyBio CyBi-SELMA 96 semi-automated pipetting robot',
    ],
  },
  {
    label: 'Quantification',
    title: 'qPCR, electrophoresis, fluorometry',
    items: [
      '2× Roche LightCycler 480 II Real-Time PCR System',
      'Qiagen Qiaxcel Advanced Capillary Electrophoresis',
      'Caliper Life Sciences LabChip GXII',
      'Applied Biosystems StepOne Real-Time PCR',
      'Qubit 4 fluorometer',
      'Molecular Devices FilterMax F3 microplate reader',
    ],
  },
  {
    label: 'Sequencing',
    title: 'Long-read sequencing',
    items: ['1× Oxford Nanopore Promethion 2 (live since November 2025)'],
  },
  {
    label: 'Infrastructure',
    title: 'Safety, storage, clean environment',
    items: [
      'ESCO Airstream + Labconco Purifier Logic+ A2 biosafety cabinets',
      'Cleatech HEPA-filtered glove box',
      'Thermo Scientific HERACELL 150i CO2 incubator',
      'VWR Revco -80 °C chest freezer',
      'Fisher Scientific SterileElite 24 tabletop autoclave',
    ],
  },
];
