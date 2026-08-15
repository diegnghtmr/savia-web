import { draftFromForm } from "../src/lib/onboarding-draft";

const complete: Record<string, string> = {
  email: "ana@savia.test",
  displayName: "Ana",
  locale: "es-CO",
  countryCode: "CO",
  timezone: "America/Bogota",
  dateFormat: "DD/MM/YYYY",
  weekStartsOn: "1",
  numberFormat: "1.234,56",
  defaultCurrency: "COP",
  workspaceName: "Casa",
  baseCurrency: "COP",
};

function formOf(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...complete, ...overrides }))
    form.set(name, value);
  return form;
}

function violationsOf(form: FormData): readonly string[] {
  const submitted = draftFromForm(form);
  if (submitted.ok) throw new Error("the submission was unexpectedly accepted");
  return submitted.violations.map((violation) => violation.field);
}

describe("reading an onboarding submission", () => {
  it("maps a complete submission to the typed draft", () => {
    const submitted = draftFromForm(formOf());

    expect(submitted).toEqual({
      ok: true,
      draft: {
        email: "ana@savia.test",
        displayName: "Ana",
        locale: "es-CO",
        countryCode: "CO",
        timezone: "America/Bogota",
        dateFormat: "DD/MM/YYYY",
        weekStartsOn: 1,
        numberFormat: "1.234,56",
        defaultCurrency: "COP",
        workspaceName: "Casa",
        baseCurrency: "COP",
        privacyModeEnabled: false,
      },
    });
  });

  it("reads privacy mode as enabled only when the checkbox was sent", () => {
    const form = formOf();
    form.set("privacyModeEnabled", "on");
    const submitted = draftFromForm(form);

    expect(submitted.ok && submitted.draft.privacyModeEnabled).toBe(true);
  });

  it("trims the whitespace a browser keeps and a pattern would reject", () => {
    const submitted = draftFromForm(formOf({ countryCode: "  CO  " }));

    expect(submitted.ok && submitted.draft.countryCode).toBe("CO");
  });

  it("rejects a value outside a set this form itself renders", () => {
    expect(violationsOf(formOf({ dateFormat: "DD-MM-YYYY" }))).toEqual([
      "dateFormat",
    ]);
    expect(violationsOf(formOf({ numberFormat: "1 234,56" }))).toEqual([
      "numberFormat",
    ]);
  });

  it.each(["", "7", "-1", "2.5", "lunes"])(
    "rejects the week start %j, which is not a whole day of the week",
    (weekStartsOn) => {
      expect(violationsOf(formOf({ weekStartsOn }))).toEqual(["weekStartsOn"]);
    },
  );

  it("accepts every day the contract allows", () => {
    for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
      const submitted = draftFromForm(formOf({ weekStartsOn: day }));
      expect(submitted.ok && submitted.draft.weekStartsOn).toBe(Number(day));
    }
  });

  it("reports every closed-set violation at once, not just the first", () => {
    expect(
      violationsOf(
        formOf({ dateFormat: "?", weekStartsOn: "9", numberFormat: "?" }),
      ),
    ).toEqual(["dateFormat", "weekStartsOn", "numberFormat"]);
  });

  it("leaves open-ended validation to the backend that owns it", () => {
    // No email pattern, no length limit, no currency shape. Re-implementing
    // those here would create a second authority free to drift from the first.
    const submitted = draftFromForm(
      formOf({ email: "", displayName: "", baseCurrency: "pesos" }),
    );

    expect(submitted.ok).toBe(true);
  });
});
