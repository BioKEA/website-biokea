// src/widget/branches.ts
//
// One function per service branch, each returning that branch's fieldsets
// (one helper per fieldset). Every control's `data-field` is a ProjectConfig
// key (see src/lib/pricing/order.ts); conditional blocks use
// `data-show-when`, and error slots use the validateConfig keys. Copy for
// legends, hints, placeholders and errors comes from the order-configurator
// mockup (docs/source/mockups/order-configurator.html).
import {
  markers,
  materials,
  sampleTypes,
  targets,
  vertebrateNotice,
  type ServiceSlug,
  type Target,
} from '@/data/configurator';
import {
  barcodingExtraMarkerFraction,
  ednaAdditionalMarkerPrice,
  samplingKitPrice,
} from '@/data/pricing';
import {
  choice,
  choices,
  errorSlot,
  esc,
  fieldset,
  hint,
  numberInput,
  select,
  showWhen,
  textarea,
  textInput,
} from './html';

type ListService = 'barcoding' | 'metabarcoding';

const targetsFor = (svc: ListService) => targets.filter((t) => t.services.includes(svc));

/** Barcoding only uses the `all` sub-categories; eDNA uses its own, or `all`. */
const subsFor = (t: Target, svc: ListService): string[] =>
  (svc === 'metabarcoding' ? (t.subs?.metabarcoding ?? t.subs?.all) : t.subs?.all) ?? [];

// ── shared by barcoding and metabarcoding ─────────────────────────────

/** "Narrow it down" checkboxes for one target, hidden until it is chosen. */
function subsFieldset(t: Target, svc: ListService): string {
  const subs = subsFor(t, svc);
  if (!subs.length) return '';
  const field = svc === 'barcoding' ? 'subs' : `subs-${t.id}`;
  const when = svc === 'barcoding' ? `target=${t.id}` : `targets=${t.id}`;
  return `<fieldset class="bk-fieldset bk-subs" data-subs-for="${esc(t.id)}" data-show-when="${esc(when)}" hidden>
        <legend class="bk-sublegend">Narrow it down (optional)</legend>
        ${choices(
          'checkbox',
          field,
          subs.map((s) => ({ value: s, label: s })),
        )}
      </fieldset>`;
}

function targetOther(svc: ListService, when: string): string {
  return showWhen(
    when,
    textInput({
      id: `bk-${svc}-target-other`,
      field: 'targetOther',
      label: 'Describe the organisms you’re targeting',
    }),
  );
}

function markerFieldset(svc: ListService): string {
  const priceHint =
    svc === 'barcoding'
      ? `Your first marker is included. Each additional marker adds ${barcodingExtraMarkerFraction * 100}% of your per-specimen rate.`
      : `Your first marker is included. Each additional marker adds $${ednaAdditionalMarkerPrice.academic} per sample (academic) or $${ednaAdditionalMarkerPrice.commercial} (commercial).`;
  const opts = markers.map((m) => ({ value: m.id, label: m.label, desc: m.desc }));
  return fieldset(
    'Genetic markers',
    `${hint(priceHint)}
        ${choices('checkbox', 'markers', opts)}
        <p class="bk-hint" data-marker-suggest></p>
        ${errorSlot('markers')}
        ${showWhen(
          'markers=other',
          textInput({
            id: `bk-${svc}-marker-other`,
            field: 'markerOther',
            label: 'Which marker?',
            placeholder: 'For example, rbcL or 23S',
          }),
          'bk-field bk-field--nested',
        )}`,
  );
}

function sampleTypeField(svc: ListService): string {
  return `<div class="bk-field">
        ${select({
          id: `bk-${svc}-sample-type`,
          field: 'sampleType',
          label: 'Sample type',
          options: sampleTypes.map((s) => ({ value: s.id, label: s.label })),
        })}
        ${sampleTypes
          .filter((s) => s.hints?.[svc])
          .map((s) => hint(s.hints![svc]!, `data-show-when="sampleType=${esc(s.id)}" hidden`))
          .join('\n        ')}
        ${hint('No problem. Tell us what you know and we’ll help you choose.', 'data-show-when="sampleType=unknown" hidden')}
      </div>
      ${showWhen(
        'sampleType=other,unknown',
        textarea({
          id: `bk-${svc}-sample-other`,
          field: 'sampleOther',
          label: 'Tell us about your samples',
          placeholder: 'What you’re collecting, where, and how',
        }),
      )}`;
}

function kitsFieldset(svc: ListService): string {
  return fieldset(
    'Sampling kits',
    choice('checkbox', 'kits', {
      value: 'on',
      label: `Add sampling kits ($${samplingKitPrice} each; confirmed with you before payment)`,
      desc:
        svc === 'metabarcoding'
          ? 'One kit per sample.'
          : 'One kit per sample you’ll send (bag, tube, or trap).',
    }),
  );
}

// ── barcoding ─────────────────────────────────────────────────────────

