import { Shell } from './components/Shell';
import { useRoute } from './lib/router';
import { StoreProvider, useStore } from './lib/store';
import { CatchEditPage } from './pages/CatchEditPage';
import { CaughtPage } from './pages/CaughtPage';
import { DexPage } from './pages/DexPage';
import { GoalsPage } from './pages/GoalsPage';
import { SpeciesPage } from './pages/SpeciesPage';
import { StatsPage } from './pages/StatsPage';

function Routes() {
  const route = useRoute();
  const { status, error } = useStore();

  let page;
  if (status === 'loading') page = <div className="loading" role="status">Loading your dex…</div>;
  else if (status === 'error') page = <div className="banner banner--warn" role="alert"><p><strong>Couldn't load the data.</strong> {error}</p></div>;
  else {
    switch (route.page) {
      case 'species': page = <SpeciesPage key={route.id} id={route.id} />; break;
      case 'caught': page = <CaughtPage />; break;
      case 'goals': page = <GoalsPage />; break;
      case 'stats': page = <StatsPage />; break;
      case 'catch-new': page = <CatchEditPage key={`new-${route.species ?? ''}`} species={route.species} />; break;
      case 'catch-edit': page = <CatchEditPage key={route.id} id={route.id} />; break;
      default: page = <DexPage />;
    }
  }
  return <Shell route={route}>{page}</Shell>;
}

export function App() {
  return (
    <StoreProvider>
      <Routes />
    </StoreProvider>
  );
}
