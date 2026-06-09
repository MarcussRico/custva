export function normalizeIndiaMobile(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (input.startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }
  throw new Error("Invalid Indian mobile number");
}

export function isValidIndiaMobile(input: string): boolean {
  try {
    const normalized = normalizeIndiaMobile(input);
    return /^\+91[6-9]\d{9}$/.test(normalized);
  } catch {
    return false;
  }
}
