export type PaymentStatus = 'PENDING' | 'PAID';
export type WhatsAppStatus = 'PENDING' | 'SENT' | 'FAILED';
export type ReminderStatus = 'SENT' | 'FAILED' | 'DELIVERED' | 'READ';
export type MessageType = 'PURCHASE_SUMMARY' | 'PAYMENT_REMINDER' | 'PAYMENT_RECEIVED';

export interface Customer {
  id: string;
  name: string;
  whatsapp_number: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseItem {
  id?: string;
  purchase_id?: string;
  item_name: string;
  quantity: number;
  mrp: number;
  discount: number;
  gross_amount: number;
  net_amount: number;
  created_at?: string;
}

export interface ReminderLog {
  id: string;
  purchase_id: string;
  reminder_date: string;
  pending_days: number;
  message_type: MessageType;
  whatsapp_message_id?: string | null;
  status: ReminderStatus;
  error_message?: string | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  customer_id: string;
  purchase_date: string;
  gross_total: number;
  total_discount: number;
  amount_payable: number;
  payment_status: PaymentStatus;
  payment_received_at?: string | null;
  whatsapp_status: WhatsAppStatus;
  whatsapp_message_id?: string | null;
  whatsapp_last_sent_at?: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  items?: PurchaseItem[];
  reminder_logs?: ReminderLog[];
}

export interface PharmacySettings {
  id?: string;
  pharmacy_name: string;
  display_name: string;
  logo_url?: string | null;
  payment_qr_url?: string | null;
  upi_id?: string | null;
  timezone: string;
  reminders_enabled: boolean;
  max_reminder_days: number;
  reminder_frequency: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  purchase_id: string;
  previous_status: string;
  new_status: string;
  notes?: string | null;
  changed_at: string;
}

export interface PurchaseInputItem {
  item_name: string;
  quantity: number;
  mrp: number;
  discount: number;
}

export interface CreatePurchaseInput {
  customer_name: string;
  whatsapp_number: string;
  items: PurchaseInputItem[];
  send_whatsapp?: boolean;
}

export interface DashboardStats {
  today_purchases_count: number;
  pending_customers_count: number;
  pending_amount: number;
  payments_received_today_count: number;
  payments_received_today_amount: number;
}
