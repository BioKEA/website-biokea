import type { APIRoute } from 'astro';
import { partners } from '@/data/partners';
import { equipmentByStage } from '@/data/equipment';
import { capabilityLines, labStats } from '@/data/stats';

export const prerender = true;

const services = [
  {
    name: 'eDNA and metabarcoding',
    target:
      'environmental DNA customers (conservation nonprofits, agencies, academic labs, environmental consultancies)',
    description:
      'Water, soil, and sediment samples through extraction, amplification, quantification, and long-read or amplicon sequencing. Delivered as a FAIR-compliant data package (DwC-A, NCBI SRA, GBIF, Zenodo).',
    primaryInstrument: 'Oxford Nanopore Promethion 2',
    status: 'primary',
  },
  {
    name: 'DNA barcoding surveys',
    description:
      'Amplicon sequencing across COI, 16S, 18S, ITS, rbcL, matK, and custom primers — a reproducible Sanger replacement.',
    primaryInstrument: 'Oxford Nanopore Promethion 2',
    status: 'available',
  },
  {
    name: 'Long-read microbial genomics',
    description: 'Whole-genome, metagenomic, and hybrid assemblies on the ONT Promethion 2.',
    primaryInstrument: 'Oxford Nanopore Promethion 2',
    status: 'available',
  },
  {
    name: 'Specimen screening',
    description:
      'High-throughput morphological imaging on DiversityScanner, pipelined into the LDC molecular workflow.',
    primaryInstrument: 'DiversityScanner',
    status: 'arriving-summer-2026',
  },
  {
    name: 'Pipeline integration',
    description:
      'Bespoke sample-to-claim workflows for partner organizations — integrated taxonomy reconciliation, QC, and FAIR packaging.',
    status: 'bespoke',
  },
];

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        lab: {
          name: 'BioKEA Large Data Collider',
          alternateName: 'BioKEA LDC',
          squareFeet: '5,000+',
          location: 'Berkeley, CA',
          operationalDate: '2026-03',
          sequencer: 'Oxford Nanopore Promethion 2',
          sequencerLiveSince: '2025-11',
        },
        services,
        equipmentByStage,
        capabilityLines,
        labStats,
        partners,
      },
      null,
      2,
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    },
  );
