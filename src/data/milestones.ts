// src/data/milestones.ts
export interface Milestone {
  date: string;
  title: string;
  body?: string;
}

export const milestones: Milestone[] = [
  {
    date: '2025-03',
    title: 'BioKEA founded',
    body: 'Biology Knowledge Exploration Assistant — spin-out from biodiversity and environmental omics research, accelerated by revolutionary AI tooling.',
  },
  {
    date: '2025-04',
    title: 'Agentis started',
    body: 'AI-reviewed science journal conceived.',
  },
  {
    date: '2025-09',
    title: 'Berkeley lab planning begins',
    body: 'Start planning the 5,000+ sq ft Berkeley lab space.',
  },
  {
    date: '2025-10',
    title: 'Built with Claude Sonnet 4.5 Challenge — winner',
    body: "Sean wins Anthropic's Built with Claude Sonnet 4.5 Challenge with DaKineDiving, a real-time dive intelligence platform for O'ahu.",
  },
  {
    date: '2025-11',
    title: 'Contracts begin; ONT Promethion 2 arrives',
    body: 'Major new contracts begin and the Oxford Nanopore Promethion 2 sequencer lands on site.',
  },
  {
    date: '2026-02',
    title: 'Sean becomes Anthropic Claude Community Ambassador',
    body: "Sean joins the Claude Community Ambassador program, deepening BioKEA's ties to the Anthropic developer community.",
  },
  {
    date: '2026-03',
    title: 'Move into Berkeley space',
    body: 'Team takes possession of the 5,000+ sq ft Berkeley lab.',
  },
  {
    date: '2026-04',
    title: 'First employee hired',
    body: 'Founding team expands, the first salaried hire joins the team.',
  },
  {
    date: '2026-05',
    title: "Main-stage talk at Anthropic's Code w/ Claude: Extended",
    body: "Sean discusses BioKEA's mission on main stage at Anthropic's Code w/ Claude: Extended.",
  },
];
