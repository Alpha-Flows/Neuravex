/**
 * What kind of business or person a site can say runs it, as schema.org
 * names it; see `lib/structured-data`.
 *
 * A short list rather than the several hundred schema.org has: the types a
 * search engine does something with for a small site, each under a name the
 * operator would use for themselves. Anything more particular can be said as
 * the nearest of these, which is what the general ones are for.
 *
 * Dependency-free: the settings panel offers these, and the server checks them.
 */
export const BUSINESS_TYPES = [
  { value: "LocalBusiness", label: "A local business" },
  { value: "Store", label: "A shop" },
  { value: "Restaurant", label: "A restaurant" },
  { value: "CafeOrCoffeeShop", label: "A café" },
  { value: "Bakery", label: "A bakery" },
  { value: "BarOrPub", label: "A bar or pub" },
  { value: "LodgingBusiness", label: "A hotel, guesthouse or holiday let" },
  { value: "HealthAndBeautyBusiness", label: "A salon, spa or beauty studio" },
  { value: "MedicalBusiness", label: "A medical practice" },
  { value: "Dentist", label: "A dental practice" },
  { value: "LegalService", label: "A law firm or notary" },
  { value: "ProfessionalService", label: "Another professional service" },
  { value: "HomeAndConstructionBusiness", label: "A trade: builder, electrician, plumber" },
  { value: "AutomotiveBusiness", label: "A garage or car business" },
  { value: "SportsActivityLocation", label: "A gym, studio or sports club" },
  { value: "EducationalOrganization", label: "A school or course provider" },
  { value: "Organization", label: "An organisation with no premises to visit" },
  { value: "Person", label: "A person: a portfolio, a freelancer" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];

/** One of the types above, or null for anything else — including "say nothing". */
export function cleanBusinessType(raw: unknown): BusinessType | null {
  return BUSINESS_TYPES.find((t) => t.value === raw)?.value ?? null;
}

/**
 * Whether the description carries the postal address. Not for a person: the
 * address the legal notice has to give is often their home, and a notice
 * someone has to read is not the same as a card a search engine shows beside
 * their name.
 */
export function publishesAddress(type: BusinessType): boolean {
  return type !== "Person";
}
