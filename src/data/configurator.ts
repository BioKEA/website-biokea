import { priceRange, pricedServices, metagenomics, targetedEdna } from '@/data/pricing';

export type ServiceSlug = 'barcoding' | 'metabarcoding' | 'metagenomics' | 'targeted-edna';
export type TargetId =
  | 'bacteria'
  | 'phytoplankton'
  | 'microeuk'
  | 'invertebrates'
  | 'vertebrates'
  | 'fungi'
  | 'other';
export type MarkerId = 'COI' | '12S' | '16S' | '18S' | 'ITS' | 'other';
export type SampleTypeId = 'water' | 'soil' | 'net' | 'other' | 'unknown';
export type MaterialId = 'swabs' | 'hair' | 'feces' | 'other';

export interface ServiceChoice {
  slug: ServiceSlug;
  title: string;
  tagline: string;
  priceLine: string;
}

export interface Target {
  id: TargetId;
  label: string;
  services: ServiceSlug[];
  marker?: Partial<Record<ServiceSlug, MarkerId>>;
  subs?: { all?: string[]; metabarcoding?: string[] };
  /**
   * Per-service marker overrides for individual subgroups, keyed by the
   * subgroup's label. A chosen subgroup without an entry falls back to
   * `marker`.
   */
  subMarkers?: Partial<Record<ServiceSlug, Record<string, MarkerId>>>;
  consult?: true;
}

export interface Marker {
  id: MarkerId;
  label: string;
  desc: string;
  consult?: true;
}

export interface SampleType {
  id: SampleTypeId;
  label: string;
  hints?: Partial<Record<ServiceSlug, string>>;
  consult?: true;
}

export interface Material {
  id: MaterialId;
  label: string;
}

const bySlug = (slug: string) => {
  const svc = pricedServices.find((s) => s.slug === slug);
  if (!svc) throw new Error(`Unknown priced service: ${slug}`);
  return svc;
};

/** "$6–$20 per specimen", from the rate card so it can never drift. */
function priceLine(slug: string): string {
  const r = priceRange(slug);
  if (!r) return 'Custom quote';
  return `$${r.min.toLocaleString('en-US')}–$${r.max.toLocaleString('en-US')} per ${r.unit}`;
}

export const serviceChoices: ServiceChoice[] = [
  {
    slug: 'barcoding',
    title: bySlug('barcoding').title,
    tagline: bySlug('barcoding').tagline,
    priceLine: priceLine('barcoding'),
  },
  {
    slug: 'metabarcoding',
    title: bySlug('metabarcoding').title,
    tagline: bySlug('metabarcoding').tagline,
    priceLine: priceLine('metabarcoding'),
  },
  {
    slug: 'metagenomics',
    title: metagenomics.title,
    tagline: metagenomics.tagline,
    priceLine: priceLine('metagenomics'),
  },
  {
    slug: 'targeted-edna',
    title: targetedEdna.title,
    tagline: targetedEdna.tagline,
    priceLine: priceLine('targeted-edna'),
  },
];

