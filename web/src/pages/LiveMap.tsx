import { MapSection } from "../components/MapSection";
import { SplitTitle } from "../components/ui";

export default function LiveMap() {
  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">En temps réel</div>
        <h1 className="display page-title">
          <SplitTitle text="Carte des enchères" />
        </h1>
        <p className="muted" style={{ marginBottom: 28, maxWidth: 560 }}>
          Survole une région pour voir ses ventes, clique pour les afficher. Les ondes rouges apparaissent à chaque nouvelle offre.
        </p>
        <MapSection tall />
      </div>
    </div>
  );
}
