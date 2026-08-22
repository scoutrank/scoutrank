// Same country list as SignupPage — single source, not duplicated.
export const COUNTRIES = ['Australia', 'New Zealand', 'United Kingdom', 'United States', 'Canada', 'Other'];

// Curated state/province lists — deliberately only for the three
// countries given concrete examples. New Zealand/United Kingdom/Other
// have no entry here on purpose: inventing UK counties or NZ regions
// wasn't asked for, and a missing entry is the signal to fall back to
// free text or hide the second dropdown, not an oversight.
export const STATES_BY_COUNTRY: Record<string, string[]> = {
  Australia: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'ACT', 'TAS', 'NT'],
  'United States': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
    'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
    'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
  ],
  Canada: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
    'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Northwest Territories', 'Nunavut', 'Yukon',
  ],
};

export function getStatesForCountry(country: string): string[] | null {
  return STATES_BY_COUNTRY[country] ?? null;
}

export const ORG_TYPE_LABEL: Record<string, string> = {
  club: 'Sporting Club',
  school: 'School',
  academy: 'Academy',
  organisation: 'Sporting Organisation',
};
