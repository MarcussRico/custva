export interface TemplateButton {
  type: "url" | "phone" | "quick_reply";
  text: string;
  value: string;
}

export interface GlobalTemplate {
  id: string;
  name: string;
  body: string;
  headerText: string | null;
  headerImageUrl: string | null;
  footerText: string | null;
  buttons: TemplateButton[];
  languageCode: string;
  version: number;
  assignedCount?: number;
  isStarterPack: boolean;
  archivedAt: string | null;
}

export interface TemplateAssignment {
  copyId: string;
  merchantId: string;
  shopName: string;
  sourceVersion: number;
  globalVersion: number;
  isLocallyModified: boolean;
  hasVersionDrift: boolean;
}

export interface TemplateFormState {
  name: string;
  headerText: string;
  headerImageUrl: string;
  body: string;
  footerText: string;
  languageCode: string;
  buttons: TemplateButton[];
  isStarterPack: boolean;
}

export const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: "",
  headerText: "",
  headerImageUrl: "",
  body: "",
  footerText: "",
  languageCode: "en",
  buttons: [],
  isStarterPack: false
};

export function templateToForm(t: GlobalTemplate): TemplateFormState {
  return {
    name: t.name,
    headerText: t.headerText ?? "",
    headerImageUrl: t.headerImageUrl ?? "",
    body: t.body,
    footerText: t.footerText ?? "",
    languageCode: t.languageCode ?? "en",
    buttons: Array.isArray(t.buttons) ? t.buttons : [],
    isStarterPack: t.isStarterPack
  };
}
