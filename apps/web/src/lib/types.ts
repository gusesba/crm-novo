export interface User {
  id: number;
  name: string;
  username: string;
  isAdmin: boolean;
  active: boolean;
  branchId: number | null;
}
export interface Named {
  id: number;
  name: string;
  active: boolean;
}
export interface Catalog {
  branches: Named[];
  users: User[];
  services: Named[];
  conditions: Named[];
  statuses: string[];
}
export interface Lead {
  id: number;
  branchId: number;
  sellerId: number;
  currentSellerId: number;
  name: string;
  phone: string;
  additionalPhone: string | null;
  email: string | null;
  gender: string | null;
  birthDate: string | null;
  origin: string;
  referral: string | null;
  discovery: string | null;
  choiceReason: string | null;
  serviceId: number | null;
  conditionId: number | null;
  status: string;
  value: number;
  notes: string | null;
  chatId: string | null;
  chatUserId: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  classifications?: LeadClassification[];
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Appointment {
  id: number;
  leadId: number;
  leadName: string;
  phone: string;
  currentSellerId: number;
  branchId: number;
  dueAt: string;
  note: string | null;
  completed: boolean;
}
export interface DashboardData {
  total: number;
  sales: number;
  open: number;
  lost: number;
  revenue: number;
  conversion: number;
  daily: { date: string; leads: number; sales: number }[];
  statuses: { status: string; count: number }[];
  sellers: {
    id: number;
    name: string;
    leads: number;
    sales: number;
    revenue: number;
  }[];
  recent: Lead[];
}
export interface LeadClassification {
  id: number;
  name: string;
  color: string;
}
export interface Chat {
  id: string;
  name: string;
  lastText: string;
  updatedAt: number;
  archived: boolean;
  pinnedAt: number;
  leadId?: number | null;
  leadStatus?: string | null;
  classifications?: LeadClassification[];
}
export interface Message {
  id: string;
  chatId: string;
  text: string;
  mine: number;
  kind: string;
  timestamp: number;
  canDeleteForEveryone: boolean;
  attachment?: {
    name: string;
    mime: string;
    size?: number;
    pageCount?: number;
    thumbnail?: string;
  };
  contact?: { name: string; phone: string };
  reactions: { emoji: string; mine: boolean }[];
}
export interface Attachment {
  name: string;
  mime: string;
  data: string;
  voiceNote?: boolean;
  asDocument?: boolean;
}
export interface SharedContact {
  name: string;
  phone: string;
}
export interface LeadGroup {
  id: number;
  name: string;
  count: number;
}
export interface Campaign {
  id: string;
  name: string;
  total: number;
  messageCount: number;
  status: string;
  sent: number;
  skipped: number;
  failed: number;
  error: string | null;
  createdAt: number;
}
export interface CampaignDelivery {
  leadId: number;
  name: string;
  phone: string;
  status: "pending" | "sent" | "skipped" | "failed";
  error: string | null;
  externalMessageId: string | null;
  updatedAt: number | null;
}
