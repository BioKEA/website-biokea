// src/widget/html.ts
//
// String-building primitives shared by template.ts and branches.ts: the
// escaper and one helper per kind of form control. Each control carries the
// `data-field` hook the controller reads (named after the ProjectConfig key),
// and radio/checkbox groups share `name="bk-<field>"`.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-escape any interpolated copy. Catalog data is ours, but it is still
 * content, and the same helper guards customer text echoed into the quote. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export interface Option {
  value: string;
  label: string;
  desc?: string;
  checked?: boolean;
}

/** A radio or checkbox inside a label, with an optional muted description. */
export function choice(type: 'radio' | 'checkbox', field: string, o: Option): string {
  const desc = o.desc ? `<span class="bk-choice-desc">${esc(o.desc)}</span>` : '';
  return `<label class="bk-choice">
          <input type="${type}" name="bk-${esc(field)}" value="${esc(o.value)}" data-field="${esc(field)}"${o.checked ? ' checked' : ''} />
          <span class="bk-choice-text"><span class="bk-choice-title">${esc(o.label)}</span>${desc}</span>
        </label>`;
}

export const choices = (type: 'radio' | 'checkbox', field: string, opts: Option[]): string =>
  opts.map((o) => choice(type, field, o)).join('\n        ');

/** Inline error slot; the controller fills and un-hides it. */
export const errorSlot = (field: string): string =>
  `<p class="bk-error" data-error-for="${esc(field)}" role="alert" hidden></p>`;

export const hint = (text: string, attrs = ''): string =>
  `<p class="bk-hint"${attrs ? ' ' + attrs : ''}>${esc(text)}</p>`;

/** A fieldset with a bold legend. */
export function fieldset(legend: string, body: string, attrs = ''): string {
  return `<fieldset class="bk-fieldset"${attrs ? ' ' + attrs : ''}>
        <legend class="bk-step-legend">${esc(legend)}</legend>
        ${body}
      </fieldset>`;
}

/** A conditional block the controller shows when `when` ("field=value", or
 * "field=a,b" for any of several values) holds. Hidden until then. */
export const showWhen = (when: string, body: string, cls = 'bk-field'): string =>
  `<div class="${cls}" data-show-when="${esc(when)}" hidden>
        ${body}
      </div>`;

interface ControlOpts {
  /** Unique element id for the label's `for`. */
  id: string;
  field: string;
  label: string;
  placeholder?: string;
  hint?: string;
  /** The validateConfig key, when it differs from `field`. */
  errorFor?: string;
  /** Extra attributes for the label, e.g. a hook the controller rewrites. */
  labelAttrs?: string;
}

const placeholder = (p?: string) => (p ? ` placeholder="${esc(p)}"` : '');
const extra = (a?: string) => (a ? ' ' + a : '');

function labelled(o: ControlOpts, control: string): string {
  return `<label class="bk-label" for="${esc(o.id)}"${extra(o.labelAttrs)}>${esc(o.label)}</label>
        ${control}${o.hint ? '\n        ' + hint(o.hint) : ''}\n        ${errorSlot(o.errorFor ?? o.field)}`;
}

export function textInput(o: ControlOpts): string {
  return labelled(
    o,
    `<input type="text" id="${esc(o.id)}" data-field="${esc(o.field)}" class="bk-input bk-input--block"${placeholder(o.placeholder)} />`,
  );
}

export function numberInput(o: ControlOpts): string {
  return labelled(
    o,
    `<input type="number" id="${esc(o.id)}" data-field="${esc(o.field)}" min="1" step="1" inputmode="numeric" class="bk-input bk-input--num" />`,
  );
}

export function textarea(o: ControlOpts): string {
  return labelled(
    o,
    `<textarea id="${esc(o.id)}" data-field="${esc(o.field)}" rows="3" class="bk-input bk-input--block"${placeholder(o.placeholder)}></textarea>`,
  );
}

export function select(o: ControlOpts & { options: Option[] }): string {
  const opts = [{ value: '', label: 'Choose one' }, ...o.options]
    .map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)
    .join('');
  return labelled(
    o,
    `<select id="${esc(o.id)}" data-field="${esc(o.field)}" class="bk-input bk-input--block">${opts}</select>`,
  );
}
