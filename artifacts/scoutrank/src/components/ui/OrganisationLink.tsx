import { Link } from 'react-router-dom';

interface OrganisationLinkProps {
  /** The UUID from the organisations table. When null/undefined, renders plain text. */
  organisationId: string | null | undefined;
  /** The display name to show. */
  name: string;
  /** Extra Tailwind classes applied to the link or span. */
  className?: string;
}

/**
 * Renders an organisation name as a clickable link to `/organisation/:id`
 * when an `organisationId` is available, or as plain text when it isn't
 * (e.g. manually-entered organisations not yet in the registry).
 *
 * Use this everywhere an organisation name appears so all pages stay
 * consistent and future pages automatically inherit correct behaviour.
 */
export function OrganisationLink({ organisationId, name, className = '' }: OrganisationLinkProps) {
  if (!organisationId) {
    return <span className={className}>{name}</span>;
  }

  return (
    <Link
      to={`/organisation/${organisationId}`}
      className={`hover:text-sr-purple-light transition-colors ${className}`}
    >
      {name}
    </Link>
  );
}
