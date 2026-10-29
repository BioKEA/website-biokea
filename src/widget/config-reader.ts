// src/widget/config-reader.ts
//
// DOM → ProjectConfig, plus the small amount of branch upkeep that goes
// with reading it: `data-show-when` wrappers, suggested markers, error
// slots and a couple of hint lines. Every helper takes the active branch
// root (`[data-branch="<slug>"]`), because the `data-field` names repeat
// across branches (samples, markers, sampleType, kits, …) and barcoding has
// one `data-field="subs"` group per target. Nothing here holds state; the
// controller in quote-widget.ts owns that.
import {
  markers as markerCatalog,
  sampleTypes,
  suggestedMarkers,
  type MarkerId,
  type MaterialId,
  type ServiceSlug,
  type TargetId,
} from '@/data/configurator';
import type {
  BarcodingConfig,
  MetabarcodingConfig,
  MetagenomicsConfig,
  ProjectConfig,
  TargetedEdnaConfig,
} from '@/lib/pricing/order';
import { esc } from './html';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export const SERVICE_SLUGS: readonly ServiceSlug[] = [
  'barcoding',
  'metabarcoding',
  'metagenomics',
  'targeted-edna',
];
export const isServiceSlug = (v: unknown): v is ServiceSlug =>
  typeof v === 'string' && (SERVICE_SLUGS as readonly string[]).includes(v);

/** Upper bounds from config-schema.ts, applied when a count is committed. */
export const COUNT_MAX: Record<string, number> = {
  samples: 100_000,
  perSample: 1_000,
  count: 1_000_000,
  approxSamples: 1_000_000,
};

const controls = (root: ParentNode, field: string): Control[] =>
  Array.from(root.querySelectorAll<Control>(`[data-field="${field}"]`));

const isToggle = (el: Control): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

/** A field's current values: the checked values of a checkbox/radio group,
 * otherwise the control's value. */
export function fieldValues(root: ParentNode, field: string): string[] {
  return controls(root, field).flatMap((el) =>
    isToggle(el) ? (el.checked ? [el.value] : []) : [el.value],
  );
}

const checked = (root: ParentNode, field: string): string[] =>
  controls(root, field)
    .filter((el) => isToggle(el) && el.checked)
    .map((el) => el.value);
const radio = (root: ParentNode, field: string): string => checked(root, field)[0] ?? '';
const on = (root: ParentNode, field: string): boolean => checked(root, field).length > 0;
const str = (root: ParentNode, field: string): string =>
  (controls(root, field)[0]?.value ?? '').trim();

/** A whole number from a count input; blank or non-positive reads as 0 so
 * validateConfig reports it. */
