/**
 * The languages a code block can say it is written in.
 *
 * The block stores whatever it was given — an agent writing through the MCP
 * server is as likely to say "sh" or "Rust" as anything on this list, and
 * refusing a language nobody here has heard of would throw away the label the
 * author meant the reader to see. So the stored value stays free text, and
 * this list does two smaller jobs: it is what the panel offers, and it turns
 * the ids it knows into the name a reader expects in the corner of a sample
 * ("JavaScript", not "javascript"). A value it does not know is shown as it
 * was written.
 */

export interface CodeLanguage {
  value: string;
  label: string;
}

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { value: "", label: "Plain text" },
  { value: "bash", label: "Shell" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "xml", label: "XML" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "toml", label: "TOML" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "diff", label: "Diff" },
];

/**
 * The ways of saying "no language in particular". A sample marked `text` is
 * not one that wants the word "text" printed above it.
 */
const PLAIN = new Set(["", "text", "txt", "plain", "plaintext", "none"]);

/** The key a language is looked up by: trimmed, lower-case. */
export function languageKey(language: string | undefined | null): string {
  return typeof language === "string" ? language.trim().toLowerCase() : "";
}

/** What the reader sees in the header bar, or "" for none. */
export function languageLabel(language: string | undefined | null): string {
  const key = languageKey(language);
  if (PLAIN.has(key)) return "";
  const known = CODE_LANGUAGES.find((l) => l.value === key);
  return known ? known.label : (language ?? "").trim();
}