// Mockup service ids: edna -> metabarcoding. Keys of `marker` are service slugs.
export const targets: Target[] = [
  {
    id: 'bacteria',
    label: 'Bacteria and archaea',
    services: ['metabarcoding'],
    marker: { metabarcoding: '16S' },
    subs: {
      metabarcoding: [
        'Whole bacterial and archaeal community',
        'Indicator or pathogen-associated taxa',
      ],
    },
  },
  {
    id: 'phytoplankton',
    label:
      'Phytoplankton (diatoms, dinoflagellates, cyanobacteria, green algae, haptophytes, harmful algal bloom species)',
    services: ['metabarcoding'],
    marker: { metabarcoding: '18S' },
  },
  {
    id: 'microeuk',
    label: 'Microeukaryotes (ciliates, flagellates, amoebae, parasitic protists, oomycetes)',
    services: ['metabarcoding'],
    marker: { metabarcoding: '18S' },
  },
  {
    id: 'invertebrates',
    label: 'Invertebrates (plankton, insects, worms, etc.)',
    services: ['barcoding', 'metabarcoding'],
    marker: { barcoding: 'COI', metabarcoding: 'COI' },
    subs: {
      all: [
        'Aquatic zooplankton (copepods, rotifers)',
        'Macrobenthos (amphipods, bivalves)',
        'Insects (beetles, flies)',
        'Arachnids (spiders, mites)',
        'Worms and annelids (earthworms, polychaetes)',
        'Crustaceans (crabs, isopods)',
        'Mollusks (snails, clams)',
        'Cnidarians (corals, jellyfish)',
        'Echinoderms (sea stars, sea urchins)',
        'Myriapods (centipedes, millipedes)',
      ],
    },
  },
  {
    id: 'vertebrates',
    label: 'Vertebrates (non-human)',
    services: ['barcoding', 'metabarcoding'],
    marker: { barcoding: 'COI', metabarcoding: '12S' },
    // Sean, 2026-10-29: barcoding suggestions depend on the subgroup — 12S
    // for fish (sharks and rays included), COI for every other vertebrate.
    subMarkers: { barcoding: { Fish: '12S', 'Sharks and rays': '12S' } },
    subs: {
      all: [
        'Fish',
        'Sharks and rays',
        'Amphibians',
        'Reptiles',
        'Birds',
        'Mammals',
        'Ungulates (hoofed mammals)',
        'Marine mammals',
        'Bats',
      ],
    },
  },
  {
    id: 'fungi',
    label: 'Fungi',
    services: ['barcoding', 'metabarcoding'],
    marker: { barcoding: 'ITS', metabarcoding: 'ITS' },
    subs: {
      metabarcoding: [
        'Mycorrhizal fungi',
        'Plant pathogens',
        'Decomposers',
        'Yeasts and molds',
        'Aquatic fungi',
      ],
    },
  },
  { id: 'other', label: 'Other', services: ['barcoding', 'metabarcoding'], consult: true },
];

export const markers: Marker[] = [
  { id: 'COI', label: 'COI', desc: 'Animals, especially invertebrates' },
  { id: '12S', label: '12S', desc: 'Vertebrates, especially fish' },
  { id: '16S', label: '16S rRNA', desc: 'Bacteria and archaea' },
  { id: '18S', label: '18S', desc: 'Eukaryotes broadly, including plankton and protists' },
  { id: 'ITS', label: 'ITS', desc: 'Fungi' },
  { id: 'other', label: 'Other marker', desc: 'Tell us which one', consult: true },
];

export const sampleTypes: SampleType[] = [
  {
    id: 'water',
    label: 'Water',
    hints: {
      barcoding: 'Aquatic specimens, such as plankton tows.',
      metabarcoding: 'Filtered water from streams, lakes, or the ocean.',
    },
  },
  {
    id: 'soil',
    label: 'Soil',
    hints: {
      barcoding: 'Invertebrates extracted from soil or leaf litter.',
      metabarcoding: 'Soil or sediment.',
    },
  },
  {
    id: 'net',
    label: 'Net-collected',
    hints: {
      barcoding: 'Insects or other invertebrates from nets or traps.',
      metabarcoding: 'Bulk net or trap contents, analyzed as a whole community.',
    },
  },
  { id: 'other', label: 'Other', consult: true },
  { id: 'unknown', label: 'Unknown', consult: true },
];

export const materials: Material[] = [
  { id: 'swabs', label: 'Swabs (buccal or skin)' },
  { id: 'hair', label: 'Hair with follicles' },
  { id: 'feces', label: 'Feces' },
  { id: 'other', label: 'Other' },
];

export const vertebrateNotice =
  'Please use methods that don’t harm live animals, such as swabs, hair with follicles, or feces. Collection from live animals should follow your institution’s animal care requirements and any permits that apply.';

/**
 * Markers to pre-select, unique, in selection order. Each chosen target
 * contributes its marker for this service; when subgroups of it are chosen,
 * each subgroup contributes its own override (`subMarkers`) or, failing
 * that, the target's marker. Barcoding defaults to COI; eDNA to none.
 */
export function suggestedMarkers(
  service: ServiceSlug,
  targetIds: TargetId[],
  subs: Partial<Record<TargetId, string[]>> = {},
): MarkerId[] {
  const out: MarkerId[] = [];
  const add = (m: MarkerId | undefined) => {
    if (m && !out.includes(m)) out.push(m);
  };
  for (const id of targetIds) {
    const t = targets.find((x) => x.id === id);
    const picked = subs[id] ?? [];
    if (picked.length === 0) add(t?.marker?.[service]);
    for (const sub of picked) add(t?.subMarkers?.[service]?.[sub] ?? t?.marker?.[service]);
  }
  if (out.length === 0 && service === 'barcoding') return ['COI'];
  return out;
}