const num = (root: ParentNode, field: string): number => {
  const n = Math.floor(Number(str(root, field)));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Sets `key` only when the text is non-empty: optional strings are
 * omitted rather than sent as ''. */
function optText<T extends object>(target: T, key: keyof T & string, value: string): void {
  if (value) (target as Record<string, unknown>)[key] = value;
}

const isConsultSampleType = (id: string) => sampleTypes.find((s) => s.id === id)?.consult === true;

function readBarcoding(b: ParentNode): BarcodingConfig {
  const target = str(b, 'target') as TargetId;
  const markers = checked(b, 'markers') as MarkerId[];
  const sampleType = str(b, 'sampleType') as BarcodingConfig['sampleType'];
  const c: BarcodingConfig = {
    service: 'barcoding',
    handling: radio(b, 'handling') === 'idOnly' ? 'idOnly' : 'voucher',
    target,
    markers,
    sampleType,
    samples: num(b, 'samples'),
    preservativeEdna: on(b, 'preservativeEdna'),
    kits: on(b, 'kits'),
  };
  if (target === 'other') optText(c, 'targetOther', str(b, 'targetOther'));
  const wrap = target ? b.querySelector(`[data-subs-for="${CSS.escape(target)}"]`) : null;
  const subs = wrap ? checked(wrap, 'subs') : [];
  if (subs.length) c.subs = subs;
  if (markers.includes('other')) optText(c, 'markerOther', str(b, 'markerOther'));
  if (isConsultSampleType(sampleType)) optText(c, 'sampleOther', str(b, 'sampleOther'));
  if (on(b, 'perSampleOn')) c.perSample = num(b, 'perSample');
  // '' (not omitted) when ticked and blank, so validateConfig flags it.
  if (on(b, 'uniqueOn')) c.uniqueOrganisms = str(b, 'uniqueOrganisms');
  if (target === 'vertebrates') {
    const material = checked(b, 'material') as MaterialId[];
    if (material.length) c.material = material;
    optText(c, 'materialNotes', str(b, 'materialNotes'));
  }
  return c;
}

function readMetabarcoding(b: ParentNode): MetabarcodingConfig {
  const targets = checked(b, 'targets') as TargetId[];
  const markers = checked(b, 'markers') as MarkerId[];
  const sampleType = str(b, 'sampleType') as MetabarcodingConfig['sampleType'];
  const c: MetabarcodingConfig = {
    service: 'metabarcoding',
    targets,
    markers,
    sampleType,
    samples: num(b, 'samples'),
    kits: on(b, 'kits'),
  };
  if (targets.includes('other')) optText(c, 'targetOther', str(b, 'targetOther'));
  const subs: Partial<Record<TargetId, string[]>> = {};
  for (const t of targets) {
    const picked = checked(b, `subs-${t}`);
    if (picked.length) subs[t] = picked;
  }
  if (Object.keys(subs).length) c.subs = subs;
  if (markers.includes('other')) optText(c, 'markerOther', str(b, 'markerOther'));
  if (isConsultSampleType(sampleType)) optText(c, 'sampleOther', str(b, 'sampleOther'));
  return c;
}

function readMetagenomics(b: ParentNode): MetagenomicsConfig {
  const source = radio(b, 'source') === 'environmental' ? 'environmental' : 'specimens';
  const c: MetagenomicsConfig = {
    service: 'metagenomics',
    assays: checked(b, 'assays').filter((a): a is 'mg' | 'mt' => a === 'mg' || a === 'mt'),
    source,
    count: num(b, 'count'),
  };
  if (source === 'environmental') optText(c, 'envNotes', str(b, 'envNotes'));
  return c;
}

const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

function readTargetedEdna(b: ParentNode): TargetedEdnaConfig {
  const c: TargetedEdnaConfig = {
    service: 'targeted-edna',
    species: str(b, 'species'),
    measure: pick(radio(b, 'measure'), ['presence', 'abundance', 'both', 'unsure'], 'unsure'),
    assayExists: pick(radio(b, 'assayExists'), ['yes', 'no', 'unsure'], 'unsure'),
    sampleType: str(b, 'qSampleType'),
  };
  const approx = num(b, 'approxSamples');
  if (approx > 0) c.approxSamples = approx;
  return c;
}

/** The configuration described by one branch, plus the shared directions. */
export function readBranch(
  service: ServiceSlug,
  branch: ParentNode,
  directions: string,
): ProjectConfig {
  const c: ProjectConfig =
    service === 'barcoding'
      ? readBarcoding(branch)
      : service === 'metabarcoding'
        ? readMetabarcoding(branch)
        : service === 'metagenomics'
          ? readMetagenomics(branch)
          : readTargetedEdna(branch);
  optText(c, 'directions', directions.trim());
  return c;
}

/** Unhide each `data-show-when="field=a,b"` wrapper whose field currently
 * has any of the listed values. */
export function syncShowWhen(branch: ParentNode): void {
  branch.querySelectorAll<HTMLElement>('[data-show-when]').forEach((el) => {
    const [field, list = ''] = (el.dataset.showWhen ?? '').split('=');
    const want = list.split(',');
    el.hidden = !fieldValues(branch, field).some((v) => want.includes(v));
  });
}

/** Clamp a committed count to 1..max (blank stays blank, so the inline
 * error can say what's missing). Returns true when the value changed. */
export function clampCount(el: HTMLInputElement): boolean {
  const max = COUNT_MAX[el.dataset.field ?? ''];
  if (max === undefined || el.value.trim() === '') return false;
  const n = Math.floor(Number(el.value));
  const next = String(Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : 1);
  if (next === el.value) return false;
  el.value = next;
  return true;
}

/** The suggested markers for the branch's current target selection. */
export function markerSuggestion(service: ServiceSlug, branch: ParentNode): MarkerId[] {
  if (service !== 'barcoding' && service !== 'metabarcoding') return [];
  const targetIds = (
    service === 'barcoding' ? [str(branch, 'target')].filter(Boolean) : checked(branch, 'targets')
  ) as TargetId[];
  return suggestedMarkers(service, targetIds);
}

export function applyMarkers(branch: ParentNode, ids: MarkerId[]): void {
  controls(branch, 'markers').forEach((el) => {
    if (isToggle(el)) el.checked = ids.includes(el.value as MarkerId);
  });
}

/** "Suggested for your targets: 12S." — plus, once the customer has edited
 * the markers into something else, a way back to the suggestion. */
export function renderMarkerNote(branch: ParentNode, suggested: MarkerId[], touched: boolean) {
  const note = branch.querySelector<HTMLElement>('[data-marker-suggest]');
  if (!note) return;
  if (!suggested.length) {
    note.innerHTML = '';
    return;
  }
  const chosen = checked(branch, 'markers');
  const differs =
    touched && (chosen.length !== suggested.length || suggested.some((m) => !chosen.includes(m)));
  const labels = suggested.map((id) => markerCatalog.find((m) => m.id === id)?.label ?? id);
  note.innerHTML =
    `Suggested for your targets: ${esc(labels.join(', '))}.` +
    (differs
      ? ' Your selection differs from the suggestion. <button type="button" class="bk-linkbtn" data-use-suggested>Use suggested markers</button>'
      : '');
}

/** Hint lines that depend on the current values (not on validity). */
export function syncHints(branch: ParentNode, config: ProjectConfig): void {
  if (config.service === 'metagenomics') {
    const label = branch.querySelector<HTMLElement>('[data-count-label]');
    if (label) {
      label.textContent =
        config.source === 'environmental'
          ? 'Number of environmental samples'
          : 'Number of specimens';
    }
  }
  if (config.service === 'barcoding') {
    const hint = branch.querySelector<HTMLElement>('[data-per-sample-hint]');
    if (hint) {
      const { samples, perSample } = config;
      hint.textContent =
        samples > 0 && perSample
          ? `Up to ${perSample.toLocaleString('en-US')} per sample × ${samples.toLocaleString('en-US')} ${samples === 1 ? 'sample' : 'samples'} = up to ${(samples * perSample).toLocaleString('en-US')} specimens.`
          : '';
    }
  }
}

/** The validateConfig key a control reports under (qPCR's select is the
 * one control whose field name differs from its error key). */
const errorKey = (field: string): string => (field === 'qSampleType' ? 'sampleType' : field);

/** The error keys a customer has touched by interacting with `el`: its own
 * field, plus every field and error slot inside the same `data-show-when`
 * wrapper (ticking "Other" there is what makes "which one?" required). */
export function touchedKeys(el: Element): string[] {
  const keys = new Set<string>();
  const own = (el as HTMLElement).dataset?.field;
  if (own) keys.add(errorKey(own));
  const wrap = el.closest('[data-show-when]');
  wrap?.querySelectorAll<HTMLElement>('[data-field]').forEach((c) => {
    keys.add(errorKey(c.dataset.field ?? ''));
  });
  wrap?.querySelectorAll<HTMLElement>('[data-error-for]').forEach((slot) => {
    keys.add(slot.dataset.errorFor ?? '');
  });
  keys.delete('');
  return [...keys];
}

/** Fill each `[data-error-for]` slot in the branch from `errors` when
 * `show(key)` allows it, clear the rest, and mark the matching
 * text/number/select controls aria-invalid on the same rule. */
export function showErrors(
  branch: ParentNode,
  errors: Record<string, string>,
  show: (key: string) => boolean,
): void {
  const visible = (key: string) => (errors[key] && show(key) ? errors[key] : '');
  branch.querySelectorAll<HTMLElement>('[data-error-for]').forEach((slot) => {
    const msg = visible(slot.dataset.errorFor ?? '');
    slot.textContent = msg;
    slot.hidden = !msg;
  });
  branch.querySelectorAll<Control>('[data-field]').forEach((el) => {
    if (isToggle(el)) return;
    if (visible(errorKey(el.dataset.field ?? ''))) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  });
}
