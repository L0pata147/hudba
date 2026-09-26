import { useNavigate } from 'react-router';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      message="The page you're looking for doesn't exist."
      action={
        <Button variant="primary" onClick={() => navigate('/')}>
          Go home
        </Button>
      }
    />
  );
}
