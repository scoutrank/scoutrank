import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

// Club slugs are stored on the organisations table.
// This page resolves the slug to an organisation id and redirects
// to the real OrganisationProfilePage. No mock data.
export default function ClubPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) { navigate('/discover', { replace: true }); return; }
    supabase
      .from('organisations')
      .select('id')
      .or(`slug.eq.${slug},name.ilike.${slug.replace(/-/g, ' ')}`)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.id) {
          navigate(`/organisation/${data.id}`, { replace: true });
        } else {
          navigate('/discover', { replace: true });
        }
      });
  }, [slug, navigate]);

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 text-sr-purple animate-spin" />
    </div>
  );
}
