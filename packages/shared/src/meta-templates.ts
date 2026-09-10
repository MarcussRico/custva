/**
 * Translation between Custva's templates and Meta's Message Templates API.
 *
 * Two vocabularies have to be kept apart:
 *
 *   - What a merchant writes and reads: "Brownie Day 3", body containing
 *     `{{name}}` and `{{shop_name}}`. Readable, editable, theirs.
 *   - What Meta will accept: a lowercase snake_case name, and a body whose
 *     placeholders are positional — `{{1}}`, `{{2}}`.
 *
 * Sending `templates.name` straight to Meta, which is what the code did before,
 * fails for every template that has ever been given a human name. The worker
 * already resolves named tokens to positional parameters in order of
 * appearance, so the conversion here is deliberately the same ordering — the
 * registered body and the sent parameters line up by construction.
 */

export const META_TEMPLATE = {
  maxNameLength: 512,
  /** Meta's own categories. Marketing is the one that costs per conversation. */
  categories: ["MARKETING", "UTILITY", "AUTHENTICATION"] as const,
  approvedStatus: "APPROVED",
} as const;

export type MetaTemplateCategory = (typeof META_TEMPLATE.categories)[number];

export type MetaTemplateStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED";

/**
 * Meta permits lowercase letters, digits and underscores only. This is
 * deterministic on purpose: the same Custva template must always map to the
 * same Meta name, or a resubmission creates a duplicate instead of updating.
 */
export function toMetaTemplateName(
  merchantFacingName: string,
  suffix?: string,
): string {
  const base = merchantFacingName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

  const withSuffix = suffix ? `${base}_${suffix.toLowerCase()}` : base;
  const safe = withSuffix.replace(/[^a-z0-9_]/g, "").slice(0, META_TEMPLATE.maxNameLength);

  /* A name that reduced to nothing — "☕☕☕" — still needs to be submittable. */
  return safe || "custva_template";
}

export interface ConvertedBody {
  /** Body with `{{1}}`, `{{2}}` … ready to register with Meta. */
  metaBody: string;
  /** Named placeholders in positional order: index 0 fills `{{1}}`. */
  variableOrder: string[];
}

/**
 * `Hi {{name}}, welcome to {{shop_name}}` becomes
 * `Hi {{1}}, welcome to {{2}}` with order `["name", "shop_name"]`.
 *
 * A placeholder repeated in the body reuses its first position, because Meta
 * expects one parameter per distinct index, not per occurrence.
 */
export function toMetaBody(body: string): ConvertedBody {
  const order: string[] = [];
  const metaBody = body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    /* Already positional — leave it alone rather than double-converting. */
    if (/^\d+$/.test(key)) return `{{${key}}}`;
    let index = order.indexOf(key);
    if (index === -1) {
      order.push(key);
      index = order.length - 1;
    }
    return `{{${index + 1}}}`;
  });
  return { metaBody, variableOrder: order };
}

export interface TemplateProblem {
  field: "name" | "body" | "header" | "footer" | "buttons";
  issue: string;
}

/**
 * Catch the rejections we can predict, before submitting.
 *
 * Meta's review is slow and its rejection reasons are terse, so every problem
 * caught here is a review cycle saved. These are Meta's documented structural
 * rules — not a guess at what a human reviewer will think of the copy.
 */
export function validateTemplateForMeta(input: {
  name: string;
  body: string;
  headerText?: string | null;
  footerText?: string | null;
  buttons?: Array<{ type: string; text: string }>;
}): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const { metaBody } = toMetaBody(input.body);

  if (!input.body.trim()) {
    problems.push({ field: "body", issue: "Body cannot be empty." });
  }

  /* Meta rejects a body that begins or ends with a variable — there is no
     surrounding text to give the placeholder meaning. */
  if (/^\s*\{\{\d+\}\}/.test(metaBody)) {
    problems.push({
      field: "body",
      issue: "Body cannot start with a variable. Put a word before it.",
    });
  }
  if (/\{\{\d+\}\}\s*$/.test(metaBody)) {
    problems.push({
      field: "body",
      issue: "Body cannot end with a variable. Put a word after it.",
    });
  }

  /* Two adjacent variables give the reviewer nothing to read between them. */
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(metaBody)) {
    problems.push({
      field: "body",
      issue: "Two variables cannot sit next to each other. Add text between them.",
    });
  }

  if (input.headerText && /\{\{/.test(input.headerText)) {
    const headerVars = input.headerText.match(/\{\{[^}]+\}\}/g) ?? [];
    if (headerVars.length > 1) {
      problems.push({
        field: "header",
        issue: "A header may contain at most one variable.",
      });
    }
  }

  if (input.footerText && /\{\{/.test(input.footerText)) {
    problems.push({
      field: "footer",
      issue: "Footers cannot contain variables.",
    });
  }

  if (input.headerText && input.headerText.length > 60) {
    problems.push({ field: "header", issue: "Header must be 60 characters or fewer." });
  }
  if (input.footerText && input.footerText.length > 60) {
    problems.push({ field: "footer", issue: "Footer must be 60 characters or fewer." });
  }
  if (input.body.length > 1024) {
    problems.push({ field: "body", issue: "Body must be 1024 characters or fewer." });
  }

  const metaName = toMetaTemplateName(input.name);
  if (!/^[a-z0-9_]+$/.test(metaName)) {
    problems.push({ field: "name", issue: "Name could not be reduced to a valid Meta name." });
  }

  return problems;
}

export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE";
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Array<Record<string, unknown>>;
}

/**
 * Build the `components` array Meta's create-template endpoint expects.
 *
 * `example` is not optional in practice: Meta rejects templates with variables
 * and no sample values, because a reviewer cannot judge a message they cannot
 * read.
 */
export function buildMetaTemplateComponents(input: {
  body: string;
  headerText?: string | null;
  headerImageHandle?: string | null;
  footerText?: string | null;
  buttons?: Array<{ type: string; text: string; value?: string }>;
  sampleValues?: Record<string, string>;
}): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = [];
  const { metaBody, variableOrder } = toMetaBody(input.body);

  if (input.headerImageHandle) {
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [input.headerImageHandle] },
    });
  } else if (input.headerText) {
    const header = toMetaBody(input.headerText);
    const component: MetaTemplateComponent = {
      type: "HEADER",
      format: "TEXT",
      text: header.metaBody,
    };
    if (header.variableOrder.length) {
      component.example = {
        header_text: header.variableOrder.map(
          (key) => input.sampleValues?.[key] ?? sampleFor(key),
        ),
      };
    }
    components.push(component);
  }

  const bodyComponent: MetaTemplateComponent = { type: "BODY", text: metaBody };
  if (variableOrder.length) {
    bodyComponent.example = {
      body_text: [variableOrder.map((key) => input.sampleValues?.[key] ?? sampleFor(key))],
    };
  }
  components.push(bodyComponent);

  if (input.footerText) {
    components.push({ type: "FOOTER", text: input.footerText });
  }

  if (input.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((b) =>
        b.type === "url"
          ? { type: "URL", text: b.text, url: b.value ?? "https://custva.com" }
          : { type: "QUICK_REPLY", text: b.text },
      ),
    });
  }

  return components;
}

function sampleFor(key: string): string {
  switch (key) {
    case "name":
      return "Priya";
    case "shop_name":
      return "Filter Room";
    default:
      return "example";
  }
}
