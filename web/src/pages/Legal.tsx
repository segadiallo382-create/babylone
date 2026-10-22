import { Link } from "react-router-dom";
import { SplitTitle } from "../components/ui";
import { DOCS, UPDATED, type Block } from "../data/legal";

type DocKey = keyof typeof DOCS;

const LINKS: [DocKey, string, string][] = [
  ["rules", "/regles", "Règles des enchères"],
  ["cgu", "/cgu", "Conditions générales"],
  ["privacy", "/confidentialite", "Confidentialité"],
  ["mentions", "/mentions-legales", "Mentions légales"],
];

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function Para({ b }: { b: Block }) {
  if (Array.isArray(b))
    return (
      <ul>
        {b.map((li, i) => (
          <li key={i}>{li}</li>
        ))}
      </ul>
    );
  return <p>{b}</p>;
}

export default function Legal({ doc }: { doc: DocKey }) {
  const d = DOCS[doc];
  // Informations légales encore manquantes : on le dit plutôt que de publier un texte incomplet en silence
  const incomplete = JSON.stringify(d).includes("[À ");
  return (
    <div className="page">
      <div className="container legal">
        <div className="eyebrow">Babylone</div>
        <h1 className="display page-title">
          <SplitTitle text={d.title} />
        </h1>
        <p className="muted" style={{ fontSize: 14 }}>
          Dernière mise à jour : {UPDATED}
          {doc !== "rules" && (
            <>
              {" · "}
              <button className="red" style={{ padding: 0, fontSize: 14 }} onClick={() => window.print()}>
                Imprimer / PDF
              </button>
            </>
          )}
        </p>
        {incomplete && (
          <p className="chip chip-warn" style={{ margin: "10px 0 6px" }}>
            Certaines informations légales de la société sont en cours d'ajout.
          </p>
        )}
        {d.intro && <p style={{ fontSize: 17 }}>{d.intro}</p>}
        {d.sections.length > 5 && (
          <nav className="legal-toc">
            <b>Sommaire</b>
            {d.sections.map(([h]) => (
              <a key={h} href={`#${slug(h)}`}>
                {h}
              </a>
            ))}
          </nav>
        )}
        {d.sections.map(([h, blocks]) => (
          <section key={h} id={slug(h)}>
            <h2>{h}</h2>
            {blocks.map((b, i) => (
              <Para key={i} b={b} />
            ))}
          </section>
        ))}
        <div className="row wrap legal-links" style={{ marginTop: 40 }}>
          {LINKS.filter(([k]) => k !== doc).map(([k, to, label]) => (
            <Link key={k} to={to} className="chip">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
