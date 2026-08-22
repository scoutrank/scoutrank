// Child safety clearance requirements by country and state/territory.
// The database stores document_type = 'child_safety_clearance' for all
// of these; the specific local name is stored in document_label and
// derived from this config at form-render time.
//
// Adding a new country's system later means adding an entry here —
// no schema change, no migration.

export interface ChildSafetyRequirement {
  documentName: string;   // shown in the form label and stored in document_label
  authority: string;      // issuing body, shown as helper text
  url?: string;           // where to get it (shown as helper link in form)
}

// Australia — state/territory specific
export const AUSTRALIA_CHILD_SAFETY: Record<string, ChildSafetyRequirement> = {
  QLD: {
    documentName: 'Blue Card',
    authority: 'Blue Card Services (QLD)',
    url: 'https://www.bluecard.qld.gov.au',
  },
  NSW: {
    documentName: 'Working With Children Check',
    authority: 'Service NSW',
    url: 'https://www.kidsguardian.nsw.gov.au/working-with-children-check',
  },
  VIC: {
    documentName: 'Working With Children Check',
    authority: 'Victoria Police',
    url: 'https://www.vic.gov.au/working-with-children-check',
  },
  SA: {
    documentName: 'Working With Children Check',
    authority: 'Department for Human Services (SA)',
    url: 'https://screening.sa.gov.au',
  },
  WA: {
    documentName: 'Working With Children Check',
    authority: 'Department of Communities (WA)',
    url: 'https://workingwithchildren.wa.gov.au',
  },
  TAS: {
    documentName: 'Working with Vulnerable People Registration',
    authority: 'Communities Tasmania',
    url: 'https://justice.tas.gov.au/working_with_vulnerable_people',
  },
  ACT: {
    documentName: 'Working with Vulnerable People Registration',
    authority: 'Access Canberra',
    url: 'https://www.accesscanberra.act.gov.au/working-with-vulnerable-people',
  },
  NT: {
    documentName: 'Ochre Card',
    authority: 'NT Government',
    url: 'https://nt.gov.au/emergency/community-safety/ochre-card',
  },
};

// Future expansion: add countries here.
// Example (not yet built, just shows the pattern):
// export const USA_CHILD_SAFETY: Record<string, ChildSafetyRequirement> = { ... };
// export const UK_CHILD_SAFETY: Record<string, ChildSafetyRequirement> = { ... };

// Main resolver — takes country + state, returns the requirement or a
// generic fallback. The fallback is intentionally generic so the form
// still renders correctly for states/countries not yet in the config.
export function getChildSafetyRequirement(country: string, state: string | null): ChildSafetyRequirement | null {
  if (country === 'Australia' && state && AUSTRALIA_CHILD_SAFETY[state]) {
    return AUSTRALIA_CHILD_SAFETY[state];
  }
  // Country known but state not yet configured, or country not yet
  // added — return a generic prompt rather than nothing. The admin
  // will still see what country/state the applicant selected.
  if (country && country !== 'Other') {
    return {
      documentName: 'Working With Children / Child Safety Clearance',
      authority: 'Your local child-safety authority',
    };
  }
  return null;
}
