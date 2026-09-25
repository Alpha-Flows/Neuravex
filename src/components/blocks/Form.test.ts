import { describe, it, expect } from "vitest";
import { submissionKeys } from "@/lib/form-fields";
import { FormField } from "@/types";

const f = (label: string): FormField => ({ label, type: "text", required: false });

describe("submissionKeys", () => {
  it("uses the label as the key", () => {
    expect(submissionKeys([f("Name"), f("Email")])).toEqual(["Name", "Email"]);
  });

  it("numbers repeated labels so neither answer is lost", () => {
    // Two fields both called "Email" used to write to the same key, and the
    // second answer silently replaced the first.
    expect(submissionKeys([f("Email"), f("Email"), f("Email")])).toEqual([
      "Email",
      "Email 2",
      "Email 3",
    ]);
  });

  it("ignores surrounding whitespace when comparing labels", () => {
    expect(submissionKeys([f("Email"), f("  Email  ")])).toEqual(["Email", "Email 2"]);
  });

  it("falls back to a placeholder for an unlabelled field", () => {
    expect(submissionKeys([f(""), f("   ")])).toEqual(["Field", "Field 2"]);
  });
});
