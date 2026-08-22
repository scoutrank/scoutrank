import { Route, Switch, Router as WouterRouter } from 'wouter';
import ChatPage from './pages/ChatPage';

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080b18] text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-white/50">Page not found</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}
