// src/data/pipeline.ts
export interface PipelineStage {
  number: string;
  title: string;
  subtitle: string;
  body: string;
}

export const pipelineStages: PipelineStage[] = [
  {
    number: '01',
    title: 'Ingest',
    subtitle: 'Universal Envelope',
    body: 'Every input — raw FASTA, DwC-A archive, drafted manuscript — becomes a cryptographically trackable object. Automatic file-type detection and metadata extraction.',
  },
  {
    number: '02',
    title: 'Analyze',
    subtitle: 'Large Data Collider',
    body: 'The LDC runs image QC, taxonomy reconciliation, and FAIR validation over millions of reads in minutes. Outputs operational taxonomic units and candidate novel lineages.',
  },
  {
    number: '03',
    title: 'Draft',
    subtitle: 'AI-assisted narrative',
    body: 'The scientist directs; the AI drafts structure and links LDC data directly into the text. Cross-references with external hypotheses in real time.',
  },
  {
    number: '04',
    title: 'Review',
    subtitle: 'Multi-agent panel',
    body: 'AI pre-screens manuscript structure and methodology in hours. Verified human experts evaluate contextual scientific nuance. Weighted, transparent scoring.',
  },
  {
    number: '05',
    title: 'Broadcast',
    subtitle: 'Interactive StoryMap',
    body: 'The end product is not a dead PDF. It is an explorable digital artifact permanently tethered to its underlying FAIR data package (GBIF, NCBI SRA, Zenodo).',
  },
  {
    number: '06',
    title: 'Amplify',
    subtitle: 'Press · human-approved',
    body: 'Publishing is the starting line, not the finish. Once a result is live, Press can coordinate a human-approved, platform-neutral share campaign for that release — never automatically, and only after publication.',
  },
];
