import { whatsappShare, whatsappTo } from "../lib/perf";
import { useApp } from "../lib/store";

export function ShareWhatsApp({ text, path, label = "Partager sur WhatsApp" }: { text: string; path: string; label?: string }) {
  const url = `${location.origin}${path}`;
  return (
    <a className="btn btn-ghost btn-sm" href={whatsappShare(text, url)} target="_blank" rel="noopener noreferrer" style={{ gap: 8 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z" />
      </svg>
      {label}
    </a>
  );
}

// Bouton « Écrire au support » : masqué tant que SUPPORT_WHATSAPP n'est pas défini
export function SupportWhatsApp({ text = "Bonjour Babylone, j'ai une question :", label = "Écrire au support sur WhatsApp", className = "btn btn-ghost btn-sm" }: { text?: string; label?: string; className?: string }) {
  const { meta } = useApp();
  if (!meta?.support_whatsapp) return null;
  return (
    <a className={className} href={whatsappTo(meta.support_whatsapp, text)} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
