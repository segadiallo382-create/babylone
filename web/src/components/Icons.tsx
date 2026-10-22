import type { SVGProps } from "react";

const base = (d: React.ReactNode, size = 20) =>
  function Icon(p: SVGProps<SVGSVGElement> & { size?: number }) {
    const { size: s = size, ...rest } = p;
    return (
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...rest}
      >
        {d}
      </svg>
    );
  };

export const IBell = base(<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />);
export const ISearch = base(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const IMenu = base(<path d="M4 7h16M4 12h16M4 17h10" />);
export const IClose = base(<path d="M6 6l12 12M18 6 6 18" />);
export const IArrow = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IHeart = base(<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />);
export const IPin = base(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>,
);
export const IClock = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const IShield = base(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const ITruck = base(
  <>
    <path d="M14 18V6H2v12h2M14 9h4l4 4v5h-2M14 18h-6" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
  </>,
);
export const IBox = base(
  <>
    <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </>,
);
export const ICheck = base(<path d="M20 6 9 17l-5-5" />);
export const IGavel = base(
  <>
    <path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10" />
    <path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8" />
  </>,
);
export const IUser = base(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const IHome = base(<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3Z" />);
export const IGrid = base(
  <>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </>,
);
export const IMegaphone = base(<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1ZM17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14" />);
export const IPlus = base(<path d="M12 5v14M5 12h14" />);
export const IChart = base(<path d="M3 3v18h18M7 15l4-4 3 3 6-7" />);
export const IStore = base(
  <>
    <path d="M3 9 5 3h14l2 6M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
    <path d="M5 13v8h14v-8" />
  </>,
);
export const IStar = base(<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />);
export const IWallet = base(
  <>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
    <circle cx="16" cy="13" r="1.5" />
  </>,
);
export const IZap = base(<path d="M13 2 3 14h9l-1 8 10-12h-9Z" />);
export const ILogout = base(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const IEye = base(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const IShirt = base(<path d="M16 3 21 6l-2 5-2-1v11H7V10l-2 1-2-5 5-3a4 4 0 0 0 8 0Z" />);
export const IShoe = base(<path d="M2 16v-5l4-6 3 4c2 1 4 1 6 2l5 1.5A2 2 0 0 1 22 14.4V18H4a2 2 0 0 1-2-2ZM2 14h20" />);
export const IPhone = base(
  <>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </>,
);
export const IWatch = base(
  <>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 9.5V12l1.5 1.5M9 3h6l1 3.5M9 21h6l1-3.5M8 6.5 9 3M8 17.5 9 21" />
  </>,
);
export const ISparkle = base(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />);
export const IFridge = base(
  <>
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M5 10h14M9 5v2M9 13v3" />
  </>,
);
export const ISofa = base(<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2ZM5 18v2M19 18v2" />);
export const IHanger = base(<path d="M12 7a2 2 0 1 1 2-2c0 1.5-2 2-2 3.5L21 15a1.5 1.5 0 0 1-1 2.7H4a1.5 1.5 0 0 1-1-2.7l9-6.5" />);

export const CAT_ICONS: Record<string, ReturnType<typeof base>> = {
  Chaussures: IShoe,
  Friperie: IHanger,
  Vêtements: IShirt,
  Accessoires: IWatch,
  Électronique: IPhone,
  Électroménager: IFridge,
  Beauté: ISparkle,
  Maison: ISofa,
};