function handlingFieldset(): string {
  return fieldset(
    'Specimen handling',
    `<div class="bk-choices bk-choices--2">
        ${choices('radio', 'handling', [
          {
            value: 'voucher',
            label: 'Voucher-linked',
            desc: 'Specimen preserved and imaged',
            checked: true,
          },
          { value: 'idOnly', label: 'Identification only', desc: 'DNA ID, voucher not retained' },
        ])}
        </div>`,
  );
}

function singleTargetField(): string {
  const list = targetsFor('barcoding');
  return `<div class="bk-field">
        ${select({
          id: 'bk-barcoding-target',
          field: 'target',
          label: 'Target organism',
          options: list.map((t) => ({ value: t.id, label: t.label })),
        })}
      </div>
      ${list.map((t) => subsFieldset(t, 'barcoding')).join('')}
      ${targetOther('barcoding', 'target=other')}`;
}

function barcodingSamplesField(): string {
  return `<div class="bk-field">
        ${numberInput({
          id: 'bk-barcoding-samples',
          field: 'samples',
          label: 'How many samples will you send (bags, tubes, or traps)?',
          hint: 'A single sample can hold many specimens.',
        })}
      </div>`;
}

function selectionFieldset(): string {
  return fieldset(
    'Specimen selection and barcoding',
    `<p class="bk-subhead">Specimens to barcode per sample</p>
        <div class="bk-inline-row">
          <label class="bk-inline-check">
            <input type="checkbox" name="bk-perSampleOn" value="on" data-field="perSampleOn" checked />
            <span>Barcode up to</span>
          </label>
          <input type="number" id="bk-barcoding-per-sample" data-field="perSample" min="1" step="1" inputmode="numeric" class="bk-input bk-input--num" aria-label="Maximum organisms to barcode in each sample" />
          <label for="bk-barcoding-per-sample">organisms in each sample</label>
        </div>
        ${showWhen(
          'perSampleOn=on',
          `<p class="bk-hint" data-per-sample-hint></p>
        ${errorSlot('perSample')}`,
          'bk-field bk-field--tight',
        )}
        ${choice('checkbox', 'uniqueOn', { value: 'on', label: 'Focus on unique organisms' })}
        ${showWhen(
          'uniqueOn=on',
          textarea({
            id: 'bk-barcoding-unique',
            field: 'uniqueOrganisms',
            label: 'Describe your requested study design',
            placeholder:
              'For example, one specimen of each distinct type per sample, or only taxa missing from reference databases',
          }),
          'bk-field bk-field--nested',
        )}`,
  );
}

function addonsFieldset(): string {
  return fieldset(
    'Add-ons',
    choice('checkbox', 'preservativeEdna', {
      value: 'on',
      label: 'Bulk eDNA from the sample preservative',
      desc: 'Detects taxa too small, damaged, or missed at sorting. Priced per sample at eDNA metabarcoding rates, using the same markers.',
    }),
  );
}

function materialFieldset(): string {
  return `<fieldset class="bk-fieldset" data-show-when="target=vertebrates" hidden>
        <legend class="bk-step-legend">What material will you collect from the animals?</legend>
        <p class="bk-callout bk-callout--ochre">${esc(vertebrateNotice)}</p>
        ${choices(
          'checkbox',
          'material',
          materials.map((m) => ({ value: m.id, label: m.label })),
        )}
        ${errorSlot('material')}
        <div class="bk-field">
          ${textarea({
            id: 'bk-barcoding-material-notes',
            field: 'materialNotes',
            label: 'Comments',
            placeholder:
              'For example, which species, how you’ll collect, and whether the animals are live, deceased, or museum specimens',
          })}
          ${hint('Required when you choose Other: describe the other material.', 'data-show-when="material=other" hidden')}
        </div>
      </fieldset>`;
}

export function barcodingBranch(): string {
  return [
    handlingFieldset(),
    singleTargetField(),
    markerFieldset('barcoding'),
    sampleTypeField('barcoding'),
    barcodingSamplesField(),
    selectionFieldset(),
    addonsFieldset(),
    materialFieldset(),
    kitsFieldset('barcoding'),
  ].join('\n      ');
}

// ── eDNA metabarcoding ────────────────────────────────────────────────

function multiTargetFieldset(): string {
  const list = targetsFor('metabarcoding');
  const rows = list
    .map(
      (t) =>
        `${choice('checkbox', 'targets', { value: t.id, label: t.label })}
        ${subsFieldset(t, 'metabarcoding')}`,
    )
    .join('\n        ');
  return fieldset(
    'Target organisms',
    `${hint('Choose all that apply.')}
        ${rows}
        ${errorSlot('targets')}
        ${targetOther('metabarcoding', 'targets=other')}`,
  );
}

function metabarcodingSamplesField(): string {
  return `<div class="bk-field">
        ${numberInput({
          id: 'bk-metabarcoding-samples',
          field: 'samples',
          label: 'Number of samples',
          hint: 'Priced per sample, with lower rates at higher volumes.',
        })}
      </div>`;
}

