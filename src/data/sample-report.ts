// Display data for /sample-report. The JSON files are written by
// scripts/sample-report/export.mjs (clean highlights only) and committed.
import aa0022 from './sample-report/aa0022.json';
import aa0055 from './sample-report/aa0055.json';

export type DisplayWell = {
  well: string;
  status: 'species' | 'genus' | 'order' | 'awaiting';
  label: string;
  name?: string;
  reads?: number;
  match?: number;
  size?: string;
};

export interface Plate {
  id: 'aa0022' | 'aa0055';
  code: string;
  tab: string;
  caption: string;
  wells: DisplayWell[];
  defaultWell: string;
}

export const plates: Plate[] = [
  {
    id: 'aa0055',
    code: 'AA0055',
    tab: 'Plate AA0055 · new high-res microscope',
    caption:
      'Our newer microscope photographs each insect at higher magnification before it is picked. This plate is sequencing now; its barcodes will appear here and on calatbi.biokea.ai.',
    wells: aa0055 as DisplayWell[],
    defaultWell: 'C5',
  },
  {
    id: 'aa0022',
    code: 'AA0022',
    tab: 'Plate AA0022 · photographed + barcoded',
    caption: '95 insects, each photographed in its well and named from its DNA barcode.',
    wells: aa0022 as DisplayWell[],
    defaultWell: 'H2',
  },
];

export const thumbSrc = (plate: Plate['id'], well: string) =>
  `/assets/sample-report/${plate}/t-${well}.webp`;
export const largeSrc = (plate: Plate['id'], well: string) =>
  `/assets/sample-report/${plate}/l-${well}.webp`;

export const bannerImage = '/assets/sample-report/banner.webp';
