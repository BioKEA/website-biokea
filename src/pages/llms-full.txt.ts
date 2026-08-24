import type { APIRoute } from 'astro';
import { team } from '@/data/team';
import { partners } from '@/data/partners';
import { projects } from '@/data/projects';
import { milestones } from '@/data/milestones';
import { pipelineStages } from '@/data/pipeline';
import { equipmentByStage } from '@/data/equipment';
import { programs, credentialsFor } from '@/data/credentials';
import { serviceOfferings } from '@/data/services';

export const prerender = true;

const SITE = 'https://biokea.ai';

const renderTeam = () => {
  return team
    .map((p) => {
      const creds = credentialsFor(p.name);
      const credLine =
        creds.length > 0
          ? `\n  Credentials: ${creds
              .map((c) => `${c.label}${c.url ? ` (${c.url})` : ''}`)
              .join('; ')}`
          : '';
      const knowsLine =
        p.knowsAbout && p.knowsAbout.length > 0
          ? `\n  Knows about: ${p.knowsAbout.join(', ')}`
          : '';
      const sameAsLine =
        p.sameAs && p.sameAs.length > 0 ? `\n  Profiles: ${p.sameAs.join(', ')}` : '';
      const nominal = p.postNominal ? `, ${p.postNominal}` : '';
      return `### ${p.name}${nominal} — ${p.role}\n\n${p.bio ?? ''}${credLine}${knowsLine}${sameAsLine}`;
    })
    .join('\n\n');
};

const renderPartners = () =>
  partners
    .map((p) =>
      `- **${p.name}**${p.note ? ` (${p.note})` : ''} — ${p.description ?? ''} ${p.url ?? ''}`.trim(),
    )
    .join('\n');

const renderPrograms = () => programs.map((p) => `- **${p.name}** — ${p.url}`).join('\n');

const renderPipeline = () =>
  pipelineStages
    .map((s) => `### ${s.number}. ${s.title} — ${s.subtitle}\n\n${s.body}`)
    .join('\n\n');

const renderEquipment = () =>
  equipmentByStage
    .map((stage) => {
      const secondary = stage.secondary.map((s) => `  - ${s}`).join('\n');
      return `### ${stage.label}\n\n**Hero:** ${stage.hero.name} — ${stage.hero.why}\n\n**Also on this stage:**\n${secondary}`;
    })
    .join('\n\n');

const renderProjects = () =>
  projects
    .map((p) => {
      const lines: string[] = [];
      lines.push(`### ${p.title} (${p.status.toUpperCase()})`);
      lines.push('');
      lines.push(p.summary);
      lines.push('');
      lines.push(`- **Type:** ${p.type}`);
      lines.push(`- **Year:** ${p.year}`);
      if (p.partner) lines.push(`- **Partner:** ${p.partner}`);
      if (p.tags.length > 0) lines.push(`- **Tags:** ${p.tags.join(', ')}`);
      if (p.team && p.team.length > 0) {
        const team = p.team.map((m) => (m.lead ? `${m.name} (lead)` : m.name)).join(', ');
        lines.push(`- **Team:** ${team}`);
      }
      if (p.link) lines.push(`- **Link:** ${p.link}`);
      if (p.award) lines.push(`- **Award:** ${p.award.label} (${p.award.url})`);
      if (p.videos && p.videos.length > 0) {
        const v = p.videos.map((vv) => `${vv.label}: ${vv.url}`).join('; ');
        lines.push(`- **Videos:** ${v}`);
      }
      if (p.revealTarget) lines.push(`- **Reveal target:** ${p.revealTarget}`);
      if (p.originIndependent && p.originNote) lines.push(`- **Origin:** ${p.originNote}`);
      return lines.join('\n');
    })
    .join('\n\n');

const renderMilestones = () =>
  milestones.map((m) => `- **${m.date}** — ${m.title}${m.body ? `\n  ${m.body}` : ''}`).join('\n');

const renderServiceOfferings = () =>
  serviceOfferings
    .map((s) => {
      const desc = s.description ? `\n  ${s.description}` : '';
      return `- **${s.name}**${desc}`;
    })
    .join('\n');