export function metabarcodingBranch(): string {
  return [
    multiTargetFieldset(),
    markerFieldset('metabarcoding'),
    sampleTypeField('metabarcoding'),
    metabarcodingSamplesField(),
    kitsFieldset('metabarcoding'),
  ].join('\n      ');
}

// ── metagenomics ──────────────────────────────────────────────────────

function assaysFieldset(): string {
  return fieldset(
    'Sequencing type',
    `${choices('checkbox', 'assays', [
      {
        value: 'mg',
        label: 'Metagenome',
        desc: 'All the DNA in a specimen: the organism plus its microbiome, symbionts, and pathogens',
      },
      {
        value: 'mt',
        label: 'Metatranscriptome',
        desc: 'RNA sequencing that shows which genes the specimen and its microbes are actively using',
      },
    ])}
        <p class="bk-callout bk-callout--ochre" data-show-when="assays=mt" hidden>Metatranscriptomes need specimens preserved for RNA, such as flash-frozen or stored in an RNA preservative. Ethanol-preserved specimens may not work. Ask us if you’re unsure.</p>
        ${errorSlot('assays')}`,
  );
}

function sourceFieldset(): string {
  return fieldset(
    'What will you send?',
    `<div class="bk-choices bk-choices--2">
        ${choices('radio', 'source', [
          {
            value: 'specimens',
            label: 'Single specimens',
            desc: 'One organism per sample',
            checked: true,
          },
          {
            value: 'environmental',
            label: 'Environmental samples',
            desc: 'Water, soil, or similar, by consultation',
          },
        ])}
        </div>
        ${showWhen(
          'source=environmental',
          textarea({
            id: 'bk-metagenomics-env-notes',
            field: 'envNotes',
            label: 'Describe your environmental samples',
            placeholder:
              'Sample type, how it was collected and preserved, and what you want to learn',
          }),
        )}`,
  );
}

function metagenomicsCountField(): string {
  // The controller swaps the label to "Number of environmental samples"
  // when the source is environmental.
  return `<div class="bk-field">
        ${numberInput({
          id: 'bk-metagenomics-count',
          field: 'count',
          label: 'Number of specimens',
          hint: 'Priced per specimen.',
          labelAttrs: 'data-count-label',
        })}
      </div>`;
}

export function metagenomicsBranch(): string {
  return [assaysFieldset(), sourceFieldset(), metagenomicsCountField()].join('\n      ');
}

// ── targeted eDNA (qPCR) ──────────────────────────────────────────────

function qpcrIntro(): string {
  return `<p class="bk-callout">We specialize in applying qPCR to measure the presence and abundance of species in a variety of sample types, and in developing custom assays for species of interest. Tell us about your project and we’ll prepare a custom quote.</p>
      <div class="bk-field">
        ${textarea({
          id: 'bk-qpcr-species',
          field: 'species',
          label: 'Species of interest',
          placeholder: 'One or more species, for example an invasive mussel or a native salmon',
        })}
      </div>`;
}

function measureFieldset(): string {
  return fieldset(
    'What do you want to measure?',
    choices('radio', 'measure', [
      { value: 'presence', label: 'Presence or absence' },
      { value: 'abundance', label: 'Relative abundance' },
      { value: 'both', label: 'Presence and abundance' },
      { value: 'unsure', label: 'Not sure yet', checked: true },
    ]),
  );
}

function assayExistsFieldset(): string {
  return fieldset(
    'Is there an existing qPCR assay for your species?',
    choices('radio', 'assayExists', [
      { value: 'yes', label: 'Yes, a published or established assay' },
      { value: 'no', label: 'No, it needs a custom assay' },
      { value: 'unsure', label: 'Not sure', checked: true },
    ]),
  );
}

function qpcrSampleFields(): string {
  // Free-text sample type on the config, so the option values are the labels.
  const types = ['Water', 'Soil or sediment', 'Air', 'Tissue or swabs', 'Other'];
  return `<div class="bk-field">
        ${select({
          id: 'bk-qpcr-sample-type',
          field: 'qSampleType',
          errorFor: 'sampleType',
          label: 'Sample type',
          options: types.map((t) => ({ value: t, label: t })),
        })}
      </div>
      <div class="bk-field">
        ${numberInput({
          id: 'bk-qpcr-approx-samples',
          field: 'approxSamples',
          label: 'Approximate number of samples (optional)',
        })}
      </div>`;
}

export function targetedEdnaBranch(): string {
  return [qpcrIntro(), measureFieldset(), assayExistsFieldset(), qpcrSampleFields()].join(
    '\n      ',
  );
}

export const branches: Record<ServiceSlug, () => string> = {
  barcoding: barcodingBranch,
  metabarcoding: metabarcodingBranch,
  metagenomics: metagenomicsBranch,
  'targeted-edna': targetedEdnaBranch,
};
