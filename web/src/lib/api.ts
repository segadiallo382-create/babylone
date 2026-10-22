export type Seller = { id: number; name: string; city: string; verified: boolean; pro: boolean; rating: number | null; reviews: number };

export type Auction = {
  id: number;
  title: string;
  description: string;
  category: string;
  condition: string;
  city: string;
  region: string;
  images: string[];
  mode: "lot" | "multi";
  quantity: number;
  buy_now_price: number;
  my_rank: number | null;
  my_auto_max: number | null;
  winners?: number;
  moderation: "pending" | "approved" | "rejected";
  start_price: number;
  current_price: number;
  has_reserve: boolean;
  reserve_met: boolean;
  reserve_price?: number;
  bids_count: number;
  next_min: number;
  leader: string | null;
  is_leader: boolean;
  starts_at: number;
  ends_at: number;
  status: "live" | "sold" | "unsold" | "cancelled";
  boosted: boolean;
  views: number;
  watchers: number;
  watching: boolean;
  seller: Seller;
  my_max?: number;
};

export type User = {
  id: number;
  name: string;
  phone: string;
  role: "buyer" | "seller" | "admin";
  city: string;
  shop_name: string | null;
  verified: boolean;
  plan: "standard" | "pro";
  plan_until: number | null;
  strikes: number;
  whatsapp: boolean;
  phone_verified: boolean;
  referral_code: string | null;
};

export type Order = {
  id: number;
  auction_id: number;
  me: "buyer" | "seller" | "admin";
  amount: number;
  commission: number;
  delivery_fee: number;
  total: number;
  payout: number;
  status: "awaiting_payment" | "paid" | "shipped" | "delivered" | "released" | "expired" | "disputed" | "refunded";
  pay_deadline: number;
  provider: string | null;
  address: string | null;
  created_at: number;
  updated_at: number;
  auction: { id: number; title: string; image: string; quantity: number; city: string };
  buyer: { name: string; city: string; phone?: string };
  seller: { name: string; city: string; phone?: string };
  review: { rating: number; comment: string } | null;
};

export type Notif = { id: number; type: string; title: string; body: string; link: string | null; read: number; created_at: number };

export type FeedItem = {
  auction_id: number;
  amount: number;
  bidder: string;
  bidder_id?: number;
  created_at: number;
  title: string;
  region: string;
  city: string;
  image: string;
  bids_count?: number;
  next_min?: number;
  ends_at?: number;
  reserve_met?: boolean;
  price?: number;
  mode?: "lot" | "multi";
  added?: { amount: number; created_at: number; bidder: string; bidder_id: number; auto: boolean }[];
};

const TOKEN_KEY = "babylone.token";
export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* stockage indisponible */
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Erreur réseau. Réessaie.", res.status);
  return data as T;
}

export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