const body = `# BioKEA — long-form summary for LLM agents

> BioKEA is an AI company with a wet-lab moat. A 5,000+ sq ft Berkeley lab plus an AI pipeline from field sample to verifiable scientific claim, built for the commons.

This is the long-form variant of [llms.txt](${SITE}/llms.txt). It is generated at build time from the same typed data modules that drive the rest of the site, so its contents are always in sync with what's rendered to humans.

Canonical site: ${SITE}
Short summary: ${SITE}/llms.txt
Machine-readable JSON: ${SITE}/api/team.json, ${SITE}/api/projects.json, ${SITE}/api/capabilities.json
Sitemap: ${SITE}/sitemap-index.xml

## Operations

- **The Large Data Collider (LDC)** — combined wet-lab + compute infrastructure in Berkeley (5,000+ sq ft, operational March 2026). Houses an Oxford Nanopore Promethion 2 and ~80 instruments across extraction, prep, quantification, and sequencing stages.
- **BioInfoOS** — the compute engine behind BioKEA Works: a curated library of vetted, reproducible bioinformatics tools with a Result Manifest on every run. Also runs the in-house LDC modules (AI-assisted extraction QC, taxonomy reconciliation, FAIR-package validation, draft narrative generation).
- **BioKEA Works** — a connected suite of software (Works, Atlas, Studio, BioInfoOS, Scribe, Press) for the full research lifecycle, currently in closed-testing alpha. Press includes Agentis, an evidence-backed review capability. Droplet and Sequoia are reserved product names with no defined purpose yet. See ${SITE}/works.

## Services (molecular sequencing as a service)

BioKEA offers molecular sequencing as a service out of the Berkeley LDC, targeted at environmental DNA (eDNA) and related customers — conservation nonprofits, state/federal agencies, academic labs, and environmental consultancies.

- **eDNA & metabarcoding** (primary target) — water, soil, and sediment samples through extraction → amplification → quantification → long-read or amplicon sequencing → taxonomic assignment, delivered as a FAIR-compliant data package.
- **DNA barcoding** — Sanger-replacement barcode surveys via amplicon sequencing on the ONT Promethion 2 (COI, 16S, 18S, ITS, rbcL, matK, and custom primers).
- **Long-read microbial genomics** — whole-genome, metagenomic, and hybrid assemblies on the ONT Promethion 2.
- **Specimen screening (arriving early summer 2026)** — high-throughput morphological imaging on DiversityScanner, pipelined into the LDC molecular workflow.
- **Pipeline integration** — bespoke sample-to-claim workflows for partner organizations that need more than a raw FASTQ drop.

### Service offerings (project-rate engagements; see /services to request a quote)

${renderServiceOfferings()}

Full catalog and quote intake: ${SITE}/services · FAQ: ${SITE}/faq

## Team

${renderTeam()}

## Programs & support

BioKEA participates in major cloud and AI infrastructure programs that supply compute, credits, and engineering support behind the LDC and BioInfoOS:

${renderPrograms()}

## Partners

${renderPartners()}

## Six-stage pipeline (soil | water | specimen → verifiable claim)

${renderPipeline()}

## Equipment (LDC · Berkeley)

${renderEquipment()}

Full inventory (~80 items) available on request. Hardware was sourced across 2025–2026 through Bay Area biotech auctions in San Jose, San Francisco, and Berkeley — near-new units acquired at roughly one-tenth retail cost.

## Projects

${renderProjects()}

## Milestones

${renderMilestones()}

## Vocabulary

- **eDNA** = Environmental DNA
- **LDC** = Large Data Collider
- **CIB** = California Institute for Biodiversity
- **SFEI** = San Francisco Estuary Institute
- **FAIR** = Findable, Accessible, Interoperable, Reusable
- **DwC-A** = Darwin Core Archive
- **ONT** = Oxford Nanopore Technologies
- **GBIF** = Global Biodiversity Information Facility
- **NCBI SRA** = NCBI Sequence Read Archive
- **MIxS** = Minimum Information about any (x) Sequence
- **MIEM** = Minimum Information about an Environmental Microbiome
- **AT Protocol** = decentralized social-web protocol underpinning Bluesky
- **MLCD** = Marine Life Conservation District (Hawaii state designation)

## Contact

biokea.ai/contact — partnership / capabilities / funding / BioKEA Works access.
`;

export const GET: APIRoute = () =>
  new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
